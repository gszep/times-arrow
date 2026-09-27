import contract from "../contract.json" with { type: "json" };
import { read } from "./gpu.ts";
import { philoxWgsl } from "./philox.ts";

// The collision table from the contract, as sixteen nibbles in two words.
const table = contract.hpp.collide;
const nibbles = (from: number) =>
  table.slice(from, from + 8).reduce((w, s, i) => w | (s << (4 * i)), 0) >>> 0;

/** The HPP lattice gas: bit 0 moves +x, bit 1 +y, bit 2 −x, bit 3 −y. */
export const hppWgsl = /* wgsl */ `
${philoxWgsl}
struct Params { n: u32, seed: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;

const COLLIDE = vec2u(0x${nibbles(0).toString(16)}u, 0x${nibbles(8).toString(16)}u);

fn collide(s: u32) -> u32 {
  return (COLLIDE[s >> 3u] >> ((s & 7u) * 4u)) & 0xfu;
}

fn at(x: u32, y: u32) -> u32 {
  let m = p.n - 1u;
  return collide(src[(y & m) * p.n + (x & m)]);
}

@compute @workgroup_size(16, 16)
fn init(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= p.n || g.y >= p.n) { return; }
  let i = g.y * p.n + g.x;
  dst[i] = rand(p.seed, 0u, i).x & 0xfu;
}

@compute @workgroup_size(16, 16)
fn step(@builtin(global_invocation_id) g: vec3u) {
  let x = g.x; let y = g.y;
  if (x >= p.n || y >= p.n) { return; }
  dst[y * p.n + x] = (at(x - 1u, y) & 1u) | (at(x, y - 1u) & 2u)
                   | (at(x + 1u, y) & 4u) | (at(x, y + 1u) & 8u);
}
`;

/** An `n × n` HPP lattice (`n` a power of two) on the GPU, double-buffered. */
export class Hpp {
  readonly device: GPUDevice;
  readonly n: number;
  private buffers: GPUBuffer[];
  private params: GPUBuffer;
  private pipelines: { init: GPUComputePipeline; step: GPUComputePipeline };
  private groups: GPUBindGroup[];
  private front = 0;

  constructor(device: GPUDevice, n: number) {
    this.device = device;
    this.n = n;
    const module = device.createShaderModule({ code: hppWgsl });
    const binding = (type: GPUBufferBindingType) => ({ visibility: GPUShaderStage.COMPUTE, buffer: { type } });
    const layout = device.createBindGroupLayout({
      entries: [binding("uniform"), binding("read-only-storage"), binding("storage")].map((e, binding) => ({
        binding,
        ...e,
      })),
    });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    const pipeline = (entryPoint: string) =>
      device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint } });
    this.pipelines = { init: pipeline("init"), step: pipeline("step") };
    this.params = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.buffers = [0, 1].map(() =>
      device.createBuffer({ size: 4 * n * n, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }),
    );
    this.groups = [0, 1].map((i) =>
      device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: this.params } },
          { binding: 1, resource: { buffer: this.buffers[i] } },
          { binding: 2, resource: { buffer: this.buffers[1 - i] } },
        ],
      }),
    );
  }

  /** Reset to the seeded initial state. */
  init(seed: number): void {
    this.device.queue.writeBuffer(this.params, 0, new Uint32Array([this.n, seed]));
    this.encode(this.pipelines.init, 1);
  }

  /** Queue `t` steps, about 2²⁷ cell updates per submission so that no
  command buffer runs long enough to trip a GPU watchdog. */
  step(t: number): void {
    const chunk = Math.max(1, Math.floor(2 ** 27 / (this.n * this.n)));
    for (let k = 0; k < t; k += chunk) this.encode(this.pipelines.step, Math.min(chunk, t - k));
  }

  private encode(pipeline: GPUComputePipeline, count: number): void {
    const enc = this.device.createCommandEncoder();
    const groups = Math.ceil(this.n / 16);
    for (let k = 0; k < count; k++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, this.groups[this.front]);
      pass.dispatchWorkgroups(groups, groups);
      pass.end();
      this.front = 1 - this.front;
    }
    this.device.queue.submit([enc.finish()]);
  }

  destroy(): void {
    for (const b of [...this.buffers, this.params]) b.destroy();
  }

  /** The current state, one hex digit per site. */
  async state(): Promise<string> {
    return Array.from(await this.words(), (x) => x.toString(16)).join("");
  }

  /** The current state, one word per site. */
  async words(): Promise<Uint32Array> {
    return (await read(this.device, this.buffers[this.front]))[0];
  }
}

import contract from "../contract.json" with { type: "json" };
import { read, storage } from "./gpu.ts";
import { philoxWgsl } from "./philox.ts";

// The collision table from the contract, as sixteen nibbles in two words.
const table = contract.hpp.collide;
const nibbles = (from: number) =>
  table.slice(from, from + 8).reduce((w, s, i) => w | (s << (4 * i)), 0) >>> 0;

/** The HPP lattice gas: bit 0 moves +x, bit 1 +y, bit 2 −x, bit 3 −y. */
export const hppWgsl = /* wgsl */ `
${philoxWgsl}
struct Params { n: u32, seed: u32, i: u32, pad: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;

const COLLIDE = vec2u(0x${nibbles(0).toString(16)}u, 0x${nibbles(8).toString(16)}u);

fn collide(s: u32) -> u32 {
  return (COLLIDE[s >> 3u] >> ((s & 7u) * 4u)) & 0xfu;
}

// Velocity reversal: east ↔ west, north ↔ south.
fn flipbits(s: u32) -> u32 {
  return ((s << 2u) | (s >> 2u)) & 0xfu;
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

// The exact inverse of \`step\` (the half-step convention the Lean statement
// carries): undo the streaming, then collide. Pull form: bit k of a site
// comes from the site that velocity k would carry it to.
@compute @workgroup_size(16, 16)
fn inv(@builtin(global_invocation_id) g: vec3u) {
  let x = g.x; let y = g.y;
  if (x >= p.n || y >= p.n) { return; }
  let m = p.n - 1u;
  let s = (src[y * p.n + ((x + 1u) & m)] & 1u)
        | (src[((y + 1u) & m) * p.n + x] & 2u)
        | (src[y * p.n + ((x - 1u) & m)] & 4u)
        | (src[((y - 1u) & m) * p.n + x] & 8u);
  dst[y * p.n + x] = collide(s);
}

@compute @workgroup_size(16, 16)
fn flip(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= p.n || g.y >= p.n) { return; }
  dst[g.y * p.n + g.x] = flipbits(src[g.y * p.n + g.x]);
}

// revState, the time-reversal conjugator: reverse every velocity and collide.
@compute @workgroup_size(16, 16)
fn rev(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= p.n || g.y >= p.n) { return; }
  dst[g.y * p.n + g.x] = collide(flipbits(src[g.y * p.n + g.x]));
}
`;

// The registered damage protocol flips the east bit of one site, in place.
const xorWgsl = /* wgsl */ `
struct Params { n: u32, seed: u32, i: u32, pad: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> state: array<u32>;
@compute @workgroup_size(1)
fn xor() { state[p.i] = state[p.i] ^ 1u; }
`;

const wordsWgsl = /* wgsl */ `
${philoxWgsl}
struct Params { seed: u32, count: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> dst: array<u32>;
@compute @workgroup_size(256)
fn words(@builtin(global_invocation_id) g: vec3u) {
  if (g.x >= p.count) { return; }
  dst[g.x] = rand(p.seed, 0u, g.x).x;
}
`;

/** `count` words `rand(seed, 0, i).x`, drawn on the GPU in one readback. */
export async function philoxWords(device: GPUDevice, seed: number, count: number): Promise<Uint32Array> {
  const module = device.createShaderModule({ code: wordsWgsl });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "words" } });
  const params = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const dst = storage(device, new Uint32Array(count));
  device.queue.writeBuffer(params, 0, new Uint32Array([seed, count]));
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: params } },
        { binding: 1, resource: { buffer: dst } },
      ],
    }),
  );
  pass.dispatchWorkgroups(Math.ceil(count / 256));
  pass.end();
  device.queue.submit([enc.finish()]);
  const [out] = await read(device, dst);
  params.destroy();
  dst.destroy();
  return out;
}

/** A region of the lattice: the sites `[x0, x0 + side) × [y0, y0 + side)`. */
export type Region = { x0: number; y0: number; side: number };

/** The state holding a uniform random exact-`count` subset of the region's
 * `4 · side²` velocity slots: selection sampling on the Philox words
 * `rand(seed, 0, j).x`, with region slot `j = 4 · raster site + velocity bit`
 * selected iff `w · (slots − j) < (count − picked) · 2²⁴` for `w = word >>> 8`
 * (exact integer arithmetic, so every backend draws the same subset). This
 * construction is provisional until the same one is pinned in Lean. */
export async function subsetState(
  device: GPUDevice,
  seed: number,
  n: number,
  count: number,
  region: Region,
): Promise<Uint32Array> {
  const slots = 4 * region.side * region.side;
  if (count > slots) throw new Error(`${count} particles do not fit in ${slots} slots`);
  const words = await philoxWords(device, seed, slots);
  const state = new Uint32Array(n * n);
  let picked = 0;
  for (let j = 0; j < slots && picked < count; j++) {
    if ((words[j] >>> 8) * (slots - j) < (count - picked) * 2 ** 24) {
      const site = j >>> 2;
      state[(region.y0 + Math.floor(site / region.side)) * n + region.x0 + (site % region.side)] |=
        1 << (j & 3);
      picked++;
    }
  }
  return state;
}

/** The packed initial state: the centred block of side `n/4` holding exactly
 * `n²/8` particles — half of its velocity slots. */
export function packedState(device: GPUDevice, seed: number, n: number): Promise<Uint32Array> {
  const side = n / 4;
  return subsetState(device, seed, n, (n * n) / 8, {
    x0: n / 2 - side / 2,
    y0: n / 2 - side / 2,
    side,
  });
}

/** The null initial state: exactly `n²/8` particles, uniform over all `4n²`
 * velocity slots. */
export function nullState(device: GPUDevice, seed: number, n: number): Promise<Uint32Array> {
  return subsetState(device, seed, n, (n * n) / 8, { x0: 0, y0: 0, side: n });
}

/** An `n × n` HPP lattice (`n` a power of two) on the GPU, double-buffered. */
export class Hpp {
  readonly device: GPUDevice;
  readonly n: number;
  private buffers: GPUBuffer[];
  private params: GPUBuffer;
  private pipelines: { init: GPUComputePipeline; step: GPUComputePipeline; inv: GPUComputePipeline; flip: GPUComputePipeline; rev: GPUComputePipeline };
  private xor: GPUComputePipeline;
  private xorLayout: GPUBindGroupLayout;
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
    this.pipelines = {
      init: pipeline("init"),
      step: pipeline("step"),
      inv: pipeline("inv"),
      flip: pipeline("flip"),
      rev: pipeline("rev"),
    };
    this.xorLayout = device.createBindGroupLayout({
      entries: [binding("uniform"), binding("storage")].map((e, binding) => ({ binding, ...e })),
    });
    this.xor = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.xorLayout] }),
      compute: { module: device.createShaderModule({ code: xorWgsl }), entryPoint: "xor" },
    });
    this.params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    // `p.n` is per-instance and must hold before any dispatch; `init` only
    // refreshes the seed, and `load`-ed states never call `init`.
    device.queue.writeBuffer(this.params, 0, new Uint32Array([n, 0, 0, 0]));
    this.buffers = [0, 1].map(() =>
      device.createBuffer({
        size: 4 * n * n,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      }),
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

  /** The current state buffer. */
  get buffer(): GPUBuffer {
    return this.buffers[this.front];
  }

  /** Reset to the seeded initial state. */
  init(seed: number): void {
    this.device.queue.writeBuffer(this.params, 0, new Uint32Array([this.n, seed]));
    this.encode(this.pipelines.init, 1);
  }

  /** Replace the current state with `words`, one `u32` per site. */
  load(words: Uint32Array): void {
    if (words.length !== this.n * this.n) throw new Error(`state has ${words.length} sites, expected ${this.n * this.n}`);
    this.device.queue.writeBuffer(this.buffer, 0, words);
  }

  /** Queue `t` steps, about 2²⁷ cell updates per submission so that no
   * command buffer runs long enough to trip a GPU watchdog. */
  step(t: number): void {
    const chunk = Math.max(1, Math.floor(2 ** 27 / (this.n * this.n)));
    for (let k = 0; k < t; k += chunk) this.encode(this.pipelines.step, Math.min(chunk, t - k));
  }

  /** Queue `t` inverse steps. */
  inv(t: number): void {
    const chunk = Math.max(1, Math.floor(2 ** 27 / (this.n * this.n)));
    for (let k = 0; k < t; k += chunk) this.encode(this.pipelines.inv, Math.min(chunk, t - k));
  }

  /** Reverse every velocity everywhere. */
  flip(): void {
    this.encode(this.pipelines.flip, 1);
  }

  /** Reverse every velocity everywhere, then collide: `revState`. */
  rev(): void {
    this.encode(this.pipelines.rev, 1);
  }

  /** Flip the east bit of site `i` of the current state, in place. */
  xorEast(i: number): void {
    this.device.queue.writeBuffer(this.params, 8, new Uint32Array([i]));
    this.device.queue.submit([
      (() => {
        const enc = this.device.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(this.xor);
        pass.setBindGroup(
          0,
          this.device.createBindGroup({
            layout: this.xorLayout,
            entries: [
              { binding: 0, resource: { buffer: this.params } },
              { binding: 1, resource: { buffer: this.buffer } },
            ],
          }),
        );
        pass.dispatchWorkgroups(1);
        pass.end();
        return enc.finish();
      })(),
    ]);
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
    return (await read(this.device, this.buffer))[0];
  }
}

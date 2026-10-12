import { blank, read, watchDevice } from "../src/gpu.ts";
import { philoxWgsl } from "../src/philox.ts";

export type Config = { n: number; seed: number; rho: number; outside: number; radius: number; x: number; y: number; window: number };
export const defaults: Config = { n: 256, seed: 1, rho: 3, outside: 0.15, radius: 64, x: 0.5, y: 0.5, window: 16 };
const shader = /* wgsl */ `
${philoxWgsl}
struct Params { n: u32, seed: u32, time: u32, inverse: u32, rho: f32, outside: f32, radius: f32, pad: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> dst: array<u32>;
fn neighbour(site: u32, k: u32) -> u32 {
  let x = i32(site % p.n); let y = i32(site / p.n); let odd = y & 1;
  let dx = array<i32, 6>(1, odd, odd - 1, -1, odd - 1, odd);
  let dy = array<i32, 6>(0, 1, 1, 0, -1, -1);
  return (u32(y + dy[k] + i32(p.n)) % p.n) * p.n + u32(x + dx[k] + i32(p.n)) % p.n;
}
fn collide(s: u32, site: u32, inverse: bool) -> u32 {
  if (s == 21u) { return 42u; } if (s == 42u) { return 21u; }
  if (s != 9u && s != 18u && s != 36u) { return s; }
  let b = (rand(p.seed, p.time, site).x & 1u) ^ u32(inverse);
  if (b == 0u) { return ((s << 1u) | (s >> 5u)) & 63u; }
  return ((s >> 1u) | (s << 5u)) & 63u;
}
@compute @workgroup_size(128) fn init(@builtin(global_invocation_id) id: vec3u) {
  let site = id.x; if (site >= p.n * p.n) { return; }
  let y = site / p.n;
  let q = vec2f(f32(site % p.n) + 0.5 * f32(y & 1u), f32(y) * sqrt(3.0) / 2.0);
  let centre = vec2f(f32(p.n) / 2.0, f32(p.n) * sqrt(3.0) / 4.0);
  let rho = select(p.outside, p.rho, distance(q, centre) < p.radius);
  var s = 0u;
  for (var k = 0u; k < 6u; k++) {
    if (u01(rand(p.seed, k >> 2u, site)[k & 3u]) < rho / 6.0) { s |= 1u << k; }
  }
  dst[site] = s; dst[site + p.n * p.n] = s;
}
@compute @workgroup_size(128) fn step(@builtin(global_invocation_id) id: vec3u) {
  let i = id.x; let count = p.n * p.n; if (i >= 2u * count) { return; }
  let site = i % count; let offset = (i / count) * count; let on = offset == 0u;
  var s = 0u;
  for (var k = 0u; k < 6u; k++) {
    let origin = neighbour(site, select((k + 3u) % 6u, k, p.inverse != 0u));
    var v = src[offset + origin];
    if (on && p.inverse == 0u) { v = collide(v, origin, false); }
    s |= v & (1u << k);
  }
  if (on && p.inverse != 0u) { s = collide(s, site, true); }
  dst[i] = s;
}
`;

/** The paired runs differ only in the collision operator. */
export class Gas {
  device: GPUDevice;
  config: Config;
  buffers: GPUBuffer[];
  uniform: GPUBuffer;
  groups: GPUBindGroup[];
  pipelines: Record<string, GPUComputePipeline>;
  watch: ReturnType<typeof watchDevice>;
  time = 0;
  current = 0;
  constructor(device: GPUDevice, config: Config) {
    this.device = device; this.config = config; this.watch = watchDevice(device);
    this.buffers = [blank(device, config.n ** 2 * 8), blank(device, config.n ** 2 * 8)];
    this.uniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ] });
    const module = device.createShaderModule({ code: shader });
    const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipelines = Object.fromEntries(["init", "step"].map(entryPoint => [entryPoint,
      device.createComputePipeline({ layout: pipelineLayout, compute: { module, entryPoint } })]));
    this.groups = [0, 1].map(i => device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: this.uniform } },
      { binding: 1, resource: { buffer: this.buffers[i] } },
      { binding: 2, resource: { buffer: this.buffers[1 - i] } },
    ] }));
    this.dispatch("init", false);
  }
  dispatch(entry: string, inverse: boolean) {
    this.watch.check();
    const c = this.config, bytes = new ArrayBuffer(32), u = new Uint32Array(bytes), f = new Float32Array(bytes);
    u.set([c.n, c.seed, this.time, +inverse]); f.set([c.rho, c.outside, c.radius], 4);
    this.device.queue.writeBuffer(this.uniform, 0, bytes);
    const encoder = this.device.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(this.pipelines[entry]); pass.setBindGroup(0, this.groups[this.current]);
    pass.dispatchWorkgroups(Math.ceil(c.n ** 2 * (entry === "init" ? 1 : 2) / 128)); pass.end();
    this.device.queue.submit([encoder.finish()]); this.current = 1 - this.current;
  }
  async advance(steps: number, inverse = false) {
    for (let j = 0; j < steps; j++) {
      if (inverse && this.time === 0) break;
      if (inverse) this.time--;
      this.dispatch("step", inverse);
      if (!inverse) this.time++;
      // Drain short batches rather than risk a long GPU watchdog stall.
      if (j % 32 === 31) await this.watch.race(this.device.queue.onSubmittedWorkDone());
    }
    await this.watch.race(this.device.queue.onSubmittedWorkDone());
  }
  async state() { return (await this.watch.race(read(this.device, this.buffers[this.current])))[0]; }
  async destroy() {
    await this.watch.race(this.device.queue.onSubmittedWorkDone());
    this.buffers.forEach(b => b.destroy()); this.uniform.destroy();
  }
}

export const pop = Array.from({ length: 64 }, (_, s) => Array.from({ length: 6 }, (_, k) => (s >> k) & 1).reduce((a, b) => a + b, 0));
const mx = [2, 1, -1, -2, -1, 1], my = [0, 1, 1, 0, -1, -1];
const px = pop.map((_, s) => mx.reduce((sum, v, k) => sum + v * ((s >> k) & 1), 0));
const py = pop.map((_, s) => my.reduce((sum, v, k) => sum + v * ((s >> k) & 1), 0));
export function invariants(state: Uint32Array) {
  let mass = 0, x = 0, y = 0, invalid = 0;
  for (const s of state) { if (s > 63) invalid++; else { mass += pop[s]; x += px[s]; y += py[s]; } }
  return { mass, x, y, invalid };
}
const entropy = (p: number, a: number) => -(p > 0 ? p * Math.log(p / a) : 0) - (p < 1 ? (1 - p) * Math.log((1 - p) / (1 - a)) : 0);
export type Sample = { time: number; entropy: number[][]; invariants: ReturnType<typeof invariants>[] };
export type Curve = { time: number; from: number; rates: number[][]; slopes: (number | null)[]; spread: (number | null)[]; positive: number[] };

/** Euclidean circles on the periodic, offset-row hexagonal lattice. */
export class Circles {
  radii: number[];
  areas: number[];
  bins: Uint8Array;
  config: Config;
  constructor(c: Config) {
    this.config = c;
    this.radii = Array.from({ length: 25 }, (_, j) => 2 * (c.n / 6) ** (j / 24));
    this.areas = this.radii.map(() => 0); this.bins = new Uint8Array(c.n ** 2);
    const height = c.n * Math.sqrt(3) / 2;
    for (let i = 0; i < this.bins.length; i++) {
      const y = Math.floor(i / c.n);
      let dx = Math.abs(i % c.n + (y % 2) / 2 - c.x * c.n), dy = Math.abs(y * Math.sqrt(3) / 2 - c.y * height);
      dx = Math.min(dx, c.n - dx); dy = Math.min(dy, height - dy);
      const d = Math.hypot(dx, dy), bin = this.radii.findIndex(r => d < r);
      this.bins[i] = bin < 0 ? this.radii.length : bin;
      if (bin >= 0) for (let j = bin; j < this.areas.length; j++) this.areas[j]++;
    }
  }
  sample(state: Uint32Array, time: number): Sample {
    const count = this.config.n ** 2;
    const iv = [invariants(state.subarray(0, count)), invariants(state.subarray(count))];
    const ent = [0, 1].map(side => {
      const bins = this.radii.map(() => 0);
      for (let i = 0; i < count; i++) if (this.bins[i] < bins.length) bins[this.bins[i]] += pop[state[side * count + i]];
      let sum = 0;
      return bins.map((v, j) => { sum += v; return entropy(sum / iv[side].mass, this.areas[j] / count); });
    });
    return { time, entropy: ent, invariants: iv };
  }
  curve(before: Sample, after: Sample): Curve {
    const dt = after.time - before.time;
    const rates = after.entropy.map((row, side) => row.map((s, j) => (s - before.entropy[side][j]) / dt / (this.areas[j] * Math.sqrt(3) / 2)));
    const band = this.radii.map((r, j) => r >= 18 / this.config.rho && r < this.config.radius ? j : -1).filter(j => j >= 0);
    const slopes: (number | null)[] = [], spread: (number | null)[] = [], positive: number[] = [];
    for (const row of rates) {
      positive.push(band.filter(j => row[j] > 0).length);
      if (band.length < 3 || band.some(j => row[j] <= 0)) { slopes.push(null); spread.push(null); continue; }
      const xs = band.map(j => Math.log(this.radii[j])), ys = band.map(j => Math.log(row[j]));
      const mean = (vs: number[]) => vs.reduce((a, b) => a + b, 0) / vs.length;
      const x = mean(xs), y = mean(ys);
      slopes.push(xs.reduce((sum, v, j) => sum + (v - x) * (ys[j] - y), 0) / xs.reduce((sum, v) => sum + (v - x) ** 2, 0));
      spread.push(Math.exp(Math.max(...ys) - Math.min(...ys)));
    }
    return { time: after.time, from: before.time, rates, slopes, spread, positive };
  }
}

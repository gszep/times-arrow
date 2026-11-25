// The exact ensemble of the light-like "telegraph" gas on a ring (#14):
// every particle moves one site per step, right or left, and reverses with
// probability a per step. The state is the pair of link intensities as
// deviations from the stationary intensity ν = 1; a link carrying deviation
// d holds relative entropy φ(d) = (1+d)ln(1+d) − d to equilibrium.
// The CPU version is the f64 reference for every check; the GPU version is
// the same evolution in f32.
import { blank, read, watchDevice } from "../src/gpu.ts";

export const N = 2048, T = 768, C = N / 2, XR = 900, R = 52;
const CENTRES = [C - 20, C + 40], A = 4, HW = 12;
/** Values in the whole space-time history: (T+1) × N × 2 links. */
export const LINKS = (T + 1) * N * 2;

/** φ(d) ≥ 0, with the series keeping the equilibrium background exactly 0. */
export function phi(d: number): number {
  if (Math.abs(d) < 1e-2) return d * d / 2 - d ** 3 / 6 + d ** 4 / 12 - d ** 5 / 20;
  return (1 + d) * Math.log1p(d) - d;
}

/** Evolve the f64 history and evaluate φ on every link. Dissipation at a
 * vertex is φ(in) − φ(out); it is ≥ 0 at every vertex. */
export function cpuField(a: number) {
  const field = new Float64Array(LINKS), phiF = new Float64Array(LINKS);
  const row = (t: number) => t * N * 2;
  for (let x = 0; x < N; x++) {
    let d = 0;
    for (const xc of CENTRES) if (Math.abs(x - xc) < HW) d += A * Math.cos(Math.PI * (x - xc) / (2 * HW)) ** 2;
    field[row(0) + 2 * x] = d;
    field[row(0) + 2 * x + 1] = d;
  }
  let sumSigma = 0, minSigma = Infinity;
  for (let x = 0; x < N; x++) {
    const p = phi(field[row(0) + 2 * x]);
    phiF[row(0) + 2 * x] = p;
    phiF[row(0) + 2 * x + 1] = p;
  }
  for (let t = 0; t < T; t++) {
    const s0 = row(t), s1 = row(t + 1);
    for (let x = 0; x < N; x++) {
      const rin = field[s0 + ((x - 1 + N) % N) * 2], lin = field[s0 + ((x + 1) % N) * 2 + 1];
      field[s1 + 2 * x] = (1 - a) * rin + a * lin;
      field[s1 + 2 * x + 1] = a * rin + (1 - a) * lin;
    }
    for (let x = 0; x < N; x++) {
      const pr = phi(field[s1 + 2 * x]), pl = phi(field[s1 + 2 * x + 1]);
      phiF[s1 + 2 * x] = pr;
      phiF[s1 + 2 * x + 1] = pl;
      const s = phiF[s0 + ((x - 1 + N) % N) * 2] + phiF[s0 + ((x + 1) % N) * 2 + 1] - pr - pl;
      sumSigma += s;
      if (s < minSigma) minSigma = s;
    }
  }
  const info = (t: number) => {
    let s = 0;
    for (let x = 0; x < N; x++) s += phiF[row(t) + 2 * x] + phiF[row(t) + 2 * x + 1];
    return s;
  };
  return { field, phiF, minSigma, sumSigma, D0: info(0), DT: info(T) };
}

export type FrameCurve = { s0: number; s1: number; D: Float64Array; rises: number; gamma: number };
export type WallCurve = { D: Float64Array; rises: number; largest: number };

/** Information on the slices of the observer moving at u: level s of the
 * time function f = t − u(x−c) sums φ over the links p→q with f(p) < s ≤
 * f(q). Valid levels run from ⌈R|u|⌉+1 to ⌊(T−1)(1−|u|) − R|u|⌋. */
export function frameCurve(phiF: Float64Array, u: number): FrameCurve {
  const s0 = Math.ceil(R * Math.abs(u)) + 1, s1 = Math.floor((T - 1) * (1 - Math.abs(u)) - R * Math.abs(u));
  const D = new Float64Array(s1 - s0 + 1);
  for (const side of [0, 1]) {
    const d = 1 - 2 * side;
    for (let t = 0; t < T; t++) {
      const base = t * N * 2 + side;
      for (let x = 0; x < N; x++) {
        const p = phiF[base + 2 * x];
        if (p === 0) continue;
        const fp = t - u * (x - C), fq = t + 1 - u * (x + d - C);
        for (let s = Math.floor(fp) + 1; s <= fq; s++) if (s >= s0 && s <= s1) D[s - s0] += p;
      }
    }
  }
  let rises = 0;
  for (let i = 1; i < D.length; i++) if (D[i] - D[i - 1] > 1e-12) rises++;
  return { s0, s1, D, rises, gamma: 1 / Math.sqrt(1 - u * u) };
}

/** Information of the region c + ⌊v·t⌋ ≤ x ≤ c + 900 − t on rest-frame
 * slices, t = 0…399: the left wall moves at v, the right end retreats at
 * light speed, so for v ≥ 1 the region lies inside the domain of dependence
 * of its predecessor and the sum never rises for any state. */
export function wallCurve(phiF: Float64Array, v: number, steps = 400): WallCurve {
  const D = new Float64Array(steps);
  for (let t = 0; t < steps; t++) {
    const base = t * N * 2;
    let s = 0;
    for (let x = C + Math.floor(v * t); x <= C + XR - t; x++) s += phiF[base + 2 * x] + phiF[base + 2 * x + 1];
    D[t] = s;
  }
  let rises = 0, largest = 0;
  for (let t = 1; t < steps; t++) {
    const inc = D[t] - D[t - 1];
    if (inc > 1e-13) rises++;
    if (inc > largest) largest = inc;
  }
  return { D, rises, largest };
}

const shader = /* wgsl */ `
struct Params { t: u32, a: f32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> hist: array<f32>;
const n = 2048u; const c = 1024u;
// Host-rounded initial profile avoids adapter-dependent native cos error.
const bump = array<f32, 12>(${Array.from({ length: HW }, (_, dx) => Math.fround(A * Math.cos(Math.PI * dx / (2 * HW)) ** 2).toPrecision(9)).join(", ")});
@compute @workgroup_size(128) fn init(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x; if (x >= n) { return; }
  var s = 0.0;
  for (var k = 0u; k < 2u; k++) {
    let xc = select(c - 20u, c + 40u, k == 1u);
    let dx = u32(abs(i32(x) - i32(xc)));
    if (dx < 12u) { s += bump[dx]; }
  }
  hist[2u * x] = s; hist[2u * x + 1u] = s;
}
@compute @workgroup_size(128) fn step(@builtin(global_invocation_id) id: vec3u) {
  let x = id.x; if (x >= n) { return; }
  let b = p.t * n;
  let rin = hist[(b + (x + n - 1u) % n) * 2u];
  let lin = hist[(b + (x + 1u) % n) * 2u + 1u];
  let o = (b + n + x) * 2u;
  hist[o] = (1.0 - p.a) * rin + p.a * lin;
  hist[o + 1u] = p.a * rin + (1.0 - p.a) * lin;
}
`;

/** The whole space-time history of the link deviations in f32, in one
 * storage buffer: one init dispatch, then one dispatch per time step. */
export class Gas {
  device: GPUDevice;
  hist: GPUBuffer;
  uniform: GPUBuffer;
  pipeline: Record<"init" | "step", GPUComputePipeline>;
  watch: ReturnType<typeof watchDevice>;

  constructor(device: GPUDevice, a: number) {
    this.device = device;
    this.watch = watchDevice(device);
    this.hist = blank(device, LINKS * 4);
    this.uniform = device.createBuffer({ size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.uniform, 4, new Float32Array([a]));
    const layout = device.createBindGroupLayout({ entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
    ] });
    const module = device.createShaderModule({ code: shader });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipeline = {
      init: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "init" } }),
      step: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "step" } }),
    };
    this.bind = device.createBindGroup({ layout, entries: [
      { binding: 0, resource: { buffer: this.uniform } },
      { binding: 1, resource: { buffer: this.hist } },
    ] });
    this.dispatch("init");
  }
  bind: GPUBindGroup;

  dispatch(entry: "init" | "step", t = 0) {
    this.watch.check();
    if (entry === "step") this.device.queue.writeBuffer(this.uniform, 0, new Uint32Array([t]));
    const encoder = this.device.createCommandEncoder(), pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline[entry]);
    pass.setBindGroup(0, this.bind);
    pass.dispatchWorkgroups(Math.ceil(N / 128));
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  async run(): Promise<Float32Array> {
    for (let t = 0; t < T; t++) {
      this.dispatch("step", t);
      if (t % 64 === 63) await this.watch.race(this.device.queue.onSubmittedWorkDone());
    }
    await this.watch.race(this.device.queue.onSubmittedWorkDone());
    return new Float32Array((await this.watch.race(read(this.device, this.hist)))[0].buffer);
  }

  destroy() {
    this.hist.destroy();
    this.uniform.destroy();
  }
}

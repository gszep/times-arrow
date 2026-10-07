import { blank, read } from "./gpu.ts";
import { philoxWgsl } from "./philox.ts";

/** Per-step direction weights in 256ths of one draw: `e + w + n + s + zero
 * = 256`. A hop's log-ratio enters through `ln(e/w)`; the transverse and
 * stay weights keep the kernel a general driven walker (003 shares it). */
export type Weights = { e: number; w: number; n: number; s: number; zero: number };

/** Cumulative draw thresholds of one step: a top-8-bit draw `d` picks E if
 * `d < e`, W if `d < e + w`, N if `d < e + w + n`, S if `d < e + w + n + s`,
 * and stays otherwise — an exact integer comparison on every backend. */
export function thresholds(q: Weights): [number, number, number, number] {
  return [q.e, q.e + q.w, q.e + q.w + q.n, q.e + q.w + q.n + q.s];
}

/** The registered coordinate packing (003, pre-registration e74055a):
 * `packed = x | (y ≪ 10)` — x in bits 0–9, y in bits 10–19, bits 20–31
 * zero; each coordinate already wrapped with mask `n − 1`, so `n ≤ 1024`. */
export const PACK_Y = 10;
export const PACK_MASK = 1023;
export const decodeX = (packed: number): number => packed & PACK_MASK;
export const decodeY = (packed: number): number => (packed >> PACK_Y) & PACK_MASK;

// The direction thresholds are the contract between the arms and the kernel.
// Eight storage bindings per stage — the WebGPU-guaranteed default limit —
// so the tallies share one atomic buffer with the hop counts and the window,
// display and check accumulators share one occupancy buffer.
const walkWgsl = /* wgsl */ `
${philoxWgsl}
struct Params { n: u32, mask: u32, shift: u32, m: u32, batch: u32, T: u32, t: u32, seed0: u32,
  win: u32, disp: u32, wins: u32, grid: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> thr: array<vec4u>;
@group(0) @binding(2) var<storage, read_write> pos: array<u32>;
@group(0) @binding(3) var<storage, read_write> acc: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> edges: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read> mask0: array<u32>;
@group(0) @binding(6) var<storage, read> mask1: array<u32>;
@group(0) @binding(7) var<storage, read_write> cnt: array<atomic<u32>>;
@group(0) @binding(8) var<storage, read_write> hist: array<atomic<u32>>;

// The registered constructor: x = w mod n, y = (w ≫ log₂n) mod n of
// rand(seed, 0, i).x — uniform, hence exactly stationary for every weight
// vector (each walker's kernel is translation-invariant).
@compute @workgroup_size(256)
fn init(@builtin(global_invocation_id) g: vec3u) {
  let id = g.x;
  let b = id / p.m;
  if (b >= p.batch) { return; }
  let w = rand(p.seed0 + b, 0u, id % p.m).x;
  pos[b * p.m + id % p.m] = (w % p.n) | (((w >> p.shift) % p.n) << 10u);
}

// The registered 003 profile start: walker j ≡ 0 (mod 64) starts at
// x₀ = (j/64) mod n, every other walker at x₀ = 0; all y at 0.
@compute @workgroup_size(256)
fn initProfile(@builtin(global_invocation_id) g: vec3u) {
  let id = g.x;
  let b = id / p.m;
  if (b >= p.batch) { return; }
  let j = id % p.m;
  let prof = j % 64u == 0u;
  pos[b * p.m + j] = select(0u, (j / 64u) % p.n, prof);
}

// One dynamics implementation; the corner also counts each source out-edge.
// The acc buffer holds the E−W tallies of every (seed, step) in its first
// batch·T words and the E+W hop counts in its second batch·T.
fn hop(id: u32, recordEdges: bool) {
  let b = id / p.m;
  if (b >= p.batch) { return; }
  let j = b * p.m + id % p.m;
  let d = rand(p.seed0 + b, p.t, id % p.m).x >> 24u;
  let t = thr[p.t - 1u];
  let s = pos[j];
  var x = s & 1023u;
  var y = (s >> 10u) & 1023u;
  let cell = 4u * (y * p.n + x);
  let base = b * 4u * p.n * p.n;
  let k = b * p.T + p.t - 1u;
  if (d < t.x) {
    if (recordEdges) { atomicAdd(&edges[base + cell], 1u); }
    atomicAdd(&acc[k], 1);
    atomicAdd(&acc[p.batch * p.T + k], 1);
    x = (x + 1u) & p.mask;
  } else if (d < t.y) {
    if (recordEdges) { atomicAdd(&edges[base + cell + 1u], 1u); }
    atomicAdd(&acc[k], -1);
    atomicAdd(&acc[p.batch * p.T + k], 1);
    x = (x - 1u) & p.mask;
  } else if (d < t.z) {
    if (recordEdges) { atomicAdd(&edges[base + cell + 2u], 1u); }
    y = (y + 1u) & p.mask;
  } else if (d < t.w) {
    if (recordEdges) { atomicAdd(&edges[base + cell + 3u], 1u); }
    y = (y - 1u) & p.mask;
  }
  pos[j] = x | (y << 10u);
}

@compute @workgroup_size(256)
fn step(@builtin(global_invocation_id) g: vec3u) { hop(g.x, false); }

@compute @workgroup_size(256)
fn stepEdges(@builtin(global_invocation_id) g: vec3u) { hop(g.x, true); }

// Region occupancies at time t: cnt[(b·(T+1) + t)·2 + region], one pass over
// the walkers with the masks as per-site membership indicators.
@compute @workgroup_size(256)
fn count(@builtin(global_invocation_id) g: vec3u) {
  let id = g.x;
  let b = id / p.m;
  if (b >= p.batch) { return; }
  let s = pos[b * p.m + id % p.m];
  let cell = ((s >> 10u) & 1023u) * p.n + (s & 1023u);
  let base = (b * (p.T + 1u) + p.t) * 2u;
  if (mask0[cell] != 0u) { atomicAdd(&cnt[base], 1u); }
  if (mask1[cell] != 0u) { atomicAdd(&cnt[base + 1u], 1u); }
}

// The hist buffer in three sections: the window occupancy sums
// [(b·wins + win)·n + x], the display-time histograms
// [batch·wins·n + (b·grid + disp)·n + x], and the per-seed checks
// [batch·(wins+grid)·n + 2b] and [… + 2b + 1]. Column occupancy at time p.t
// is the pre-hop occupancy of hop p.t + 1; win/disp are slot indices or
// 0xFFFFFFFF for "skip".
@compute @workgroup_size(256)
fn occupy(@builtin(global_invocation_id) g: vec3u) {
  let id = g.x;
  let b = id / p.m;
  if (b >= p.batch) { return; }
  let x = pos[b * p.m + id % p.m] & 1023u;
  if (p.win != 0xFFFFFFFFu) { atomicAdd(&hist[(b * p.wins + p.win) * p.n + x], 1u); }
  if (p.disp != 0xFFFFFFFFu) {
    atomicAdd(&hist[p.batch * p.wins * p.n + (b * p.grid + p.disp) * p.n + x], 1u);
  }
}

// Bit-exact per-batch checks: the largest circle displacement of any walker
// from its own profile start (the C1 cone bound) and the OR of all y (zero
// in every 003 arm, where q_N = q_S = 0).
@compute @workgroup_size(256)
fn check(@builtin(global_invocation_id) g: vec3u) {
  let id = g.x;
  let b = id / p.m;
  if (b >= p.batch) { return; }
  let j = id % p.m;
  let s = pos[b * p.m + j];
  let prof = j % 64u == 0u;
  let x0 = select(0u, (j / 64u) % p.n, prof);
  let d = ((s & 1023u) + p.n - x0) & p.mask;
  let base = p.batch * (p.wins + p.grid) * p.n + 2u * b;
  atomicMax(&hist[base], min(d, p.n - d));
  atomicMax(&hist[base + 1u], (s >> 10u) & 1023u);
}

// Zero the accumulators of one batch (acc, hist) in one dispatch,
// overdispatched with per-section bounds checks.
@compute @workgroup_size(256)
fn zero(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i < 2u * p.batch * p.T) { atomicStore(&acc[i], 0); }
  if (i < p.batch * (p.wins + p.grid) * p.n + 2u * p.batch) { atomicStore(&hist[i], 0u); }
}
`;

/** The readback of one ensemble: per-(seed, step) tallies and hop counts,
 * per-(seed, cell) out-edge hops and per-(seed, time) region occupancies. */
type WalkRun = {
  /** [seeds·T]: the per-(seed, step t−1) tally n_E − n_W, bit-exact. */
  tallies: Int32Array;
  /** [seeds·T]: the per-(seed, step t−1) hop count n_E + n_W, bit-exact. */
  hops: Uint32Array;
  /** [seeds·4n²]: per (seed, cell·4 + dir) out-hop counts, bit-exact. */
  edges: Uint32Array | null;
  /** [seeds·(T+1)·2]: per (seed, t, region) occupancy, bit-exact. */
  counts: Uint32Array | null;
};

/** The readback of one profile batch (003): integer measurements, all
 * bit-exact; every consumer does its statistics in host f64. */
export type ProfileRun = {
  /** [batch·T]: per-(seed, step) tally n_E − n_W. */
  tallies: Int32Array;
  /** [batch·T]: per-(seed, step) hop count n_E + n_W. */
  hops: Uint32Array;
  /** [batch·wins·n]: per (seed, window, column) occupancy sums. */
  win: Uint32Array | null;
  /** [batch·grid·n]: per (seed, display time, column) occupancy. */
  dhist: Uint32Array | null;
  /** [batch·2]: per-seed [max circle displacement from the profile start,
   * OR of all y] at the batch's final time. */
  chk: Uint32Array;
  /** [batch·m]: packed positions at the final time T. */
  posT: Uint32Array | null;
  /** [batch·m]: packed positions at time 1 (the damage-pair snapshot). */
  pos1: Uint32Array | null;
};

/** The registered 003 measurement layout: for occupancy time τ = 0..T−1 the
 * window slot that accumulates τ (−1 = none), and for τ = 0..T the display
 * slot (−1 = none). `windowsOf`/`gridOf` in the experiment build it. */
export type ProfileLayout = { winAt: Int32Array; dispAt: Int32Array };

const NONE = 0xffffffff;

/** `m` independent walkers on the periodic `n×n` torus (`n` a power of two
 * ≤ 1024), one Philox word per (walker, step), dyadic direction weights per
 * step, and integer counters: per-(seed, step) E−W tallies and E+W hop
 * counts, per-(seed, cell) out-edge hops and per-(seed, time) region
 * occupancies, plus the 003 profile passes: the deterministic profile
 * start, per-(window, column) and per-(display time, column) occupancy
 * sums, and the cone/y checks. Every draw and every counter is bit-exact;
 * nothing about any experiment's arms is baked in — the protocol is a plain
 * per-step weight table.
 *
 * `edges`, `win` and `grid` allocate the optional measurement buffers
 * (per-cell edges, `win` window slots, `grid` display slots); unallocated
 * measurements are dummies and their passes throw. */
export class Walk {
  readonly device: GPUDevice;
  readonly n: number;
  readonly m: number;
  readonly T: number;
  readonly batch: number;
  readonly winSlots: number;
  readonly gridSlots: number;
  private params: GPUBuffer;
  private pos: GPUBuffer;
  private pos1: GPUBuffer;
  private acc: GPUBuffer;
  private edges: GPUBuffer;
  private cnt: GPUBuffer;
  private hist: GPUBuffer;
  private hasEdges: boolean;
  private pipeline: Record<"init" | "initProfile" | "step" | "stepEdges" | "count" | "occupy" | "check" | "zero", GPUComputePipeline>;
  private group: GPUBindGroup;

  constructor(device: GPUDevice, cfg: { n: number; m: number; T: number; batch: number; edges?: boolean; win?: number; grid?: number }) {
    const { n, m, T, batch } = cfg;
    if (n < 2 || n > 1024 || (n & (n - 1)) !== 0) throw new Error(`n = ${n} must be a power of two in [2, 1024]`);
    if (m < 1 || T < 1 || batch < 1) throw new Error("m, T, batch must be ≥ 1");
    if ((cfg.win ?? 0) < 0 || (cfg.grid ?? 0) < 0) throw new Error("win and grid slots must be ≥ 0");
    this.device = device;
    this.n = n;
    this.m = m;
    this.T = T;
    this.batch = batch;
    this.winSlots = cfg.win ?? 0;
    this.gridSlots = cfg.grid ?? 0;
    this.hasEdges = !!cfg.edges;
    const module = device.createShaderModule({ code: walkWgsl });
    const entries = ["uniform", "read-only-storage", "storage", "storage", "storage", "read-only-storage", "read-only-storage", "storage", "storage"].map(
      (type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: type as GPUBufferBindingType } }),
    );
    const layout = device.createBindGroupLayout({ entries });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipeline = {
      init: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "init" } }),
      initProfile: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "initProfile" } }),
      step: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "step" } }),
      stepEdges: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "stepEdges" } }),
      count: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "count" } }),
      occupy: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "occupy" } }),
      check: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "check" } }),
      zero: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "zero" } }),
    };
    const zeroed = (words: number) => {
      const b = blank(device, 4 * words);
      device.queue.writeBuffer(b, 0, new Uint32Array(words));
      return b;
    };
    this.params = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.pos = zeroed(batch * m);
    this.pos1 = zeroed(batch * m);
    this.acc = zeroed(2 * batch * T);
    this.edges = this.hasEdges ? zeroed(batch * 4 * n * n) : blank(device, 4);
    this.cnt = zeroed(batch * (T + 1) * 2);
    this.hist = zeroed(batch * (this.winSlots + this.gridSlots) * n + 2 * batch);
    const thr = zeroed(4 * T); // one vec4u per step
    const mask0 = zeroed(n * n);
    const mask1 = zeroed(n * n);
    let shift = 0;
    while ((1 << shift) < n) shift++;
    device.queue.writeBuffer(
      this.params,
      0,
      new Uint32Array([n, n - 1, shift, m, batch, T, 0, 0, NONE, NONE, this.winSlots, this.gridSlots]),
    );
    this.group = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: thr } },
        { binding: 2, resource: { buffer: this.pos } },
        { binding: 3, resource: { buffer: this.acc } },
        { binding: 4, resource: { buffer: this.edges } },
        { binding: 5, resource: { buffer: mask0 } },
        { binding: 6, resource: { buffer: mask1 } },
        { binding: 7, resource: { buffer: this.cnt } },
        { binding: 8, resource: { buffer: this.hist } },
      ],
    });
    this.masks = [mask0, mask1];
    this.thr = thr;
  }

  private masks: GPUBuffer[];
  private thr: GPUBuffer;

  /** The per-step weight table (length `T`; a constant protocol repeats one
   * entry). Mid-path changes take effect from the next step. */
  setProtocol(protocol: Weights[]): void {
    if (protocol.length !== this.T) throw new Error(`protocol has ${protocol.length} steps, expected ${this.T}`);
    const table = new Uint32Array(4 * this.T);
    for (let t = 0; t < this.T; t++) table.set(thresholds(protocol[t]), 4 * t);
    this.device.queue.writeBuffer(this.thr, 0, table);
  }

  /** Per-site membership indicators (0/1) of the two counted regions. */
  setRegions(mask0: Uint32Array, mask1: Uint32Array): void {
    if (mask0.length !== this.n * this.n || mask1.length !== this.n * this.n)
      throw new Error(`region masks need ${this.n * this.n} sites`);
    this.device.queue.writeBuffer(this.masks[0], 0, mask0);
    this.device.queue.writeBuffer(this.masks[1], 0, mask1);
  }

  private dispatch(
    entryPoint: "init" | "initProfile" | "step" | "stepEdges" | "count" | "occupy" | "check" | "zero",
    t: number,
    seed0: number,
    win = NONE,
    disp = NONE,
    threads = this.batch * this.m,
  ): void {
    this.device.queue.writeBuffer(this.params, 24, new Uint32Array([t, seed0, win, disp]));
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline[entryPoint]);
    pass.setBindGroup(0, this.group);
    pass.dispatchWorkgroups(Math.ceil(threads / 256));
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Draw the initial positions of the current batch, seeds `[seed0, seed0 + batch)`. */
  init(seed0: number): void {
    this.dispatch("init", 0, seed0);
  }

  /** The registered 003 profile start of the current batch (deterministic:
   * no seed enters it), seeds `[seed0, seed0 + batch)`. */
  initProfile(seed0: number): void {
    this.dispatch("initProfile", 0, seed0);
  }

  /** Step `t ∈ {1..T}` of the same batch; `edges` also counts per-edge hops. */
  step(t: number, seed0: number, edges = false): void {
    if (t < 1 || t > this.T) throw new Error(`step t = ${t} outside 1..${this.T}`);
    if (edges && !this.hasEdges) throw new Error("edges were not allocated for this Walk");
    this.dispatch(edges ? "stepEdges" : "step", t, seed0);
  }

  /** Occupancies of the two regions at time `t ∈ {0..T}` of the same batch. */
  countAt(t: number, seed0: number): void {
    if (t < 0 || t > this.T) throw new Error(`count t = ${t} outside 0..${this.T}`);
    this.dispatch("count", t, seed0);
  }

  /** Column occupancy at time `t ∈ {0..T}`: one count per walker into window
   * slot `win` and/or display slot `disp` (−1 skips that accumulator). */
  occupy(t: number, seed0: number, win: number, disp: number): void {
    if (t < 0 || t > this.T) throw new Error(`occupy t = ${t} outside 0..${this.T}`);
    if (win >= this.winSlots || disp >= this.gridSlots) throw new Error(`occupy slots (${win}, ${disp}) outside the allocated (${this.winSlots}, ${this.gridSlots})`);
    this.dispatch("occupy", t, seed0, win < 0 ? NONE : win, disp < 0 ? NONE : disp);
  }

  /** The bit-exact cone/y checks of the current batch at its current time. */
  checkCones(seed0: number): void {
    this.dispatch("check", 0, seed0);
  }

  /** Zero the profile accumulators (acc, hist) on the GPU. */
  zeroMeasure(): void {
    const words = Math.max(2 * this.batch * this.T, this.batch * (this.winSlots + this.gridSlots) * this.n + 2 * this.batch);
    this.dispatch("zero", 0, 0, NONE, NONE, words);
  }

  private zero(keep: { edges?: boolean; counts?: boolean }): void {
    const zeros = (b: GPUBuffer, words: number) =>
      this.device.queue.writeBuffer(b, 0, new Uint32Array(words), 0, words);
    zeros(this.acc, 2 * this.batch * this.T);
    if (keep.edges) zeros(this.edges, this.batch * 4 * this.n * this.n);
    if (keep.counts) zeros(this.cnt, this.batch * (this.T + 1) * 2);
  }

  /** The whole ensemble of `seeds` paths starting at seed `seed0`, reduced on
   * the GPU and read back once at the end (one mapped buffer). */
  async runSeeds(seed0: number, seeds: number, keep: { edges?: boolean; counts?: boolean } = {}): Promise<WalkRun> {
    const dev = this.device;
    if (keep.edges && !this.hasEdges) throw new Error("edges were not allocated for this Walk");
    const per = { acc: 8 * this.T, edges: 16 * this.n * this.n, counts: 8 * (this.T + 1) };
    const outA = blank(dev, seeds * per.acc);
    const outE = keep.edges ? blank(dev, seeds * per.edges) : null;
    const outC = keep.counts ? blank(dev, seeds * per.counts) : null;
    for (let done = 0; done < seeds; ) {
      const b = Math.min(this.batch, seeds - done);
      this.zero(keep);
      this.init(seed0 + done);
      if (keep.counts) this.countAt(0, seed0 + done);
      for (let t = 1; t <= this.T; t++) {
        this.step(t, seed0 + done, !!keep.edges);
        if (keep.counts) this.countAt(t, seed0 + done);
      }
      const enc = dev.createCommandEncoder();
      enc.copyBufferToBuffer(this.acc, 0, outA, done * per.acc, b * per.acc);
      if (outE) enc.copyBufferToBuffer(this.edges, 0, outE, done * per.edges, b * per.edges);
      if (outC) enc.copyBufferToBuffer(this.cnt, 0, outC, done * per.counts, b * per.counts);
      dev.queue.submit([enc.finish()]);
      done += b;
    }
    const parts = await read(dev, outA, ...(outE ? [outE] : []), ...(outC ? [outC] : []));
    outA.destroy();
    outE?.destroy();
    outC?.destroy();
    const acc = parts[0];
    return {
      tallies: new Int32Array(acc.buffer, acc.byteOffset, seeds * this.T),
      hops: acc.subarray(acc.byteOffset / 4 + seeds * this.T, acc.byteOffset / 4 + 2 * seeds * this.T),
      edges: outE ? parts[1] : null,
      counts: outC ? parts[outE ? 2 : 1] : null,
    };
  }

  /** One batch of the registered 003 profile protocol, seeds
   * `[seed0, seed0 + batch)`: the deterministic start, an occupancy pass
   * before every hop (window slot `lay.winAt[τ]` at time τ) and at the
   * display times `lay.dispAt`, the cone/y checks at the final time, and
   * every kept measurement read back in one mapped buffer. */
  async profileBatch(seed0: number, lay: ProfileLayout, keep: { win?: boolean; grid?: boolean; pos?: boolean; pos1?: boolean } = {}): Promise<ProfileRun> {
    if (lay.winAt.length !== this.T || lay.dispAt.length !== this.T + 1)
      throw new Error(`layout needs ${this.T} window times and ${this.T + 1} display times`);
    if ((keep.win && !this.winSlots) || (keep.grid && !this.gridSlots))
      throw new Error("occupancy buffers were not allocated for this Walk");
    const winAt = keep.win ? lay.winAt : null;
    const dispAt = keep.grid ? lay.dispAt : null;
    const slot = (tab: Int32Array | null, i: number) => (tab && tab[i] >= 0 ? tab[i] : -1);
    this.zeroMeasure();
    this.initProfile(seed0);
    const occ = (i: number) => {
      const w = slot(winAt, i);
      const d = slot(dispAt, i);
      if (w >= 0 || d >= 0) this.occupy(i, seed0, w, d);
    };
    occ(0);
    for (let t = 1; t <= this.T; t++) {
      this.step(t, seed0);
      if (t === 1 && keep.pos1) {
        const enc = this.device.createCommandEncoder();
        enc.copyBufferToBuffer(this.pos, 0, this.pos1, 0, this.pos.size);
        this.device.queue.submit([enc.finish()]);
      }
      if (t < this.T) occ(t);
    }
    if (dispAt && dispAt[this.T] >= 0) this.occupy(this.T, seed0, -1, dispAt[this.T]);
    this.checkCones(seed0);
    const parts = await read(
      this.device,
      this.acc,
      this.hist,
      ...(keep.pos ? [this.pos] : []),
      ...(keep.pos1 ? [this.pos1] : []),
    );
    const acc = parts[0];
    const hist = parts[1];
    const histWords = this.batch * (this.winSlots + this.gridSlots) * this.n;
    const off = 2 + (keep.pos ? 1 : 0) + (keep.pos1 ? 1 : 0);
    return {
      tallies: new Int32Array(acc.buffer, acc.byteOffset, this.batch * this.T),
      hops: acc.subarray(acc.byteOffset / 4 + this.batch * this.T, acc.byteOffset / 4 + 2 * this.batch * this.T),
      win: keep.win ? hist.subarray(0, this.batch * this.winSlots * this.n) : null,
      dhist: keep.grid ? hist.subarray(this.batch * this.winSlots * this.n, histWords) : null,
      chk: hist.subarray(histWords, histWords + 2 * this.batch),
      posT: keep.pos ? parts[off - 1] : null,
      pos1: keep.pos1 ? parts[off] : null,
    };
  }

  /** The live batch: current walker positions packed `x | y ≪ 10`. */
  async positions(): Promise<Uint32Array> {
    return (await read(this.device, this.pos))[0];
  }

  /** Positions, tallies, hop counts and edge counts batched into one readback. */
  async snapshot() {
    const [pos, acc, edges] = await read(this.device, this.pos, this.acc, this.edges);
    return {
      pos,
      tallies: new Int32Array(acc.buffer, acc.byteOffset, this.batch * this.T),
      hops: acc.subarray(acc.byteOffset / 4 + this.batch * this.T, acc.byteOffset / 4 + 2 * this.batch * this.T),
      edges: this.hasEdges ? edges : null,
    };
  }

  /** Zero the live batch's tallies and hop counts (a fresh path starts here). */
  zeroTally(): void {
    this.device.queue.writeBuffer(this.acc, 0, new Uint32Array(2 * this.batch * this.T));
  }

  destroy(): void {
    for (const b of [this.pos, this.pos1, this.acc, this.edges, this.cnt, this.hist, this.params, this.thr, ...this.masks]) b.destroy();
  }
}

import { read, storage } from "./gpu.ts";
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

// The direction thresholds are the contract between the arms and the kernel.
const walkWgsl = /* wgsl */ `
${philoxWgsl}
struct Params { n: u32, mask: u32, shift: u32, m: u32, batch: u32, T: u32, t: u32, seed0: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> thr: array<vec4u>;
@group(0) @binding(2) var<storage, read_write> pos: array<u32>;
@group(0) @binding(3) var<storage, read_write> tally: array<atomic<i32>>;
@group(0) @binding(4) var<storage, read_write> edges: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read> mask0: array<u32>;
@group(0) @binding(6) var<storage, read> mask1: array<u32>;
@group(0) @binding(7) var<storage, read_write> cnt: array<atomic<u32>>;

// The registered constructor: x = w mod n, y = (w ≫ log₂n) mod n of
// rand(seed, 0, i).x — uniform, hence exactly stationary for every weight
// vector (each walker's kernel is translation-invariant).
@compute @workgroup_size(256)
fn init(@builtin(global_invocation_id) g: vec3u) {
  let id = g.x;
  let b = id / p.m;
  if (b >= p.batch) { return; }
  let w = rand(p.seed0 + b, 0u, id % p.m).x;
  pos[b * p.m + id % p.m] = (w % p.n) | (((w >> p.shift) % p.n) << 8u);
}

// One dynamics implementation; the corner also counts each source out-edge.
fn hop(id: u32, recordEdges: bool) {
  let b = id / p.m;
  if (b >= p.batch) { return; }
  let j = b * p.m + id % p.m;
  let d = rand(p.seed0 + b, p.t, id % p.m).x >> 24u;
  let t = thr[p.t - 1u];
  let s = pos[j];
  var x = s & 0xffu;
  var y = (s >> 8u) & 0xffu;
  let cell = 4u * (y * p.n + x);
  let base = b * 4u * p.n * p.n;
  if (d < t.x) {
    if (recordEdges) { atomicAdd(&edges[base + cell], 1u); }
    atomicAdd(&tally[b * p.T + p.t - 1u], 1);
    x = (x + 1u) & p.mask;
  } else if (d < t.y) {
    if (recordEdges) { atomicAdd(&edges[base + cell + 1u], 1u); }
    atomicAdd(&tally[b * p.T + p.t - 1u], -1);
    x = (x - 1u) & p.mask;
  } else if (d < t.z) {
    if (recordEdges) { atomicAdd(&edges[base + cell + 2u], 1u); }
    y = (y + 1u) & p.mask;
  } else if (d < t.w) {
    if (recordEdges) { atomicAdd(&edges[base + cell + 3u], 1u); }
    y = (y - 1u) & p.mask;
  }
  pos[j] = x | (y << 8u);
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
  let cell = ((s >> 8u) & 0xffu) * p.n + (s & 0xffu);
  let base = (b * (p.T + 1u) + p.t) * 2u;
  if (mask0[cell] != 0u) { atomicAdd(&cnt[base], 1u); }
  if (mask1[cell] != 0u) { atomicAdd(&cnt[base + 1u], 1u); }
}
`;

export type WalkRun = {
  /** [seeds·T]: the per-(seed, step t−1) tally n_E − n_W, bit-exact. */
  tallies: Int32Array;
  /** [seeds·4n²]: per (seed, cell·4 + dir) out-hop counts, bit-exact. */
  edges: Uint32Array | null;
  /** [seeds·(T+1)·2]: per (seed, t, region) occupancy, bit-exact. */
  counts: Uint32Array | null;
};

/** `m` independent walkers on the periodic `n×n` torus (`n` a power of
 * two), one Philox word per (walker, step), dyadic direction weights per
 * step, and integer counters: per-(seed, step) E−W tallies, per-(seed,
 * cell) out-edge hop counts and per-(seed, time) region occupancies. Every
 * draw and every counter is bit-exact; nothing about the arms of 002 is
 * baked in — the protocol is a plain per-step weight table. */
export class Walk {
  readonly device: GPUDevice;
  readonly n: number;
  readonly m: number;
  readonly T: number;
  readonly batch: number;
  private params: GPUBuffer;
  private pos: GPUBuffer;
  private tally: GPUBuffer;
  private edges: GPUBuffer;
  private cnt: GPUBuffer;
  private pipeline: Record<"init" | "step" | "stepEdges" | "count", GPUComputePipeline>;
  private group: GPUBindGroup;

  constructor(device: GPUDevice, cfg: { n: number; m: number; T: number; batch: number }) {
    const { n, m, T, batch } = cfg;
    if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`n = ${n} must be a power of two ≥ 2`);
    if (m < 1 || T < 1 || batch < 1) throw new Error(`m, T, batch must be ≥ 1`);
    this.device = device;
    this.n = n;
    this.m = m;
    this.T = T;
    this.batch = batch;
    const module = device.createShaderModule({ code: walkWgsl });
    const entries = ["uniform", "read-only-storage", "storage", "storage", "storage", "read-only-storage", "read-only-storage", "storage"].map(
      (type, binding) => ({ binding, visibility: GPUShaderStage.COMPUTE, buffer: { type: type as GPUBufferBindingType } }),
    );
    const layout = device.createBindGroupLayout({ entries });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipeline = {
      init: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "init" } }),
      step: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "step" } }),
      stepEdges: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "stepEdges" } }),
      count: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "count" } }),
    };
    const blank = (words: number) => {
      const b = device.createBuffer({
        size: 4 * words,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(b, 0, new Uint32Array(words));
      return b;
    };
    this.params = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.pos = blank(batch * m);
    this.tally = blank(batch * T);
    this.edges = blank(batch * 4 * n * n);
    this.cnt = blank(batch * (T + 1) * 2);
    const thr = blank(4 * T); // one vec4u per step
    const mask0 = blank(n * n);
    const mask1 = blank(n * n);
    let shift = 0;
    while ((1 << shift) < n) shift++;
    device.queue.writeBuffer(this.params, 0, new Uint32Array([n, n - 1, shift, m, batch, T, 0, 0]));
    this.group = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: thr } },
        { binding: 2, resource: { buffer: this.pos } },
        { binding: 3, resource: { buffer: this.tally } },
        { binding: 4, resource: { buffer: this.edges } },
        { binding: 5, resource: { buffer: mask0 } },
        { binding: 6, resource: { buffer: mask1 } },
        { binding: 7, resource: { buffer: this.cnt } },
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

  private dispatch(entryPoint: "init" | "step" | "stepEdges" | "count", t: number, seed0: number): void {
    this.device.queue.writeBuffer(this.params, 24, new Uint32Array([t, seed0]));
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipeline[entryPoint]);
    pass.setBindGroup(0, this.group);
    pass.dispatchWorkgroups(Math.ceil((this.batch * this.m) / 256));
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Draw the initial positions of the current batch, seeds `[seed0, seed0 + batch)`. */
  init(seed0: number): void {
    this.dispatch("init", 0, seed0);
  }

  /** Step `t ∈ {1..T}` of the same batch; `edges` also counts per-edge hops. */
  step(t: number, seed0: number, edges = false): void {
    if (t < 1 || t > this.T) throw new Error(`step t = ${t} outside 1..${this.T}`);
    this.dispatch(edges ? "stepEdges" : "step", t, seed0);
  }

  /** Occupancies of the two regions at time `t ∈ {0..T}` of the same batch. */
  countAt(t: number, seed0: number): void {
    if (t < 0 || t > this.T) throw new Error(`count t = ${t} outside 0..${this.T}`);
    this.dispatch("count", t, seed0);
  }

  private zero(keep: { edges?: boolean; counts?: boolean }): void {
    const zeros = (b: GPUBuffer, words: number) =>
      this.device.queue.writeBuffer(b, 0, new Uint32Array(words), 0, words);
    zeros(this.tally, this.batch * this.T);
    if (keep.edges) zeros(this.edges, this.batch * 4 * this.n * this.n);
    if (keep.counts) zeros(this.cnt, this.batch * (this.T + 1) * 2);
  }

  /** The whole ensemble of `seeds` paths starting at seed `seed0`, reduced on
   * the GPU and read back once at the end (one mapped buffer). */
  async runSeeds(seed0: number, seeds: number, keep: { edges?: boolean; counts?: boolean } = {}): Promise<WalkRun> {
    const dev = this.device;
    const blank = (bytes: number) =>
      dev.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });
    const per = { tally: 4 * this.T, edges: 16 * this.n * this.n, counts: 8 * (this.T + 1) };
    const outT = blank(seeds * per.tally);
    const outE = keep.edges ? blank(seeds * per.edges) : null;
    const outC = keep.counts ? blank(seeds * per.counts) : null;
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
      enc.copyBufferToBuffer(this.tally, 0, outT, done * per.tally, b * per.tally);
      if (outE) enc.copyBufferToBuffer(this.edges, 0, outE, done * per.edges, b * per.edges);
      if (outC) enc.copyBufferToBuffer(this.cnt, 0, outC, done * per.counts, b * per.counts);
      dev.queue.submit([enc.finish()]);
      done += b;
    }
    const parts = await read(dev, outT, ...(outE ? [outE] : []), ...(outC ? [outC] : []));
    outT.destroy();
    outE?.destroy();
    outC?.destroy();
    return {
      tallies: new Int32Array(parts[0].buffer, parts[0].byteOffset, seeds * this.T),
      edges: outE ? parts[1] : null,
      counts: outC ? parts[outE ? 2 : 1] : null,
    };
  }

  /** The live batch: current walker positions packed `x | y ≪ 8`. */
  async positions(): Promise<Uint32Array> {
    return (await read(this.device, this.pos))[0];
  }

  /** Positions, tallies and edge counts batched into one mapped readback. */
  async snapshot() {
    const [pos, words, edges] = await read(this.device, this.pos, this.tally, this.edges);
    return { pos, tallies: new Int32Array(words.buffer, words.byteOffset, words.length), edges };
  }

  /** Zero the live batch's per-step tallies (a fresh path starts here). */
  zeroTally(): void {
    this.device.queue.writeBuffer(this.tally, 0, new Uint32Array(this.batch * this.T));
  }

  destroy(): void {
    for (const b of [this.pos, this.tally, this.edges, this.cnt, this.params, this.thr, ...this.masks]) b.destroy();
  }
}

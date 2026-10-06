// The pre-registered 001 protocol: observables reduced on the GPU, block
// entropy from exact integer counts, and the run driver used by both the
// review page and the sweep. Everything bit-level (echo, Hamming, cone) is
// exact; `S_b` is f64 from integer counts.
import type { Adapter } from "../../src/gpu.ts";
import { read } from "../../src/gpu.ts";
import { Hpp, nullState, packedState } from "../../src/hpp.ts";
import { undoFraction } from "./score.ts";

export type RunConfig = {
  n: number;
  seed: number;
  mode: "packed" | "null";
  tMax: number;
  tE: number;
  b: number[];
};

export type ForwardSample = { t: number; S: Record<number, number>; mass: number; momDev: number };
export type EchoSample = {
  r: number;
  Sp: Record<number, number>;
  Sd: Record<number, number>;
  massP: number;
  massD: number;
  H: number;
  sites: number;
  maxDist: number;
};
export type RunResult = {
  config: RunConfig;
  adapter: Adapter;
  forward: ForwardSample[];
  profiles: { px: number[]; py: number[] };
  echo: EchoSample[];
  finalHamming: number | null;
  naiveHamming: number | null;
  naiveS: Record<number, number> | null;
  undo: { pristine: number; damaged: number } | null;
};

/** The pre-registered sampling grid: `t = 0`, then powers of two up to 1024,
 * then every 128 steps, to `tMax` (which is always sampled). */
export function sampleTimes(tMax: number): number[] {
  const ts = new Set<number>([0, tMax]);
  for (let t = 1; t <= Math.min(1024, tMax); t *= 2) ts.add(t);
  for (let t = 1152; t <= tMax; t += 128) ts.add(t);
  return [...ts].sort((a, b) => a - b);
}

/** The S1 damage depths: powers of two up to 1024, then every 128 steps, to
 * `tE` — plus `r = 0`, where `H = 1` by construction. */
export function damageDepths(tE: number): number[] {
  const rs = new Set<number>([0, tE]);
  for (let r = 1; r <= Math.min(1024, tE); r *= 2) rs.add(r);
  for (let r = 1152; r <= tE; r += 128) rs.add(r);
  return [...rs].sort((a, b) => a - b);
}

/** The echo is sampled at reverse depths `r = tE − t` for every forward sample
 * time `t ≤ tE`, so the reverse and forward curves align sample for sample. */
const echoDepths = (tE: number) => sampleTimes(tE).map((t) => tE - t);

// ln k! as a cumulative sum of logs: exact to ~1e-11 relative over our range.
let FACT: Float64Array | null = null;
const lnFactorial = (m: number) => {
  if (FACT && FACT.length > m) return FACT;
  FACT = new Float64Array(m + 1);
  for (let k = 2; k <= m; k++) FACT[k] = FACT[k - 1] + Math.log(k);
  return FACT;
};

/** `ln C(m, k)` in nats; an empty block contributes 0. */
const lnC = (m: number, k: number) => {
  if (k === 0) return 0;
  const f = lnFactorial(m);
  return f[m] - f[k] - f[m - k];
};

/** `S_b = Σ_blocks ln C(4b², N_block)` from the 4×4-site block-count grid
 * (row-major `(n/4)²`), which every registered `b ∈ {4, 8, 16, 32, 64}` refines. */
function blockEntropy(counts: Uint32Array, n: number, b: number): number {
  const f = b / 4;
  const per = n / b;
  let S = 0;
  for (let By = 0; By < per; By++)
    for (let Bx = 0; Bx < per; Bx++) {
      let c = 0;
      for (let dy = 0; dy < f; dy++)
        for (let dx = 0; dx < f; dx++) c += counts[(By * f + dy) * (n / 4) + Bx * f + dx];
      S += lnC(4 * b * b, c);
    }
  return S;
}

const entropies = (counts: Uint32Array, n: number, b: number[]) => {
  const S: Record<number, number> = {};
  for (const k of b) S[k] = blockEntropy(counts, n, k);
  return S;
};

const popcount = (s: number) => (s & 1) + ((s >>> 1) & 1) + ((s >>> 2) & 1) + ((s >>> 3) & 1);

const rigWgsl = /* wgsl */ `
struct Params { n: u32, fx: u32, fy: u32, pad: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> a: array<u32>;
@group(0) @binding(2) var<storage, read> b: array<u32>;
@group(0) @binding(3) var<storage, read_write> out: array<atomic<u32>>;

var<workgroup> w: array<u32, 256>;
var<workgroup> w2: array<u32, 256>;
var<workgroup> w3: array<u32, 256>;

fn mass4(s: u32) -> u32 {
  let t = s & 0xfu;
  return (t & 1u) + ((t >> 1u) & 1u) + ((t >> 2u) & 1u) + ((t >> 3u) & 1u);
}

// Total particle number of \`a\` into out[0] (zero it first).
@compute @workgroup_size(16, 16)
fn mass(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_id) l: vec3u) {
  let i = l.y * 16u + l.x;
  w[i] = 0u;
  if (g.x < p.n && g.y < p.n) { w[i] = mass4(a[g.y * p.n + g.x]); }
  workgroupBarrier();
  var s = 128u;
  while (s > 0u) {
    if (i < s) { w[i] += w[i + s]; }
    workgroupBarrier();
    s = s >> 1u;
  }
  if (i == 0u) { atomicAdd(&out[0u], w[0]); }
}

// Per-row x-momentum and per-column y-momentum of \`a\` as i32 bit patterns
// into out[1 .. 1 + 2n): rows first, then columns. out[0] is untouched.
@compute @workgroup_size(256)
fn momentum(@builtin(workgroup_id) wg: vec3u, @builtin(local_invocation_id) l: vec3u) {
  var t = 0;
  if (wg.y == 0u) {
    for (var x = l.x; x < p.n; x += 256u) {
      let s = a[wg.x * p.n + x];
      t += i32(s & 1u) - i32((s >> 2u) & 1u);
    }
  } else {
    for (var y = l.x; y < p.n; y += 256u) {
      let s = a[y * p.n + wg.x];
      t += i32((s >> 1u) & 1u) - i32((s >> 3u) & 1u);
    }
  }
  w[l.x] = u32(t);
  workgroupBarrier();
  var s = 128u;
  while (s > 0u) {
    if (l.x < s) { w[l.x] += w[l.x + s]; }
    workgroupBarrier();
    s = s >> 1u;
  }
  if (l.x == 0u) { atomicStore(&out[1u + wg.y * p.n + wg.x], w[0]); }
}

// 4×4-site block counts of \`a\`, row-major (n/4)², into out[1 + 2n ..].
@compute @workgroup_size(4, 4)
fn blocks(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_id) l: vec3u) {
  let i = l.y * 4u + l.x;
  w[i] = 0u;
  if (g.x < p.n && g.y < p.n) { w[i] = mass4(a[g.y * p.n + g.x]); }
  workgroupBarrier();
  if (i == 0u) {
    var sum = 0u;
    for (var k = 0u; k < 16u; k++) { sum += w[k]; }
    let G = p.n / 4u;
    atomicStore(&out[1u + 2u * p.n + (g.y / 4u) * G + g.x / 4u], sum);
  }
}

// Pair variant: masses of \`a\` into out[3] and \`b\` into out[4] (zero both).
@compute @workgroup_size(16, 16)
fn pairMass(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_id) l: vec3u) {
  let i = l.y * 16u + l.x;
  w[i] = 0u;
  w2[i] = 0u;
  if (g.x < p.n && g.y < p.n) {
    let j = g.y * p.n + g.x;
    w[i] = mass4(a[j]);
    w2[i] = mass4(b[j]);
  }
  workgroupBarrier();
  var s = 128u;
  while (s > 0u) {
    if (i < s) { w[i] += w[i + s]; w2[i] += w2[i + s]; }
    workgroupBarrier();
    s = s >> 1u;
  }
  if (i == 0u) { atomicAdd(&out[3u], w[0]); atomicAdd(&out[4u], w2[0]); }
}

// Pair variant: block counts of \`a\` into out[5 ..] and of \`b\` into
// out[5 + (n/4)² ..].
@compute @workgroup_size(4, 4)
fn pairBlocks(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_id) l: vec3u) {
  let i = l.y * 4u + l.x;
  w[i] = 0u;
  w2[i] = 0u;
  if (g.x < p.n && g.y < p.n) {
    let j = g.y * p.n + g.x;
    w[i] = mass4(a[j]);
    w2[i] = mass4(b[j]);
  }
  workgroupBarrier();
  if (i == 0u) {
    var sa = 0u;
    var sb = 0u;
    for (var k = 0u; k < 16u; k++) { sa += w[k]; sb += w2[k]; }
    let G = p.n / 4u;
    let bi = (g.y / 4u) * G + g.x / 4u;
    atomicStore(&out[5u + bi], sa);
    atomicStore(&out[5u + G * G + bi], sb);
  }
}

// Damage of \`b\` against \`a\`: XOR slot count into out[0], number of damaged
// sites into out[1], largest torus diamond distance from (p.fx, p.fy) of a
// damaged site into out[2] (zero out[0..3) first).
@compute @workgroup_size(16, 16)
fn diff(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_id) l: vec3u) {
  let i = l.y * 16u + l.x;
  w[i] = 0u;
  w2[i] = 0u;
  w3[i] = 0u;
  if (g.x < p.n && g.y < p.n) {
    let x = a[g.y * p.n + g.x] ^ b[g.y * p.n + g.x];
    if (x != 0u) {
      w[i] = mass4(x);
      w2[i] = 1u;
      let dx0 = max(g.x, p.fx) - min(g.x, p.fx);
      let dy0 = max(g.y, p.fy) - min(g.y, p.fy);
      w3[i] = min(dx0, p.n - dx0) + min(dy0, p.n - dy0);
    }
  }
  workgroupBarrier();
  var s = 128u;
  while (s > 0u) {
    if (i < s) { w[i] += w[i + s]; w2[i] += w2[i + s]; w3[i] = max(w3[i], w3[i + s]); }
    workgroupBarrier();
    s = s >> 1u;
  }
  if (i == 0u) {
    atomicAdd(&out[0u], w[0]);
    atomicAdd(&out[1u], w2[0]);
    atomicMax(&out[2u], w3[0]);
  }
}
`;

/** The per-sample observable rig over one or two lattices. Layouts, in words:
 * single `[mass][px n][py n][counts (n/4)²]`; pair
 * `[H][sites][maxDist][massP][massD][countsP (n/4)²][countsD]`. */
class Rig {
  private device: GPUDevice;
  private n: number;
  private watch: DeviceWatch;
  private out: GPUBuffer;
  private layout: GPUBindGroupLayout;
  private pipelines: Record<string, GPUComputePipeline>;
  private single: number;
  private pair: number;

  constructor(device: GPUDevice, n: number, watch: DeviceWatch) {
    this.device = device;
    this.n = n;
    this.watch = watch;
    const grid = (n / 4) ** 2;
    this.single = 1 + 2 * n + grid;
    this.pair = 5 + 2 * grid;
    const module = device.createShaderModule({ code: rigWgsl });
    const binding = (type: GPUBufferBindingType) => ({ visibility: GPUShaderStage.COMPUTE, buffer: { type } });
    this.layout = device.createBindGroupLayout({
      entries: [binding("uniform"), binding("read-only-storage"), binding("read-only-storage"), binding("storage")].map(
        (e, binding) => ({ binding, ...e }),
      ),
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.layout] });
    this.pipelines = Object.fromEntries(
      ["mass", "momentum", "blocks", "pairMass", "pairBlocks", "diff"].map((entryPoint) => [
        entryPoint,
        device.createComputePipeline({ layout, compute: { module, entryPoint } }),
      ]),
    );
    const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(params, 0, new Uint32Array([n, n / 2, n / 2, 0]));
    this.out = device.createBuffer({
      size: 4 * Math.max(this.single, this.pair),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.group = (a: GPUBuffer, b: GPUBuffer) =>
      device.createBindGroup({
        layout: this.layout,
        entries: [
          { binding: 0, resource: { buffer: params } },
          { binding: 1, resource: { buffer: a } },
          { binding: 2, resource: { buffer: b } },
          { binding: 3, resource: { buffer: this.out } },
        ],
      });
  }

  private group: (a: GPUBuffer, b: GPUBuffer) => GPUBindGroup;

  private submit(entries: string[], a: GPUBuffer, b: GPUBuffer, zero: number): void {
    this.device.queue.writeBuffer(this.out, 0, new Uint32Array(zero));
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    for (const e of entries) {
      pass.setPipeline(this.pipelines[e]);
      pass.setBindGroup(0, this.group(a, b));
      if (e === "blocks" || e === "pairBlocks") pass.dispatchWorkgroups(this.n / 4, this.n / 4);
      else if (e === "momentum") pass.dispatchWorkgroups(this.n, 2);
      else pass.dispatchWorkgroups(this.n / 16, this.n / 16);
    }
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Mass, per-row/per-column momentum and block counts of `a`. */
  async sample(a: GPUBuffer) {
    this.submit(["mass", "momentum", "blocks"], a, a, 1);
    const words = (await this.watch.race(read(this.device, this.out)))[0];
    return {
      mass: words[0],
      momentum: new Int32Array(words.slice(1, 1 + 2 * this.n).buffer),
      counts: words.slice(1 + 2 * this.n, this.single),
    };
  }

  /** The same for the pair `a`, `b`, plus the damage of `b` against `a`. */
  async pairSample(a: GPUBuffer, b: GPUBuffer) {
    this.submit(["pairMass", "pairBlocks", "diff"], a, b, 5);
    const words = (await this.watch.race(read(this.device, this.out)))[0];
    const grid = (this.n / 4) ** 2;
    return {
      H: words[0],
      sites: words[1],
      maxDist: words[2],
      massP: words[3],
      massD: words[4],
      countsP: words.slice(5, 5 + grid),
      countsD: words.slice(5 + grid, this.pair),
    };
  }

  /** The damage of `b` against `a`, nothing else. */
  async damage(a: GPUBuffer, b: GPUBuffer) {
    this.submit(["diff"], a, b, 3);
    const words = (await this.watch.race(read(this.device, this.out)))[0];
    return { H: words[0], sites: words[1], maxDist: words[2] };
  }

  destroy(): void {
    this.out.destroy();
  }
}

/** Watches `device.lost` for the lifetime of one run: every run subscribes
 * when it starts, every readback is raced against it (a lost device can leave
 * a pending readback hanging), and the check throws the moment the promise
 * has resolved. `device.lost` settles at most once and never rejects, so
 * leftover subscriptions from finished runs are inert. */
export function watchDevice(device: GPUDevice) {
  let info: GPUDeviceLostInfo | null = null;
  const lost = device.lost.then((i) => {
    info = i;
  });
  const err = () => new Error(`device lost: ${info?.reason ?? "unknown"}, ${info?.message ?? ""}`);
  const check = () => {
    if (info) throw err();
  };
  const race = async <T>(readback: Promise<T>): Promise<T> => {
    const first = await Promise.race([readback.then((r) => ({ r })), lost.then(() => ({ err: err() }))]);
    if ("err" in first) throw first.err;
    check();
    return first.r;
  };
  return { check, race };
}

export type DeviceWatch = ReturnType<typeof watchDevice>;

const blank = (device: GPUDevice, bytes: number) =>
  device.createBuffer({
    size: bytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  });

const copy = (device: GPUDevice, src: GPUBuffer, dst: GPUBuffer, bytes: number) => {
  const enc = device.createCommandEncoder();
  enc.copyBufferToBuffer(src, 0, dst, 0, bytes);
  device.queue.submit([enc.finish()]);
};

/** One pre-registered run: the forward grid to `tMax` (always), and for the
 * packed start also the Loschmidt echo with its paired single-bit-damage
 * twin and the naive flip-only negative control. The echo phases apply the
 * exact inverse step; the reverse state at depth `r` is then bit for bit the
 * forward state at `tE − r`. The naive control is `tE` more forward steps
 * and a flip: the turn flip cancels against the leading flip of the first
 * flip-conjugated step, leaving `flip ∘ step^(2·tE)` of the initial state. */
export async function run(device: GPUDevice, adapter: Adapter, cfg: RunConfig): Promise<RunResult> {
  const { n, seed, mode, tMax, tE } = cfg;
  if (n < 16 || (n & (n - 1)) !== 0) throw new Error(`n = ${n} must be a power of two ≥ 16`);
  if (!(0 < tE && tE <= tMax)) throw new Error(`need 0 < tE ≤ tMax, got tE = ${tE}, tMax = ${tMax}`);
  for (const b of cfg.b)
    if (b < 4 || b % 4 !== 0 || b > n || n % b !== 0) throw new Error(`b = ${b} must divide n = ${n}`);
  const count = (n * n) / 8;
  const bytes = 4 * n * n;
  // Aborts the run the moment the device is lost (the constructor readback and
  // every later one is checked; the Rig races each of its readbacks).
  const watch = watchDevice(device);

  const initial = mode === "packed" ? await packedState(device, seed, n) : await nullState(device, seed, n);
  watch.check();
  let mass = 0;
  for (const s of initial) mass += popcount(s);
  if (mass !== count) throw new Error(`constructor drew ${mass} particles, expected ${count}`);
  if (mode === "packed") {
    const side = n / 4;
    const lo = n / 2 - side / 2;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        if ((x < lo || x >= lo + side || y < lo || y >= lo + side) && popcount(initial[y * n + x]))
          throw new Error(`particle outside the block at (${x}, ${y})`);
  }

  const rig = new Rig(device, n, watch);
  const h = new Hpp(device, n);
  h.load(initial);
  const saveInit = blank(device, bytes);
  copy(device, h.buffer, saveInit, bytes);

  const ts = new Set(sampleTimes(tMax));
  if (mode === "packed") ts.add(tE);
  const forward: ForwardSample[] = [];
  let profiles: { px: number[]; py: number[] } | null = null;
  let reference: Int32Array | null = null;
  let saveTE = null as GPUBuffer | null;
  let prev = 0;
  for (const t of [...ts].sort((a, b) => a - b)) {
    h.step(t - prev);
    prev = t;
    if (mode === "packed" && t === tE) {
      saveTE = blank(device, bytes);
      copy(device, h.buffer, saveTE, bytes);
    }
    const s = await rig.sample(h.buffer);
    if (!profiles || !reference) {
      profiles = { px: [...s.momentum.slice(0, n)], py: [...s.momentum.slice(n)] };
      reference = s.momentum;
    }
    let momDev = 0;
    for (let i = 0; i < 2 * n; i++) momDev += Math.abs(s.momentum[i] - reference[i]);
    forward.push({ t, S: entropies(s.counts, n, cfg.b), mass: s.mass, momDev });
  }
  for (const s of forward)
    if (s.mass !== count)
      throw new Error(`particle number drifted at t = ${s.t}: ${s.mass} particles, expected ${count}`);

  let echo: EchoSample[] = [];
  let finalHamming: number | null = null;
  let naiveHamming: number | null = null;
  let naiveS: Record<number, number> | null = null;
  let undo: { pristine: number; damaged: number } | null = null;
  if (mode === "packed" && saveTE) {
    const depths = [...new Set([...echoDepths(tE), ...damageDepths(tE)])].sort((a, b) => a - b);
    const pristine = new Hpp(device, n);
    const damaged = new Hpp(device, n);
    copy(device, saveTE, pristine.buffer, bytes);
    copy(device, saveTE, damaged.buffer, bytes);
    damaged.xorEast((n / 2) * n + n / 2);
    let prevR = 0;
    for (const r of depths) {
      pristine.inv(r - prevR);
      damaged.inv(r - prevR);
      prevR = r;
      const s = await rig.pairSample(pristine.buffer, damaged.buffer);
      echo.push({
        r,
        Sp: entropies(s.countsP, n, cfg.b),
        Sd: entropies(s.countsD, n, cfg.b),
        massP: s.massP,
        massD: s.massD,
        H: s.H,
        sites: s.sites,
        maxDist: s.maxDist,
      });
    }
    // The damaged twin flipped one slot, so it carries N ± 1 particles for life.
    for (const s of echo)
      if (s.massP !== count || Math.abs(s.massD - count) !== 1)
        throw new Error(`particle number drifted during the echo at r = ${s.r}: ${s.massP}, ${s.massD}, expected ${count} ± 1`);
    finalHamming = (await rig.damage(pristine.buffer, saveInit)).H;

    const naive = new Hpp(device, n);
    copy(device, saveTE, naive.buffer, bytes);
    naive.step(tE);
    naive.flip();
    const ns = await rig.sample(naive.buffer);
    naiveS = entropies(ns.counts, n, cfg.b);
    naiveHamming = (await rig.damage(naive.buffer, saveInit)).H;

    const pb = cfg.b.includes(16) ? 16 : cfg.b[cfg.b.length - 1];
    undo = undoFraction(forward, echo, pb, tE);
    pristine.destroy();
    damaged.destroy();
    naive.destroy();
    saveTE.destroy();
  }

  await device.queue.onSubmittedWorkDone();
  watch.check();

  h.destroy();
  rig.destroy();
  saveInit.destroy();
  return { config: cfg, adapter, forward, profiles: profiles!, echo, finalHamming, naiveHamming, naiveS, undo };
}

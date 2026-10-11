import { blank, read } from "../src/gpu.ts";
import { philoxWgsl } from "../src/philox.ts";

/** Fixed geometry, in units of the unit-square table. */
export const ROOM = { x: 0.5, y: 0.6, h: 0.2 };
/** One speed for every particle, in table widths per step. */
export const SPEED = 0.02;
/** Coarse-cell grid for fluxes/occupancy (squares, C×C over the table). */
export const GRIDS = [32, 64] as const;
export const MAXN = 200000;
/** Surfaces tallied simultaneously: a family of shrinking circles and
 * squares around each of two points. */
export const MAXSURF = 40;
/** Scatterer presets: `scatm` equal circles of one total area π·0.13².
 * The m = 9 grid crosses the room, so it is only used with the walls off. */
const s9 = [1 / 7, 3 / 7, 5 / 7];
export const SCATTERERS: Record<number, [number, number][]> = {
  0: [],
  1: [[0.5, 0.19]],
  4: [
    [0.22, 0.22],
    [0.78, 0.22],
    [0.22, 0.78],
    [0.78, 0.78],
  ],
  9: s9.flatMap((x) => s9.map((y) => [x, y] as [number, number])),
};
export const scatR = (m: number) => 0.13 / Math.sqrt(m);

/** A counting surface: a circle of radius r, or a square of half-side r,
 * centred at (x, y). Clipping against the table walls is allowed. */
export type Surf = { x: number; y: number; r: number; square: boolean };

/** The radius ladder around each point: r_k = 2^(k/2)/C from one coarse
 * cell up to a quarter table (7 radii at C = 32, 9 at C = 64). */
export const radiiOf = (C: number) => {
  const out: number[] = [];
  for (let k = 0; ; k++) {
    const r = (2 ** (k / 2)) / C;
    if (r > 0.2500001) break;
    out.push(r);
  }
  return out;
};

/** Both families: for each point, circles then squares over the ladder.
 * A square at equal circle area has half-side r·√π/2. */
export const surfacesFor = (pts: { x: number; y: number }[], C: number): Surf[] => {
  const rad = radiiOf(C);
  return pts.flatMap(({ x, y }) => [
    ...rad.map((r) => ({ x, y, r, square: false })),
    ...rad.map((r) => ({ x, y, r: (r * Math.sqrt(Math.PI)) / 2, square: true })),
  ]);
};

export type Config = {
  n: number;
  seed: number;
  door: number;
  walls: boolean;
  scatm: 0 | 1 | 4 | 9;
  /** spawn: uniform in the room | a disc at the table centre | uniform over the table. */
  spawn: "room" | "disc" | "table";
  /** Release-disc radius for spawn = disc (0 = exact point release). */
  startDisc: number;
  /** Speed spread s: uniform in SPEED·[1−s, 1+s]; 0 = one speed. */
  spread: number;
  /** Coarse grid C for fluxes/occupancy and the radius ladder. */
  grid: number;
  surfaces: Surf[];
};

const wgsl = /* wgsl */ `
${philoxWgsl}
const SPEED = ${SPEED};
// Walls are infinitely thin, but the hit point is computed in f32: without
// this tolerance a path aimed within an ulp of a corner can round outside
// both wall segments and cut the corner.
const TOL = 1e-6;

struct Params {
  ctrl: vec4u,   // n, fluxOn, walls, scatm
  cfg: vec4u,    // spawn (0 room, 1 disc, 2 table), seed, gridDim, nSurf
  room: vec4f,   // cx, cy, half, doorHalf
  spawn: vec4f,  // startDisc, spread, 0, 0
  surf: array<vec4f, ${MAXSURF}>,  // x, y, r, square?
  scats: array<vec4f, 9>,          // x, y, r, 0
}
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> ctr: array<atomic<u32>, ${MAXSURF}>;
// Directed coarse-cell crossings: flux[(j*gridDim + i)*4 + d] counts
// crossings leaving cell (i, j) in direction d (0 R, 1 L, 2 up, 3 down).
@group(0) @binding(3) var<storage, read_write> flux: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> occ: array<atomic<u32>>;

fn cellIdx(v: f32, gd: u32) -> u32 {
  return min(u32(clamp(v, 0.0, 0.9999999) * f32(gd)), gd - 1u);
}

// Counting surface k: circle of radius s.z, or square of half-side s.z.
fn insideK(pos: vec2f, k: u32) -> u32 {
  let s = p.surf[k];
  let d = abs(pos - s.xy);
  if (s.w > 0.5) { return u32(max(d.x, d.y) <= s.z); }
  return u32(dot(d, d) <= s.z * s.z);
}

// Earliest crossing of a wall at x = X (horiz = false) or y = X (horiz = true)
// whose hit point lies within [lo, hi] along the wall; -1 when there is none.
// Two-sided: any crossing of the line inside the segment is a hit, so the
// walls work from both sides and v -> v - 2(v·n)n is the same reflection.
fn wallHit(pos: vec2f, v: vec2f, rem: f32, horiz: bool, X: f32, lo: f32, hi: f32) -> f32 {
  var t: f32;
  var h: f32;
  if (horiz) {
    t = (X - pos.y) / v.y;
    h = pos.x + t * v.x;
  } else {
    t = (X - pos.x) / v.x;
    h = pos.y + t * v.y;
  }
  if (t >= 0.0 && t <= rem && h >= lo - TOL && h <= hi + TOL) { return t; }
  return -1.0;
}

fn circleHit(pos: vec2f, v: vec2f, rem: f32, s: vec4f) -> f32 {
  let d = pos - s.xy;
  let b = dot(d, v);
  let c = dot(d, d) - s.z * s.z;
  if (c <= 0.0) { return -1.0; }
  let disc = b * b - dot(v, v) * c;
  if (disc <= 0.0) { return -1.0; }
  let t = (-b - sqrt(disc)) / dot(v, v);
  if (t >= 0.0 && t <= rem) { return t; }
  return -1.0;
}

// Every coarse-cell edge crossing on the straight piece p0 -> p1, attributed
// to the cell being left. The crossing point on the edge fixes the orthogonal
// index, so a diagonal hop through a corner lands on the cells the path
// actually leaves. Runs once per flight subsegment; no-op unless fluxOn.
fn account(p0: vec2f, p1: vec2f) {
  if (p.ctrl.y == 0u) { return; }
  let gd = p.cfg.z;
  let cell = f32(gd);
  let i0 = cellIdx(p0.x, gd);
  let i1 = cellIdx(p1.x, gd);
  let j0 = cellIdx(p0.y, gd);
  let j1 = cellIdx(p1.y, gd);
  let dx = p1.x - p0.x;
  let dy = p1.y - p0.y;
  if (i1 > i0) {
    var c = i0;
    while (c < i1) {
      let xb = f32(c + 1u) / cell;
      let yc = p0.y + (xb - p0.x) / dx * dy;
      atomicAdd(&flux[(cellIdx(yc, gd) * gd + c) * 4u + 0u], 1u);
      c++;
    }
  } else if (i1 < i0) {
    var c = i0;
    while (c > i1) {
      let xb = f32(c) / cell;
      let yc = p0.y + (xb - p0.x) / dx * dy;
      atomicAdd(&flux[(cellIdx(yc, gd) * gd + c - 1u) * 4u + 1u], 1u);
      c--;
    }
  }
  if (j1 > j0) {
    var r = j0;
    while (r < j1) {
      let yb = f32(r + 1u) / cell;
      let xc = p0.x + (yb - p0.y) / dy * dx;
      atomicAdd(&flux[(r * gd + cellIdx(xc, gd)) * 4u + 2u], 1u);
      r++;
    }
  } else if (j1 < j0) {
    var r = j0;
    while (r > j1) {
      let yb = f32(r) / cell;
      let xc = p0.x + (yb - p0.y) / dy * dx;
      atomicAdd(&flux[((r - 1u) * gd + cellIdx(xc, gd)) * 4u + 3u], 1u);
      r--;
    }
  }
}

@compute @workgroup_size(64)
fn spawn(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= p.ctrl.x) { return; }
  var r = rand(p.cfg.y, 0u, i);
  var x = u01(r.x);
  var y = u01(r.y);
  if (p.cfg.x == 0u) {
    // uniform inside the room, clear of the walls by 0.01
    let h = p.room.z - 0.01;
    x = p.room.x + (x - 0.5) * 2.0 * h;
    y = p.room.y + (y - 0.5) * 2.0 * h;
  } else if (p.cfg.x == 1u) {
    // uniform in the release disc at the table centre (r = 0: a point)
    let rad = p.spawn.x * sqrt(x);
    let ang = 6.2831853 * y;
    x = 0.5 + rad * cos(ang);
    y = 0.5 + rad * sin(ang);
  }
  // p.cfg.x == 2u: uniform over the whole table (the equilibrium null)
  let th = 6.2831853 * u01(r.z);
  let sp = SPEED * (1.0 + p.spawn.y * (2.0 * u01(r.w) - 1.0));
  particles[i] = vec4f(x, y, sp * cos(th), sp * sin(th));
}

// One step of flight (dt = 1), up to 4 collisions. A particle that ends a
// step exactly on a wall line is ambiguous (a t = 0 test cannot tell a
// pending touch from a just-reflected state and can flip it through the
// wall), so every reflection stands off the wall by a fixed gap on the side
// the particle now moves toward. Under reversal the same push applies to
// the same hit point, so a retraced path stays on the forward one to ~1e-5.
@compute @workgroup_size(64)
fn fly(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= p.ctrl.x) { return; }
  let s = particles[i];
  var pos = s.xy;
  var v = s.zw;
  var rem = 1.0;
  for (var k = 0; k < 4; k++) {
    var best = rem + 1.0;
    var kind = 0u;
    var t = wallHit(pos, v, rem, false, 0.0, 0.0, 1.0);
    if (t >= 0.0) { best = t; kind = 1u; }
    t = wallHit(pos, v, rem, false, 1.0, 0.0, 1.0);
    if (t >= 0.0 && t < best) { best = t; kind = 2u; }
    t = wallHit(pos, v, rem, true, 0.0, 0.0, 1.0);
    if (t >= 0.0 && t < best) { best = t; kind = 3u; }
    t = wallHit(pos, v, rem, true, 1.0, 0.0, 1.0);
    if (t >= 0.0 && t < best) { best = t; kind = 4u; }
    if (p.ctrl.z == 1u) {
      let rc = p.room.xy;
      let h = p.room.z;
      let dh = p.room.w;
      t = wallHit(pos, v, rem, false, rc.x - h, rc.y - h, rc.y + h);
      if (t >= 0.0 && t < best) { best = t; kind = 5u; }
      t = wallHit(pos, v, rem, false, rc.x + h, rc.y - h, rc.y + h);
      if (t >= 0.0 && t < best) { best = t; kind = 6u; }
      t = wallHit(pos, v, rem, true, rc.y - h, rc.x - h, rc.x + h);
      if (t >= 0.0 && t < best) { best = t; kind = 7u; }
      t = wallHit(pos, v, rem, true, rc.y + h, rc.x - h, rc.x - dh);
      if (t >= 0.0 && t < best) { best = t; kind = 8u; }
      t = wallHit(pos, v, rem, true, rc.y + h, rc.x + dh, rc.x + h);
      if (t >= 0.0 && t < best) { best = t; kind = 9u; }
    }
    for (var j = 0u; j < p.ctrl.w; j++) {
      t = circleHit(pos, v, rem, p.scats[j]);
      if (t >= 0.0 && t < best) { best = t; kind = 16u + j; }
    }
    let pre = pos;
    if (kind == 0u) {
      pos = pos + v * rem;
      account(pre, pos);
      break;
    }
    pos = pos + v * best;
    var X: f32;
    var Y: f32;
    if (kind == 1u) { pos.x = 0.0; v.x = -v.x; X = 0.0; }
    else if (kind == 2u) { pos.x = 1.0; v.x = -v.x; X = 1.0; }
    else if (kind == 3u) { pos.y = 0.0; v.y = -v.y; Y = 0.0; }
    else if (kind == 4u) { pos.y = 1.0; v.y = -v.y; Y = 1.0; }
    else if (kind == 5u) { pos.x = p.room.x - p.room.z; v.x = -v.x; X = pos.x; }
    else if (kind == 6u) { pos.x = p.room.x + p.room.z; v.x = -v.x; X = pos.x; }
    else if (kind == 7u) { pos.y = p.room.y - p.room.z; v.y = -v.y; Y = pos.y; }
    else if (kind == 8u || kind == 9u) { pos.y = p.room.y + p.room.z; v.y = -v.y; Y = pos.y; }
    else {
      let sc = p.scats[kind - 16u];
      let d = pos - sc.xy;
      let n = normalize(d);
      pos = sc.xy + n * sc.z;
      v = v - 2.0 * dot(v, n) * n;
    }
    // The stand-off: pure normal, into the side the reflected velocity
    // points to (never tangential — a tangential jump near a corner lands
    // past both walls, where no segment covers it).
    if (kind <= 2u || (kind >= 5u && kind <= 6u)) { pos.x = X + sign(v.x) * 1e-5; }
    else if (kind == 3u || kind == 4u || (kind >= 7u && kind <= 9u)) { pos.y = Y + sign(v.y) * 1e-5; }
    else {
      let sc = p.scats[kind - 16u];
      pos = sc.xy + normalize(pos - sc.xy) * (sc.z + 1e-5);
    }
    account(pre, pos);
    rem = rem - best;
  }
  particles[i] = vec4f(pos, v);
}

// Snapshot pass: per-cell occupancy and per-surface inside counts, one
// atomic per particle per surface. Run at window boundaries.
@compute @workgroup_size(64)
fn census(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= p.ctrl.x) { return; }
  let s = particles[i];
  let gd = p.cfg.z;
  atomicAdd(&occ[cellIdx(s.y, gd) * gd + cellIdx(s.x, gd)], 1u);
  for (var k = 0u; k < p.cfg.w; k++) {
    if (insideK(s.xy, k) == 1u) { atomicAdd(&ctr[k], 1u); }
  }
}
`;

/** The billiard gas on the GPU. All buffers are fixed at construction; only
 * the uniform params and the dispatch counts change with the config. */
export class Billiard {
  readonly device: GPUDevice;
  private params: GPUBuffer;
  private particles: GPUBuffer;
  private ctr: GPUBuffer;
  private flux: GPUBuffer;
  private occ: GPUBuffer;
  private bind: GPUBindGroup;
  private pipelines: Record<"spawn" | "fly" | "census", GPUComputePipeline>;
  private groups = 1;
  private ab = new ArrayBuffer(16 * (4 + MAXSURF + 9)); // ctrl, cfg, room, spawn + surf[40] + scats[9]
  private u32 = new Uint32Array(this.ab);
  private f32 = new Float32Array(this.ab);
  private zeroCtr = new Uint32Array(MAXSURF);
  private zeroCell = new Uint32Array(64 * 64 * 4);
  private prevCtr: Uint32Array | null = null;
  private prevOcc: Uint32Array | null = null;
  cfg: Config;
  t = 0;

  /** Compiles the module (surfacing WGSL errors) and validates the pipelines
   * (an invalid pipeline dispatches as a silent no-op). */
  static async create(device: GPUDevice, cfg: Config) {
    const module = device.createShaderModule({ code: wgsl });
    const info = await module.getCompilationInfo();
    const bad = info.messages.find((m) => m.type === "error");
    if (bad) throw new Error(`WGSL ${bad.lineNum}:${bad.linePos} ${bad.message}`);
    device.pushErrorScope("validation");
    const b = new Billiard(device, cfg, module);
    const err = await device.popErrorScope();
    if (err) throw new Error(err.message);
    return b;
  }

  private constructor(device: GPUDevice, cfg: Config, module: GPUShaderModule) {
    this.device = device;
    this.cfg = cfg;
    const layout = device.createBindGroupLayout({
      entries: [0, 1, 2, 3, 4].map((b) => ({
        binding: b,
        visibility: GPUShaderStage.COMPUTE,
        buffer: { type: b === 0 ? "uniform" as const : "storage" as const },
      })),
    });
    const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] });
    this.pipelines = {
      spawn: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "spawn" } }),
      fly: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "fly" } }),
      census: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "census" } }),
    };
    this.params = device.createBuffer({ size: this.ab.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particles = device.createBuffer({ size: MAXN * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.ctr = blank(device, MAXSURF * 4);
    this.flux = blank(device, 64 * 64 * 4 * 4);
    this.occ = blank(device, 64 * 64 * 4);
    this.bind = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.particles } },
        { binding: 2, resource: { buffer: this.ctr } },
        { binding: 3, resource: { buffer: this.flux } },
        { binding: 4, resource: { buffer: this.occ } },
      ],
    });
  }

  private write(fluxOn: number) {
    const c = this.cfg;
    this.u32[0] = c.n;
    this.u32[1] = fluxOn;
    this.u32[2] = c.walls ? 1 : 0;
    this.u32[3] = c.scatm;
    this.u32[4] = c.spawn === "room" ? 0 : c.spawn === "disc" ? 1 : 2;
    this.u32[5] = c.seed >>> 0;
    this.u32[6] = c.grid;
    this.u32[7] = c.surfaces.length;
    this.f32[8] = ROOM.x;
    this.f32[9] = ROOM.y;
    this.f32[10] = ROOM.h;
    this.f32[11] = c.door / 2;
    this.f32[12] = c.startDisc;
    this.f32[13] = c.spread;
    this.f32[14] = 0;
    this.f32[15] = 0;
    this.f32.fill(0, 16, 16 + 4 * MAXSURF);
    c.surfaces.forEach((s, k) => {
      this.f32[16 + 4 * k] = s.x;
      this.f32[17 + 4 * k] = s.y;
      this.f32[18 + 4 * k] = s.r;
      this.f32[19 + 4 * k] = s.square ? 1 : 0;
    });
    this.f32.fill(0, 16 + 4 * MAXSURF, 16 + 4 * (MAXSURF + 9));
    const r = scatR(c.scatm);
    SCATTERERS[c.scatm].forEach(([x, y], j) => {
      this.f32[16 + 4 * (MAXSURF + j)] = x;
      this.f32[17 + 4 * (MAXSURF + j)] = y;
      this.f32[18 + 4 * (MAXSURF + j)] = r;
    });
    this.device.queue.writeBuffer(this.params, 0, this.ab);
  }

  private dispatch(pipeline: GPUComputePipeline, times: number) {
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, this.bind);
    for (let j = 0; j < times; j++) pass.dispatchWorkgroups(this.groups);
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  /** Reset to the initial condition drawn from the seed, then take the
   * t = 0 census (the start occupancy of the first window). */
  async reset(cfg: Config) {
    if (cfg.n < 1 || cfg.n > MAXN) throw new Error("n out of range");
    if (cfg.surfaces.length < 1 || cfg.surfaces.length > MAXSURF) throw new Error(`1–${MAXSURF} surfaces`);
    if (!(cfg.scatm in SCATTERERS)) throw new Error("scatm must be 0, 1, 4 or 9");
    if (!GRIDS.includes(cfg.grid as 32 | 64)) throw new Error("grid must be 32 or 64");
    this.cfg = cfg;
    this.groups = Math.ceil(cfg.n / 64);
    this.t = 0;
    this.write(0);
    this.dispatch(this.pipelines.spawn, 1);
    this.prevCtr = null;
    this.prevOcc = null;
    return this.snapshot();
  }

  /** Census without advancing: the per-surface counts and occupancy now. */
  private async snapshot() {
    const q = this.device.queue;
    q.writeBuffer(this.ctr, 0, this.zeroCtr);
    q.writeBuffer(this.occ, 0, this.zeroCell.subarray(0, this.cfg.grid * this.cfg.grid));
    this.dispatch(this.pipelines.census, 1);
    const bufs = await read(this.device, this.ctr, this.occ);
    this.prevCtr = bufs[0];
    this.prevOcc = bufs[1];
    return { t: this.t, ctr: bufs[0], occ: bufs[1] };
  }

  /** Advance W steps as one window, then census and read back one batched
   * buffer. With full = true, the directed coarse-cell crossings accumulated
   * over the window and the window-end occupancy come back too; with
   * full = false only the surface counts do (no flux accounting on the GPU).
   * The previous window's census is returned as the window's start state. */
  async advance(
    W: number,
    full = true,
  ): Promise<{ t: number; ctr: Uint32Array; prevCtr: Uint32Array; prevOcc: Uint32Array; flux?: Uint32Array; occ?: Uint32Array }> {
    if (W < 1) throw new Error("advance needs W ≥ 1");
    const q = this.device.queue;
    q.writeBuffer(this.ctr, 0, this.zeroCtr);
    const g2 = this.cfg.grid * this.cfg.grid;
    if (full) {
      q.writeBuffer(this.flux, 0, this.zeroCell.subarray(0, g2 * 4));
      q.writeBuffer(this.occ, 0, this.zeroCell.subarray(0, g2));
    }
    this.write(full ? 1 : 0);
    this.dispatch(this.pipelines.fly, W);
    this.dispatch(this.pipelines.census, 1);
    this.t += W;
    const bufs = await read(this.device, this.ctr, ...(full ? [this.flux, this.occ] : []));
    const out = {
      t: this.t,
      ctr: bufs[0],
      prevCtr: this.prevCtr!,
      prevOcc: this.prevOcc!,
      ...(full ? { flux: bufs[1], occ: bufs[2] } : {}),
    };
    this.prevCtr = bufs[0];
    this.prevOcc = bufs[2] ?? this.prevOcc!;
    return out;
  }

  /** Sanity over the first m particles: NaN, escape, speed range, scatterers. */
  async audit(m = 4096) {
    const k = Math.min(m, this.cfg.n);
    const staging = this.device.createBuffer({ size: k * 16, usage: GPUBufferUsage.COPY_DST | GPUMapMode.READ });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.particles, 0, staging, 0, k * 16);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(staging.getMappedRange().slice(0));
    staging.destroy();
    const scats = SCATTERERS[this.cfg.scatm].map(([x, y]) => [x, y, scatR(this.cfg.scatm)]);
    const lo = SPEED * (1 - this.cfg.spread) * (1 - 1e-4);
    const hi = SPEED * (1 + this.cfg.spread) * (1 + 1e-4);
    let nan = 0;
    let escaped = 0;
    let inScat = 0;
    let speedErr = 0;
    for (let i = 0; i < k; i++) {
      const x = f[4 * i];
      const y = f[4 * i + 1];
      const vx = f[4 * i + 2];
      const vy = f[4 * i + 3];
      if (!Number.isFinite(x + y + vx + vy)) {
        nan++;
        continue;
      }
      if (x < 0 || x > 1 || y < 0 || y > 1) escaped++;
      const sp = Math.hypot(vx, vy);
      speedErr = Math.max(speedErr, sp - hi, lo - sp);
      if (scats.some(([sx, sy, sr]) => Math.hypot(x - sx, y - sy) < sr)) inScat++;
    }
    return { checked: k, nan, escaped, inScat, speedErr };
  }
}

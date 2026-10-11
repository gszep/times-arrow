import { blank, read } from "../src/gpu.ts";
import { philoxWgsl } from "../src/philox.ts";

/** Fixed geometry, in units of the unit-square table. */
export const ROOM = { x: 0.5, y: 0.6, h: 0.2 };
/** One speed for every particle, in table widths per step. */
export const SPEED = 0.02;
/** Occupancy grids (one per side of the drawn counting surface). */
export const GRID = 160;
export const MAXN = 200000;
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

/** Room area as a fraction of the table: the equilibrium of N_in/N. */
export const roomFraction = (2 * ROOM.h) ** 2;

/** The two protocol surface sets: A = wall switch (room + 3 circles),
 * B = centre release (concentric circles + a far control circle). */
export const SURF_A: Surface[] = [
  { x: 0.5, y: 0.6, r: 0, aligned: true },
  { x: 0.5, y: 0.6, r: 0.08, aligned: false },
  { x: 0.25, y: 0.35, r: 0.12, aligned: false },
  { x: 0.8, y: 0.15, r: 0.18, aligned: false },
];
export const SURF_B: Surface[] = [
  { x: 0.5, y: 0.5, r: 0.12, aligned: false },
  { x: 0.5, y: 0.5, r: 0.02, aligned: false },
  { x: 0.5, y: 0.5, r: 0.05, aligned: false },
  { x: 0.8, y: 0.15, r: 0.15, aligned: false },
];

/** Rough effusion time in steps: τ = π·A_room/(door·⟨v⟩). */
export const tauOf = (door: number) => (Math.PI * (2 * ROOM.h) ** 2) / (door * SPEED);

/** A counting surface: aligned with the room, or a circle. */
export type Surface = { x: number; y: number; r: number; aligned: boolean };
/** The area fraction of the table a surface encloses: the equilibrium of p. */
export const areaOf = (s: Surface) => (s.aligned ? roomFraction : Math.PI * s.r * s.r);

export type Config = {
  n: number;
  seed: number;
  door: number;
  walls: boolean;
  scatm: 0 | 1 | 4 | 9;
  /** true: start uniform inside the room; false: release from a disc at the table centre. */
  startIn: boolean;
  /** Release-disc radius for startIn = false (0 = exact point release). */
  startDisc: number;
  /** Speed spread s: uniform in SPEED·[1−s, 1+s]; 0 = one speed. */
  spread: number;
  /** 1–5 counting surfaces, all tallied every sampled step; [0] is drawn. */
  surfaces: Surface[];
};

const wgsl = /* wgsl */ `
${philoxWgsl}
const SPEED = ${SPEED};
// Walls are infinitely thin, but the hit point is computed in f32: without
// this tolerance a path aimed within an ulp of a corner can round outside
// both wall segments and cut the corner.
const TOL = 1e-6;

struct Params {
  ctrl: vec4u,   // n, occupy, walls, scatm
  cfg: vec4u,    // startIn, seed, gridDim, nSurf
  room: vec4f,   // cx, cy, half, doorHalf
  spawn: vec4f,  // startDisc, spread, 0, 0
  surf: array<vec4f, 5>,   // x, y, r, aligned
  scats: array<vec4f, 9>,  // x, y, r, 0
}
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> counters: array<atomic<u32>, 8>;
@group(0) @binding(3) var<storage, read_write> gridIn: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> gridOut: array<atomic<u32>>;

// Counting surface k: the room rectangle (aligned) or the user circle.
// The boundary itself counts as inside: a particle caught touching a wall
// (approaching, hit pending) must not be read as a crossing.
fn insideK(pos: vec2f, k: u32) -> u32 {
  let s = p.surf[k];
  if (s.w > 0.5) {
    let d = abs(pos - p.room.xy);
    return u32(d.x <= p.room.z && d.y <= p.room.z);
  }
  return u32(distance(pos, s.xy) <= s.z);
}

fn inRoom(pos: vec2f) -> u32 {
  let d = abs(pos - p.room.xy);
  return u32(d.x < p.room.z && d.y < p.room.z);
}

fn inAnyScat(pos: vec2f) -> u32 {
  for (var j = 0u; j < p.ctrl.w; j++) {
    let s = p.scats[j];
    if (distance(pos, s.xy) < s.z) { return 1u; }
  }
  return 0u;
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

@compute @workgroup_size(64)
fn spawn(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= p.ctrl.x) { return; }
  var r = rand(p.cfg.y, 0u, i);
  var x = u01(r.x);
  var y = u01(r.y);
  if (p.cfg.x == 1u) {
    // uniform inside the room, clear of the walls by 0.01
    let h = p.room.z - 0.01;
    x = p.room.x + (x - 0.5) * 2.0 * h;
    y = p.room.y + (y - 0.5) * 2.0 * h;
  } else {
    // uniform in the release disc at the table centre (r = 0: a point)
    let rad = p.spawn.x * sqrt(x);
    let ang = 6.2831853 * y;
    x = 0.5 + rad * cos(ang);
    y = 0.5 + rad * sin(ang);
  }
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
  let in0 = insideK(pos, 0u);
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
    if (kind == 0u) {
      pos = pos + v * rem;
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
    rem = rem - best;
  }
  particles[i] = vec4f(pos, v);
  let in1 = insideK(pos, 0u);
  if (in1 != in0) {
    if (in1 == 1u) { atomicAdd(&counters[0], 1u); }
    else { atomicAdd(&counters[1], 1u); }
  }
  if (p.ctrl.y == 1u) {
    for (var k = 0u; k < p.cfg.w; k++) {
      if (insideK(pos, k) == 1u) { atomicAdd(&counters[2u + k], 1u); }
    }
    let gdim = p.cfg.z;
    let c = min(u32(pos.x * f32(gdim)), gdim - 1u);
    let rr = min(u32(pos.y * f32(gdim)), gdim - 1u);
    let idx = rr * gdim + c;
    if (in1 == 1u) { atomicAdd(&gridIn[idx], 1u); }
    else { atomicAdd(&gridOut[idx], 1u); }
  }
}

// Time reversal: negate every velocity.
@compute @workgroup_size(64)
fn reverse(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= p.ctrl.x) { return; }
  let s = particles[i];
  particles[i] = vec4f(s.xy, -s.zw);
}
`;

/** The billiard gas on the GPU. All buffers are fixed at construction; only
 * the uniform params and the dispatch counts change with the config. */
export class Billiard {
  readonly device: GPUDevice;
  private params: GPUBuffer;
  private particles: GPUBuffer;
  private counters: GPUBuffer;
  private grids: [GPUBuffer, GPUBuffer];
  private bind: GPUBindGroup;
  private pipelines: Record<"spawn" | "fly" | "reverse", GPUComputePipeline>;
  private groups = 1;
  private ab = new ArrayBuffer(288);
  private u32 = new Uint32Array(this.ab);
  private f32 = new Float32Array(this.ab);
  private zeroCtr = new Uint32Array(8);
  private zeroGrid = new Uint32Array(GRID * GRID);
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
      reverse: device.createComputePipeline({ layout: pl, compute: { module, entryPoint: "reverse" } }),
    };
    this.params = device.createBuffer({ size: 288, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particles = device.createBuffer({ size: MAXN * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.counters = blank(device, 32);
    this.grids = [blank(device, GRID * GRID * 4), blank(device, GRID * GRID * 4)];
    this.bind = device.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: { buffer: this.params } },
        { binding: 1, resource: { buffer: this.particles } },
        { binding: 2, resource: { buffer: this.counters } },
        { binding: 3, resource: { buffer: this.grids[0] } },
        { binding: 4, resource: { buffer: this.grids[1] } },
      ],
    });
    this.configure(cfg);
  }

  private write(occupy: number) {
    const c = this.cfg;
    this.u32[0] = c.n;
    this.u32[1] = occupy;
    this.u32[2] = c.walls ? 1 : 0;
    this.u32[3] = c.scatm;
    this.u32[4] = c.startIn ? 1 : 0;
    this.u32[5] = c.seed >>> 0;
    this.u32[6] = GRID;
    this.u32[7] = c.surfaces.length;
    this.f32[8] = ROOM.x;
    this.f32[9] = ROOM.y;
    this.f32[10] = ROOM.h;
    this.f32[11] = c.door / 2;
    this.f32[12] = c.startDisc;
    this.f32[13] = c.spread;
    this.f32[14] = 0;
    this.f32[15] = 0;
    c.surfaces.forEach((s, k) => {
      this.f32[16 + 4 * k] = s.x;
      this.f32[17 + 4 * k] = s.y;
      this.f32[18 + 4 * k] = s.r;
      this.f32[19 + 4 * k] = s.aligned ? 1 : 0;
    });
    this.f32.fill(0, 36, 72);
    const r = scatR(c.scatm);
    SCATTERERS[c.scatm].forEach(([x, y], j) => {
      this.f32[36 + 4 * j] = x;
      this.f32[37 + 4 * j] = y;
      this.f32[38 + 4 * j] = r;
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

  /** Reset to the initial condition drawn from the seed. */
  configure(cfg: Config) {
    if (cfg.n < 1 || cfg.n > MAXN) throw new Error("n out of range");
    if (cfg.surfaces.length < 1 || cfg.surfaces.length > 5) throw new Error("1–5 surfaces");
    if (!(cfg.scatm in SCATTERERS)) throw new Error("scatm must be 0, 1, 4 or 9");
    this.cfg = cfg;
    this.groups = Math.ceil(cfg.n / 64);
    this.t = 0;
    this.write(0);
    this.dispatch(this.pipelines.spawn, 1);
    this.device.queue.writeBuffer(this.counters, 0, this.zeroCtr);
    for (const g of this.grids) this.device.queue.writeBuffer(g, 0, this.zeroGrid);
  }

  /** Flip the room walls without touching the particles. */
  setWalls(on: boolean) {
    this.cfg.walls = on;
    this.write(0);
  }

  reverse() {
    this.dispatch(this.pipelines.reverse, 1);
  }

  /** Advance k steps and read back one batched buffer: the per-surface
   * inside counts, the per-step crossing rates of surface [0] in each
   * direction, and (optionally) the two occupancy grids. */
  async advance(
    k: number,
    wantGrid = true,
  ): Promise<{ nin: number; counts: number[]; cin: number; cout: number; gridIn?: Uint32Array; gridOut?: Uint32Array }> {
    if (k < 1) throw new Error("advance needs k ≥ 1");
    const q = this.device.queue;
    q.writeBuffer(this.counters, 0, this.zeroCtr);
    if (wantGrid) {
      q.writeBuffer(this.grids[0], 0, this.zeroGrid);
      q.writeBuffer(this.grids[1], 0, this.zeroGrid);
    }
    this.write(0);
    if (k > 1) this.dispatch(this.pipelines.fly, k - 1);
    this.write(1);
    this.dispatch(this.pipelines.fly, 1);
    this.t += k;
    const bufs = await read(this.device, this.counters, ...(wantGrid ? this.grids : []));
    const ctr = bufs[0];
    return {
      nin: ctr[2],
      counts: [...ctr.subarray(2, 2 + this.cfg.surfaces.length)],
      cin: ctr[0] / k,
      cout: ctr[1] / k,
      ...(wantGrid ? { gridIn: bufs[1], gridOut: bufs[2] } : {}),
    };
  }

  /** Sanity over the first m particles: NaN, escape, speed range, scatterers. */
  async audit(m = 4096) {
    const k = Math.min(m, this.cfg.n);
    const staging = this.device.createBuffer({ size: k * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
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

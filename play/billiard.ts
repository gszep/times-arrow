import { blank, read } from "../src/gpu.ts";
import { philoxWgsl } from "../src/philox.ts";

/** Fixed geometry, in units of the unit-square table. */
export const ROOM = { x: 0.5, y: 0.6, h: 0.2 };
export const SCAT = { x: 0.5, y: 0.19, r: 0.13 };
/** One speed for every particle, in table widths per step. */
export const SPEED = 0.02;
/** Occupancy grids (one per side of the counting surface). */
export const GRID = 160;
export const MAXN = 200000;

/** Room area as a fraction of the table: the equilibrium of N_in/N. */
export const roomFraction = (2 * ROOM.h) ** 2;

/** Rough effusion time in steps: τ = π·A_room/(door·⟨v⟩). */
export const tauOf = (door: number) => (Math.PI * (2 * ROOM.h) ** 2) / (door * SPEED);

export type Config = {
  n: number;
  seed: number;
  door: number;
  walls: boolean;
  scatter: boolean;
  circle: boolean;
  cx: number;
  cy: number;
  cr: number;
  startIn: boolean;
};

const wgsl = /* wgsl */ `
${philoxWgsl}
const SPEED = ${SPEED};
// Walls are infinitely thin, but the hit point is computed in f32: without
// this tolerance a path aimed within an ulp of a corner can round outside
// both wall segments and cut the corner.
const TOL = 1e-6;

struct Params {
  ctrl: vec4u,  // n, occupy, walls, scatter
  cfg: vec4u,   // startInside, seed, gridDim, 0
  room: vec4f,  // cx, cy, half, doorHalf
  surf: vec4f,  // cx, cy, radius, mode (0 aligned, 1 circle)
  scat: vec4f,  // cx, cy, radius, 0
}
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4f>;
@group(0) @binding(2) var<storage, read_write> counters: array<atomic<u32>, 2>;
@group(0) @binding(3) var<storage, read_write> gridIn: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> gridOut: array<atomic<u32>>;

// The counting surface: the room rectangle (aligned) or the user circle.
// The boundary itself counts as inside: a particle caught touching a wall
// (approaching, hit pending) must not be read as a crossing.
fn insideSurface(pos: vec2f) -> u32 {
  if (p.surf.w < 0.5) {
    let d = abs(pos - p.room.xy);
    return u32(d.x <= p.room.z && d.y <= p.room.z);
  }
  return u32(distance(pos, p.surf.xy) <= p.surf.z);
}

fn inRoom(pos: vec2f) -> u32 {
  let d = abs(pos - p.room.xy);
  return u32(d.x < p.room.z && d.y < p.room.z);
}

fn inScatterer(pos: vec2f) -> u32 {
  return u32(p.ctrl.w == 1u && distance(pos, p.scat.xy) < p.scat.z);
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

fn circleHit(pos: vec2f, v: vec2f, rem: f32) -> f32 {
  let d = pos - p.scat.xy;
  let b = dot(d, v);
  let c = dot(d, d) - p.scat.z * p.scat.z;
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
    // rejection-sample the table outside the room (and the scatterer)
    var tries = 0u;
    while (tries < 16u && (inRoom(vec2f(x, y)) == 1u || inScatterer(vec2f(x, y)) == 1u)) {
      r = rand(p.cfg.y, tries + 1u, i);
      x = u01(r.x);
      y = u01(r.y);
      tries++;
    }
  }
  let th = 6.2831853 * u01(r.z);
  particles[i] = vec4f(x, y, SPEED * cos(th), SPEED * sin(th));
}

// One step of flight (dt = 1), up to 4 collisions. A particle that ends a
// step exactly on a wall line is ambiguous (a t = 0 test cannot tell a
// pending touch from a just-reflected state and can flip it through the
// wall), so every reflection stands off the wall by a fixed gap on the side
// the particle now moves toward. Under reversal the same push applies to the
// same hit point, so a retraced path stays on the forward one to ~1e-5.
@compute @workgroup_size(64)
fn fly(@builtin(global_invocation_id) g: vec3u) {
  let i = g.x;
  if (i >= p.ctrl.x) { return; }
  let s = particles[i];
  var pos = s.xy;
  var v = s.zw;
  let in0 = insideSurface(pos);
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
    if (p.ctrl.w == 1u) {
      t = circleHit(pos, v, rem);
      if (t >= 0.0 && t < best) { best = t; kind = 10u; }
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
      let d = pos - p.scat.xy;
      let n = normalize(d);
      pos = p.scat.xy + n * p.scat.z;
      v = v - 2.0 * dot(v, n) * n;
    }
    // The stand-off: pure normal, into the side the reflected velocity
    // points to (never tangential — a tangential jump near a corner lands
    // past both walls, where no segment covers it).
    if (kind <= 2u || (kind >= 5u && kind <= 6u)) { pos.x = X + sign(v.x) * 1e-5; }
    else if (kind == 3u || kind == 4u || (kind >= 7u && kind <= 9u)) { pos.y = Y + sign(v.y) * 1e-5; }
    else { pos = p.scat.xy + normalize(pos - p.scat.xy) * (p.scat.z + 1e-5); }
    rem = rem - best;
  }
  particles[i] = vec4f(pos, v);
  let in1 = insideSurface(pos);
  if (in1 != in0) {
    if (in1 == 1u) { atomicAdd(&counters[0], 1u); }
    else { atomicAdd(&counters[1], 1u); }
  }
  if (p.ctrl.y == 1u) {
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
  private ab = new ArrayBuffer(80);
  private u32 = new Uint32Array(this.ab);
  private f32 = new Float32Array(this.ab);
  private zeroCtr = new Uint32Array(2);
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
    this.params = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.particles = device.createBuffer({ size: MAXN * 16, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.counters = blank(device, 8);
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
    this.u32[3] = c.scatter ? 1 : 0;
    this.u32[4] = c.startIn ? 1 : 0;
    this.u32[5] = c.seed >>> 0;
    this.u32[6] = GRID;
    this.u32[7] = 0;
    this.f32[8] = ROOM.x;
    this.f32[9] = ROOM.y;
    this.f32[10] = ROOM.h;
    this.f32[11] = c.door / 2;
    this.f32[12] = c.cx;
    this.f32[13] = c.cy;
    this.f32[14] = c.cr;
    this.f32[15] = c.circle ? 1 : 0;
    this.f32[16] = SCAT.x;
    this.f32[17] = SCAT.y;
    this.f32[18] = SCAT.r;
    this.f32[19] = 0;
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
    this.cfg = cfg;
    this.groups = Math.ceil(cfg.n / 64);
    this.t = 0;
    this.write(0);
    this.dispatch(this.pipelines.spawn, 1);
    this.device.queue.writeBuffer(this.counters, 0, this.zeroCtr);
    for (const g of this.grids) this.device.queue.writeBuffer(g, 0, this.zeroGrid);
  }

  reverse() {
    this.dispatch(this.pipelines.reverse, 1);
  }

  /** Advance k steps and read back one batched buffer: the inside count
   * (summed from the occupancy grid painted on the last step), the
   * per-step crossing rates in each direction, and the two grids. */
  async advance(k: number): Promise<{ nin: number; nout: number; cin: number; cout: number; gridIn: Uint32Array; gridOut: Uint32Array }> {
    if (k < 1) throw new Error("advance needs k ≥ 1");
    const q = this.device.queue;
    q.writeBuffer(this.counters, 0, this.zeroCtr);
    q.writeBuffer(this.grids[0], 0, this.zeroGrid);
    q.writeBuffer(this.grids[1], 0, this.zeroGrid);
    this.write(0);
    if (k > 1) this.dispatch(this.pipelines.fly, k - 1);
    this.write(1);
    this.dispatch(this.pipelines.fly, 1);
    this.t += k;
    const [ctr, gridIn, gridOut] = await read(this.device, this.counters, this.grids[0], this.grids[1]);
    let nin = 0;
    let nout = 0;
    for (let i = 0; i < gridIn.length; i++) {
      nin += gridIn[i];
      nout += gridOut[i];
    }
    return { nin, nout, cin: ctr[0] / k, cout: ctr[1] / k, gridIn, gridOut };
  }

  /** Sanity over the first m particles: NaN, escape, speed drift, scatterer. */
  async audit(m = 4096) {
    const k = Math.min(m, this.cfg.n);
    const staging = this.device.createBuffer({ size: k * 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.particles, 0, staging, 0, k * 16);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const f = new Float32Array(staging.getMappedRange().slice(0));
    staging.destroy();
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
      speedErr = Math.max(speedErr, Math.abs(Math.hypot(vx, vy) - SPEED));
      if (this.cfg.scatter && Math.hypot(x - SCAT.x, y - SCAT.y) < SCAT.r) inScat++;
    }
    return { checked: k, nan, escaped, inScat, speedErr };
  }
}

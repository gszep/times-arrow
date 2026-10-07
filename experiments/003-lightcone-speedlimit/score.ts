// The committed scorer of the locked 003 pre-registration
// (experiments/003-lightcone-speedlimit/README.md, frozen at e74055a; the
// held-out lock at 56b6ad1): every registered decision rule, computed from
// the sweep's results JSON and nothing else.
// `node experiments/003-lightcone-speedlimit/score.ts <results.json>` prints
// the verdict table and writes it next to the results as `<results>.score.json`.
// The page and the run driver import the same functions (the arms, the
// layout, the exact-chain recurrence, the estimators) instead of duplicating
// them.
//
// The GPU computes integer positions and counts only; W₁, L̂, σ̂, Ê, η and
// E_diss are evaluated in host f64 (the trust boundary on the page). Every
// registered constant is frozen here as written in the README, and the
// scorer recomputes what it can from the model as a pipeline check.
import type { Weights, ProfileLayout } from "../../src/walk.ts";

// ── the registered configuration and arms ─────────────────────────────────

export type ArmName = "calm" | "w5" | "w4" | "wind" | "c2" | "max" | "h8" | "windXOR";
export const ARM_NAMES: ArmName[] = ["calm", "w5", "w4", "wind", "c2", "max", "h8"];
const w3 = (e: number, w: number, zero: number): Weights => ({ e, w, n: 0, s: 0, zero });

/** The registered arms, integer weights in 256ths of one draw (q_N = q_S = 0:
 * y is identically zero). */
export const ARMS: Record<ArmName, Weights> = {
  calm: w3(64, 64, 128),
  w5: w3(123, 5, 128),
  w4: w3(124, 4, 128),
  wind: w3(125, 3, 128),
  c2: w3(126, 2, 128),
  max: w3(255, 1, 0),
  h8: w3(120, 8, 128),
  windXOR: w3(125, 3, 128), // the arm whose step-1 protocol swaps E ↔ W
};

/** The arm's per-step protocol: windXOR is wind with E ↔ W at step 1 only
 * (the paired damage control); every other arm is constant. */
export function protocolOf(arm: ArmName, T: number): Weights[] {
  const q = ARMS[arm === "windXOR" ? "wind" : arm];
  const proto = Array.from({ length: T }, () => q);
  if (arm === "windXOR") proto[0] = w3(q.w, q.e, q.zero);
  return proto;
}

/** The arm's scalar parameters: `μ = (e−w)/256`, `a = (e+w)/256`,
 * `ρ = ln(e/w)`, the per-step flux EP `μρ`, and `δ = 1 − √(a μρ)`. */
export function paramsOf(arm: ArmName) {
  const q = ARMS[arm];
  const mu = (q.e - q.w) / 256;
  const a = (q.e + q.w) / 256;
  const rho = Math.log(q.e / q.w);
  const sigStep = mu * rho;
  return { mu, a, rho, sigStep, delta: 1 - Math.sqrt(a * sigStep) };
}

/** The pre-registered ensemble (Setup section of the README). */
export const REG = {
  n: 1024,
  m: 65536,
  R: 256,
  T: 512,
  blocks: 16,
  /** the deterministic profile: walkers j ≡ 0 (mod 64) start at (j/64) mod n */
  stride: 64,
  /** the display grid {0,1,2,3,4,8,16,24,32,64,128,256,384,512} */
  grid: [0, 1, 2, 3, 4, 8, 16, 24, 32, 64, 128, 256, 384, 512],
  /** the branch centres of C5 (frozen in the hypothesis table) */
  C3: { tH: 10.5938460336, tol: 1.5890769050 + 0.25 },
  C4: { centre: 0.5289774930939531, tol: 0.0007, EdissCalm512: 23.750753735433943 },
  C5: {
    bd: { w5: 0.52812328, w4: 0.51433595, wind: 0.49762074, h8: 0.55954658 } as Record<string, number>,
    bdTol: 0.0061,
    bc: { c2: 0.476806640625, max: 0.97668457 } as Record<string, number>,
    bcTol: 0.0002,
  },
  /** X1's damage count: draws in [3,125) of the wind step-1 mirror */
  X1: { mean: 7995392, half: 8429 },
  /** T1's nine checks: exact mean and half-width, frozen in the README */
  T1: [
    { name: "calm tally", mean: 0, half: 270009 },
    { name: "w5 tally", mean: 3959422976, half: 204757 },
    { name: "w4 tally", mean: 4026531840, half: 202155 },
    { name: "wind tally", mean: 4093640704, half: 199474 },
    { name: "c2 tally", mean: 4160749568, half: 196711 },
    { name: "max tally", mean: 8522825728, half: 47638 },
    { name: "h8 tally", mean: 3758096384, half: 212122 },
    { name: "windXOR tally", mean: 4077649920, half: 199474 },
    { name: "wind hop-1 activity", mean: 8388608, half: 8438 },
  ],
  /** P's omnibus box: fixed population centres, rank-protected half-widths,
   * reject if Z > max(1, max Z_i) = 1 */
  P: {
    centres: [3.4401988985, 2.2425826092, 21.0661460650],
    widths: [0.045, 0.025, 0.015],
    threshold: 1,
  },
  /** Bonferroni over the 19 registered tests plus the six 10⁻⁶ C5
   * mean-bias certificate risks */
  FWER: 7 * 0.001 + 10 * 0.001 + 2 / 4096 + 6e-6,
} as const;

/** The registered window layout, truncated to a horizon it covers exactly:
 * `(j, j+1)` for j = 0..23, then `(24, 32)`, then `(32j, 32(j+1))` while it
 * fits. `windowsOf(512)` is the registered 40. */
export function windowsOf(T: number): [number, number][] {
  const w: [number, number][] = [];
  for (let j = 0; j < Math.min(24, T); j++) w.push([j, j + 1]);
  if (T > 24) w.push([24, Math.min(32, T)]);
  for (let j = 1; 32 * (j + 1) <= T; j++) w.push([32 * j, 32 * (j + 1)]);
  if (w[w.length - 1][1] !== T) throw new Error(`T = ${T} is not a registered window horizon`);
  return w;
}

/** The display grid, truncated to the horizon. */
export function gridOf(T: number): number[] {
  return REG.grid.filter((t) => t <= T);
}

/** The 003 measurement layout for `profileBatch`: window slot per
 * occupancy time 0..T−1, display slot per time 0..T. */
export function profileLayout(T: number): ProfileLayout {
  const windows = windowsOf(T);
  const grid = gridOf(T);
  const slotOf = new Int32Array(T).fill(-1);
  const dispAt = new Int32Array(T + 1).fill(-1);
  windows.forEach(([b, e], k) => {
    for (let t = b; t < e; t++) slotOf[t] = k;
  });
  grid.forEach((t, g) => (dispAt[t] = g));
  return { winAt: slotOf, dispAt };
}

// ── the deterministic start and the exact chain (host f64) ───────────────

/** The deterministic start in walker counts: walkers j ≡ 0 (mod 64) at
 * x₀ = (j/64) mod n, one per profile slot; all others at 0; all y at 0. */
export function profileCounts(n: number, m: number): Float64Array {
  const p = new Float64Array(n);
  const slots = Math.ceil(m / REG.stride);
  p[0] = m - slots;
  for (let k = 0; k < slots; k++) p[k % n] += 1;
  return p;
}

/** The circle distance d(x) = min(x, n−x). */
export const dist = (x: number, n: number): number => Math.min(x, n - x);

/** One seed's circle W₁ from the deterministic start: cumulative integer
 * count differences c_x, then Σ_x |c_x − median(c)|/m — the median
 * optimized for every sample. */
export function circleW1(counts: ArrayLike<number>, profile: Float64Array): number {
  const n = counts.length;
  const c = new Float64Array(n);
  let acc = 0;
  for (let x = 0; x < n; x++) {
    acc += counts[x] - profile[x];
    c[x] = acc;
  }
  const sorted = Float64Array.from(c).sort();
  const med = sorted[(n / 2) | 0];
  let sum = 0;
  for (let x = 0; x < n; x++) sum += Math.abs(c[x] - med);
  return sum / profile.reduce((a, b) => a + b, 0);
}

/** The pooled mean circle distance Σ_x counts(x)·d(x)/m of one seed. */
export function meanDist(counts: ArrayLike<number>, n: number): number {
  let sum = 0;
  let m = 0;
  for (let x = 0; x < n; x++) {
    sum += counts[x] * dist(x, n);
    m += counts[x];
  }
  return sum / m;
}

/** The exact-chain law of one arm, in host f64: the profile start, the
 * recurrence `p_{s+1}(x) = q₀p_s(x) + q_Ep_s(x−1) + q_Wp_s(x+1)`, the
 * per-step flux EP `σ(s) = Σ_x (F−R)ln(F/R)` across the edges (x, x+1) with
 * `F = q_E p_s(x)`, `R = q_W p_s(x+1)`, and the registered window pooling:
 * `E_diss(t) = Σ_{s<t} √(a σ(s))`, `D(t) = min(t, E_diss(t))`. The display
 * grid carries the population W₁ (the median formula), the distance witness
 * `Σ p·d − Σ p₀·d`, and D; the windows carry the flux EP of the pooled
 * window-mean distribution (the population version of σ̂). */
export function exactLaw(arm: ArmName, cfg: { n: number; m: number; T: number }) {
  const { n, m, T } = cfg;
  if (arm === "windXOR") throw new Error("windXOR is a control arm; it has no population law");
  const q = ARMS[arm];
  const { a } = paramsOf(arm);
  const qE = q.e / 256, qW = q.w / 256, q0 = q.zero / 256;
  const p0 = profileCounts(n, m);
  const total = p0.reduce((x, y) => x + y, 0);
  const p = Float64Array.from(p0, (v) => v / total);
  const p00 = Float64Array.from(p);
  let d0 = 0;
  for (let x = 0; x < n; x++) d0 += p00[x] * dist(x, n);
  const windows = windowsOf(T);
  const grid = gridOf(T);
  const winMean = windows.map(() => new Float64Array(n));
  const sigmaStep = new Float64Array(T);
  const EdissStep = new Float64Array(T + 1); // cumulative at every time 0..T
  const EdissGrid = new Float64Array(grid.length);
  const DGrid = new Float64Array(grid.length);
  const w1Grid = new Float64Array(grid.length);
  const meanDGrid = new Float64Array(grid.length);
  EdissStep[0] = 0;
  let g = 0;
  if (grid[0] === 0) {
    w1Grid[0] = 0;
    meanDGrid[0] = d0;
    DGrid[0] = 0;
    g = 1;
  }
  const next = new Float64Array(n);
  for (let s = 0; s < T; s++) {
    let sig = 0;
    for (let x = 0; x < n; x++) {
      const F = qE * p[x];
      const R = qW * p[(x + 1) % n];
      sig += (F - R) * Math.log(F / R);
    }
    sigmaStep[s] = sig;
    EdissStep[s + 1] = EdissStep[s] + Math.sqrt(a * sig);
    const Ediss = EdissStep[s + 1];
    const wk = windows.findIndex(([b, e]) => s >= b && s < e);
    if (wk >= 0) {
      const w = windows[wk][1] - windows[wk][0];
      for (let x = 0; x < n; x++) winMean[wk][x] += p[x] / w;
    }
    for (let x = 0; x < n; x++) next[x] = q0 * p[x] + qE * p[(x - 1 + n) % n] + qW * p[(x + 1) % n];
    p.set(next);
    while (g < grid.length && grid[g] === s + 1) {
      EdissGrid[g] = Ediss;
      DGrid[g] = Math.min(s + 1, Ediss);
      const c = new Float64Array(n);
      let acc = 0;
      for (let x = 0; x < n; x++) {
        acc += p[x] - p00[x];
        c[x] = acc;
      }
      const sorted = Float64Array.from(c).sort();
      const med = sorted[(n / 2) | 0];
      let w1 = 0;
      let md = 0;
      for (let x = 0; x < n; x++) {
        w1 += Math.abs(c[x] - med);
        md += p[x] * dist(x, n);
      }
      w1Grid[g] = w1;
      meanDGrid[g] = md - d0;
      g++;
    }
  }
  const windowSigma = winMean.map((pm) => {
    let sig = 0;
    for (let x = 0; x < n; x++) {
      const F = qE * pm[x];
      const R = qW * pm[(x + 1) % n];
      sig += (F - R) * Math.log(F / R);
    }
    return sig;
  });
  return { n, m, T, windows, grid, sigmaStep, EdissStep, EdissGrid, DGrid, w1Grid, meanDGrid, winMean, windowSigma, d0 };
}

/** The population crossing of E_diss(t) − t (per-step, unwindowed),
 * linearly interpolated between consecutive steps. `null` = no crossing
 * within the horizon. The training crossings (w5 = 17.16748,
 * w4 = 23.93471) and h8's full-pool reference (10.2694847413) are this. */
export function popCross(law: ReturnType<typeof exactLaw>): number | null {
  let prevV = 0; // E_diss(0) − 0 = 0
  for (let t = 1; t <= law.T; t++) {
    const v = law.EdissStep[t] - t;
    if (v <= 0 && prevV > 0) return t - 1 + (prevV * 1) / (prevV - v);
    prevV = v;
  }
  return null;
}

/** The measured-window EP estimator: σ̂_k of the pooled window occupancy
 * `p̂_k`, with the registered q — `F̂ = q_E p̂(x)`, `R̂ = q_W p̂(x+1)`. A zero
 * pooled site is reported (its probability under the law is ≤ exp(−256)),
 * never silently clipped. */
export function sigmaOf(pooled: ArrayLike<number>, arm: ArmName, denom: number): { sigma: number; zeroSite: boolean } {
  const n = pooled.length;
  const q = ARMS[arm];
  const qE = q.e / 256, qW = q.w / 256;
  let sig = 0;
  let zeroSite = false;
  for (let x = 0; x < n; x++) {
    const F = (qE * pooled[x]) / denom;
    const R = (qW * pooled[(x + 1) % n]) / denom;
    if (pooled[x] === 0) zeroSite = true;
    sig += (F - R) * Math.log(F / R);
  }
  return { sigma: sig, zeroSite };
}

/** Ê at every window endpoint: `Ê(e_k) = Σ_{e_j ≤ e_k} w_j √(a σ̂_j)`. */
export function ehatOf(sigmaHat: number[], windows: [number, number][], a: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let k = 0; k < windows.length; k++) {
    acc += (windows[k][1] - windows[k][0]) * Math.sqrt(a * sigmaHat[k]);
    out.push(acc);
  }
  return out;
}

/** The first positive-to-nonpositive crossing of Ê(t) − t, linearly
 * interpolated on all window endpoints; the equality at t = 0 is excluded.
 * No crossing is `null` (+∞ for scoring). */
export function tCrossOf(Ehat: number[], windows: [number, number][]): number | null {
  let prevT = 0;
  let prevV = 0; // Ê(0) − 0 = 0, excluded as the registered equality
  for (let k = 0; k < windows.length; k++) {
    const t = windows[k][1];
    const v = Ehat[k] - t;
    if (v <= 0 && prevV > 0) return prevT + (prevV * (t - prevT)) / (prevV - v);
    prevT = t;
    prevV = v;
  }
  return null;
}

// ── the results shape the sweep writes ─────────────────────────────────────

export type ConeArm = {
  arm: ArmName;
  n: number;
  m: number;
  T: number;
  R: number;
  blocks: number;
  /** per-seed cumulative E−W tally at T */
  tallyTotal: number[];
  /** per-seed hop count at step 1 */
  hops1: number[];
  /** pooled per-window hop counts — the numerators of â_k (diagnostic) */
  hopsWin?: number[];
  /** pooled σ̂_k per window (the registered occupancy estimator) */
  sigmaKappa?: number[];
  /** Ê at every window endpoint */
  Ehat?: number[];
  /** t̂× (null = no crossing: +∞ for scoring) */
  tCross?: number | null;
  /** per-seed circle W₁ at the display grid (median-optimized) */
  W1?: number[][];
  /** per-seed pooled mean circle distance at the display grid */
  meanD?: number[][];
  /** per-seed max circle displacement from the profile start at T */
  coneMax: number[];
  /** per-seed OR of all y at T (zero in every registered arm) */
  yAny: number[];
  /** windXOR: per-seed damaged-walker count (the step-1 mirror) */
  damaged?: number[];
  /** windXOR: the X1 identity held bit for bit on every walker */
  identityOk?: boolean;
  /** h8 only in the compact form: pooled window occupancy [window][column],
   * so the P gate recomputes σ̂ from the raw counts */
  winPooled?: number[][];
  /** pooled zero occupancy sites, (window, column) — a statistical failure */
  zeroSites?: [number, number][];
};

export type Results = {
  commit?: string;
  dirty?: boolean;
  host?: string;
  date?: string;
  smoke?: boolean;
  adapter?: { vendor: string; architecture: string; device: string; description: string; fallback: boolean };
  /** the sweep guard's contract gate (probe.check()) */
  goldens?: boolean | null;
  /** M1 contract keys the Lean lane has not exported yet */
  m1Pending?: string[];
  n?: number;
  m?: number;
  T?: number;
  R?: number;
  blocks?: number;
  seeds?: unknown;
  sampling?: string;
  arms: ConeArm[];
  release?: { tag: string; url: string; sha256: Record<string, string>; regenerate: string };
};

/** Project one arm into the committed compact form: only h8 keeps the
 * pooled window occupancy (the P gate recomputes σ̂ from it); every other
 * arm's raw occupancy stays on the results-003 release. */
export function compactArm(a: ConeArm): ConeArm {
  return a.arm === "h8" ? a : { ...a, winPooled: undefined };
}

/** The registered decision rules need the full 003 configuration. */
export const isRegistered = (r: Results): boolean =>
  r.n === REG.n && r.m === REG.m && r.T === REG.T && r.R === REG.R && r.blocks === REG.blocks &&
  ARM_NAMES.every((arm) => r.arms.some((x) => x.arm === arm && x.sigmaKappa && x.Ehat && x.tCross !== undefined && x.W1 && x.meanD && x.hopsWin)) &&
  r.arms.some((x) => x.arm === "windXOR" && x.identityOk !== undefined && x.damaged);

// ── the registered decision rules ─────────────────────────────────────────

export type Verdict = "verified" | "supported" | "refuted" | "implementation error" | "statistical failure" | "pending" | "n/a";
export type Row = { name: string; pass: boolean; verdict: Verdict; detail: string };
export type Score = ReturnType<typeof score>;

const num = (x: number | null | undefined) =>
  x === null || x === undefined
    ? "—"
    : Math.abs(x) >= 1e6 || (x !== 0 && Math.abs(x) < 1e-3)
      ? x.toExponential(3)
      : String(+x.toPrecision(5));

/** The f64 pipeline checks: the scorer's own recurrence and closed forms
 * must reproduce the frozen registered constants (the rational calm W₁ at
 * t = 1, 2, 3; the calm denominator and c₅₁₂; the C5 branches; the P
 * centres; C_fit, t_h and the population crossings; the Bonferroni sum).
 * Pure host arithmetic — the page gate and the scorer share them. */
export function pipelineRows(): Row[] {
  const rows: Row[] = [];
  const near = (name: string, got: number, want: number, tol: number) =>
    rows.push({ name, pass: Number.isFinite(got) && Math.abs(got - want) <= tol, verdict: "verified", detail: `${num(got)} vs ${want} (±${tol})` });
  const reg = { n: REG.n, m: REG.m, T: REG.T };
  const calm = exactLaw("calm", { ...reg, T: 3 });
  const rational = [
    [1, 63 / 128],
    [2, 189 / 256],
    [3, 945 / 1024],
  ] as const;
  for (const [t, want] of rational) {
    near(`rational calm W₁ at t = ${t}`, calm.w1Grid[calm.grid.indexOf(t)], want, 1e-14);
    near(`calm distance witness at t = ${t}`, calm.meanDGrid[calm.grid.indexOf(t)], want, 1e-14);
  }
  const calm512 = exactLaw("calm", reg);
  near("calm E_diss(512) equals the frozen denominator", calm512.EdissGrid[calm512.grid.indexOf(REG.T)], REG.C4.EdissCalm512, 1e-10);
  near("c₅₁₂ = W₁(512)/E_diss(512)", calm512.w1Grid[calm512.grid.indexOf(REG.T)] / REG.C4.EdissCalm512, REG.C4.centre, 1e-12);
  for (const a of ARM_NAMES.filter((x) => x !== "calm")) {
    const { mu, rho } = paramsOf(a);
    if (REG.C5.bd[a] !== undefined)
      near(`${a} dissipative branch b_d = A√(tanh(ρ/2)/ρ)`, (63 / 64) * Math.sqrt(Math.tanh(rho / 2) / rho), REG.C5.bd[a], 1e-8);
    if (REG.C5.bc[a] !== undefined) near(`${a} causal branch b_c = Aμ`, (63 / 64) * mu, REG.C5.bc[a], 1e-8);
  }
  const h8 = exactLaw("h8", reg);
  near("P centre: h8 σ̂ at time 1", h8.windowSigma[1], REG.P.centres[0], 1e-9);
  near("P centre: h8 σ̂ at time 2", h8.windowSigma[2], REG.P.centres[1], 1e-9);
  near("P centre: h8 Ê(24)", ehatOf(h8.windowSigma, h8.windows, paramsOf("h8").a)[23], REG.P.centres[2], 1e-9);
  // The lock's own constants: the hypothesis section prints the training
  // crossings as 17.167 and 23.935, and C_fit is their δ-weighted mean as
  // written — which reproduces the frozen C_fit to 5e-11 (the harness
  // table's 17.16748/23.93471 are the diagnostics, not the lock's inputs).
  const cfit = (17.167 * paramsOf("w5").delta + 23.935 * paramsOf("w4").delta) / 2;
  near("C_fit as written in the lock", cfit, 2.4401213499, 1e-9);
  near("the held-out t_h = C_fit/δ_h8", cfit / paramsOf("h8").delta, REG.C3.tH, 1e-9);
  near("w5 training crossing", popCross(exactLaw("w5", reg)) ?? NaN, 17.16748, 1e-4);
  near("w4 training crossing", popCross(exactLaw("w4", reg)) ?? NaN, 23.93471, 1e-4);
  near("wind population crossing", popCross(exactLaw("wind", reg)) ?? NaN, 44.73715, 1e-4);
  near("h8 population crossing", popCross(h8) ?? NaN, 10.2694847413, 1e-9);
  near("the Bonferroni FWER", REG.FWER, 0.01749428125, 0);
  for (const r of rows) if (!r.pass) r.verdict = "implementation error";
  return rows;
}

/** Every registered decision rule over one sweep's results. Statistical
 * verdicts are n/a unless the results are the registered configuration;
 * bit-exact verdicts (M1, C1, X1's identity) are always computed. */
export function score(results: Results, source?: string) {
  const registered = isRegistered(results);
  const na = registered ? null : `n/a: not the registered configuration (n = ${REG.n}, m = ${REG.m}, R = ${REG.R}, T = ${REG.T}, 8 arms)`;
  const statistical = (ok: boolean): Verdict => (na ? "n/a" : ok ? "supported" : "refuted");
  const arm = (name: ArmName) => {
    const a = results.arms.find((x) => x.arm === name);
    if (!a) throw new Error(`results have no ${name} arm`);
    return a;
  };
  const cfg = { n: results.n ?? REG.n, m: results.m ?? REG.m, T: results.T ?? REG.T };
  const laws: Partial<Record<ArmName, ReturnType<typeof exactLaw>>> = {};
  const law = (a: ArmName) => (laws[a] ??= exactLaw(a, cfg));

  // M1: the contract gate. `goldens` is the sweep's probe.check() outcome;
  // m1Pending names the contract keys the Lean lane has not exported.
  const pending = results.m1Pending ?? [];
  const M1: Row = {
    name: "M1",
    pass: results.goldens === true && pending.length === 0,
    verdict: results.goldens === true ? (pending.length ? "pending" : "verified") : "implementation error",
    detail: results.goldens === true
      ? pending.length ? `gate passed; pending contract keys: ${pending.join(", ")}` : "gate passed bit for bit"
      : `the contract gate FAILED (${results.goldens})`,
  };

  // C1: bit-exact cone and packing checks on every arm present.
  const gridT = gridOf(results.T ?? REG.T);
  const C1 = (() => {
    const rows = results.arms.map((a) => ({
      arm: a.arm,
      cone: a.coneMax.every((c) => c <= a.T),
      y: a.yAny.every((c) => c === 0),
      w1: a.W1?.every((row) => row.every((v, g) => v <= gridT[g] + 1e-7)) ?? true,
    }));
    const pass = rows.every((r) => r.cone && r.y && r.w1);
    return {
      rows,
      maxCone: Math.max(0, ...results.arms.flatMap((a) => a.coneMax)),
      pass,
      verdict: (pass ? "verified" : "implementation error") as Verdict,
      detail: pass
        ? `max displacement ${Math.max(0, ...results.arms.flatMap((a) => a.coneMax))} ≤ T on ${results.arms.length} arms; y ≡ 0; Ŵ ≤ t on the grid`
        : rows.filter((r) => !r.cone || !r.y || !r.w1).map((r) => r.arm).join(", ") + " violate the cone or packing",
    };
  })();

  // C2: the population inequality W₁ ≤ min(t, E_diss) on the display grid,
  // from the exact chain — a numerical check of the (Lean-lane) theorem; a
  // violation flags arithmetic, not physics.
  const C2 = (() => {
    let worst = { arm: "" as ArmName, slack: Infinity };
    for (const a of ARM_NAMES) {
      const l = law(a);
      for (let g = 0; g < l.grid.length; g++) {
        const slack = l.DGrid[g] - l.w1Grid[g];
        if (slack < worst.slack) worst = { arm: a, slack };
      }
    }
    const pass = worst.slack >= -1e-9;
    return { worst, pass, verdict: (pass ? "verified" : "implementation error") as Verdict };
  })();

  // The pipeline arithmetic: the scorer's own f64 recurrence must reproduce
  // the frozen constants before any measured verdict is read (shared with
  // the page gate).
  const pipeline = pipelineRows();

  // The measured statistical tests, each at its registered tolerance.
  const has = (name: ArmName) => results.arms.some((x) => x.arm === name);
  const D = (a: ArmName, t: number) => {
    const l = law(a);
    return l.DGrid[l.grid.indexOf(t)];
  };

  const C3 = has("h8") && registered
    ? (() => {
        const t = arm("h8").tCross ?? Infinity;
        const dev = Math.abs(t - REG.C3.tH);
        const pass = dev <= REG.C3.tol;
        return {
          tCross: Number.isFinite(t) ? t : null,
          dev,
          pass,
          verdict: (arm("h8").zeroSites?.length ? "statistical failure" : statistical(pass)) as Verdict,
          detail: `t̂× = ${Number.isFinite(t) ? num(t) : "+∞"} vs t_h = ${REG.C3.tH} (|Δ| = ${num(dev)} ≤ ${num(REG.C3.tol)})${arm("h8").zeroSites?.length ? ` — pooled zero site at ${JSON.stringify(arm("h8").zeroSites)}` : ""}`,
        };
      })()
    : null;

  const C4 = has("calm") && registered
    ? (() => {
        const a = arm("calm");
        const pooled = a.meanD!.reduce((s, row) => s + row[row.length - 1], 0) / a.R;
        const l = law("calm");
        const L = pooled - l.d0;
        const eta = L / D("calm", REG.T);
        const dev = Math.abs(eta - REG.C4.centre);
        const pass = dev <= REG.C4.tol;
        return {
          pooled,
          d0: l.d0,
          L,
          eta,
          dev,
          pass,
          verdict: statistical(pass) as Verdict,
          detail: `η̂_lin(512) = ${num(eta)} vs c₅₁₂ = ${REG.C4.centre} (|Δ| = ${num(dev)} ≤ ${REG.C4.tol}); L̂ = ${num(L)}, D = ${num(D("calm", REG.T))}`,
        };
      })()
    : null;

  const C5 = ARM_NAMES.filter((a) => a !== "calm" && has(a)).map((name) => {
    const a = arm(name);
    if (!registered || !a.W1 || !a.meanD) return { arm: name, verdict: "n/a" as Verdict, pass: true, detail: na ?? "not the registered configuration" };
    const t = a.T;
    const w1 = a.W1.reduce((s, row) => s + row[row.length - 1], 0) / a.R;
    const eta = w1 / D(name, t);
    const causal = name === "c2" || name === "max";
    const branch = causal ? (63 / 64) * paramsOf(name).mu : (63 / 64) * Math.sqrt(Math.tanh(paramsOf(name).rho / 2) / paramsOf(name).rho);
    const tol = causal ? REG.C5.bcTol : REG.C5.bdTol;
    const dev = Math.abs(eta - branch);
    const pass = dev <= tol;
    return {
      arm: name,
      branch,
      eta,
      dev,
      tol,
      pass,
      verdict: statistical(pass) as Verdict,
      detail: `η̂(512) = ${num(eta)} vs the ${causal ? "causal" : "dissipative"} branch ${num(branch)} (|Δ| = ${num(dev)} ≤ ${tol})`,
    };
  });

  const X1 = has("windXOR")
    ? (() => {
        const a = arm("windXOR");
        const total = (a.damaged ?? []).reduce((x, y) => x + y, 0);
        const countPass = Math.abs(total - REG.X1.mean) <= REG.X1.half;
        const pass = a.identityOk === true && countPass;
        return {
          identityOk: a.identityOk === true,
          damaged: total,
          countPass,
          pass,
          verdict: (a.identityOk === true ? (registered ? (countPass ? "supported" : "refuted") : "n/a") : "implementation error") as Verdict,
          detail: `identity ${a.identityOk === true ? "holds bit for bit" : "VIOLATED"}; damaged ${total} vs ${REG.X1.mean} ± ${REG.X1.half}${registered ? "" : " (not the registered configuration)"}`,
        };
      })()
    : null;

  const T1 = REG.T1.map((row) => {
    const isActivity = row.name.endsWith("activity");
    const name = (isActivity ? "wind" : row.name.split(" ")[0]) as ArmName;
    if (!has(name)) return { ...row, total: null, pass: false, verdict: "n/a" as Verdict, detail: `${row.name}: arm not present` };
    // wind hop-1 activity reads the wind arm's step-1 hop counts
    const total = isActivity
      ? arm(name).hops1.reduce((x, y) => x + y, 0)
      : arm(name).tallyTotal.reduce((x, y) => x + y, 0);
    const dev = total - row.mean;
    const pass = Math.abs(dev) <= row.half;
    return { ...row, total, dev, pass, verdict: (registered ? statistical(pass) : "n/a") as Verdict, detail: `${row.name}: ${total} vs ${row.mean} ± ${row.half}` };
  });

  const P = has("h8") && arm("h8").winPooled && registered
    ? (() => {
        const a = arm("h8");
        const windows = windowsOf(a.T);
        // the P gate recomputes σ̂ from the pooled occupancy through the
        // committed estimator, then reads Ê(24) from the σ̂ row
        const s1 = sigmaOf(a.winPooled![1], "h8", a.R * a.m * (windows[1][1] - windows[1][0]));
        const s2 = sigmaOf(a.winPooled![2], "h8", a.R * a.m * (windows[2][1] - windows[2][0]));
        const E24 = ehatOf(a.sigmaKappa!, windows, paramsOf("h8").a)[23];
        const devs = [s1.sigma - REG.P.centres[0], s2.sigma - REG.P.centres[1], E24 - REG.P.centres[2]];
        const Z = Math.max(...devs.map((d, i) => Math.abs(d) / REG.P.widths[i]));
        const pass = Z <= REG.P.threshold;
        const zero = s1.zeroSite || s2.zeroSite || (a.zeroSites?.length ?? 0) > 0;
        return {
          s1: s1.sigma,
          s2: s2.sigma,
          E24,
          devs,
          Z,
          zeroSite: zero,
          pass,
          verdict: (zero ? "statistical failure" : statistical(pass)) as Verdict,
          detail: `Z = ${num(Z)} ≤ ${REG.P.threshold} (deviations ${devs.map((d, i) => `${num(d)}/${REG.P.widths[i]}`).join(", ")})${zero ? " — a pooled zero site: statistical failure" : ""}`,
        };
      })()
    : null;

  const fwer = {
    sum: 7 * 0.001 + 10 * 0.001 + 2 / 4096 + 6e-6,
    budget: 0.05,
    pass: 7 * 0.001 + 10 * 0.001 + 2 / 4096 + 6e-6 <= 0.05,
  };

  const diagnostics = (() => {
    const rows: string[] = [];
    for (const name of ARM_NAMES) {
      if (!has(name)) continue;
      const a = arm(name);
      if (a.tCross === undefined) continue;
      rows.push(`${name}: t̂× = ${a.tCross === null ? "none" : num(a.tCross)}, D(${a.T}) = ${num(D(name, a.T))} (${D(name, a.T) === a.T ? "cone" : "dissipation"} bound)`);
    }
    return rows;
  })();

  return {
    source: source ?? null,
    commit: results.commit ?? null,
    dirty: results.dirty ?? null,
    registered,
    note: na,
    M1,
    C1,
    C2,
    pipeline,
    C3,
    C4,
    C5,
    X1,
    T1,
    P,
    fwer,
    diagnostics,
  };
}

// ── rendering ─────────────────────────────────────────────────────────────

/** The verdict table, one line per registered claim. */
export function renderVerdict(s: Score): string {
  const v = (x: Verdict) => x;
  const line = (id: string, r: Row | { verdict: Verdict; detail: string } | null) =>
    `${(id + " ".repeat(14)).slice(0, 14)} ${r ? `${v(r.verdict)}  ${r.detail}` : `n/a${s.registered ? ": arm not present" : ": needs the registered configuration"}`}`;
  const lines = [
    `003 verdict — ${s.source ?? "(results)"} · commit ${s.commit ?? "?"}${s.dirty ? " · DIRTY" : " · clean"} · ${s.registered ? "registered configuration" : "NOT the registered configuration: statistical verdicts are n/a"} · FWER ${s.fwer.sum} ≤ 0.05`,
    line("M1", { verdict: s.M1.verdict, detail: s.M1.detail }),
    line("C1 cone", s.C1),
    line("C2 bound", { verdict: s.C2.verdict, detail: `worst slack ${num(s.C2.worst.slack)} on ${s.C2.worst.arm} (population W₁ ≤ D on the grid)` }),
    ...s.pipeline.map((r) => line("pipeline", r)),
    line("C3 held-out", s.C3),
    line("C4 calm", s.C4),
    ...s.C5.map((c) => line(`C5 ${c.arm}`, { verdict: c.verdict, detail: c.detail })),
    line("X1 damage", s.X1),
    ...s.T1.map((t) => line("T1", { verdict: t.verdict, detail: t.detail })),
    line("P pipeline", s.P),
    `diagnostics   ${s.diagnostics.join(" | ") || "—"}`,
  ];
  return lines.join("\n");
}

// The CLI entry: `node experiments/003-lightcone-speedlimit/score.ts <results.json>`.
// Only Node reaches the dynamic import; the browser bundle stops at the guard.
if (typeof process !== "undefined" && process.argv[1]?.endsWith("score.ts")) {
  const [input] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node experiments/003-lightcone-speedlimit/score.ts <results.json>");
    process.exit(2);
  }
  const { readFileSync, writeFileSync } = await import(/* @vite-ignore */ "node:fs");
  const scored = score(JSON.parse(readFileSync(input, "utf8")), input);
  console.log(renderVerdict(scored));
  const out = input.replace(/\.json$/, "") + ".score.json";
  writeFileSync(out, JSON.stringify(scored, null, 1) + "\n");
  console.log(out);
}

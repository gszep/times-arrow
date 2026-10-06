// The committed scorer of the locked 002 pre-registration
// (experiments/002-arrow-kl/README.md, frozen at 09d37bb): every registered
// decision rule, computed from the sweep's results JSON and nothing else.
// `node experiments/002-arrow-kl/score.ts <results.json>` prints the verdict
// table and writes it next to the results as `<results>.score.json`. The
// page and the run driver import the same functions (the arm weights, σ,
// the exact tally DP) instead of duplicating them.
//
// Tallies are exact integers throughout; σ enters as the single registered
// product (n_E − n_W)·ln 3 (≤ 1 ulp — the stated trust boundary). Registered
// rules that needed an interpretation are marked INTERPRETATION where they
// are implemented.
import type { Weights } from "../../src/walk.ts";
import contract from "../../contract.json" with { type: "json" };
export type { Weights };

const weights = ([e, w, n, s, zero]: number[]): Weights => ({ e, w, n, s, zero });

/** The registered arms of 002, dyadic in 256ths. */
export const ARMS = {
  driven: weights(contract.walk.arms.driven.q),
  reversed: weights(contract.walk.arms.reversed.q),
  null: weights(contract.walk.arms.null.q),
} as const satisfies Record<string, Weights>;

/** The ramp protocol ε(t) = t/16: q_E = (32+t)/256, q_W = (32−t)/256, the
 * stay weight constant. Its reverse protocol is ε(15−t), weights not
 * swapped — the schedule reversal is the protocol reversal. */
export const ramp = (t: number): Weights => weights(contract.walk.arms.ramp.schedule[t]);
const rampRev = (t: number): Weights => weights(contract.walk.arms.ramprev.schedule[t]);
export const RAMP_T = contract.walk.arms.ramp.schedule.length;

export const protocolOf = (arm: ArmName, T: number): Weights[] =>
  arm === "ramp" ? Array.from({ length: T }, (_, t) => ramp(t))
  : arm === "ramprev" ? Array.from({ length: T }, (_, t) => rampRev(t))
  : Array.from({ length: T }, () => ARMS[arm]);

/** σ of one path from its per-step tallies: Σ over the protocol's distinct
 * hop ratios of (path tally at that ratio) · ln(ratio). A constant protocol
 * collapses to the registered single product (n_E − n_W)·ln(q_E/q_W); the
 * null's ratio is ln 1 = 0, so every null path has σ = 0 exactly. */
export function sigma(tallies: ArrayLike<number>, protocol: Weights[]): number {
  const partial = new Map<number, number>();
  for (let t = 0; t < tallies.length; t++) {
    const r = Math.log(protocol[t].e / protocol[t].w);
    partial.set(r, (partial.get(r) ?? 0) + tallies[t]);
  }
  let s = 0;
  for (const [r, k] of partial) s += k * r;
  return s;
}

/** The exact law of the path tally `K = n_E − n_W` after `m·T` independent
 * 3-point increments, by DP in f64 (the contract pins the T ≤ 2 tables as
 * exact rationals; denominators 256^(mT)). Entry `K + m·T` is `P(K)`. */
export function tallyDp(m: number, T: number, q: Weights): Float64Array {
  return protocolTallyDp(m, Array.from({ length: T }, () => q));
}

/** Tally (not σ) histogram for a possibly time-dependent protocol. */
export function protocolTallyDp(m: number, protocol: Weights[]): Float64Array {
  const steps = m * protocol.length;
  let dp = new Float64Array(2 * steps + 3); // K at index K + steps + 1
  dp[steps + 1] = 1;
  for (let i = 0; i < steps; i++) {
    const q = protocol[Math.floor(i / m)];
    const inc = [q.w / 256, (q.n + q.s + q.zero) / 256, q.e / 256];
    const next = new Float64Array(dp.length);
    for (let j = 1; j < dp.length - 1; j++) {
      const p = dp[j];
      if (p === 0) continue;
      next[j - 1] += p * inc[0];
      next[j] += p * inc[1];
      next[j + 1] += p * inc[2];
    }
    dp = next;
  }
  return dp.slice(1, 2 * steps + 2); // K at index K + steps
}

/** The exact mean and variance of σ over one path: `m` walkers, the
 * protocol's per-step weights. (The registered numbers follow: the driven
 * arm gives ⟨σ⟩ = 2T ln 3, std √(15T/4)·ln 3; the ramp gives 10.193,
 * 4.549.) */
export function exactSigmaStats(protocol: Weights[], m: number): { mean: number; std: number } {
  let mean = 0;
  let varr = 0;
  for (const q of protocol) {
    const r = Math.log(q.e / q.w);
    const mu = ((q.e - q.w) / 256) * r;
    mean += m * mu;
    varr += m * (((q.e + q.w) / 256) * r * r - mu * mu);
  }
  return { mean, std: Math.sqrt(varr) };
}

// ── the results shape the sweep writes ─────────────────────────────────────

export type ArmName = "driven" | "reversed" | "null" | "ramp" | "ramprev";
export type MainArm = {
  arm: ArmName;
  T: number;
  R: number;
  blocks: number;
  /** constant arms: per-block sparse tally histograms, sorted [K, count] */
  blockHist?: [number, number][][];
  /** the largest |σ| over the arm's paths (the null arms' record: 0) */
  maxAbsSigma?: number;
  /** ramp arms: per-block Σσ and Σσ² (σ is not a lattice value there) */
  blockSum?: number[];
  blockSumSq?: number[];
  /** ramp arms: full-arm histogram over 0.5-nat bins [bin, count], bin b = ⌊σ/0.5⌋ */
  hist?: [number, number][];
};
export type CornerPaths = {
  /** per path: the integer tally n_E − n_W */
  tally: number[];
  /** per path: the integer crossing tally #E(∂A) − #W(∂A) */
  cross: number[];
  /** per path: the half-count occupancy sequence, t = 0..T */
  half: number[][];
  /** per path: the L-count occupancy sequence */
  l: number[][];
  /** per path: σ_cg of the half-count path (f64; the null arm's are 0 —
   * its reversed kernel equals its forward kernel, exact by the weights) */
  scgHalf: number[];
  /** per path: σ_cg of the L-count path */
  scgL: number[];
  maxAbsSigma?: number;
};
export type CornerResult = {
  n: number;
  m: number;
  T: number;
  R: number;
  blocks: number;
  driven: CornerPaths;
  null: CornerPaths;
};
export type Results = {
  commit?: string;
  dirty?: boolean;
  host?: string;
  date?: string;
  smoke?: boolean;
  adapter?: { vendor: string; architecture: string; device: string; description: string; fallback: boolean };
  /** the sweep guard's golden check: bit for bit against contract.walk */
  goldens?: boolean | null;
  n?: number;
  m?: number;
  main: MainArm[];
  corner: CornerResult;
};

// ── registered constants (Bonferroni: 25 checks, α = 0.002 per test) ───────

/** The normal band when σ is exactly known. */
export const Z = 3.1;
/** The t quantile at df 15 — the two bands dividing by a 16-block SE. */
export const T15 = 3.73;
export const LN3 = Math.log(ARMS.driven.e / ARMS.driven.w);
/** per-increment excess kurtosis of the E−W tally, (62/75) (registered). */
const KAPPA_X = 62 / 75;
/** χ² thresholds at p ≈ 10⁻³, and the registered bin sets behind them.
 * INTERPRETATION: the "expected count ≥ 10" text of the observables section
 * reproduces the registered bin count only at T = 1 ([−5, 9]); at T = 4 the
 * unique contiguous expected-count set with the registered 29 bins is
 * [−6, 22] (it contains the k = −6 bin whose expected 8.2 the registration
 * itself computes, and excludes k = −7 at 3.0), and at T = 64 the registered
 * 117 bins are the explicit cross-arm range [70, 186] of K3 — the same set
 * the χ² threshold 169 (df 116) is stated for. */
const CHI2: Record<number, { limit: number; bins: number; range: [number, number] }> = {
  1: { limit: 36, bins: 15, range: [-5, 9] },
  4: { limit: 57, bins: 29, range: [-6, 22] },
  64: { limit: 169, bins: 117, range: [70, 186] },
};
/** the T = 64 cross-arm mirror bins (registered: j ∈ [70, 186]) */
const CROSS_LO = 70;
const CROSS_HI = 186;
/** Var(σ_∂) = 6.4349 (ln 3)², the exact position-chain lag covariance. */
const VAR_SIGMA_D = 6.4349;
/** the collapse threshold of the deep IFT (registered). */
const IFT_COLLAPSE = 1e-3;

// ── small helpers ─────────────────────────────────────────────────────────

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
/** the count at bin `k`, or 0 */
const at = (h: [number, number][], k: number): number => {
  let lo = 0;
  let hi = h.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (h[mid][0] < k) lo = mid + 1;
    else hi = mid;
  }
  return h[lo]?.[0] === k ? h[lo][1] : 0;
};
const histTotal = (h: [number, number][]) => h.reduce((a, [, n]) => a + n, 0);
const mergeHist = (blocks: [number, number][][]): [number, number][] => {
  const m = new Map<number, number>();
  for (const h of blocks) for (const [k, n] of h) m.set(k, (m.get(k) ?? 0) + n);
  return [...m].sort((a, b) => a[0] - b[0]);
};

// ── K1: the second law is linear ───────────────────────────────────────────

function k1(arm: MainArm | undefined) {
  if (!arm?.blockHist) throw new Error("K1 needs the driven arm's block histograms");
  const { T, R } = arm;
  const hist = mergeHist(arm.blockHist);
  const sigmaStd = Math.sqrt((15 / 4) * T) * LN3;
  const dMean = hist.reduce((a, [k, n]) => a + n * k * LN3, 0) / R;
  const meanOk = Math.abs(dMean - 2 * T * LN3) <= (Z * sigmaStd) / Math.sqrt(R);
  const varr = hist.reduce((a, [k, n]) => a + n * (k * LN3 - dMean) ** 2, 0) / (R - 1);
  const kappa = KAPPA_X / (16 * T);
  const stdOk = Math.abs(Math.sqrt(varr) - sigmaStd) <= Z * sigmaStd * Math.sqrt((kappa + 2) / (4 * R));
  const dp = tallyDp(16, T, ARMS.driven);
  const chi2 = { value: 0, bins: 0 };
  const [lo, hi] = CHI2[T].range;
  for (let K = lo; K <= hi; K++) {
    const e = R * dp[K + 16 * T];
    chi2.value += ((at(hist, K) - e) ** 2) / e;
    chi2.bins++;
  }
  const chi2Ok = chi2.value <= CHI2[T].limit;
  const perBlock = arm.blockHist.map((h) => {
    const bR = histTotal(h);
    const m = h.reduce((a, [k, n]) => a + n * k * LN3, 0) / bR;
    return { m, inside: Math.abs(m - 2 * T * LN3) <= (Z * sigmaStd) / Math.sqrt(bR) };
  });
  const outside = perBlock.filter((b) => !b.inside).length;
  const blocksOk = outside <= 1; // ≥ 15/16 inside; ≥ 2 outside refutes
  return {
    T,
    dMean,
    sigmaStd,
    std: Math.sqrt(varr),
    chi2: { ...chi2, limit: CHI2[T].limit, registeredBins: CHI2[T].bins, range: CHI2[T].range },
    perBlock,
    outside,
    pass: meanOk && stdOk && chi2Ok && blocksOk,
    meanOk,
    stdOk,
    chi2Ok,
    blocksOk,
    refutedBy: [
      !meanOk && `mean ${dMean.toPrecision(6)} leaves 2T ln 3 ± ${((Z * sigmaStd) / Math.sqrt(R)).toPrecision(3)}`,
      !stdOk && `std ${Math.sqrt(varr).toPrecision(6)} leaves its band`,
      !chi2Ok && `χ² ${chi2.value.toPrecision(4)} > ${CHI2[T].limit} over ${chi2.bins} bins (registered ${CHI2[T].bins})`,
      !blocksOk && `${outside} of ${perBlock.length} block means outside their band (≥ 2 refutes)`,
    ].filter((s): s is string => !!s),
  };
}

// ── K2: the arrow is the state, not the law ────────────────────────────────

function k2(nulls: MainArm[], drivenMeans: (number | null)[]) {
  const bad = nulls.filter((a) => (a.maxAbsSigma ?? NaN) !== 0);
  const drivenPos = drivenMeans.every((m) => m !== null && m > 0);
  return {
    bad: bad.map((a) => `${a.arm} T=${a.T}`),
    maxAbs: nulls.map((a) => a.maxAbsSigma ?? null),
    drivenPos,
    pass: bad.length === 0 && drivenPos,
  };
}

// ── K3: the detailed fluctuation theorem ───────────────────────────────────

function k3(hist: [number, number][], T: number, reversedHist: [number, number][] | null) {
  // The within-arm mirror bins k ∈ [−5, 5] of T ∈ {1, 4}: 11 bins, ≥ 10 must
  // hold at per-bin 3σ, and the least-squares slope through the origin must
  // be ln 3 within 5%.
  // INTERPRETATION: the slope is the unweighted through-origin fit of
  // ln(n(k)/n(−k)) on k over the 11 registered bins (the exact relation has
  // zero intercept).
  const mirrorBins = (T: 1 | 4) => {
    const bins: { k: number; y: number; pass: boolean }[] = [];
    let num = 0;
    let den = 0;
    for (let k = -5; k <= 5; k++) {
      const n = at(hist, k);
      const nm = at(hist, -k);
      const y = nm > 0 && n > 0 ? Math.log(n / nm) : NaN;
      const pass = nm > 0 && n > 0 && Math.abs(y - k * LN3) <= 3 * Math.sqrt(1 / n + 1 / nm);
      bins.push({ k, y, pass });
      if (!Number.isNaN(y)) {
        num += k * y;
        den += k * k;
      }
    }
    const slope = num / den;
    const passing = bins.filter((b) => b.pass).length;
    return {
      bins,
      passing,
      binsOk: passing >= 10,
      slope,
      slopeOk: Math.abs(slope - LN3) <= 0.05 * LN3,
    };
  };
  const m1 = T === 1 ? mirrorBins(1) : null;
  const m4 = T === 4 ? mirrorBins(4) : null;
  // T = 64: the mirror identity of the exact DP (the f64 stand-in for the
   // Lean golden) and the cross-arm mirror: the
  // reversed arm realizes reversedPathPMF, n_R(−j) = n_F(j) within 3σ.
  // INTERPRETATION: "3σ Poisson" is the two-count difference test
  // |n_R(−j) − n_F(j)| ≤ 3·√(n_F(j) + n_R(−j)).
  let dpMirror = true;
  if (T === 64) {
    const dp = tallyDp(16, 64, ARMS.driven);
    for (let K = 0; K <= 186; K++) {
      const p = dp[K + 16 * 64];
      const pm = dp[-K + 16 * 64];
      if (p < 1e-200) continue;
      if (Math.abs(Math.log(p / pm) - K * LN3) > 1e-9 * (1 + K)) dpMirror = false;
    }
  }
  let cross: { bins: number; passing: number; frac: number } | null = null;
  if (T === 64 && reversedHist) {
    let passing = 0;
    let bins = 0;
    for (let j = CROSS_LO; j <= CROSS_HI; j++) {
      const nF = at(hist, j);
      const nR = at(reversedHist, -j);
      bins++;
      if (Math.abs(nR - nF) <= 3 * Math.sqrt(nF + nR)) passing++;
    }
    cross = { bins, passing, frac: passing / bins };
  }
  const pass = (m1 ? m1.binsOk && m1.slopeOk : true) && (m4 ? m4.binsOk && m4.slopeOk : true) &&
    (T === 64 ? dpMirror && (cross ? cross.frac >= 0.9 : false) : true);
  return { m1, m4, dpMirror, cross, pass };
}

// ── K4: the integral fluctuation theorem ──────────────────────────────────

function k4(hist: [number, number][], T: number, R: number) {
  const ift = hist.reduce((a, [k, n]) => a + n * Math.exp(-k * LN3), 0) / R;
  const meanExp = hist.reduce((a, [k, n]) => a + n * Math.exp(k * LN3), 0) / R;
  const stdHat = Math.sqrt((meanExp - 1) / R);
  if (T === 1) {
    const band = 4 * stdHat;
    return { T, ift, stdHat, band, pass: Math.abs(ift - 1) <= band };
  }
  return { T, ift, stdHat, band: IFT_COLLAPSE, pass: ift < IFT_COLLAPSE };
}

// ── K5: coarse-graining loses the arrow (the corner) ──────────────────────

function k5(corner: CornerResult) {
  const { R, T } = corner;
  const sigmaPath = (t: number) => t * LN3;
  const d = corner.driven;
  const nu = corner.null;
  const meanSigma = d.tally.reduce((a, t) => a + sigmaPath(t), 0) / R;
  const sigmaBand = (Z * Math.sqrt(30) * LN3) / Math.sqrt(R);
  const meanSd = d.cross.reduce((a, c) => a + sigmaPath(c), 0) / R;
  const sdBand = (Z * Math.sqrt(VAR_SIGMA_D) * LN3) / Math.sqrt(R);
  const halfBad = d.scgHalf.map((s, i) => ({ i, s })).filter((x) => !Number.isFinite(x.s) || Math.abs(x.s) > 1e-12);
  const halfMax = d.scgHalf.reduce((a, s) => Math.max(a, Math.abs(s)), 0);
  const per = R / corner.blocks;
  const blockMeans = Array.from({ length: corner.blocks }, (_, b) => mean(d.scgL.slice(b * per, (b + 1) * per)));
  const lMean = mean(d.scgL);
  const lSe = sd(blockMeans) / Math.sqrt(corner.blocks);
  const lBand = T15 * lSe;
  const lOk = Math.abs(lMean) <= lBand;
  const nullSigmaOk = (nu.maxAbsSigma ?? NaN) === 0;
  const nullScgOk = [...nu.scgHalf, ...nu.scgL].every((s) => Math.abs(s) <= 1e-12);
  return {
    meanSigma,
    sigmaExact: 16 * LN3,
    sigmaBand,
    sigmaOk: Math.abs(meanSigma - 16 * LN3) <= sigmaBand,
    meanSd,
    sdExact: 4 * LN3,
    sdBand,
    sdOk: Math.abs(meanSd - 4 * LN3) <= sdBand,
    halfBad,
    halfMax,
    lMean,
    lSe,
    lBand,
    lOk,
    nullSigmaOk,
    nullScgOk,
    // bit-level failures are implementation errors, not physics verdicts
    pass: nullSigmaOk && nullScgOk && halfBad.length === 0 && lOk,
    physicsOk: Math.abs(meanSigma - 16 * LN3) <= sigmaBand && Math.abs(meanSd - 4 * LN3) <= sdBand,
  };
}

// ── K6: the estimator story (the plug-in against the mean) ────────────────

function k6(driven: MainArm, reversed: MainArm) {
  const { R } = driven;
  const hist = mergeHist(driven.blockHist!);
  const rev = mergeHist(reversed.blockHist!);
  const dMean = hist.reduce((a, [k, n]) => a + n * k * LN3, 0) / R;
  // INTERPRETATION: the reversed arm's σ-law lives on the mirror of the
  // driven arm's support, so the plug-in reconstructs p̂_R on the driven
  // support through the exact dFT tilt: p̂_R(k) = e^{−k ln 3}·n_R(−k)/R
  // (the license the registration states). "Populated bins" are the
  // observed-populated ones (both counts > 0) — K̂ ≈ 117 at T = 64, the
  // registered count; an expected-count cutoff would bias the plug-in off
  // the mean by the tail mass it drops.
  const pluginOf = (h: [number, number][], r: [number, number][], rF: number, rR: number) => {
    let sum = 0;
    let k = 0;
    for (const [K, n] of h) {
      const nRm = at(r, -K);
      if (n < 1 || nRm < 1) continue;
      k++;
      sum += (n / rF) * Math.log(n / rF / (Math.exp(-K * LN3) * (nRm / rR)));
    }
    return { sum, k };
  };
  const full = pluginOf(hist, rev, R, histTotal(rev));
  const perBlock = driven.blockHist!.map((h, b) => {
    const bR = histTotal(h);
    const p = pluginOf(h, reversed.blockHist![b], bR, histTotal(reversed.blockHist![b]));
    return p.sum - h.reduce((a, [K, n]) => a + n * K * LN3, 0) / bR;
  });
  const sigmaDiff = sd(perBlock);
  const band = (T15 * sigmaDiff) / Math.sqrt(driven.blocks);
  const bias = (full.k - 1) / (2 * R);
  const diff = full.sum - dMean;
  const ok = -band <= diff && diff <= bias + band;
  return { dMean, dPlugin: full.sum, kPopulated: full.k, bias, sigmaDiff, band, diff, ok, exact: 2 * 64 * LN3 };
}

// ── C1: Crooks/Jarzynski for the time-dependent protocol ──────────────────

function c1(rampArm: MainArm, revArm: MainArm) {
  const proto = protocolOf("ramp", RAMP_T);
  const m = 16;
  const { mean: exactMean, std: exactStd } = exactSigmaStats(proto, m);
  const exactVar = exactStd ** 2;
  const kappa = proto.reduce((a, q) => {
    const r = Math.log(q.e / q.w);
    const mu = ((q.e - q.w) / 256) * r;
    const v = ((q.e + q.w) / 256) * r * r - mu * mu;
    const e4 = ((q.e * (r - mu) ** 4 + q.w * (-r - mu) ** 4 + (256 - q.e - q.w) * mu ** 4) / 256);
    return a + (e4 - 3 * v * v);
  }, 0) / exactVar ** 2;
  const { R } = rampArm;
  const meanArm = rampArm.blockSum!.reduce((a, b) => a + b, 0) / R;
  const sumSq = rampArm.blockSumSq!.reduce((a, b) => a + b, 0);
  const stdArm = Math.sqrt((sumSq - R * meanArm ** 2) / (R - 1));
  const meanOk = Math.abs(meanArm - exactMean) <= (Z * Math.sqrt(exactVar)) / Math.sqrt(R);
  const stdOk = Math.abs(stdArm - Math.sqrt(exactVar)) <= Z * Math.sqrt(exactVar) * Math.sqrt((kappa + 2) / (4 * R));
  // Crooks over populated 0.5-nat bins: bin b covers s ∈ [0.5b, 0.5b + 0.5),
  // so the mirrored bin of b is −b − 1. The per-bin s is the bin centre.
  const mirror = (b: number) => -b - 1;
  const hist = rampArm.hist!;
  const rev = revArm.hist!;
  const bins: { b: number; s: number; y: number; pass: boolean }[] = [];
  let num = 0;
  let den = 0;
  for (const [b, nF] of hist) {
    const nR = at(rev, mirror(b));
    if (nF < 10 || nR < 10) continue;
    const s = 0.5 * b + 0.25;
    const y = Math.log(nF / nR);
    const pass = Math.abs(y - s) <= 3 * Math.sqrt(1 / nF + 1 / nR);
    bins.push({ b, s, y, pass });
    num += s * y;
    den += s * s;
  }
  const slope = num / den;
  const frac = bins.length ? bins.filter((x) => x.pass).length / bins.length : 0;
  // The crossing s*: where the two histogram curves meet, i.e. where the
  // log-ratio first changes sign between adjacent populated bins (ΔF = 0 ⇒
  // s* = 0); the first crossing ascending s is the registered one.
  let crossing: number | null = null;
  for (let i = 1; i < bins.length && crossing === null; i++)
    if (bins[i].y === 0 || Math.sign(bins[i].y) !== Math.sign(bins[i - 1].y))
      crossing = (bins[i - 1].s + bins[i].s) / 2;
  const crossingOk = crossing !== null && Math.abs(crossing) <= 1;
  // The ramp's Jarzynski is certified only through this ratio, never through
  // ⟨e^{−σ}⟩: the effective horizon and T* are reported, not tested.
  const lnEexp = proto.reduce((a, q) => {
    const r = Math.log(q.e / q.w);
    return a + m * Math.log((q.e / 256) * Math.exp(r) + (q.w / 256) * Math.exp(-r) + (256 - q.e - q.w) / 256);
  }, 0);
  const tStar = Math.log(R) / (m * Math.log(4 / 3));
  return {
    exactMean,
    exactStd: Math.sqrt(exactVar),
    meanArm,
    stdArm,
    meanOk,
    stdOk,
    bins,
    slope,
    frac,
    crooksOk: bins.length >= 10 && frac >= 0.9 && Math.abs(slope - 1) <= 0.1,
    crossing,
    crossingOk,
    lnEexp,
    tEff: lnEexp / (16 * Math.log(4 / 3)),
    tStar,
    pass: meanOk && stdOk && Math.abs(slope - 1) <= 0.1 && frac >= 0.9 && crossingOk,
  };
}

// ── the score ─────────────────────────────────────────────────────────────

export type Verdict = "verified" | "supported" | "refuted" | "implementation error" | "n/a" | "exploratory";
export type Score = ReturnType<typeof score>;

export const isRegistered = (r: Results): boolean => {
  if (r.n !== 8 || r.m !== 16) return false;
  const need: [ArmName, number][] = [];
  for (const a of ["driven", "reversed", "null"] as const) for (const T of [1, 4, 64]) need.push([a, T]);
  need.push(["ramp", RAMP_T], ["ramprev", RAMP_T]);
  for (const [arm, T] of need) {
    const got = r.main.find((x) => x.arm === arm && x.T === T);
    if (!got || got.R !== 65536 || got.blocks !== 16) return false;
  }
  const c = r.corner;
  return c.n === 4 && c.m === 4 && c.T === 32 && c.R === 1024 && c.blocks === 16;
};

/** Every registered decision rule over one sweep's results. Arms that are
 * not present (the smoke runs a subset) leave their claims n/a. */
export function score(results: Results, source?: string) {
  const registered = isRegistered(results);
  const na = registered
    ? null
    : "n/a: not the registered configuration (11 arms at n = 8, m = 16, R = 65536; corner n = 4, m = 4, T = 32, R = 1024)";
  const has = (name: ArmName, T: number) => results.main.some((x) => x.arm === name && x.T === T);
  const arm = (name: ArmName, T: number) => {
    const a = results.main.find((x) => x.arm === name && x.T === T);
    if (!a) throw new Error(`results have no ${name} arm at T = ${T}`);
    return a;
  };
  const verdict = (ok: boolean): Verdict => (na ? "n/a" : ok ? "supported" : "refuted");

  const K1 = [1, 4, 64]
    .filter((T) => has("driven", T))
    .map((T) => {
      const k = k1(arm("driven", T));
      return { ...k, T, verdict: verdict(k.pass) };
    });
  const nullTs = [1, 4, 64].filter((T) => has("null", T));
  const K2 = k2(
    nullTs.map((T) => arm("null", T)),
    nullTs.filter((T) => has("driven", T)).map((T) => K1.find((k) => k.T === T)?.dMean ?? null),
  );
  const K3: Record<number, ReturnType<typeof k3> & { verdict: Verdict } | undefined> = {};
  for (const T of [1, 4, 64].filter((T) => has("driven", T))) {
    const k = k3(
      mergeHist(arm("driven", T).blockHist!),
      T,
      T === 64 && has("reversed", 64) ? mergeHist(arm("reversed", 64).blockHist!) : null,
    );
    K3[T] = { ...k, verdict: verdict(k.pass) };
  }
  const K4: Record<number, ReturnType<typeof k4> & { verdict: Verdict } | undefined> = {};
  for (const T of [1, 64].filter((T) => has("driven", T))) {
    const k = k4(mergeHist(arm("driven", T).blockHist!), T, arm("driven", T).R);
    K4[T] = { ...k, verdict: verdict(k.pass) };
  }
  const K5 = k5(results.corner);
  const K6 =
    has("driven", 64) && has("reversed", 64)
      ? { ...k6(arm("driven", 64), arm("reversed", 64)), verdict: verdict(k6(arm("driven", 64), arm("reversed", 64)).ok) as Verdict }
      : null;
  const C1 =
    has("ramp", RAMP_T) && has("ramprev", RAMP_T)
      ? { ...c1(arm("ramp", RAMP_T), arm("ramprev", RAMP_T)), verdict: verdict(c1(arm("ramp", RAMP_T), arm("ramprev", RAMP_T)).pass) as Verdict }
      : null;
  return {
    source: source ?? null,
    commit: results.commit ?? null,
    dirty: results.dirty ?? null,
    registered,
    note: na,
    goldens: results.goldens ?? null,
    K1,
    K2: { ...K2, verdict: (K2.pass ? "verified" : "implementation error") as Verdict },
    K3,
    K4,
    K5: {
      ...K5,
      bitLevel: (K5.halfBad.length === 0 && K5.nullSigmaOk && K5.nullScgOk ? "verified" : "implementation error") as Verdict,
      verdict: (K5.pass ? verdict(K5.physicsOk) : "implementation error") as Verdict,
    },
    K6,
    C1,
  };
}

// ── rendering ─────────────────────────────────────────────────────────────

const num = (x: number | null | undefined) =>
  x === null || x === undefined
    ? "—"
    : Math.abs(x) >= 1e4 || (x !== 0 && Math.abs(x) < 1e-2)
      ? x.toExponential(2)
      : String(+x.toPrecision(3));

/** The verdict table, one line per registered claim. */
export function renderVerdict(s: Score): string {
  const v = (x: Verdict) => x;
  const k1line = (k: (typeof s.K1)[number]) =>
    `T=${k.T}: mean ${num(k.dMean)} vs 2T ln 3 = ${num(2 * k.T * LN3)} (band ±${num((Z * k.sigmaStd) / Math.sqrt(65536))}), std ${num(k.std)} vs ${num(k.sigmaStd)}, χ² ${num(k.chi2.value)} ≤ ${k.chi2.limit} over K ∈ [${k.chi2.range}] (${k.chi2.bins} bins), ${k.perBlock.length - k.outside}/${k.perBlock.length} blocks in band`;
  const mirrorLine = (k: (typeof s.K3)[number] | undefined) =>
    k
      ? `${k.m1 ? `T=1: ${k.m1.passing}/11 bins, slope ${num(k.m1.slope)}` : ""}${k.m4 ? ` T=4: ${k.m4.passing}/11 bins, slope ${num(k.m4.slope)}` : ""} dp mirror ${k.dpMirror ? "holds" : "FAILS"}, cross-arm ${k.cross ? `${k.cross.passing}/${k.cross.bins} bins (≥ 90%)` : "—"}`
      : "arm not present";
  const lines = [
    `002 verdict — ${s.source ?? "(results)"} · commit ${s.commit ?? "?"}${s.dirty ? " · DIRTY" : " · clean"} · ${s.registered ? "registered configuration" : "NOT the registered configuration: statistical verdicts are n/a"} · goldens ${s.goldens === null ? "not in the contract yet" : s.goldens ? "reproduced bit for bit" : "FAILED"}`,
    `K1 second law       ${s.K1.map((k) => `${v(k.verdict)} (${k1line(k)})`).join(" | ") || "arm not present"}${s.K1.some((k) => k.refutedBy.length) ? ` — ${s.K1.flatMap((k) => k.refutedBy).join("; ")}` : ""}`,
    `K2 arrow=state      ${v(s.K2.verdict)}  null max|σ| over T ∈ {${s.K2.maxAbs.map((x) => num(x)).join(", ")}}: ${s.K2.bad.length === 0 ? "all 0 (predict 0)" : `NONZERO at ${s.K2.bad.join(", ")}`}; driven means > 0: ${s.K2.drivenPos}`,
    `K3 detailed FT      ${[1, 4, 64].map((T) => s.K3[T]).filter((k) => k).map((k) => `T=${k!.m1 ? 1 : k!.m4 ? 4 : 64} ${v(k!.verdict)}`).join(" ")}  ${[1, 4, 64].map((T) => s.K3[T]).filter((k) => k).map(mirrorLine).join(" | ") || "arm not present"}`,
    `K4 integral FT      ${[1, 64].map((T) => s.K4[T]).filter((k) => k).map((k) => `T=${k!.T} ${v(k!.verdict)}: ⟨e^−σ⟩ = ${num(k!.ift)} vs ${k!.T === 1 ? `1, band ±${num(k!.band)} (4σ̂, σ̂ = ${num(k!.stdHat)})` : `${num(k!.band)} (the registered collapse: < 1e-3)`}`).join(" | ") || "arm not present"}`,
    `K5 coarse arrow    bit-level ${s.K5.bitLevel}; physics ${v(s.K5.verdict)}  ⟨σ⟩ = ${num(s.K5.meanSigma)} vs ${num(s.K5.sigmaExact)} ± ${num(s.K5.sigmaBand)}; ⟨σ_∂⟩ = ${num(s.K5.meanSd)} vs ${num(s.K5.sdExact)} ± ${num(s.K5.sdBand)}; half-count max|σ_cg| = ${num(s.K5.halfMax)} (≤ 1e-12); L ⟨σ_cg⟩ = ${num(s.K5.lMean)} vs |·| ≤ ${num(s.K5.lBand)} (t₁₅ · block SE ${num(s.K5.lSe)}); null σ ≡ 0: ${s.K5.nullSigmaOk}, σ_cg ≡ 0: ${s.K5.nullScgOk}`,
    `K6 estimators       ${s.K6 ? `${v(s.K6.verdict)}  D̂_mean = ${num(s.K6.dMean)}, D̂_plugin = ${num(s.K6.dPlugin)} (exact ${num(s.K6.exact)}), difference ${num(s.K6.diff)} ∈ [−${num(s.K6.band)}, ${num(s.K6.bias)} + ${num(s.K6.band)}]; K̂ = ${s.K6.kPopulated} populated bins, bias (K̂−1)/(2R) = ${num(s.K6.bias)}, σ̂_diff = ${num(s.K6.sigmaDiff)}` : "T = 64 arms not present"}`,
    `C1 Crooks/Jarzynski ${s.C1 ? `${v(s.C1.verdict)}  ⟨σ⟩ = ${num(s.C1.meanArm)} vs ${num(s.C1.exactMean)} ± ${num((Z * s.C1.exactStd) / Math.sqrt(65536))}, std ${num(s.C1.stdArm)} vs ${num(s.C1.exactStd)}; Crooks ${s.C1.bins.length} populated bins, slope ${num(s.C1.slope)} (1 ± 0.1), ${Math.round(100 * s.C1.frac)}% in 3σ, crossing s* = ${num(s.C1.crossing)} ∈ [−1,1]; Jarzynski excluded: ln E[e^σ] = ${num(s.C1.lnEexp)}, T_eff = ${num(s.C1.tEff)} > T* = ${num(s.C1.tStar)} (unreliable regime)` : "ramp arms not present"}`,
  ];
  return lines.join("\n");
}

// The CLI entry: `node experiments/002-arrow-kl/score.ts <results.json>`.
// Only Node reaches the dynamic import; the browser bundle stops at the guard.
if (typeof process !== "undefined" && process.argv[1]?.endsWith("score.ts")) {
  const [input] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node experiments/002-arrow-kl/score.ts <results.json>");
    process.exit(2);
  }
  const { readFileSync, writeFileSync } = await import(/* @vite-ignore */ "node:fs");
  const scored = score(JSON.parse(readFileSync(input, "utf8")), input);
  console.log(renderVerdict(scored));
  const out = input.replace(/\.json$/, "") + ".score.json";
  writeFileSync(out, JSON.stringify(scored, null, 1) + "\n");
  console.log(out);
}

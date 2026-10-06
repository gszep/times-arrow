// The committed scorer of the locked 001 pre-registration
// (experiments/001-irreversibility/README.md, frozen at 2058d14): every
// registered decision rule, computed from the sweep's results JSON and
// nothing else. `node experiments/001-irreversibility/score.ts <results.json>`
// prints the verdict table and writes it next to the results as
// `<results>.score.json`. The page and the run driver import the same
// functions (the null band, the undo fraction) instead of duplicating them.
//
// Bit-level claims (L1, L2, L3/S1a, R1) are exact and scored at any
// configuration. The statistical claims (E1, E2, S1b–d) are registered only
// for the locked configuration — n = 1024, tMax = 32768, tE = 16384, seeds
// 1…16 — and read "n/a" otherwise. Registered rules that needed an
// interpretation are marked INTERPRETATION where they are implemented.
import type { EchoSample, ForwardSample, RunResult } from "./run.ts";

/** The shape `sweep.ts` writes: provenance plus the run results. */
export type Results = {
  commit?: string;
  dirty?: boolean;
  host?: string;
  date?: string;
  smoke?: boolean;
  params: { n: number; tMax: number; tE: number; seeds: number[]; b: number[] };
  runs: RunResult[];
};

const BS = [4, 8, 16, 32, 64];
const REGISTERED = { n: 1024, tMax: 32768, tE: 16384, seeds: Array.from({ length: 16 }, (_, i) => i + 1) };
// E1: "S_16(0) ≈ 1.81 × 10⁵ nats", falsified if off by > 1%.
const S16_0 = 1.81e5;
// S1(c): H(T_e)/4n² ∈ [0.05, 0.07]; the estimate is 2p(1−p) = 31/512 ≈ 0.0605.
const DECORR = [0.05, 0.07] as const;
// S1(d): the damaged reverse is checked from this depth on and must end with
// U ≤ 0.05. E1: entry by t = 16384 (equal to the registered tE), no downward
// excursion longer than 32 samples. E2: ratio in [1.2, 1.5], s.d. ≤ 0.05.
const D_FROM = 1024;
const U_MAX = 0.05;
const EXCURSION = 32;

export type Verdict = "verified" | "supported" | "refuted" | "implementation error" | "n/a" | "exploratory";

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** The s.d. over seeds with ddof = 1 — the convention the registered band
 * states ("μ̂ ± 3σ̂, the mean and s.d. of the 16 null seeds"); every
 * across-seed s.d. below uses the same ddof. */
const sd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

export type BandPoint = { t: number; mu: number; half: number };

function sharedGrid(runs: RunResult[]): number[] {
  const grid = runs[0].forward.map((s) => s.t);
  for (const r of runs)
    if (r.forward.length !== grid.length || r.forward.some((s, i) => s.t !== grid[i]))
      throw new Error(`runs do not share one sampling grid (seed ${r.config.seed}, ${r.config.mode})`);
  return grid;
}

/** The registered null band: at each sampled `t`, the mean μ̂ and the
 * half-width 3σ̂ of the null runs' `S_b`, σ̂ the across-seed s.d. (ddof = 1). */
export function nullBand(runs: RunResult[], b: number): BandPoint[] {
  if (runs.length < 2) throw new Error(`the null band needs ≥ 2 null runs, got ${runs.length}`);
  return sharedGrid(runs).map((t, i) => {
    const at = runs.map((r) => r.forward[i].S[b]);
    return { t, mu: mean(at), half: 3 * sd(at) };
  });
}

/** The undo fraction U = (S_b(T_e) − S_b(final))/(S_b(T_e) − S_b(0)) of the
 * pristine and the damaged reverse, at the deepest echo sample (r = tE). The
 * pristine value is exactly 1 when the echo is bit for bit; the registered
 * S1(d) bound is U ≤ 0.05 for the damaged twin. */
export function undoFraction(
  forward: ForwardSample[],
  echo: EchoSample[],
  b: number,
  tE: number,
): { pristine: number; damaged: number } | null {
  if (!echo.length) return null;
  const s0 = forward[0].S[b];
  const ste = forward.find((s) => s.t === tE)!.S[b];
  const fin = echo[echo.length - 1];
  return { pristine: (ste - fin.Sp[b]) / (ste - s0), damaged: (ste - fin.Sd[b]) / (ste - s0) };
}

const inBand = (S: number, e: BandPoint) => e.mu - e.half <= S && S <= e.mu + e.half;

/** E1 — the entropy rise into the null band. Per packed seed: the entry time
 * t* (first sampled t with S_16 in the band at that t), the longest downward
 * excursion after t* (a maximal run of consecutive sampled times ≥ t* with
 * S_16 below μ̂ − 3σ̂), and the band check at t_max. */
function e1(packed: RunResult[], bandAt: Map<number, BandPoint>, tE: number) {
  // INTERPRETATION: the 1%-of-1.81×10⁵ initial-state check is applied to the
  // seed mean of S_16(0) — the registered text writes E[S_16(0)], and a wrong
  // initial state is a systematic error every seed shares (the per-seed
  // scatter is ~0.05%, so mean and per-seed checks coincide in practice).
  const s0Mean = mean(packed.map((r) => r.forward[0].S[16]));
  const initialOk = Math.abs(s0Mean - S16_0) <= 0.01 * S16_0;
  const at = (t: number) => {
    const e = bandAt.get(t);
    if (!e) throw new Error(`the null band is not sampled at t = ${t}, which E1 needs`);
    return e;
  };
  const seeds = packed.map((r) => {
    let tStar: number | null = null;
    for (const s of r.forward) if (tStar === null && inBand(s.S[16], at(s.t))) tStar = s.t;
    let longest = 0;
    let run = 0;
    if (tStar !== null)
      for (const s of r.forward) {
        if (s.t < tStar) continue;
        const e = at(s.t);
        if (s.S[16] < e.mu - e.half) longest = Math.max(longest, ++run);
        else run = 0;
      }
    const fin = r.forward[r.forward.length - 1];
    const finalInBand = inBand(fin.S[16], at(fin.t));
    // INTERPRETATION: the entry deadline is the registered t = 16384, which
    // equals tE at the locked configuration.
    const pass = tStar !== null && tStar <= tE && longest <= EXCURSION && finalInBand;
    return { seed: r.config.seed, tStar, longestExcursion: longest, finalInBand, pass };
  });
  const failures = seeds.filter((s) => !s.pass).map((s) => s.seed);
  // Diagnostic only (the prediction column says "the rise is large and
  // monotone on average"; it is not in the falsifier column): the seed-mean
  // S_16 curve over the grid.
  const curve = sharedGrid(packed).map((_, i) => mean(packed.map((r) => r.forward[i].S[16])));
  const decreases = curve.filter((v, i) => i > 0 && v < curve[i - 1]).length;
  return {
    s0: { mean: s0Mean, deviationPct: (100 * (s0Mean - S16_0)) / S16_0, ok: initialOk },
    seeds,
    failures,
    meanRise: { from: curve[0], to: curve[curve.length - 1], decreases },
    refuted: !initialOk || failures.length >= 2,
    reason: !initialOk
      ? `seed-mean S_16(0) = ${s0Mean.toExponential(3)} is off the registered ${S16_0.toExponential(2)} by > 1%`
      : failures.length >= 2
        ? `entry, excursion or final-band fails in ${failures.length} of ${packed.length} seeds (≥ 2 refutes): seeds ${failures.join(", ")}`
        : failures.length === 1
          ? `supported with the registered one-run allowance: seed ${failures[0]} fails and is reported`
          : "",
  };
}

/** E2 — partition robustness of the rise. Per packed seed, the rise
 * rise_i(b) = S_b(t_max) − S_b(0) for every registered b, its monotonicity
 * across b, and the per-seed ratio rise_i(64)/rise_i(4). */
function e2(packed: RunResult[]) {
  const perSeed = packed.map((r) => {
    const first = r.forward[0];
    const last = r.forward[r.forward.length - 1];
    const rise = Object.fromEntries(BS.map((b) => [b, last.S[b] - first.S[b]])) as Record<number, number>;
    const monotone = BS.every((b, i) => i === 0 || rise[BS[i - 1]] <= rise[b]);
    return { seed: r.config.seed, rise, monotone, ratio: rise[64] / rise[4] };
  });
  const ratios = perSeed.map((s) => s.ratio);
  const meanRatio = mean(ratios);
  // INTERPRETATION: "the per-seed s.d." is the across-seed s.d. of the
  // per-seed ratios, ddof = 1 like every registered s.d.
  const sdRatio = sd(ratios);
  const inversions = perSeed.filter((s) => !s.monotone).map((s) => s.seed);
  const edges = BS.slice(1).map((to, i) => ({
    from: BS[i],
    to,
    wins: perSeed.filter((s) => s.rise[to] >= s.rise[BS[i]]).length,
  }));
  const ratioOk = 1.2 <= meanRatio && meanRatio <= 1.5;
  const refuted = !ratioOk || sdRatio > 0.05 || inversions.length >= 2;
  const reason = !ratioOk
    ? `seed-mean ratio rise(64)/rise(4) = ${meanRatio.toPrecision(4)} leaves [1.2, 1.5]`
    : sdRatio > 0.05
      ? `per-seed ratio s.d. = ${sdRatio.toPrecision(3)} exceeds 0.05`
      : inversions.length >= 2
        ? `monotonicity inverts in ${inversions.length} of ${perSeed.length} runs (≥ 2 refutes): seeds ${inversions.join(", ")}`
        : inversions.length === 1
          ? `supported with the registered one-run allowance: seed ${inversions[0]} inverts and is reported`
          : "";
  return { perSeed, meanRatio, sdRatio, inversions, edges, refuted, reason };
}

/** S1 — echo sensitivity, one flipped bit. (a) is the light-cone check (L3),
 * exact at any configuration; (b)–(d) are the statistical claims under the
 * registered ≥ 2-of-16 rule; β̂ is exploratory. */
function s1(packed: RunResult[], bandAt: Map<number, BandPoint>, params: Results["params"]) {
  const { n, tE } = params;
  const half = n / 2;
  const at = (t: number) => {
    const e = bandAt.get(t);
    if (!e) throw new Error(`the null band is not sampled at t = ${t}, which S1(d) needs`);
    return e;
  };
  const perRun = packed.map((r) => {
    // (a) damage support inside the torus diamond, at every sampled r ≤ n/2.
    const cone = r.echo.filter((s) => s.r <= half);
    const worstSlack = cone.length ? Math.max(...cone.map((s) => s.maxDist - s.r)) : 0;
    // (b) H at r = n/2 (512 at the registered n = 1024) ≥ 1000 XOR slots.
    const sb = r.echo.find((s) => s.r === half);
    // (c) H(T_e)/4n² ∈ [0.05, 0.07], at the deepest sample r = tE.
    const sc = r.echo.find((s) => s.r === tE);
    const decorr = sc ? sc.H / (4 * n * n) : null;
    // (d) the damaged reverse stays in band from r = 1024 on.
    // INTERPRETATION of the band indexing: the reverse state at depth r is
    // bit for bit the forward state at t = tE − r (L1), so a sample at depth
    // r is compared against the band at the aligned forward time tE − r.
    // The registered S_b curve is sampled at the echo depths r = tE − t for
    // forward sample times t; the damage grid (H, support) adds depths whose
    // aligned times are no forward sample times and carry no registered S_b
    // sample, so they take no part in the check.
    const outOfBand = r.echo
      .filter((s) => s.r >= D_FROM && bandAt.has(tE - s.r) && !inBand(s.Sd[16], at(tE - s.r)))
      .map((s) => s.r);
    const undo = undoFraction(r.forward, r.echo, 16, tE);
    const bPass = sb !== undefined && sb.H >= 1000;
    const cPass = decorr !== null && DECORR[0] <= decorr && decorr <= DECORR[1];
    const dPass = undo !== null && outOfBand.length === 0 && undo.damaged <= U_MAX;
    // Exploratory: the branching rate β̂, least squares of ln H against r
    // over the samples with H in the registered fit range [4, 10⁴].
    const fit = r.echo.filter((s) => s.H >= 4 && s.H <= 1e4 && s.r > 0);
    const rBar = mean(fit.map((s) => s.r));
    const yBar = mean(fit.map((s) => Math.log(s.H)));
    const beta = fit.length >= 2
      ? fit.reduce((a, s) => a + (s.r - rBar) * (Math.log(s.H) - yBar), 0) /
        fit.reduce((a, s) => a + (s.r - rBar) ** 2, 0)
      : null;
    return {
      seed: r.config.seed,
      worstSlack,
      Hhalf: sb?.H ?? null,
      decorr,
      outOfBand,
      U: undo?.damaged ?? null,
      pristineU: undo?.pristine ?? null,
      bPass,
      cPass,
      dPass,
      pass: bPass && cPass && dPass,
      beta,
      fitPoints: fit.length,
    };
  });
  const coneViolations = perRun.filter((s) => s.worstSlack > 0).map((s) => s.seed);
  const bFailing = perRun.filter((s) => !s.bPass).map((s) => s.seed);
  const cFailing = perRun.filter((s) => !s.cPass).map((s) => s.seed);
  const dFailing = perRun.filter((s) => !s.dPass).map((s) => s.seed);
  const failing = perRun.filter((s) => !s.pass).map((s) => s.seed);
  const reason = failing.length >= 2
    ? `(b), (c) or (d) fails in ${failing.length} of ${perRun.length} runs (≥ 2 refutes): seeds ${failing.join(", ")}`
    : failing.length === 1
      ? `supported with the registered one-run allowance: seed ${failing[0]} fails and is reported`
      : "";
  return { perRun, coneViolations, bFailing, cFailing, dFailing, failing, reason };
}

const isRegistered = (params: Results["params"], packed: number, nulls: number) =>
  params.n === REGISTERED.n && params.tMax === REGISTERED.tMax && params.tE === REGISTERED.tE &&
  params.seeds.length === REGISTERED.seeds.length && params.seeds.every((s, i) => s === REGISTERED.seeds[i]) &&
  params.b.length === BS.length && params.b.every((b, i) => b === BS[i]) &&
  packed === 16 && nulls === 16;

export type Score = ReturnType<typeof score>;

/** Every registered decision rule over one sweep's results. */
export function score(results: Results, source?: string) {
  const { params } = results;
  const packed = results.runs.filter((r) => r.config.mode === "packed");
  const nulls = results.runs.filter((r) => r.config.mode === "null");
  if (!params.b.includes(16)) throw new Error("the registered observable is S_16, but b = 16 was not computed");
  const registered = isRegistered(params, packed.length, nulls.length);
  const statistical = registered
    ? null
    : "n/a: not the registered configuration (16 packed + 16 null seeds, n = 1024, tMax = 32768, tE = 16384)";
  const count = (params.n * params.n) / 8;

  // L2 — particle number constant at every sample; the damaged twin carries
  // N ± 1 for life (one slot was flipped at t = tE).
  const drift = results.runs.filter(
    (r) =>
      r.forward.some((s) => s.mass !== count) ||
      r.echo.some((s) => s.massP !== count || Math.abs(s.massD - count) !== 1),
  ).length;
  const l2 = { verdict: (drift === 0 ? "verified" : "implementation error") as Verdict, drift };

  // L1 and R1 — the exact echo: Hamming distance 0 over all 4n² slots after
  // tE forward and tE inverse steps, and the reverse-phase S_b curve equal
  // to the forward curve sample for sample, at every echo depth whose
  // aligned forward time was sampled.
  const echo = packed.map((r) => {
    const forward = new Map(r.forward.map((s) => [s.t, s] as const));
    const aligned = r.echo.filter((s) => forward.has(params.tE - s.r));
    const mismatched = aligned.filter((s) =>
      params.b.some((b) => s.Sp[b] !== forward.get(params.tE - s.r)!.S[b]),
    ).length;
    return { seed: r.config.seed, hamming: r.finalHamming, aligned: aligned.length, mismatched };
  });
  const l1 = {
    verdict: (echo.every((e) => e.hamming === 0 && e.mismatched === 0 && e.aligned > 0)
      ? "verified"
      : "implementation error") as Verdict,
    runs: echo,
  };
  const r1 = {
    exact: {
      verdict: (echo.every((e) => e.hamming === 0) ? "verified" : "implementation error") as Verdict,
      hamming: echo.map((e) => e.hamming),
    },
    // The negative control: the naive flip-only reversal must not recover.
    // INTERPRETATION: the registered text treats any bit-for-bit recovery of
    // the control as a negative-control result, so a single recovering run
    // (Hamming 0) already refutes it — there is no counting allowance.
    control: {
      verdict: (packed.every((r) => (r.naiveHamming ?? 0) >= 1) ? "supported" : "refuted") as Verdict,
      hamming: packed.map((r) => r.naiveHamming),
    },
  };

  // The null band is the registered band of the 16 null seeds (2 in a smoke
  // run); fewer than 2 nulls cannot form one, and the score refuses.
  const bandAt = new Map(nullBand(nulls, 16).map((e) => [e.t, e] as const));
  const e1v = e1(packed, bandAt, params.tE);
  const e2v = e2(packed);
  const s1v = s1(packed, bandAt, params);
  const betas = s1v.perRun.map((s) => s.beta).filter((b): b is number => b !== null);
  return {
    source: source ?? null,
    commit: results.commit ?? null,
    dirty: results.dirty ?? null,
    registered,
    runs: { packed: packed.length, null: nulls.length },
    claims: {
      L1: l1,
      L2: l2,
      // L3 is proved in Lean and "verified in S1a" — the same numbers.
      L3: {
        verdict: (s1v.coneViolations.length === 0 ? "verified" : "implementation error") as Verdict,
        coneViolations: s1v.coneViolations,
        worstSlack: Math.max(0, ...s1v.perRun.map((s) => s.worstSlack)),
      },
      E1: {
        verdict: (statistical ? "n/a" : e1v.refuted ? "refuted" : "supported") as Verdict,
        note: statistical,
        ...e1v,
      },
      E2: {
        verdict: (statistical ? "n/a" : e2v.refuted ? "refuted" : "supported") as Verdict,
        note: statistical,
        ...e2v,
      },
      R1: r1,
      S1: {
        a: {
          verdict: (s1v.coneViolations.length === 0 ? "verified" : "implementation error") as Verdict,
          coneViolations: s1v.coneViolations,
          worstSlack: Math.max(0, ...s1v.perRun.map((s) => s.worstSlack)),
        },
        b: { failing: s1v.bFailing, perRun: s1v.perRun.map((s) => ({ seed: s.seed, Hhalf: s.Hhalf })) },
        c: { failing: s1v.cFailing, perRun: s1v.perRun.map((s) => ({ seed: s.seed, decorr: s.decorr })) },
        d: {
          failing: s1v.dFailing,
          perRun: s1v.perRun.map((s) => ({ seed: s.seed, outOfBand: s.outOfBand, U: s.U, pristineU: s.pristineU })),
        },
        bcd: {
          verdict: (statistical ? "n/a" : s1v.failing.length >= 2 ? "refuted" : "supported") as Verdict,
          note: statistical,
          failing: s1v.failing,
          reason: s1v.reason,
        },
        beta: {
          verdict: "exploratory" as Verdict,
          mean: betas.length ? mean(betas) : null,
          perRun: s1v.perRun.map((s) => ({ seed: s.seed, beta: s.beta })),
          reference: 0.032,
        },
      },
    },
  };
}

const num = (x: number | null | undefined) =>
  x === null || x === undefined
    ? "—"
    : Math.abs(x) >= 1e4 || (x !== 0 && Math.abs(x) < 1e-2)
      ? x.toExponential(2)
      : String(+x.toPrecision(3));

/** The verdict table, one line per claim. */
export function renderVerdict(s: Score): string {
  const c = s.claims;
  const packed = s.runs.packed;
  const total = s.runs.packed + s.runs.null;
  const tStars = c.E1.seeds.map((e) => e.tStar).filter((t): t is number => t !== null);
  const e1line = `S_16(0) mean ${num(c.E1.s0.mean)} (${num(c.E1.s0.deviationPct)}% off), entry ≤ ${REGISTERED.tE} in ${c.E1.seeds.filter((e) => e.tStar !== null && e.tStar <= REGISTERED.tE).length}/${packed} (max t* ${tStars.length ? num(Math.max(...tStars)) : "never"}), longest excursion ${num(Math.max(0, ...c.E1.seeds.map((e) => e.longestExcursion)))} ≤ ${EXCURSION}, in band at t_max ${c.E1.seeds.filter((e) => e.finalInBand).length}/${packed}, seed-mean rise ${num(c.E1.meanRise.from)} → ${num(c.E1.meanRise.to)} with ${c.E1.meanRise.decreases} decreases`;
  const e2line = `ratio rise(64)/rise(4) mean ${num(c.E2.meanRatio)} (registered [1.2, 1.5]), s.d. ${num(c.E2.sdRatio)} ≤ 0.05, monotone ${c.E2.perSeed.length - c.E2.inversions.length}/${packed}, edges ${c.E2.edges.map((e) => `${e.from}→${e.to} ${e.wins}/${packed}`).join(" ")}`;
  const hmin = Math.min(...c.S1.b.perRun.map((e) => e.Hhalf).filter((h): h is number => h !== null));
  const decs = c.S1.c.perRun.map((e) => e.decorr).filter((d): d is number => d !== null);
  const umax = Math.max(...c.S1.d.perRun.map((e) => e.U).filter((u): u is number => u !== null));
  const controls = c.R1.control.hamming.filter((h): h is number => h !== null);
  const s1line = `(a) support ⊆ diamond (worst slack ${num(c.S1.a.worstSlack)}), (b) H(n/2) ≥ 1000 in ${c.S1.b.perRun.filter((e) => (e.Hhalf ?? 0) >= 1000).length}/${packed} (min ${num(hmin === Infinity ? null : hmin)}), (c) H/4n² ∈ [${DECORR[0]}, ${DECORR[1]}] in ${c.S1.c.perRun.filter((e) => e.decorr !== null && DECORR[0] <= e.decorr && e.decorr <= DECORR[1]).length}/${packed} (min ${decs.length ? num(Math.min(...decs)) : "—"}, max ${decs.length ? num(Math.max(...decs)) : "—"}), (d) in band and U ≤ ${U_MAX} in ${c.S1.d.perRun.filter((e) => e.U !== null && e.U <= U_MAX && e.outOfBand.length === 0).length}/${packed} (max U ${umax === -Infinity ? "—" : num(umax)}), β̂ ${num(c.S1.beta.mean)}/step (exploratory; reference p(1−p)² ln 3 ≈ ${c.S1.beta.reference})`;
  const lines = [
    `001 verdict — ${s.source ?? "(results)"} · commit ${s.commit ?? "?"}${s.dirty ? " · DIRTY" : " · clean"} · ${s.registered ? "registered configuration" : "NOT the registered configuration: statistical verdicts are n/a"}`,
    `L1 exact echo        ${c.L1.verdict}  Hamming 0 in ${c.L1.runs.filter((e) => e.hamming === 0).length}/${packed} runs; S_b aligned, ${c.L1.runs.reduce((a, e) => a + e.mismatched, 0)} mismatches over ${c.L1.runs.reduce((a, e) => a + e.aligned, 0)} sampled depths`,
    `L2 particle number   ${c.L2.verdict}  ${c.L2.drift} of ${total} runs drift`,
    `L3 light cone       ${c.L3.verdict}  ${c.L3.coneViolations.length === 0 ? "damage inside the diamond at every sampled r ≤ n/2" : `violated by seeds ${c.L3.coneViolations.join(", ")}`} (worst slack ${num(c.L3.worstSlack)})`,
    `E1 entropy entry    ${c.E1.verdict}  ${c.E1.note ? `${c.E1.note} — ` : ""}${e1line}${c.E1.reason ? ` — ${c.E1.reason}` : ""}`,
    `E2 partition        ${c.E2.verdict}  ${c.E2.note ? `${c.E2.note} — ` : ""}${e2line}${c.E2.reason ? ` — ${c.E2.reason}` : ""}`,
    `R1 reversal         exact ${c.R1.exact.verdict} (max Hamming ${num(Math.max(0, ...c.R1.exact.hamming.map((h) => h ?? 0)))}); flip-only control ${c.R1.control.verdict} (min Hamming ${controls.length ? num(Math.min(...controls)) : "—"})`,
    `S1 sensitivity      (a) ${c.S1.a.verdict}; (b)–(d) ${c.S1.bcd.verdict}  ${s1line}${c.S1.bcd.reason ? ` — ${c.S1.bcd.reason}` : ""}`,
  ];
  return lines.join("\n");
}

// The CLI entry: `node experiments/001-irreversibility/score.ts <results.json>`.
// Only Node reaches the dynamic import; the browser bundle stops at the guard.
if (typeof process !== "undefined" && process.argv[1]?.endsWith("score.ts")) {
  const [input] = process.argv.slice(2);
  if (!input) {
    console.error("usage: node experiments/001-irreversibility/score.ts <results.json>");
    process.exit(2);
  }
  const { readFileSync, writeFileSync } = await import(/* @vite-ignore */ "node:fs");
  const scored = score(JSON.parse(readFileSync(input, "utf8")), input);
  console.log(renderVerdict(scored));
  const out = input.replace(/\.json$/, "") + ".score.json";
  writeFileSync(out, JSON.stringify(scored, null, 1) + "\n");
  console.log(out);
}


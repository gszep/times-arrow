// Tests for the committed scorer, all against the locked registration:
//   node experiments/002-arrow-kl/score.test.ts
// First the registered constants are recomputed from the model (the χ² bin
// counts, the mirror-bin populations, the driven and ramp predictions), then
// two synthetic ensembles at the registered configuration — one that must
// score supported everywhere, one that must refute through the registered
// clauses — and finally the smoke results, whose bit-level checks must hold
// and whose statistical verdicts must read n/a.
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import assert from "node:assert/strict";
import { ARMS, LN3, RAMP_T, exactSigmaStats, protocolOf, renderVerdict, score, tallyDp } from "./score.ts";
import type { ArmName, CornerPaths, CornerResult, MainArm, Results, Weights } from "./score.ts";

const R = 65536;
const BLOCKS = 16;
const PER = R / BLOCKS;

// ── the registered constants, recomputed from the model ────────────────────
{
  // the T = 1 χ² bin set: "expected ≥ 10" reproduces the registered range
  const t1 = tallyDp(16, 1, ARMS.driven);
  const inT1 = Array.from({ length: 33 }, (_, i) => i - 16).filter((K) => R * t1[K + 16] >= 10);
  assert.deepEqual([inT1[0], inT1[inT1.length - 1], inT1.length], [-5, 9, 15], "T = 1 χ² bins");
  // at T = 4 and T = 64 the registered counts (29, 117) pin the contiguous
  // ranges [−6, 22] and [70, 186]; the DP facts behind them:
  const t4 = tallyDp(16, 4, ARMS.driven);
  const e4 = (K: number) => R * t4[K + 64];
  assert.ok(e4(-6) >= 8 && e4(-7) < 8 && e4(22) >= 8 && e4(23) < 8, `T = 4: the χ² set [−6, 22] (E(−6) = ${e4(-6).toFixed(2)}, E(23) = ${e4(23).toFixed(2)})`);
  const t64 = tallyDp(16, 64, ARMS.driven);
  const e64 = (K: number) => R * t64[K + 1024];
  assert.ok(e64(70) > e64(69) && e64(70) < 1.5 && e64(186) > e64(187), `T = 64: the cross-arm range [70, 186] (E(70) = ${e64(70).toFixed(2)})`);
  // the registered mirror-bin populations at the minor side
  assert.ok(Math.abs(e4(-5) - 20.8) < 0.5, `T = 4 minor side of k = −5: ${e4(-5)}`);
  assert.ok(e4(-6) < 10, "T = 4: k = −6 excluded from the mirror bins (8.2 < 10)");
  assert.ok(Math.abs(R * t1[-5 + 16] - 16.4) < 0.5, `T = 1 minor side of k = −5: ${R * t1[-5 + 16]}`);
  assert.ok(R * t1[-6 + 16] < 10, "T = 1: k = −6 below the population rule");
  const ramp = exactSigmaStats(protocolOf("ramp", RAMP_T), 16);
  assert.ok(Math.abs(ramp.mean - 10.193) < 0.01, `ramp mean ${ramp.mean}`);
  assert.ok(Math.abs(ramp.std - 4.549) < 0.01, `ramp std ${ramp.std}`);
  for (const [i, T] of [1, 4, 64].entries()) {
    const s = exactSigmaStats(protocolOf("driven", T), 16);
    assert.ok(Math.abs(s.mean - 2 * T * LN3) < 1e-12);
    assert.ok(Math.abs(s.std - [2.127, 4.255, 17.02][i]) < 0.005, `driven std T=${T}: ${s.std}`);
  }
  console.log("pass: the registered constants reproduce (χ² bin sets, mirror counts 16.4/20.8/8.2, driven and ramp predictions)");
}

// ── the synthetic ensembles ────────────────────────────────────────────────

/** stratified quantile inversion of the tally law: level (j+0.5)/R maps to
 * the bin holding it; block j % BLOCKS takes level j, so every block is a
 * uniform sample of the same law (per-bin deviation ≤ 1 by telescoping). */
function sampleBlocks(dp: Float64Array): Map<number, number>[] {
  const half = (dp.length - 1) / 2;
  const blocks: Map<number, number>[] = Array.from({ length: BLOCKS }, () => new Map());
  let acc = 0;
  let j = 0;
  for (let i = 0; i < dp.length; i++) {
    acc += dp[i];
    const K = i - half;
    while (j < R && (j + 0.5) / R <= acc) {
      const b = blocks[j % BLOCKS];
      b.set(K, (b.get(K) ?? 0) + 1);
      j++;
    }
  }
  while (j < R) {
    const b = blocks[j % BLOCKS];
    const K = dp.length - 1 - half;
    b.set(K, (b.get(K) ?? 0) + 1);
    j++;
  }
  return blocks;
}

const pairs = (m: Map<number, number>): [number, number][] => [...m].sort((a, b) => a[0] - b[0]);

function dpArm(arm: ArmName, T: number, q: Weights): MainArm {
  const dp = tallyDp(16, T, q);
  const all = sampleBlocks(dp);
  const blockHist = all.map(pairs);
  const ratio = Math.log(q.e / q.w);
  const full = new Map<number, number>();
  for (const b of all) for (const [k, n] of b) full.set(k, (full.get(k) ?? 0) + n);
  let maxAbs = 0;
  for (const k of full.keys()) maxAbs = Math.max(maxAbs, Math.abs(k * ratio));
  return { arm, T, R, blocks: BLOCKS, blockHist, maxAbsSigma: maxAbs };
}

/** the ramp pair, Crooks-consistent by construction; `offset` shifts the
 * mean, `ratioExp` tilts the reverse-protocol arm (1 = the exact ratio) */
function rampArms(offset: number, ratioExp: number): [MainArm, MainArm] {
  const { mean, std } = exactSigmaStats(protocolOf("ramp", RAMP_T), 16);
  const blockSum = Array.from({ length: BLOCKS }, () => PER * (mean + offset));
  const blockSumSq = Array.from({ length: BLOCKS }, () => PER * (mean * mean + std * std));
  const sOf = (b: number) => 0.5 * b + 0.25;
  const hist: [number, number][] = [];
  const peak = (R * 0.5) / (std * Math.sqrt(2 * Math.PI));
  for (let b = -16; b <= 56; b++) {
    const s = sOf(b);
    const n = Math.round(peak * Math.exp(-((s - mean) ** 2) / (2 * std * std)));
    if (n >= 10) hist.push([b, n]);
  }
  const rev: [number, number][] = hist
    .map(([b, n]) => [-b - 1, Math.max(1, Math.round(n * Math.exp(-sOf(b) * ratioExp)))] as [number, number])
    .sort((x, y) => x[0] - y[0]);
  return [
    { arm: "ramp", T: RAMP_T, R, blocks: BLOCKS, blockSum, blockSumSq, hist },
    { arm: "ramprev", T: RAMP_T, R, blocks: BLOCKS, blockSum, blockSumSq, hist: rev },
  ];
}

function cornerPaths(
  o: { tally?: number; cross?: number; halfBad?: number; scgL?: (i: number) => number; nullBad?: boolean },
): CornerPaths {
  const seq = Array.from({ length: 33 }, (_, t) => t % 3);
  return {
    tally: Array.from({ length: 1024 }, () => o.tally ?? 16),
    cross: Array.from({ length: 1024 }, () => o.cross ?? 4),
    half: Array.from({ length: 1024 }, () => seq),
    l: Array.from({ length: 1024 }, () => seq),
    scgHalf: Array.from({ length: 1024 }, (_, i) => (o.halfBad !== undefined && i === 7 ? o.halfBad : 0)),
    scgL: Array.from({ length: 1024 }, (_, i) => (o.scgL ? o.scgL(i) : 0)),
    maxAbsSigma: o.nullBad ? 0.001 : 0,
  };
}

const corner = (driven: CornerPaths, nullArm: CornerPaths): CornerResult => ({
  n: 4,
  m: 4,
  T: 32,
  R: 1024,
  blocks: 16,
  driven,
  null: nullArm,
});

const WRONG: Weights = { e: 72, w: 8, n: 24, s: 24, zero: 128 }; // a = 2 ln 3

type Ensemble = "supported" | "refuted";

function buildResults(which: Ensemble): Results {
  const main: MainArm[] = [];
  const wrong = which === "refuted";
  const WRONG_REV: Weights = { e: 8, w: 72, n: 24, s: 24, zero: 128 };
  const drivenArms = new Map<number, MainArm>();
  for (const arm of ["driven", "reversed", "null"] as const)
    for (const T of [1, 4, 64]) {
      const weights =
        arm === "driven" ? (wrong ? WRONG : ARMS.driven)
        : arm === "reversed" ? (wrong ? WRONG_REV : ARMS.reversed)
        : ARMS.null;
      let a: MainArm;
      if (arm === "reversed" && !wrong) {
        // the reversed arm realizes reversedPathPMF: its histogram is the
        // blockwise mirror of the driven arm's, so the cross-arm and
        // plug-in checks exercise their arithmetic without sampler noise
        const from = drivenArms.get(T)!;
        a = {
          arm,
          T,
          R,
          blocks: BLOCKS,
          blockHist: from.blockHist!.map((h) => pairs(new Map(h.map(([k, n]) => [-k, n] as [number, number])))),
          maxAbsSigma: from.maxAbsSigma,
        };
      } else {
        a = dpArm(arm, T, weights) as MainArm & { blockHist: [number, number][][] };
      }
      if (wrong) {
        if (arm === "null" && T === 1) a.maxAbsSigma = 0.001; // K2: a null path with σ ≠ 0
        if (arm === "driven" && T === 1) {
          // K4 T=1: a spurious deep-left bin
          const m = new Map(a.blockHist![0]);
          m.set(-10, (m.get(-10) ?? 0) + 30);
          a.blockHist![0] = pairs(m);
        }
        if (arm === "reversed" && T === 64) {
          // K3 T=64: the cross-arm mirror off 3σ in 20/117 bins (an excess
          // count where the driven arm has none)…
          a.blockHist = a.blockHist!.map((h) => {
            const m = new Map(h);
            for (let j = 70; j <= 89; j++) m.set(-j, (m.get(-j) ?? 0) + 100);
            return pairs(m);
          });
        }
      }
      if (arm === "driven") drivenArms.set(T, a);
      main.push(a);
    }
  if (wrong) {
    // …and K6: the reversed arm's mirror law distorted on a proper subset
    // of its support (the plug-in's dFT reconstruction shifts off the mean)
    const rev64 = main.find((x) => x.arm === "reversed" && x.T === 64)!;
    rev64.blockHist = rev64.blockHist!.map((h) =>
      pairs(new Map(h.map(([k, n]) => [k, k <= -230 && k >= -260 ? 2 * n : n] as [number, number]))),
    );
  }
  const [ramp, ramprev] =
    which === "supported"
      ? rampArms(0, 1)
      : rampArms(1, 0.5); // C1: mean +1 (band ±0.055) and the Crooks slope halved
  main.push(ramp, ramprev);
  const c =
    which === "supported"
      ? corner(
          cornerPaths({ scgL: (i) => 1e-4 * Math.sin(i * 0.61) }),
          cornerPaths({}),
        )
      : corner(
          cornerPaths({ tally: 20, cross: 8, halfBad: 1e-9, scgL: (i) => 3 + 0.1 * Math.sin(i) }),
          cornerPaths({ nullBad: true }),
        );
  return { commit: "synthetic", dirty: false, smoke: false, goldens: true, n: 8, m: 16, main, corner: c };
}

console.log(renderVerdict(score(buildResults("supported"))));

// Must score supported everywhere.
{
  const v = score(buildResults("supported"));
  assert.equal(v.registered, true);
  for (const k of v.K1) {
    assert.equal(k.verdict, "supported", `K1 T=${k.T}: ${k.refutedBy.join("; ")}`);
    assert.equal(k.chi2.bins, k.chi2.registeredBins, `K1 T=${k.T}: bin count`);
    assert.equal(k.outside, 0);
  }
  assert.equal(v.K2.verdict, "verified");
  assert.ok(v.K2.maxAbs.every((x) => x === 0));
  const k31 = v.K3[1]!;
  const k34 = v.K3[4]!;
  const k364 = v.K3[64]!;
  assert.equal(k31.verdict, "supported");
  assert.equal(k34.verdict, "supported");
  assert.equal(k364.verdict, "supported");
  assert.ok(k31.m1!.binsOk && k31.m1!.slopeOk, `slope ${k31.m1!.slope}`);
  assert.equal(k364.cross!.passing, 117);
  const k41 = v.K4[1]!;
  const k464 = v.K4[64]!;
  assert.equal(k41.verdict, "supported");
  assert.ok(Math.abs(k41.ift - 1) <= k41.band, `ift ${k41.ift}`);
  assert.equal(k464.verdict, "supported");
  assert.ok(k464.ift < 1e-3);
  assert.equal(v.K5.bitLevel, "verified");
  assert.equal(v.K5.verdict, "supported");
  assert.ok(v.K5.halfBad.length === 0);
  assert.ok(Math.abs(v.K5.meanSigma - 16 * LN3) <= v.K5.sigmaBand);
  assert.ok(Math.abs(v.K5.meanSd - 4 * LN3) <= v.K5.sdBand);
  assert.ok(Math.abs(v.K5.lMean) <= v.K5.lBand, `L ${v.K5.lMean} vs ${v.K5.lBand}`);
  assert.equal(v.K6!.verdict, "supported");
  assert.ok(Math.abs(v.K6!.diff) <= v.K6!.bias + v.K6!.band, `K6 diff ${v.K6!.diff}`);
  assert.equal(v.C1!.verdict, "supported");
  assert.ok(v.C1!.crooksOk && v.C1!.crossingOk, `C1 slope ${v.C1!.slope}, crossing ${v.C1!.crossing}`);
  assert.ok(Math.abs(v.C1!.lnEexp - 20.91) < 0.02, `ln E[e^σ] ${v.C1!.lnEexp}`);
  assert.ok(Math.abs(v.C1!.tEff - 4.54) < 0.02 && Math.abs(v.C1!.tStar - 2.41) < 0.01);
  console.log("pass: the supported ensemble scores supported everywhere");
}

// Must refute through the registered clauses.
{
  const v = score(buildResults("refuted"));
  assert.equal(v.registered, true);
  for (const k of v.K1) {
    assert.equal(k.verdict, "refuted", `K1 T=${k.T} should refute`);
    assert.ok(!k.meanOk && !k.stdOk && !k.chi2Ok, `K1 T=${k.T} mean/std/χ² all off`);
  }
  assert.equal(v.K2.verdict, "implementation error"); // the null path with σ ≠ 0
  const k31 = v.K3[1]!;
  const k34 = v.K3[4]!;
  const k364 = v.K3[64]!;
  assert.equal(k31.verdict, "refuted"); // the wrong drive: mirror off, slope 2 ln 3
  assert.ok(!k31.m1!.slopeOk && Math.abs(k31.m1!.slope - 2 * LN3) < 0.05 * LN3);
  assert.equal(k34.verdict, "refuted");
  assert.equal(k364.verdict, "refuted"); // the cross-arm mirror fails in 20/117 bins
  assert.ok(k364.cross!.passing <= 97, `cross-arm passing ${k364.cross!.passing}`);
  const k41 = v.K4[1]!;
  const k464 = v.K4[64]!;
  assert.equal(k41.verdict, "refuted"); // the spurious deep-left bin
  assert.ok(Math.abs(k41.ift - 1) > k41.band);
  assert.equal(k464.verdict, "supported"); // the wrong drive still collapses
  assert.equal(v.K5.bitLevel, "implementation error"); // the half path with σ_cg ≠ 0
  assert.equal(v.K5.verdict, "refuted"); // the corner mean, σ_∂ and L bands all off
  assert.ok(!v.K5.sigmaOk && !v.K5.sdOk && !v.K5.lOk && !v.K5.nullSigmaOk);
  assert.equal(v.K6!.verdict, "refuted"); // the distorted mirror law
  assert.ok(Math.abs(v.K6!.diff) > v.K6!.bias + v.K6!.band, `K6 diff ${v.K6!.diff} band ${v.K6!.band} kPopulated ${v.K6!.kPopulated} dPlugin ${v.K6!.dPlugin} dMean ${v.K6!.dMean}`);
  assert.equal(v.C1!.verdict, "refuted"); // mean +1 and the halved Crooks slope
  assert.ok(!v.C1!.meanOk && !v.C1!.crooksOk);
  console.log("pass: the refuted ensemble refutes K1, K2, K3, K4(T=1), K5, K6 and C1 through their registered clauses");
}

// The smoke output: bit-level checks hold, statistical verdicts are n/a.
{
  const smokeFile = new URL(`results/${hostname().split(".")[0]}-smoke.json`, import.meta.url);
  assert.ok(existsSync(smokeFile), `${smokeFile.pathname} is missing; run the smoke sweep first`);
  const v = score(JSON.parse(readFileSync(smokeFile, "utf8")), smokeFile.pathname);
  console.log(renderVerdict(v));
  assert.equal(v.registered, false);
  assert.equal(v.K2.verdict, "verified"); // every null path has σ = 0, bit for bit
  assert.equal(v.K5.bitLevel, "verified"); // the half-count σ_cg ≡ 0 and the null corner
  assert.ok(v.K5.halfBad.length === 0, `half σ_cg off 0 on paths ${v.K5.halfBad.map((b) => b.i).join(",")}`);
  assert.ok(v.K5.halfMax <= 1e-12, `half max|σ_cg| ${v.K5.halfMax.toExponential(2)} > 1e-12`);
  assert.ok(v.K5.nullSigmaOk && v.K5.nullScgOk);
  assert.equal(v.K1.length, 2); // the smoke runs T ∈ {1, 4}
  for (const k of v.K1) assert.equal(k.verdict, "n/a");
  assert.equal(v.K3[1]!.verdict, "n/a");
  assert.equal(v.K4[1]!.verdict, "n/a");
  assert.equal(v.K6, null);
  assert.equal(v.C1!.verdict, "n/a"); // the ramp arms run in the smoke, but not registered
  console.log("pass: the smoke run scores verified bit for bit, statistics n/a");
}

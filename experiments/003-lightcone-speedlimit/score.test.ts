// Tests for the committed scorer, all against the locked registration:
//   node experiments/003-lightcone-speedlimit/score.test.ts
// (1) The registered constants recomputed from the model — the pipeline rows
//     already pin the frozen prediction chain; here the T1/X1 bands are
//     checked against their own registered properties (half-widths beyond
//     1.25·3.29σ, Bernstein sizes within the 0.000415 budget) and the FWER
//     accounting is exact.
// (2) Two synthetic ensembles at the registered configuration — one built
//     from the exact-chain population values that must score supported
//     everywhere, and per-clause variants that must refute (or flag an
//     implementation error) through the registered clauses.
// (3) The smoke results: bit-exact verdicts hold, statistical verdicts n/a.
import { existsSync, readFileSync } from "node:fs";
import { hostname } from "node:os";
import assert from "node:assert/strict";
import {
  ARM_NAMES, REG, compactArm, ehatOf, exactLaw, paramsOf, pipelineRows, renderVerdict, score, tCrossOf,
} from "./score.ts";
import type { ArmName, ConeArm, Results } from "./score.ts";

// ── the registered constants, recomputed from the model ────────────────────
{
  const rows = pipelineRows();
  assert.equal(rows.length, 24, `pipeline rows: ${rows.length}`);
  for (const r of rows) assert.ok(r.pass, `${r.name}: ${r.detail}`);
  console.log("pass: the frozen prediction chain reproduces (24 pipeline rows: rationals, denominator, branches, P centres, C_fit, t_h, crossings, FWER)");
}

// T1's bands: mean Lμ, variance L(a−μ²), b = 1+|μ|; the registered
// half-widths exceed 1.25·3.29σ and the Bernstein size 2exp[−h²/(2(V+bh/3))]
// is within the registered 0.000415 per-test budget.
{
  const L = REG.R * REG.m * REG.T;
  for (const row of REG.T1) {
    const isActivity = row.name.endsWith("activity");
    const arm = (isActivity ? "wind" : row.name.split(" ")[0]) as ArmName;
    const { mu, a } = paramsOf(arm === "windXOR" ? "wind" : arm);
    const draws = isActivity ? REG.R * REG.m : L - (arm === "windXOR" ? 2 * REG.R * REG.m : 0);
    const V = isActivity
      ? REG.R * REG.m * (128 / 256) * (128 / 256)
      : draws * (a - mu * mu);
    const b = isActivity ? 1 : 1 + Math.abs(mu);
    assert.ok(row.half > 1.25 * 3.29 * Math.sqrt(V), `${row.name}: half ${row.half} vs 1.25·3.29σ ${1.25 * 3.29 * Math.sqrt(V)}`);
    const bern = 2 * Math.exp(-(row.half ** 2) / (2 * (V + (b * row.half) / 3)));
    assert.ok(bern <= 0.000415, `${row.name}: Bernstein size ${bern.toExponential(4)} > 0.000415`);
  }
  // X1's damage count: Bernoulli(122/256) over R·m draws, b = 1
  {
    const V = REG.R * REG.m * (122 / 256) * (134 / 256);
    const bern = 2 * Math.exp(-(REG.X1.half ** 2) / (2 * (V + REG.X1.half / 3)));
    assert.ok(bern <= 0.000415, `X1 Bernstein size ${bern.toExponential(4)}`);
    assert.ok(REG.X1.half > 1.25 * 3.29 * Math.sqrt(V));
  }
  console.log("pass: the T1 and X1 bands hold their registered size properties (≥1.25·3.29σ, Bernstein ≤ 0.000415)");
}

// ── the synthetic ensembles at the registered configuration ───────────────

const REGSHAPE = { n: REG.n, m: REG.m, T: REG.T };
const laws: Partial<Record<ArmName, ReturnType<typeof exactLaw>>> = {};
const law = (a: ArmName) => (laws[a] ??= exactLaw(a, REGSHAPE));

/** One arm's records at the registered configuration, centered on the
 * exact-chain population values (so every registered test must pass). */
function popArm(arm: ArmName): ConeArm {
  if (arm === "windXOR") {
    return {
      arm, ...REGSHAPE, R: REG.R, blocks: REG.blocks,
      tallyTotal: Array(REG.R).fill(Math.round(REG.m * (REG.T - 2) * paramsOf("wind").mu)),
      hops1: Array(REG.R).fill(REG.m / 2),
      coneMax: Array(REG.R).fill(REG.T),
      yAny: Array(REG.R).fill(0),
      damaged: Array(REG.R).fill(REG.X1.mean / REG.R),
      identityOk: true,
    };
  }
  const l = law(arm);
  const jitter = (r: number, g: number) => 1e-9 * (((r * 7 + g * 13) % 11) - 5);
  const W1 = Array.from({ length: REG.R }, (_, r) => l.grid.map((_, g) => l.w1Grid[g] + jitter(r, g)));
  const meanD = Array.from({ length: REG.R }, (_, r) => l.grid.map((_, g) => l.w1Grid[g] + l.d0 + jitter(r, g)));
  const base: ConeArm = {
    arm, ...REGSHAPE, R: REG.R, blocks: REG.blocks,
    tallyTotal: Array(REG.R).fill(Math.round(REG.m * REG.T * paramsOf(arm).mu)),
    hops1: Array(REG.R).fill(arm === "wind" ? REG.m / 2 : Math.round(REG.m * paramsOf(arm).a)),
    coneMax: Array(REG.R).fill(REG.T),
    yAny: Array(REG.R).fill(0),
  };
  const sigmaKappa = l.windowSigma.slice();
  const Ehat = ehatOf(sigmaKappa, l.windows, paramsOf(arm).a);
  base.hopsWin = l.windows.map(([b, e]) => REG.R * REG.m * (e - b) * paramsOf(arm).a);
  base.sigmaKappa = sigmaKappa;
  base.Ehat = Ehat;
  base.tCross = tCrossOf(Ehat, l.windows);
  base.W1 = W1;
  base.meanD = meanD;
  if (arm === "h8")
    // the pooled window counts the population law implies (integers; the P
    // widths dwarf the rounding), so the P gate recomputes σ̂ from raw counts
    base.winPooled = l.windows.map(([b, e], k) =>
      Array.from({ length: REG.n }, (_, x) => Math.round(REG.R * REG.m * (e - b) * l.winMean[k][x])));
  return base;
}

/** Build a full synthetic results object. */
function build(which: "supported" | "refuted", tweak?: (arms: ConeArm[]) => void): Results {
  const arms: ConeArm[] = [...ARM_NAMES, "windXOR"].map((a) => popArm(a as ArmName));
  if (which === "refuted") {
    const by = (a: ArmName) => arms.find((x) => x.arm === a)!;
    // C3: the held-out crossing outside 10.5938460336 ± 1.8390769050
    by("h8").tCross = 20;
    // C4: L̂ off by 0.05 → η̂_lin off by 0.05/23.75 ≈ 0.0021 > 0.0007
    by("calm").meanD = by("calm").meanD!.map((row) => row.map((v, g) => (g === row.length - 1 ? v + 0.05 : v)));
    // C5: W̄₁(512) down by 3 for w5 (η off by 0.0068, away from the branch,
    // since the population η sits 0.0039 below it) and up by 0.2 for c2
    // (0.00039 vs the 0.0002 causal tolerance)
    by("w5").W1 = by("w5").W1!.map((row) => row.map((v, g) => (g === row.length - 1 ? v - 3 : v)));
    by("c2").W1 = by("c2").W1!.map((row) => row.map((v, g) => (g === row.length - 1 ? v + 0.2 : v)));
    // X1: the count off its Bernstein band (identity still holds)
    by("windXOR").damaged = by("windXOR").damaged!.map((d) => d + 100);
    // T1: the calm tally and the wind hop-1 activity off their bands
    by("calm").tallyTotal = by("calm").tallyTotal.map((t) => t + 400000);
    by("wind").hops1 = by("wind").hops1.map((h) => h + 100);
    // P: σ̂₁ recomputed from a flat pooled occupancy — far outside the box
    const flat = Math.round((REG.R * REG.m) / REG.n);
    by("h8").winPooled![1] = Array.from({ length: REG.n }, () => flat);
  }
  tweak?.(arms);
  return {
    commit: "synthetic", dirty: false, smoke: false, goldens: true, m1Pending: [],
    n: REG.n, m: REG.m, T: REG.T, R: REG.R, blocks: REG.blocks,
    sampling: "synthetic: exact-chain population values",
    arms,
  };
}

console.log(renderVerdict(score(build("supported"))));

// Must score supported everywhere.
{
  const v = score(build("supported"));
  assert.equal(v.registered, true);
  assert.equal(v.M1.verdict, "verified");
  assert.equal(v.C1.verdict, "verified");
  assert.equal(v.C2.verdict, "verified");
  assert.ok(v.pipeline.every((r) => r.pass));
  assert.equal(v.C3!.verdict, "supported", `C3: ${v.C3!.detail}`);
  assert.ok(Math.abs((v.C3!.tCross ?? 0) - 10.2694847413) < 0.01, `C3 t̂× ${v.C3!.tCross}`);
  assert.equal(v.C4!.verdict, "supported", `C4: ${v.C4!.detail}`);
  for (const c of v.C5) assert.equal(c.verdict, "supported", `C5 ${c.arm}: ${c.detail}`);
  assert.equal(v.X1!.verdict, "supported", `X1: ${v.X1!.detail}`);
  for (const t of v.T1) assert.equal(t.verdict, "supported", `T1 ${t.name}: ${t.detail}`);
  assert.equal(v.P!.verdict, "supported", `P: ${v.P!.detail}`);
  assert.ok(v.P!.Z < 0.01, `P Z ${v.P!.Z}`);
  assert.equal(v.fwer.sum, 0.01749428125);
  assert.ok(v.fwer.pass);
  console.log("pass: the population ensemble scores supported everywhere (C3, C4, C5×6, X1, T1×9, P, M1, C1, C2)");
}

// Must refute through the registered clauses.
{
  const v = score(build("refuted"));
  assert.equal(v.registered, true);
  assert.equal(v.C3!.verdict, "refuted", `C3: ${v.C3!.detail}`);
  assert.equal(v.C4!.verdict, "refuted", `C4: ${v.C4!.detail}`);
  assert.equal(v.C5.find((c) => c.arm === "w5")!.verdict, "refuted");
  assert.equal(v.C5.find((c) => c.arm === "c2")!.verdict, "refuted");
  assert.equal(v.C5.find((c) => c.arm === "max")!.verdict, "supported", "max untouched");
  assert.equal(v.X1!.verdict, "refuted", `X1: ${v.X1!.detail}`);
  assert.equal(v.T1.find((t) => t.name === "calm tally")!.verdict, "refuted");
  assert.equal(v.T1.find((t) => t.name === "wind hop-1 activity")!.verdict, "refuted");
  assert.equal(v.T1.find((t) => t.name === "w4 tally")!.verdict, "supported", "w4 untouched");
  assert.equal(v.P!.verdict, "refuted", `P: ${v.P!.detail}`);
  console.log("pass: the shifted ensemble refutes C3, C4, C5(w5, c2), X1, T1(calm, wind-1) and P through their registered clauses");
}

// Isolated failures distinguish pipeline faults from physics refutations.
{
  const identity = build("supported");
  const x = identity.arms.find((a) => a.arm === "windXOR")!;
  x.identityOk = false;
  assert.equal(score(identity).X1!.verdict, "implementation error", "X1 identity violation");

  const cone = build("supported");
  cone.arms.forEach((a) => (a.coneMax = a.coneMax.map((c) => c + 1)));
  assert.equal(score(cone).C1.verdict, "implementation error", "cone violation");

  const y = build("supported");
  y.arms.forEach((a) => (a.yAny = a.yAny.map(() => 1)));
  assert.equal(score(y).C1.verdict, "implementation error", "y packing violation");

  const goldens = build("supported");
  goldens.goldens = false;
  assert.equal(score(goldens).M1.verdict, "implementation error", "gate failure");

  const pending = build("supported");
  pending.m1Pending = ["contract.walk.profile (…); contract.walk.profile (…)"];
  assert.equal(score(pending).M1.verdict, "pending", "pending contract keys");

  const zero = build("supported");
  const h8 = zero.arms.find((a) => a.arm === "h8")!;
  h8.winPooled![1][0] = 0; // a pooled zero site: reported, never clipped
  const zp = score(zero).P!;
  assert.equal(zp.verdict, "statistical failure", `P zero site: ${zp.detail}`);

  const nocross = build("supported");
  nocross.arms.find((a) => a.arm === "h8")!.tCross = null; // +∞ for scoring
  assert.equal(score(nocross).C3!.verdict, "refuted", "missing crossing");

  const unregistered = build("supported");
  unregistered.m = 16384;
  unregistered.n = 256;
  const u = score(unregistered);
  assert.equal(u.registered, false);
  assert.equal(u.C3!.verdict, "n/a");
  assert.equal(u.C4!.verdict, "n/a");
  assert.equal(u.C5.every((c) => c.verdict === "n/a"), true);
  assert.equal(u.X1!.verdict, "n/a");
  assert.equal(u.P!.verdict, "n/a");
  // bit-exact verdicts survive the unregistered shape
  assert.equal(u.C1.verdict, "verified");
  console.log("pass: pipeline faults are implementation errors; zero sites are statistical failures; unregistered shapes are n/a");
}

// The compact projection drops the pooled occupancy from every arm but h8.
{
  const r = build("supported");
  const compact = r.arms.map(compactArm);
  assert.ok(compact.find((a) => a.arm === "h8")!.winPooled !== undefined);
  assert.ok(compact.every((a) => a.arm === "h8" || a.winPooled === undefined));
  assert.equal(JSON.parse(JSON.stringify({ arms: compact })).arms.filter((a: ConeArm) => a.winPooled).length, 1);
  console.log("pass: the compact form keeps only h8's pooled occupancy");
}

// The smoke output: bit-level checks hold, statistical verdicts are n/a.
{
  const smokeFile = new URL(`results/${hostname().split(".")[0]}-smoke.json`, import.meta.url);
  assert.ok(existsSync(smokeFile), `${smokeFile.pathname} is missing; run the smoke sweep first`);
  const v = score(JSON.parse(readFileSync(smokeFile, "utf8")), smokeFile.pathname);
  console.log(renderVerdict(v));
  assert.equal(v.registered, false);
  assert.equal(v.C1.verdict, "verified", "cone, packing and Ŵ ≤ t hold at the smoke shape");
  assert.equal(v.X1!.verdict, "n/a");
  assert.equal(v.X1!.identityOk, true, "the damage identity holds bit for bit");
  assert.equal(v.M1.verdict, "pending", `M1 pending: ${JSON.stringify(v.M1)}`);
  assert.ok(v.M1.detail.includes("contract.walk.profile"), `M1 detail: ${v.M1.detail}`);
  assert.equal(v.C3!.verdict, "n/a");
  assert.equal(v.C4, null);
  assert.equal(v.P, null);
  console.log("pass: the smoke run scores verified bit for bit, statistics n/a, M1 pending the Lean contract keys");
}

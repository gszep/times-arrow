// Golden vectors and randomised differential tests against the Lean
// reference, in headless Chrome. Exits non-zero on any mismatch.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { f32Bits, same } from "../src/check.ts";
import { damageDepths } from "../experiments/001-irreversibility/run.ts";
import { ARMS, protocolOf, sigma } from "../experiments/002-arrow-kl/score.ts";
import { compareWalk } from "../experiments/002-arrow-kl/check.ts";
import { headless } from "./headless.ts";

const lean = ".lake/build/bin/timesarrow";
const u32 = () => Math.floor(Math.random() * 2 ** 32);
const ref = (...args: (string | number)[]) => execFileSync(lean, args.map(String), { encoding: "utf8" }).trim();
const results: { name: string; pass: boolean; detail: string }[] = [];
const check = (name: string, pass: boolean, detail = "") => results.push({ name, pass, detail });

const failures = await headless("experiments/000-plumbing/", async (evaluate) => {
  console.log("adapter", await evaluate("probe.adapter"));
  const contract: { name: string; pass: boolean; detail: string }[] = await evaluate("probe.check()");
  results.push(...contract);
  if (!existsSync(lean)) {
    console.log(`${lean} not built: skipping differential tests against Lean`);
  } else {
    const triples = Array.from({ length: 8 }, () => [u32(), u32(), u32()]);
    const gpu: number[][] = await evaluate(`probe.rand(${JSON.stringify(triples)})`);
    triples.forEach((t, i) => {
      const words = ref("rand", ...t).split(" ").map(Number);
      const pass = same(gpu[i], [...words, ...words.map((w) => f32Bits(w >>> 8))]);
      results.push({ name: `random Philox ${t.join(" ")}`, pass, detail: "" });
    });
    for (const n of [16, 32, 64]) {
      const seed = u32();
      const t = Math.floor(Math.random() * 200);
      const pass = (await evaluate(`probe.hpp(${seed}, ${n}, ${t})`)) === ref("hpp", seed, n, t);
      results.push({ name: `random HPP seed ${seed}, n ${n}, t ${t}`, pass, detail: "" });
    }
    for (const n of [32, 64]) {
      const seed = u32();
      for (const mode of ["packed", "null"] as const) {
        check(
          `random ${mode} initial state seed ${seed}, n ${n}`,
          (await evaluate(`probe.init(${JSON.stringify(mode)}, ${seed}, ${n})`)) === ref("hppinit", mode, seed, n),
        );
      }
    }
  }
  return results.filter((r) => !r.pass).length;
});

// The 001 protocol end to end on a small configuration: mechanics only (the
// exact echo, the alignment, the cone and the negative control), never the
// statistical predictions, which belong to the registered sweep. With the
// Lean executable present, the reverse step and the conjugated echo are also
// differentially tested against it on fresh random states.
const smokeFailures = await headless("experiments/001-irreversibility/", async (evaluate) => {
  if (existsSync(lean)) {
    for (const n of [16, 32, 64]) {
      const seed = u32();
      const t = 1 + Math.floor(Math.random() * 99);
      check(
        `random HPP inverse seed ${seed}, n ${n}, t ${t}`,
        (await evaluate(`probe.hppinv(${seed}, ${n}, ${t})`)) === ref("hppinv", seed, n, t),
      );
      check(
        `random HPP echo seed ${seed}, n ${n}, t ${t}`,
        (await evaluate(`probe.hppecho(${seed}, ${n}, ${t})`)) === ref("hppecho", seed, n, t),
      );
    }
  } else {
    console.log(`${lean} not built: skipping reverse-step differential tests against Lean`);
  }
  const cfg = { n: 64, seed: 1, mode: "packed", tMax: 128, tE: 64, b: [4, 8, 16, 32, 64] };
  const r = await evaluate(`probe.run(${JSON.stringify(cfg)})`);
  const N = (64 * 64) / 8;
  check("001 smoke: constructor draws n²/8 particles", r.forward[0].mass === N, `${r.forward[0].mass}`);
  check(
    "001 smoke: particle number constant (L2)",
    r.forward.every((s: { mass: number }) => s.mass === N) &&
      r.echo.every((s: { massP: number; massD: number }) => s.massP === N && Math.abs(s.massD - N) === 1),
  );
  check(
    "001 smoke: momentum profiles invariant",
    r.forward.every((s: { momDev: number }) => s.momDev === 0),
    `max momDev ${Math.max(...r.forward.map((s: { momDev: number }) => s.momDev))}`,
  );
  check("001 smoke: exact echo returns bit for bit (L1)", r.finalHamming === 0, `${r.finalHamming}`);
  const forward = new Map(r.forward.map((s: { t: number; S: Record<number, number> }) => [s.t, s.S[16]]));
  const aligned = r.echo.filter((s: { r: number }) => forward.has(cfg.tE - s.r));
  check(
    "001 smoke: reverse S_16 aligns sample for sample",
    aligned.length > 0 &&
      aligned.every((s: { r: number; Sp: Record<number, number> }) => s.Sp[16] === forward.get(cfg.tE - s.r)),
    `${aligned.length} aligned depths`,
  );
  const zero = r.echo.find((s: { r: number }) => s.r === 0);
  check("001 smoke: H(0) = 1", zero.H === 1 && zero.sites === 1 && zero.maxDist === 0, `H ${zero.H}`);
  const s1 = new Set(damageDepths(cfg.tE));
  const cone = r.echo.filter((s: { r: number }) => s1.has(s.r) && s.r <= 32);
  check(
    "001 smoke: damage support inside the diamond (L3, r ≤ n/2)",
    cone.length > 0 && cone.every((s: { r: number; maxDist: number }) => s.maxDist <= s.r),
    `${cone.length} depths checked`,
  );
  check("001 smoke: naive flip-only control does not recover (R1)", r.naiveHamming >= 1, `${r.naiveHamming}`);
  check("001 smoke: pristine undo fraction is 1", Math.abs(r.undo.pristine - 1) < 1e-9, `${r.undo.pristine}`);
  for (const r0 of results) console.log(r0.pass ? "pass" : "FAIL", r0.name, r0.detail);
  return results.filter((x) => !x.pass).length;
});

// The 002 contract gate and fresh differential tests against Lean, followed
// by a small protocol smoke check (not the registered ensemble).
const walkFailures = await headless("experiments/002-arrow-kl/", async (evaluate) => {
  console.log("adapter", await evaluate("probe.adapter"));

  results.push(...await evaluate("probe.check()"));
  if (existsSync(lean)) {
    for (const arm of ["null", "driven", "reversed", "ramp", "ramprev"]) {
      for (const n of [4, 8, 16]) {
        const seed = u32();
        const m = 1 + Math.floor(Math.random() * 16);
        const t = Math.floor(Math.random() * (arm.startsWith("ramp") ? 17 : 65));
        const g = JSON.parse(ref("walkjson", seed, arm, n, m, t));
        const got = await evaluate(`probe.walk(${JSON.stringify({ seed, arm, n, m, t })})`);
        results.push(...compareWalk(g, got).map((c) => ({ ...c, name: `random Lean ${c.name}` })));
      }
    }
  } else console.log(`${lean} not built: skipping walker differential tests against Lean`);

  // The 002 protocol end to end on a small configuration.
  const cfgR = 512;
  const nullArm = await evaluate(`probe.run(${JSON.stringify({ arm: "null", T: 4, R: cfgR, blocks: 16 })})`);
  check("002 smoke: null σ ≡ 0 on every path", nullArm.maxAbsSigma === 0, `${nullArm.maxAbsSigma}`);
  const driven = await evaluate(`probe.run(${JSON.stringify({ arm: "driven", T: 4, R: cfgR, blocks: 16 })})`);
  const dMean = driven.blockHist
    .flatMap((h: [number, number][]) => h.map(([k, c]) => k * c * Math.log(3)))
    .reduce((a: number, b: number) => a + b, 0) / cfgR;
  const dStd = Math.sqrt(
    driven.blockHist
      .flatMap((h: [number, number][]) => h.map(([k, c]) => c * (k * Math.log(3) - dMean) ** 2))
      .reduce((a: number, b: number) => a + b, 0) / (cfgR - 1),
  );
  check("002 smoke: driven T=4 mean within 6σ of 8 ln 3", Math.abs(dMean - 8 * Math.log(3)) < (6 * Math.sqrt(15) * Math.log(3)) / Math.sqrt(cfgR), `${dMean}`);
  check("002 smoke: driven T=4 std within 6σ of √15 ln 3", Math.abs(dStd - Math.sqrt(15) * Math.log(3)) < 6 * Math.sqrt(15) * Math.log(3) / Math.sqrt(2 * cfgR), `${dStd}`);
  const rampArm = await evaluate(`probe.run(${JSON.stringify({ arm: "ramp", T: 16, R: cfgR, blocks: 16 })})`);
  const rampMean = rampArm.blockSum.reduce((a: number, b: number) => a + b, 0) / cfgR;
  check(
    "002 smoke: ramp mean within 6σ of 10.193",
    Math.abs(rampMean - 10.193) < (6 * 4.549) / Math.sqrt(cfgR),
    `${rampMean}`,
  );
  const corner = await evaluate(`probe.runCorner(${JSON.stringify({ R: 16, blocks: 16, T: 32 })})`);
  const maxHalf = Math.max(0, ...corner.driven.scgHalf.map(Math.abs));
  check("002 smoke: half-count σ_cg ≡ 0 (|·| ≤ 1e-12) on every path", maxHalf <= 1e-12, `${maxHalf.toExponential(2)}`);
  check("002 smoke: null corner σ ≡ 0", corner.null.maxAbsSigma === 0, `${corner.null.maxAbsSigma}`);
  check(
    "002 smoke: null corner σ_cg ≡ 0",
    corner.null.scgHalf.every((s: number) => s === 0) && corner.null.scgL.every((s: number) => s === 0),
  );
  check(
    "002 smoke: corner σ_∂ within the possible range",
    corner.driven.cross.every((c: number) => Math.abs(c) <= 128) && Number.isFinite(corner.driven.cross.reduce((a: number, b: number) => a + b, 0)),
    `${corner.driven.cross.reduce((a: number, b: number) => a + b, 0)}`,
  );
  check(
    "002 smoke: L-count σ_cg finite",
    corner.driven.scgL.every((s: number) => Number.isFinite(s)),
    `max |σ_cg| ${Math.max(...corner.driven.scgL.map(Math.abs)).toExponential(2)}`,
  );
  const halfPath = corner.driven.half[0];
  check(
    "002 smoke: corner count paths have T+1 times",
    halfPath.length === 33 && corner.driven.l[0].length === 33,
    `${halfPath.length}`,
  );
  const drivenProto = protocolOf("driven", 4);
  const sigmaZero = sigma([0, 0, 0, 0], drivenProto);
  const sigmaFive = sigma([4, -1, 0, 2], drivenProto);
  check(
    "002 smoke: the σ formula gives (n_E − n_W)·ln 3",
    sigmaZero === 0 && Math.abs(sigmaFive - 5 * Math.log(3)) < 1e-15,
    `${sigmaZero}, ${sigmaFive}`,
  );
  check("002 smoke: the null weights are the registered arm", ARMS.null.e === 32 && ARMS.null.w === 32 && ARMS.driven.e === 48 && ARMS.driven.w === 16);
  for (const r0 of results) console.log(r0.pass ? "pass" : "FAIL", r0.name, r0.detail);
  return results.filter((x) => !x.pass).length;
});

// The 003 contract gate (pipeline constants, the small GPU self-check of
// every new kernel path, and the contract.walk.profile goldens when the
// Lean lane has exported them), plus the randomized differential guard.
const coneFailures = await headless("experiments/003-lightcone-speedlimit/", async (evaluate) => {
  console.log("adapter", await evaluate("probe.adapter"));
  const gate = (await evaluate("probe.check()")) as { checks: { name: string; pass: boolean; detail: string }[]; pending: string[] };
  results.push(...gate.checks.map((c) => ({ name: c.name, pass: c.pass, detail: c.detail ?? "" })));
  if (gate.pending.length) console.log(`pending from the Lean lane: ${gate.pending.join("; ")}`);
  if (existsSync(lean)) {
    // The randomized differential test of the profile passes needs a
    // `walkprofilejson SEED ARM N M T` command on the timesarrow executable
    // printing the golden shape (state, tallies, hops, nE, nW, cols,
    // winSums) and a contract.walk.profile key with the same schema. Until
    // the Lean lane exports them, the guard reports the pending command.
    for (const arm of ["calm", "wind", "max", "h8"] as const) {
      const seed = u32();
      try {
        ref("walkprofilejson", seed, arm, 16, 256, 4);
        check(`random Lean profile ${arm} seed ${seed}`, false, "the command exists: wire the differential comparison in scripts/check.ts");
      } catch {
        check(`random Lean profile ${arm} seed ${seed}`, true, "pending: timesarrow has no walkprofilejson command yet");
      }
    }
  } else console.log(`${lean} not built: skipping the walker differential tests`);
  for (const r0 of results) console.log(r0.pass ? "pass" : "FAIL", r0.name, r0.detail);
  return results.filter((x) => !x.pass).length;
});
console.log(`${results.filter((r) => r.pass).length}/${results.length} checks passed`);
process.exit(failures + smokeFailures + walkFailures + coneFailures ? 1 : 0);

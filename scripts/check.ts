// Golden vectors and randomised differential tests against the Lean
// reference, in headless Chrome. Exits non-zero on any mismatch.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { f32Bits, same } from "../src/check.ts";
import { damageDepths } from "../experiments/001-irreversibility/run.ts";
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
process.exit(failures + smokeFailures ? 1 : 0);

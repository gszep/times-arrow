// Golden vectors and randomised differential tests against the Lean
// reference, in headless Chrome. Exits non-zero on any mismatch.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import contract from "../contract.json" with { type: "json" };
import { f32Bits, same } from "../src/check.ts";
import { damageDepths } from "../experiments/001-irreversibility/run.ts";
import { thresholds } from "../src/walk.ts";
import { ARMS, protocolOf, sigma } from "../experiments/002-arrow-kl/score.ts";
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

// The 002 walker kernel: the contract goldens when the Lean lane has pinned
// them (checked bit for bit through the page's probe — until then reported
// as skipped), randomised differential tests against a TypeScript
// reference whose Philox is itself verified against the contract's stream
// vectors first, and the 002 protocol end to end on a small configuration:
// mechanics only, never the registered statistics.
const walkFailures = await headless("experiments/002-arrow-kl/", async (evaluate) => {
  console.log("adapter", await evaluate("probe.adapter"));

  // The TypeScript Philox reference, validated against the contract first.
  const mulhilo = (a: number, b: number): [number, number] => {
    const al = a & 0xffff;
    const ah = a >>> 16;
    const bl = b & 0xffff;
    const bh = b >>> 16;
    const ll = Math.imul(al, bl);
    const lh = Math.imul(al, bh);
    const hl = Math.imul(ah, bl);
    const mid = ((ll >>> 16) + (lh & 0xffff) + (hl & 0xffff)) >>> 0;
    return [(ah * bh + (lh >>> 16) + (hl >>> 16) + (mid >>> 16)) >>> 0, Math.imul(a, b) >>> 0];
  };
  const philoxWord = (seed: number, step: number, site: number): number => {
    let c0 = site;
    let c1 = step;
    let c2 = 0;
    let c3 = 0;
    let k0 = seed;
    let k1 = 0;
    for (let r = 0; r < 10; r++) {
      const p0 = mulhilo(0xd2511f53, c0);
      const p1 = mulhilo(0xcd9e8d57, c2);
      c0 = (p1[0] ^ c1 ^ k0) >>> 0;
      c1 = p1[1];
      c2 = (p0[0] ^ c3 ^ k1) >>> 0;
      c3 = p0[1];
      k0 = (k0 + 0x9e3779b9) >>> 0;
      k1 = (k1 + 0xbb67ae85) >>> 0;
    }
    return c0;
  };
  const streamPass = contract.philox.stream.filter((v) => philoxWord(v.seed, v.step, v.site) === v.out[0]).length;
  check("TS Philox reference against the contract stream", streamPass === contract.philox.stream.length, `${streamPass}/${contract.philox.stream.length}`);

  // The walker reference: the constructor, the step, the tallies and the
  // out-edge counts, mirroring the WGSL exactly.
  const refTrace = (seed: number, n: number, m: number, T: number, e: number, w: number) => {
    const shift = Math.log2(n);
    const pos = new Uint32Array(m);
    for (let i = 0; i < m; i++) {
      const word = philoxWord(seed, 0, i);
      pos[i] = (word % n) | ((((word >>> shift) % n) << 8) >>> 0);
    }
    const tally = new Int32Array(T);
    const edges = new Uint32Array(4 * n * n);
    const thr = thresholds({ e, w, n: 24, s: 24, zero: 256 - 48 - e - w });
    for (let t = 1; t <= T; t++)
      for (let i = 0; i < m; i++) {
        const d = philoxWord(seed, t, i) >>> 24;
        let x = pos[i] & 0xff;
        let y = (pos[i] >>> 8) & 0xff;
        const cell = 4 * (y * n + x);
        if (d < thr[0]) {
          edges[cell]++;
          tally[t - 1]++;
          x = (x + 1) & (n - 1);
        } else if (d < thr[1]) {
          edges[cell + 1]++;
          tally[t - 1]--;
          x = (x - 1) & (n - 1);
        } else if (d < thr[2]) {
          edges[cell + 2]++;
          y = (y + 1) & (n - 1);
        } else if (d < thr[3]) {
          edges[cell + 3]++;
          y = (y - 1) & (n - 1);
        }
        pos[i] = x | (y << 8);
      }
    return {
      pos: Array.from(pos, (s) => `${(s & 0xff).toString(16)}${((s >>> 8) & 0xff).toString(16)}`).join(""),
      tally: Array.from(tally),
      edges: Array.from(edges),
    };
  };

  // The contract's walker goldens, in the assumed shape (`walk.golden`
  // trajectories, `walk.sigma` per-path σ), whenever the Lean lane lands them.
  const walk = (contract as Record<string, unknown>).walk as Record<string, unknown> | undefined;
  const goldenVecs = (walk?.golden ?? []) as { seed: number; n: number; m: number; t: number; state: string }[];
  const sigmaVecs = (walk?.sigma ?? []) as { seed: number; n: number; m: number; t: number; sigma: number }[];
  if (!goldenVecs.length)
    console.log("contract.walk goldens not present: golden checks skipped (the full 002 sweep will refuse to run)");
  for (const g of goldenVecs) {
    const got = await evaluate(`probe.golden(${g.seed}, ${g.n}, ${g.m}, ${g.t})`);
    check(`contract walk.golden seed ${g.seed}, n ${g.n}, m ${g.m}, t ${g.t}`, got === g.state, `${got} vs ${g.state}`);
  }
  for (const g of sigmaVecs) {
    const got = await evaluate(`probe.sigmaGolden(${g.seed}, ${g.n}, ${g.m}, ${g.t})`);
    check(`contract walk.sigma seed ${g.seed}, n ${g.n}, m ${g.m}, t ${g.t}`, Math.abs(got - g.sigma) <= 1e-9 * Math.max(1, Math.abs(g.sigma)), `${got} vs ${g.sigma}`);
  }

  // Randomised differential tests, WGSL against the TypeScript reference.
  for (let i = 0; i < 4; i++) {
    const seed = u32();
    const n = [4, 8, 16][i % 3];
    const m = [1, 4, 16][i % 3];
    const T = 1 + Math.floor(Math.random() * 8);
    const e = 8 + Math.floor(Math.random() * 96);
    const w = 8 + Math.floor(Math.random() * Math.min(96, 200 - e));
    const gpu = await evaluate(`probe.trace(${seed}, ${n}, ${m}, ${T}, ${e}, ${w})`);
    const ref = refTrace(seed, n, m, T, e, w);
    check(
      `random walker trace seed ${seed}, n ${n}, m ${m}, T ${T}, e/w ${e}/${w}`,
      gpu.pos === ref.pos && same(gpu.tally, ref.tally) && same(gpu.edges, ref.edges),
      gpu.pos === ref.pos ? "" : `pos ${gpu.pos} vs ${ref.pos}`,
    );
  }

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
process.exit(failures + smokeFailures + walkFailures ? 1 : 0);

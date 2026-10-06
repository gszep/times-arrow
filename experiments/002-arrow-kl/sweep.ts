// The pre-registered 002 ensemble, in headless Chrome:
//   node experiments/002-arrow-kl/sweep.ts
// writes results/<host>.json with provenance. `--smoke` runs a small
// end-to-end validation (R = 512 per arm, a 16-path corner) to
// results/<host>-smoke.json instead. The full ensemble is meant for Artemis.
//
// The full run is guarded: it refuses to start unless the contract pins the
// walker goldens under the expected key `walk` (ASSUMED SHAPE, until the
// Lean lane lands it: `walk.golden = [{seed, n, m, t, state}…]`, `state`
// two hex digits per walker, x then y; optional `walk.sigma =
// [{seed, n, m, t, sigma}]` at 1e-9) — and, inside the page, refuses
// unless the GPU reproduces them bit for bit. The smoke run is exempt; it
// validates plumbing, not the goldens. The device-loss watch is inside the
// run driver; the expected-vendor and software-adapter checks are in
// scripts/headless.ts.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import contract from "../../contract.json" with { type: "json" };
import { headless } from "../../scripts/headless.ts";
import { RAMP_T } from "./score.ts";
import type { ArmName, CornerResult, MainArm } from "./score.ts";

const smoke = process.argv.includes("--smoke");
const vendor = process.env.TIMES_ARROW_VENDOR ?? (process.platform === "darwin" ? "intel" : "nvidia");
const full = { R: 65536, blocks: 16, cornerR: 1024, cornerT: 32 };
const tiny = { R: 512, blocks: 16, cornerR: 16, cornerT: 32 };
const cfg = smoke ? tiny : full;

// The goldens the guard demands, in the assumed shape.
type GoldenVec = { seed: number; n: number; m: number; t: number; state: string };
type SigmaVec = { seed: number; n: number; m: number; t: number; sigma: number };
let goldenVectors: GoldenVec[] = [];
let sigmaVectors: SigmaVec[] = [];
if (!smoke) {
  const walk = (contract as Record<string, unknown>).walk as Record<string, unknown> | undefined;
  const need = (key: string) => {
    const v = walk?.[key];
    if (!Array.isArray(v) || v.length === 0)
      throw new Error(
        `contract.walk.${key} golden vectors are missing; the full 002 sweep refuses to run until the Lean lane pins them`,
      );
    return v;
  };
  goldenVectors = need("golden") as GoldenVec[];
  sigmaVectors = (walk?.sigma ?? []) as SigmaVec[];
}

const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const provenance = {
  commit: git("rev-parse HEAD"),
  dirty: git("status --porcelain --untracked-files=no") !== "",
  host: hostname().split(".")[0],
  date: new Date().toISOString(),
  smoke,
};

const { adapter, goldens, main, corner } = await headless("experiments/002-arrow-kl/", async (evaluate) => {
  let goldensPassed: boolean | null = null;
  for (const g of goldenVectors) {
    const got = (await evaluate(`probe.golden(${g.seed}, ${g.n}, ${g.m}, ${g.t})`)) as string;
    if (got !== g.state)
      throw new Error(
        `the GPU walker trace (seed ${g.seed}, n ${g.n}, m ${g.m}, t ${g.t}) differs from contract.walk.golden:\n  got ${got}\n  want ${g.state}`,
      );
  }
  for (const g of sigmaVectors) {
    const got = (await evaluate(`probe.sigmaGolden(${g.seed}, ${g.n}, ${g.m}, ${g.t})`)) as number;
    if (Math.abs(got - g.sigma) > 1e-9 * Math.max(1, Math.abs(g.sigma)))
      throw new Error(`probe.sigmaGolden(seed ${g.seed}) = ${got}, contract says ${g.sigma}`);
  }
  if (!smoke) goldensPassed = true;

  const main: MainArm[] = [];
  const run = async (arm: ArmName, T: number) => {
    const a = (await evaluate(
      `probe.run(${JSON.stringify({ arm, T, R: cfg.R, blocks: cfg.blocks })})`,
    )) as MainArm;
    main.push(a);
    const note =
      a.blockHist !== undefined
        ? `${a.blockHist.reduce((s, h) => s + h.length, 0)} tally bins`
        : `mean σ ${(a.blockSum!.reduce((x, y) => x + y, 0) / a.R).toPrecision(6)}`;
    console.log(`${arm} T=${T}: R=${a.R}, ${note}, max|σ| ${a.maxAbsSigma ?? "—"}`);
  };
  for (const arm of ["driven", "reversed", "null"] as const)
    for (const T of smoke ? [1, 4] : [1, 4, 64]) await run(arm, T);
  for (const arm of ["ramp", "ramprev"] as const) await run(arm, RAMP_T);

  const corner = (await evaluate(
    `probe.runCorner(${JSON.stringify({ R: cfg.cornerR, blocks: cfg.blocks, T: cfg.cornerT })})`,
  )) as CornerResult;
  const maxHalf = Math.max(0, ...corner.driven.scgHalf.map(Math.abs));
  console.log(
    `corner: R=${corner.R}, ⟨σ⟩ ${(corner.driven.tally.reduce((a, b) => a + b, 0) / corner.R).toFixed(1)}·ln 3, max |σ_cg^half| ${maxHalf.toExponential(2)}, null σ ≡ 0 ${corner.null.maxAbsSigma === 0}`,
  );
  return { adapter: await evaluate("probe.adapter"), goldens: goldensPassed, main, corner };
}, vendor);

mkdirSync(new URL("results", import.meta.url), { recursive: true });
const file = new URL(`results/${provenance.host}${smoke ? "-smoke" : ""}.json`, import.meta.url);
writeFileSync(
  file,
  JSON.stringify(
    {
      ...provenance,
      n: 8,
      m: 16,
      sampling: "per-block tally histograms (0.5-nat bins for the ramp); per-path corner records",
      adapter,
      goldens,
      main,
      corner,
    },
    null,
    1,
  ) + "\n",
);
console.log(file.pathname);

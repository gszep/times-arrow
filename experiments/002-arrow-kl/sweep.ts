// The pre-registered 002 ensemble, in headless Chrome:
//   node experiments/002-arrow-kl/sweep.ts
// writes results/<host>.json with provenance. `--smoke` runs a small
// end-to-end validation (R = 512 per arm, a 16-path corner) to
// results/<host>-smoke.json instead. The full ensemble is meant for Artemis.
//
// Both modes require the page's complete contract gate: trajectories,
// tallies, σ, DP histograms and K5 HMM goldens. Device-loss monitoring is in
// the run driver; the adapter/vendor check is in scripts/headless.ts.
import { headless, provenance, writeRaw, writeResults } from "../../scripts/headless.ts";
import { RAMP_T, compactCorner } from "./score.ts";
import type { ArmName, MainArm } from "./score.ts";
import type { LiveCornerResult } from "./run.ts";

const smoke = process.argv.includes("--smoke");
const vendor = process.env.TIMES_ARROW_VENDOR ?? (process.platform === "darwin" ? "intel" : "nvidia");
const full = { R: 65536, blocks: 16, cornerR: 1024, cornerT: 32 };
const tiny = { R: 512, blocks: 16, cornerR: 16, cornerT: 32 };
const cfg = smoke ? tiny : full;

const prov = provenance(smoke);
if (prov.dirty) throw new Error("commit the code before recording sweep provenance");

const { adapter, goldens, main, corner } = await headless("experiments/002-arrow-kl/", async (evaluate) => {
  const checks: { name: string; pass: boolean }[] = await evaluate("probe.check()");
  const failed = checks.filter((c) => !c.pass);
  if (!checks.length || failed.length) throw new Error(`walker contract gate failed: ${JSON.stringify(failed)}`);
  console.log(`contract.walk: ${checks.length} checks passed`);

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
  for (const arm of ["null", "driven", "reversed"] as const)
    for (const T of smoke ? [1, 4] : [1, 4, 64]) await run(arm, T);
  for (const arm of ["ramp", "ramprev"] as const) await run(arm, RAMP_T);

  const corner = (await evaluate(
    `probe.runCorner(${JSON.stringify({ R: cfg.cornerR, blocks: cfg.blocks, T: cfg.cornerT })})`,
  )) as LiveCornerResult;
  const maxHalf = Math.max(0, ...corner.driven.scgHalf.map(Math.abs));
  console.log(
    `corner: R=${corner.R}, ⟨σ⟩ ${(corner.driven.tally.reduce((a, b) => a + b, 0) / corner.R).toFixed(1)}·ln 3, max |σ_cg^half| ${maxHalf.toExponential(2)}, null σ ≡ 0 ${corner.null.maxAbsSigma === 0}`,
  );
  return { adapter: await evaluate("probe.adapter"), goldens: true, main, corner };
}, vendor);

const name = `${prov.host}${smoke ? "-smoke" : ""}`;
const raw = {
  ...prov,
  seeds: { main: { first: 1, last: cfg.R }, corner: { first: 1, last: cfg.cornerR }, pairedAcrossArms: true },
  n: 8,
  m: 16,
  sampling: "per-block tally histograms (0.5-nat bins for the ramp); per-path corner records",
  adapter,
  goldens,
  main,
  corner,
};
// The compact form is committed (exactly the scorer's input); the raw form
// goes to the results-002 release, with its SHA-256 in the compact file.
writeRaw(`002-${name}`, raw);
writeResults(new URL("results", import.meta.url), name, { ...raw, corner: compactCorner(corner) });

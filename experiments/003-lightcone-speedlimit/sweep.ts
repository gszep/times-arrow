// The pre-registered 003 ensemble, in headless Chrome:
//   node experiments/003-lightcone-speedlimit/sweep.ts
// writes the compact scorer input to results/<host>.json with provenance
// and a release block; the full raw output goes to the scratch dir for the
// results-003 GitHub release. `--smoke` runs a small end-to-end validation
// (n = 256, m = 16384, R = 16, T = 64 — every arm, every measurement pass)
// to results/<host>-smoke.json instead. The full registered ensemble
// (n = 1024, m = 65536, R = 256, T = 512) is meant for Artemis.
//
// Both modes require the page's complete contract gate first. Device-loss
// monitoring is in the run driver; the adapter/vendor check is in
// scripts/headless.ts.
import { headless, provenance, writeRaw, writeResults } from "../../scripts/headless.ts";
import { REG, compactArm } from "./score.ts";
import type { ArmName, ConeArm } from "./score.ts";

const smoke = process.argv.includes("--smoke");
const vendor = process.env.TIMES_ARROW_VENDOR ?? (process.platform === "darwin" ? "intel" : "nvidia");
const full = { n: REG.n, m: REG.m, T: REG.T, R: REG.R, blocks: REG.blocks };
const tiny = { n: 256, m: 16384, T: 64, R: 16, blocks: 16 };
const cfg = smoke ? tiny : full;

const prov = provenance(smoke);
if (prov.dirty) throw new Error("commit the code before recording sweep provenance");

const { gate, arms, adapter } = await headless("experiments/003-lightcone-speedlimit/", async (evaluate) => {
  const gate = (await evaluate("probe.check()")) as { checks: { name: string; pass: boolean }[]; pending: string[] };
  const failed = gate.checks.filter((c) => !c.pass);
  if (!gate.checks.length || failed.length) throw new Error(`003 contract gate failed: ${JSON.stringify(failed)}`);
  console.log(`gate: ${gate.checks.length} checks passed; pending from the Lean lane: ${gate.pending.join("; ") || "none"}`);

  const arms: ConeArm[] = [];
  const run = async (arm: ArmName) => {
    const a = (await evaluate(`probe.run(${JSON.stringify({ ...cfg, arm })})`)) as ConeArm;
    arms.push(a);
    console.log(
      `${arm}: R=${a.R}, tally ${a.tallyTotal.reduce((x, y) => x + y, 0)}, t̂× ${a.tCross === null || a.tCross === undefined ? "—" : a.tCross.toFixed(5)}, max cone ${Math.max(...a.coneMax)}, y max ${Math.max(...a.yAny)}`,
    );
  };
  for (const arm of ["calm", "w5", "w4", "c2", "max", "h8"] as const) await run(arm);
  const pair = (await evaluate(`probe.pair(${JSON.stringify(cfg)})`)) as { wind: ConeArm; windXOR: ConeArm };
  arms.push(pair.wind, pair.windXOR);
  console.log(
    `wind: R=${pair.wind.R}, t̂× ${pair.wind.tCross?.toFixed(5) ?? "—"} · windXOR: identity ${pair.windXOR.identityOk}, damaged ${pair.windXOR.damaged!.reduce((x, y) => x + y, 0)}`,
  );
  return { gate, arms, adapter: await evaluate("probe.adapter") };
}, vendor);

const name = `${prov.host}${smoke ? "-smoke" : ""}`;
const raw = {
  ...prov,
  seeds: { first: 1, last: cfg.R, pairedAcrossArms: true },
  n: cfg.n,
  m: cfg.m,
  T: cfg.T,
  R: cfg.R,
  blocks: cfg.blocks,
  sampling: "per-seed grid W₁ and mean distance, pooled window occupancy (h8 kept in the compact form for the P gate); per-seed tallies, hop-1 counts, cone/y checks; wind/windXOR paired damage records",
  adapter,
  goldens: gate.checks.every((c) => c.pass),
  m1Pending: gate.pending,
  arms,
};
// The compact form is committed (exactly the scorer's input, h8's pooled
// occupancy only); the raw form goes to the results-003 release, with its
// SHA-256 in the compact file's release block.
const written = writeRaw(`003-${name}`, raw);
writeResults(new URL("results", import.meta.url), name, {
  ...raw,
  arms: arms.map(compactArm),
  release: {
    tag: "results-003",
    url: "https://github.com/gszep/times-arrow/releases/tag/results-003",
    sha256: { [`003-${name}.json`]: written.sha256 },
    regenerate: "node experiments/003-lightcone-speedlimit/sweep.ts [--smoke] — deterministic (Philox keyed by seed); commit and adapter recorded.",
  },
});

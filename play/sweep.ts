import assert from "node:assert/strict";
import { headless, provenance, writeRaw } from "../scripts/headless.ts";
import { hostname } from "node:os";

if (hostname().split(".")[0] !== "artemis") throw new Error("Sweeps run on Artemis");
const seeds = Array.from({ length: 16 }, (_, i) => i + 1);
const output = await headless("play/?paused=1", async ev => {
  const rows = [];
  // Null first: only the background density changes between null and disc.
  for (const nullModel of [true, false]) for (const rho of [1, 3]) for (const seed of seeds) {
    const config = { n: 256, seed, rho, outside: nullModel ? rho : 0.15, radius: 64, x: 0.5, y: 0.5, window: 16 };
    const initial = await ev(`probe.reset(${JSON.stringify(config)})`);
    const result = await ev("probe.run(128)");
    assert.deepEqual(result.sample.invariants, initial.invariants);
    const audit = await ev("probe.audit()");
    rows.push({ nullModel, config, curves: result.samples, radii: audit.radii });
    console.log(JSON.stringify({ nullModel, rho, seed, slopes: result.samples.map((c: any) => c.slopes) }));
  }
  return { ...provenance(), adapter: await ev("probe.adapter"), rows };
}, "nvidia");
writeRaw("play-fhp", output);

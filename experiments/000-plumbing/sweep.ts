// HPP throughput sweep in headless Chrome: `node experiments/000-plumbing/sweep.ts`.
// Writes results/<host>-chrome.json with provenance.
import { headless, provenance, writeResults } from "../../scripts/headless.ts";

const steps = 500;
const prov = provenance();

const result = await headless("experiments/000-plumbing/", async (evaluate) => {
  const runs = [];
  for (const n of [1024, 2048, 4096, 8192])
    for (let r = 0; r < 3; r++) {
      try {
        runs.push(await evaluate(`probe.bench(${n}, ${steps})`));
      } catch (e) {
        runs.push({ n, error: String(e) });
      }
      console.log(JSON.stringify(runs.at(-1)));
    }
  return { adapter: await evaluate("probe.adapter"), runs };
});

writeResults(new URL("results", import.meta.url), `${prov.host}-chrome`, {
  ...prov,
  backend: "chrome",
  steps,
  ...result,
});

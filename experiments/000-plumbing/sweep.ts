// HPP throughput sweep in headless Chrome: `node experiments/000-plumbing/sweep.ts`.
// Writes results/<host>-chrome.json with provenance.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { headless } from "../../scripts/headless.ts";

const steps = 500;
const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const provenance = { commit: git("rev-parse HEAD"), dirty: git("status --porcelain") !== "", host: hostname() };

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

mkdirSync(new URL("results", import.meta.url), { recursive: true });
writeFileSync(
  new URL(`results/${hostname().split(".")[0]}-chrome.json`, import.meta.url),
  JSON.stringify({ ...provenance, backend: "chrome", date: new Date().toISOString(), steps, ...result }, null, 1) + "\n",
);

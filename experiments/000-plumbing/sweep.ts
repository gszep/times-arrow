// HPP throughput sweep: `node experiments/000-plumbing/sweep.ts chrome|dawn`.
// Writes results/<host>-<backend>.json with provenance.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { gpu } from "../../src/gpu.ts";
import { headless } from "../../scripts/headless.ts";
import { bench } from "./bench.ts";

const backend = process.argv[2];
const sizes = [1024, 2048, 4096, 8192];
const steps = 500;
const repeats = 3;

type Run = Awaited<ReturnType<typeof bench>>;

async function sweep(adapter: unknown, run: (n: number) => Promise<Run>) {
  const runs: (Run | { n: number; error: string })[] = [];
  for (const n of sizes)
    for (let r = 0; r < repeats; r++) {
      try {
        runs.push(await run(n));
      } catch (e) {
        runs.push({ n, error: String(e) });
      }
      console.log(JSON.stringify(runs.at(-1)));
    }
  return { adapter, runs };
}

let result;
if (backend === "chrome") {
  result = await headless("experiments/000-plumbing/", async (evaluate) =>
    sweep(await evaluate("probe.adapter"), (n) => evaluate(`probe.bench(${n}, ${steps})`)),
  );
} else if (backend === "dawn") {
  const { create, globals } = await import("webgpu");
  Object.assign(globalThis, globals);
  const instance = create([]); // Dawn segfaults if this is garbage-collected.
  Object.defineProperty(navigator, "gpu", { value: instance });
  const { device, adapter } = await gpu();
  if (adapter.fallback) throw new Error(`software adapter: ${JSON.stringify(adapter)}`);
  result = await sweep(adapter, (n) => bench(device, n, steps));
} else {
  throw new Error("usage: sweep.ts chrome|dawn");
}

const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
mkdirSync(new URL("results", import.meta.url), { recursive: true });
writeFileSync(
  new URL(`results/${hostname().split(".")[0]}-${backend}.json`, import.meta.url),
  JSON.stringify(
    { commit: git("rev-parse HEAD"), dirty: git("status --porcelain") !== "", host: hostname(), backend, date: new Date().toISOString(), steps, ...result },
    null,
    1,
  ) + "\n",
);

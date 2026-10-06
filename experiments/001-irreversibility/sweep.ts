// The pre-registered 001 ensemble, in headless Chrome:
//   node experiments/001-irreversibility/sweep.ts
// writes results/<host>.json with provenance. `--smoke` runs a tiny
// end-to-end validation (n = 64, two seeds, a short grid) to
// results/<host>-smoke.json instead. The full ensemble is meant for Artemis;
// it must not run before the Lean lane pins the initial-state constructors
// and the inverse/echo golden vectors in the contract.
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { headless } from "../../scripts/headless.ts";

const smoke = process.argv.includes("--smoke");
const b = [4, 8, 16, 32, 64];
const full = { n: 1024, tMax: 32768, tE: 16384, seeds: Array.from({ length: 16 }, (_, i) => i + 1) };
const tiny = { n: 64, tMax: 128, tE: 64, seeds: [1, 2] };
const cfg = smoke ? tiny : full;

const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
const provenance = {
  commit: git("rev-parse HEAD"),
  dirty: git("status --porcelain --untracked-files=no") !== "",
  host: hostname().split(".")[0],
  date: new Date().toISOString(),
  smoke,
};

const { adapter, runs } = await headless("experiments/001-irreversibility/", async (evaluate) => {
  const adapter = await evaluate("probe.adapter");
  const runs = [];
  for (const seed of cfg.seeds)
    for (const mode of ["packed", "null"] as const) {
      const r = await evaluate(
        `probe.run(${JSON.stringify({ n: cfg.n, seed, mode, tMax: cfg.tMax, tE: cfg.tE, b })})`,
      );
      runs.push(r);
      console.log(
        `seed ${seed} ${mode}: ${r.forward.length} forward samples, ${r.echo.length} echo depths, final Hamming ${r.finalHamming}, naive Hamming ${r.naiveHamming}, U ${r.undo ? [r.undo.pristine, r.undo.damaged].map((u) => u?.toFixed(3)).join("/") : "—"}`,
      );
    }
  return { adapter, runs };
});

mkdirSync(new URL("results", import.meta.url), { recursive: true });
const file = new URL(`results/${provenance.host}${smoke ? "-smoke" : ""}.json`, import.meta.url);
writeFileSync(
  file,
  JSON.stringify(
    {
      ...provenance,
      params: { ...cfg, b, sampling: "t = 0, powers of two ≤ 1024, then every 128; echo at r = tE − t; damage on the same grid in r" },
      adapter,
      runs,
    },
    null,
    1,
  ) + "\n",
);
console.log(file.pathname);

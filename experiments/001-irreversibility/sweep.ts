// The pre-registered 001 ensemble, in headless Chrome:
//   node experiments/001-irreversibility/sweep.ts
// writes results/<host>.json with provenance. `--smoke` runs a tiny
// end-to-end validation (n = 64, two seeds, a short grid) to
// results/<host>-smoke.json instead. The full ensemble is meant for Artemis.
//
// The full run is guarded: it refuses to start unless the contract pins the
// golden vectors it depends on — the inverse and the echo (already landed)
// and the two exact-N initial-state constructors under the expected key
// `hpp.init` (ASSUMED SHAPE, until the Lean lane lands it:
// `hpp.init = [{seed, n, mode: "packed" | "null", state}, …]`, `state` one
// hex digit per site like every other contract vector) — and, inside the
// page, refuses unless the GPU constructors reproduce those states bit for
// bit. The smoke run is exempt; it validates plumbing, not the constructors.
//
// The expected GPU vendor comes from TIMES_ARROW_VENDOR, defaulting to this
// Mac's Intel iGPU on darwin and Artemis's NVIDIA on Linux.
import contract from "../../contract.json" with { type: "json" };
import { headless, provenance, writeRaw, writeResults } from "../../scripts/headless.ts";
import { scoreRun } from "./score.ts";

const smoke = process.argv.includes("--smoke");
const vendor = process.env.TIMES_ARROW_VENDOR ?? (process.platform === "darwin" ? "intel" : "nvidia");
const b = [4, 8, 16, 32, 64];
const full = { n: 1024, tMax: 32768, tE: 16384, seeds: Array.from({ length: 16 }, (_, i) => i + 1) };
const tiny = { n: 64, tMax: 128, tE: 64, seeds: [1, 2] };
const cfg = smoke ? tiny : full;

// The constructor golden vectors the guard demands, in the assumed shape.
type InitVec = { seed: number; n: number; mode: "packed" | "null"; state: string };
let initVectors: InitVec[] = [];
if (!smoke) {
  const hpp = contract.hpp as Record<string, unknown>;
  const vectors = (key: string) => {
    const v = hpp[key];
    if (!Array.isArray(v) || v.length === 0)
      throw new Error(
        `contract.hpp.${key} golden vectors are missing; the full 001 sweep refuses to run until the Lean lane pins them`,
      );
    return v;
  };
  vectors("inverse");
  vectors("echo");
  initVectors = vectors("init") as InitVec[];
  for (const mode of ["packed", "null"] as const)
    if (!initVectors.some((v) => v.mode === mode))
      throw new Error(
        `contract.hpp.init has no ${mode} start-state vector; the full 001 sweep needs both constructors pinned`,
      );
}

const prov = provenance(smoke);

const { adapter, runs } = await headless("experiments/001-irreversibility/", async (evaluate) => {
  const adapter = await evaluate("probe.adapter");
  for (const g of initVectors) {
    const got = (await evaluate(`probe.construct(${JSON.stringify(g.mode)}, ${g.seed}, ${g.n})`)) as string;
    const diff = [...got].filter((c, i) => c !== g.state[i]).length;
    if (diff !== 0)
      throw new Error(
        `the GPU ${g.mode} constructor (seed ${g.seed}, n ${g.n}) differs from contract.hpp.init at ${diff} sites`,
      );
  }
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
}, vendor);

const name = `${prov.host}${smoke ? "-smoke" : ""}`;
const raw = {
  ...prov,
  params: { ...cfg, b, sampling: "t = 0, powers of two ≤ 1024, then every 128; echo at r = tE − t; damage on the same grid in r" },
  adapter,
  runs,
};
// The compact form is committed (exactly the scorer's input); the raw form
// goes to the results-001 release, with its SHA-256 in the compact file.
writeRaw(`001-${name}`, raw);
writeResults(new URL("results", import.meta.url), name, { ...raw, runs: runs.map(scoreRun) });

// Headless sweep driver for the local-arrow study on play/ (issue #13).
// For each cell it runs R paired seeds through two phases per seed:
//   A — census every step (W = 1): the per-surface inside-count series,
//       from which σ is composed offline at every window length in the
//       ladder (non-overlapping windows from t = 0);
//   B — W = 25 full windows with flux readback: per-cell σ fields and the
//       same per-surface σ series for the W = 25 cross-check against phase A
//       (same seed ⇒ identical trajectory ⇒ exact agreement expected).
// The ensemble mean ± 2 SE across seeds separates signal from noise. The
// compact summaries print; the raw series go to the scratch dir, never Git.
//   node play/sweep.ts                 full matrix
//   CELL="^door$" node play/sweep.ts   subset by name regex
//   SMOKE=1 node play/sweep.ts         tiny fast pass to validate plumbing
import { headless, writeRaw, provenance } from "../scripts/headless.ts";
import { sObs, areaOf, rEqOf, pNegGauss } from "./analyze.ts";

type Cell = { name: string; knobs: Record<string, unknown> };

const SMOKE = process.env.SMOKE === "1";
const only = process.env.CELL ? new RegExp(process.env.CELL) : null;
const R = SMOKE ? 3 : 32;
const N = SMOKE ? 12500 : 50000;
const T = SMOKE ? 200 : 1200; // steps per seed
const W = 25;
const W_LADDER = [5, 25, 50, 100];
const log = (...a: unknown[]) => console.log(...a);

const CELLS: Cell[] = [
  { name: "door", knobs: { proto: "door", door: 0.08, spawn: "room", scatm: 0, spread: 0 } },
  { name: "door-null", knobs: { proto: "door", door: 0.08, spawn: "table", scatm: 0, spread: 0 } },
  { name: "door-sinai", knobs: { proto: "door", door: 0.08, spawn: "room", scatm: 1, spread: 0 } },
  { name: "door-spread", knobs: { proto: "door", door: 0.08, spawn: "room", scatm: 0, spread: 0.25 } },
  { name: "door-fine", knobs: { proto: "door", door: 0.08, spawn: "room", scatm: 0, spread: 0, grid: 64 } },
  { name: "release", knobs: { proto: "release", spawn: "disc", startDisc: 0.01, scatm: 0, spread: 0 } },
  { name: "release-null", knobs: { proto: "release", spawn: "table", scatm: 0, spread: 0 } },
];

const sigmaOf = (p0: number, p1: number, a: number) => sObs(p1, a) - sObs(p0, a);

await headless("play/", async (ev) => {
  log(`adapter ${JSON.stringify(await ev("probe.adapter"))}`);
  log(`provenance ${JSON.stringify(provenance())}`);
  const reset = (patch: Record<string, unknown>) => ev(`probe.reset(${JSON.stringify(patch)})`) as Promise<{ t: number; ctr: number[] }>;
  const config = () => ev("probe.config()") as Promise<{ surfaces: { x: number; y: number; r: number; square: boolean }[]; n: number; grid: number }>;
  const burstA = (count: number) => ev(`probe.burst(1, false, ${count})`) as Promise<{ ctrSeries: number[][] }>;
  const burstB = (w: number, count: number) => ev(`probe.burst(${w}, true, ${count})`) as Promise<{ mean: number[]; sd: number[]; pNeg: number[]; heat: Float64Array; div: Float64Array }>;
  const invariants = () => ev("probe.invariants()") as Promise<{ occSum: number; divSum: number | null; n: number; t: number }>;
  const audit = () => ev("probe.audit()") as Promise<{ nan: number; escaped: number; inScat: number; speedErr: number }>;

  const out: Record<string, unknown>[] = [];
  const raws: Record<string, unknown>[] = [];

  for (const cell of CELLS) {
    if (only && !only.test(cell.name)) continue;
    const tc0 = Date.now();
    const seedPatch = { ...cell.knobs, n: N, seed: 1 };
    await reset(seedPatch);
    const cfgNow = await config();
    const surfaces = cfgNow.surfaces;
    const areas = surfaces.map(areaOf);
    const rEq = surfaces.map(rEqOf);
    const K = surfaces.length;
    const fam = (k: number) => (surfaces[k].square ? 1 : 0) + (Math.abs(surfaces[k].x - surfaces[0].x) < 1e-9 && Math.abs(surfaces[k].y - surfaces[0].y) < 1e-9 ? 0 : 2);
    // per-seed: per (W', surface): mean, sd, pNeg over non-overlapping windows
    const perSeedA: { w: number; mean: number[]; sd: number[]; pNeg: number[] }[] = [];
    const perSeedB: { mean: number[]; sd: number[]; pNeg: number[]; heat: number[] }[] = [];
    for (let s = 0; s < R; s++) {
      const s0 = await reset({ ...cell.knobs, n: N, seed: 1 + s });
      const n = N;
      const seriesA = [s0.ctr.map((c) => c / n), ...(await burstA(T)).ctrSeries.map((c) => c.map((v) => v / n))];
      for (const w of W_LADDER) {
        const sigs: number[][] = Array.from({ length: K }, () => []);
        for (let t = 0; t + w <= T; t += w)
          for (let k = 0; k < K; k++) sigs[k].push(sigmaOf(seriesA[t][k], seriesA[t + w][k], areas[k]));
        perSeedA.push({
          w,
          mean: sigs.map((a) => a.reduce((s2, v) => s2 + v, 0) / a.length),
          sd: sigs.map((a) => {
            const m = a.reduce((s2, v) => s2 + v, 0) / a.length;
            return Math.sqrt(a.reduce((s2, v) => s2 + (v - m) ** 2, 0) / (a.length - 1));
          }),
          pNeg: sigs.map((a) => a.filter((v) => v < 0).length / a.length),
        });
      }
      // phase B: same seed again — the trajectory must reproduce
      await reset({ ...cell.knobs, n: N, seed: 1 + s });
      const b = await burstB(W, T / W);
      perSeedB.push({ mean: b.mean, sd: b.sd, pNeg: b.pNeg, heat: Object.values(b.heat).map(Number) });
      // phase A vs B cross-check at W = 25 (same seed ⇒ identical trajectory)
      const A25 = perSeedA[s * W_LADDER.length + W_LADDER.indexOf(25)]!;
      const cross = Math.max(...A25.mean.map((m, k) => Math.abs(m - b.mean[k])));
      if (cross > 1e-12) log(`  CROSS-CHECK FAIL seed ${s}: max |A−B| = ${cross}`);
    }
    const inv = await invariants();
    const aud = await audit();
    // aggregate across seeds
    const aggA = W_LADDER.map((w) => {
      const rows = perSeedA.filter((p) => p.w === w);
      const mean = rows[0].mean.map((_, k) => rows.reduce((s2, r) => s2 + r.mean[k], 0) / R);
      const se = rows[0].mean.map((_, k) => Math.sqrt(rows.reduce((s2, r) => s2 + (r.mean[k] - mean[k]) ** 2, 0) / (R - 1) / R));
      const pNeg = rows[0].pNeg.map((_, k) => rows.reduce((s2, r) => s2 + r.pNeg[k], 0) / R);
      const pNegSe = rows[0].pNeg.map((_, k) => Math.sqrt(rows.reduce((s2, r) => s2 + (r.pNeg[k] - pNeg[k]) ** 2, 0) / (R - 1) / R));
      const sd = rows[0].sd.map((_, k) => rows.reduce((s2, r) => s2 + r.sd[k], 0) / R);
      return { w, mean, se, pNeg, pNegSe, sd };
    });
    const meanB = perSeedB[0].mean.map((_, k) => perSeedB.reduce((s2, r) => s2 + r.mean[k], 0) / R);
    const seB = perSeedB[0].mean.map((_, k) => Math.sqrt(perSeedB.reduce((s2, r) => s2 + (r.mean[k] - meanB[k]) ** 2, 0) / (R - 1) / R));
    const pNegB = perSeedB[0].pNeg.map((_, k) => perSeedB.reduce((s2, r) => s2 + r.pNeg[k], 0) / R);
    const heatMean = perSeedB[0].heat.map((_, i) => perSeedB.reduce((s2, r) => s2 + r.heat[i], 0) / R);
    const summary = {
      cell: cell.name,
      knobs: cell.knobs,
      n: N,
      r: R,
      T,
      grid: cfgNow.grid,
      invariants: inv,
      audit: aud,
      surfaces: surfaces.map((s2, k) => ({ x: s2.x, y: s2.y, r: s2.r, square: s2.square, rEq: rEq[k], area: areas[k], fam: fam(k) })),
      // Φ per surface at each window length, per area, with ±2SE bands
      phiPerArea: aggA.map((a) => ({ w: a.w, perArea: a.mean.map((m, k) => m / a.w / areas[k]), sePerArea: a.se.map((m, k) => m / a.w / areas[k]) })),
      pNeg: aggA.map((a) => ({ w: a.w, pNeg: a.pNeg, se: a.pNegSe })),
      // W = 25 full-window stats (cross-checked against phase A)
      phiPerArea25: meanB.map((m, k) => m / W / areas[k]),
      pNeg25: pNegB,
      heatMean,
      ft: aggA.map((a) => ({ w: a.w, pts: a.mean.map((m, k) => [m / a.sd[k], a.pNeg[k]]), gauss: a.mean.map((m, k) => pNegGauss(m, a.sd[k])) })),
    };
    out.push(summary);
    raws.push({ cell: cell.name, perSeedA, perSeedB });
    writeRaw(`play-arrow-${cell.name}`, { cell: cell.name, knobs: cell.knobs, n: N, r: R, T, summary });
    log(`CELL ${cell.name} done in ${((Date.now() - tc0) / 1000).toFixed(0)}s: phiPerArea25 (A circles) = ${summary.phiPerArea25.slice(0, 7).map((v: number) => v.toFixed(4)).join(", ")}`);
    log(`  invariants ${JSON.stringify(inv)}, audit ${JSON.stringify(aud)}`);
  }

  log(`SUMMARY ${JSON.stringify(out)}`);
  const raw = writeRaw("play-arrow-all", { provenance: provenance(), summaries: out, raws });
  log(`raw ${raw.file} sha256 ${raw.sha256}`);
});

// Headless protocol driver for the oscillation-or-noise study on play/.
// Drives the page's probe over ensembles of paired seeds — wall-switch
// protocols (scenario A) and centre releases (scenario B) — several counting
// surfaces at once, and prints a compact summary per cell. The raw curves go
// to the scratch dir (never Git); the numbers are reported in the issue note.
//   node play/protocol.ts            full matrix
//   CELL="^B-m0" node play/protocol.ts    subset by name regex
//   SMOKE=1 node play/protocol.ts    tiny fast pass to validate plumbing
import { headless, writeRaw, provenance } from "../scripts/headless.ts";
import { SURF_A, SURF_B, areaOf } from "./billiard.ts";
import type { Surface } from "./billiard.ts";
import { sObs, spectrum, peaks, rmsEnvelope, linfit, dirsOnCircle, TABLE_PERIODS } from "./analyze.ts";

type Sample = { t: number; pin: number[]; cin: number; cout: number };
type Run = { t: number[]; pin: number[][] };
type Ens = { r: number; t: number[]; mean: number[][]; se: number[][]; std: number[][]; raw: Run[] };

const SMOKE = process.env.SMOKE === "1";
const only = process.env.CELL ? new RegExp(process.env.CELL) : null;
const R = SMOKE ? 4 : 32;
const log = (...a: unknown[]) => console.log(...a);

const A_BASE = { n: 50000, seed: 1, door: 0.08, walls: true, scatm: 0, startIn: true, startDisc: 0, spread: 0, surfaces: SURF_A };
const B_BASE = { n: 50000, seed: 1, door: 0, walls: false, scatm: 0, startIn: false, startDisc: 0.01, spread: 0, surfaces: SURF_B };
/** B sample schedule: fine early, coarse later (t < 500 → 5, else 10). */
const chunkB = (t: number) => (t < 500 ? 5 : 10);
const A_T = (tOff: number) => tOff + (SMOKE ? 200 : 2500);
const B_T = SMOKE ? 600 : 8000;

type Cell = {
  name: string;
  base: Record<string, unknown>;
  r: number;
  T: number;
  chunk: number | ((t: number) => number);
  flip?: { at: number; on: boolean };
  kind: "a" | "b";
};

const CELLS: Cell[] = [
  { name: "A-t150", kind: "a", base: { ...A_BASE }, r: R, T: A_T(150), chunk: 5, flip: { at: 150, on: false } },
  { name: "A-t600", kind: "a", base: { ...A_BASE }, r: R, T: A_T(600), chunk: 5, flip: { at: 600, on: false } },
  { name: "A-t2000", kind: "a", base: { ...A_BASE }, r: R, T: A_T(2000), chunk: 5, flip: { at: 2000, on: false } },
  { name: "A-t600-sinai", kind: "a", base: { ...A_BASE, scatm: 1 }, r: R, T: A_T(600), chunk: 5, flip: { at: 600, on: false } },
  { name: "A-t2000-sinai", kind: "a", base: { ...A_BASE, scatm: 1 }, r: R, T: A_T(2000), chunk: 5, flip: { at: 2000, on: false } },
  { name: "A-t600-spread", kind: "a", base: { ...A_BASE, spread: 0.25 }, r: R, T: A_T(600), chunk: 5, flip: { at: 600, on: false } },
  { name: "A-rev600", kind: "a", base: { ...A_BASE, walls: false }, r: R, T: 600 + (SMOKE ? 200 : 2000), chunk: 5, flip: { at: 600, on: true } },
  { name: "A-rev2000", kind: "a", base: { ...A_BASE, walls: false }, r: R, T: 2000 + (SMOKE ? 200 : 1500), chunk: 5, flip: { at: 2000, on: true } },
  { name: "A-t600-N12500", kind: "a", base: { ...A_BASE, n: 12500 }, r: R, T: A_T(600), chunk: 5, flip: { at: 600, on: false } },
  { name: "A-t600-N200000", kind: "a", base: { ...A_BASE, n: 200000 }, r: R, T: A_T(600), chunk: 5, flip: { at: 600, on: false } },
  { name: "B-m0", kind: "b", base: { ...B_BASE }, r: R, T: B_T, chunk: chunkB },
  { name: "B-m1", kind: "b", base: { ...B_BASE, scatm: 1 }, r: R, T: B_T, chunk: chunkB },
  { name: "B-m4", kind: "b", base: { ...B_BASE, scatm: 4 }, r: R, T: B_T, chunk: chunkB },
  { name: "B-m9", kind: "b", base: { ...B_BASE, scatm: 9 }, r: R, T: B_T, chunk: chunkB },
  { name: "B-m0-spread", kind: "b", base: { ...B_BASE, spread: 0.25 }, r: R, T: B_T, chunk: chunkB },
  { name: "B-m0-N12500", kind: "b", base: { ...B_BASE, n: 12500 }, r: R, T: B_T, chunk: chunkB },
  { name: "B-m0-N200000", kind: "b", base: { ...B_BASE, n: 200000 }, r: SMOKE ? R : 16, T: B_T, chunk: chunkB },
  { name: "B-m0-point", kind: "b", base: { ...B_BASE, startDisc: 0 }, r: R, T: B_T, chunk: chunkB },
];

const summaries: Record<string, unknown>[] = [];
const raws: Record<string, unknown>[] = [];

await headless("play/", async (ev) => {
  const t0 = Date.now();
  log(`adapter ${JSON.stringify(await ev("probe.adapter"))}`);
  log(`provenance ${JSON.stringify(provenance())}`);
  const reset = (patch: Record<string, unknown>) => ev(`probe.reset(${JSON.stringify(patch)})`);
  const run = (k: number) => ev(`probe.run(${k}, false)`) as Promise<Sample>;
  const setWalls = (on: boolean) => ev(`probe.setWalls(${on})`);

  const series = async (cell: Cell): Promise<Ens> => {
    const base = cell.base;
    const K = (base.surfaces as Surface[]).length;
    const raw: Run[] = [];
    for (let s = 0; s < cell.r; s++) {
      await reset({ ...base, seed: (base.seed as number) + s });
      const t: number[] = [];
      const pin: number[][] = Array.from({ length: K }, () => []);
      let now = 0;
      let flipped = false;
      while (now < cell.T) {
        let c = typeof cell.chunk === "function" ? cell.chunk(now) : cell.chunk;
        let k = Math.min(c, cell.T - now);
        if (cell.flip && !flipped) k = Math.min(k, cell.flip.at - now);
        if (k < 1) k = 1;
        const r = await run(k);
        t.push(r.t);
        r.pin.forEach((p, i) => pin[i].push(p));
        now = r.t;
        if (cell.flip && !flipped && now >= cell.flip.at) {
          await setWalls(cell.flip.on);
          flipped = true;
        }
      }
      raw.push({ t, pin });
    }
    const t = raw[0].t;
    const mean = Array.from({ length: K }, (_, k) => t.map((_, i) => raw.reduce((s, r) => s + r.pin[k][i], 0) / cell.r));
    const std = Array.from({ length: K }, (_, k) =>
      t.map((_, i) => {
        const m = mean[k][i];
        return Math.sqrt(raw.reduce((s, r) => s + (r.pin[k][i] - m) ** 2, 0) / (cell.r - 1));
      }),
    );
    const se = std.map((a) => a.map((v) => v / Math.sqrt(cell.r)));
    return { r: cell.r, t, mean, se, std, raw };
  };

  // ── scenario A: ringing after the walls are switched off (or on) ──────────
  const analyseA = (cell: Cell, ens: Ens) => {
    const surfs = cell.base.surfaces as Surface[];
    const n = cell.base.n as number;
    const at = cell.flip!.at;
    const a0 = areaOf(surfs[0]);
    const dt = ens.t[1] - ens.t[0];
    const i0 = ens.t.findIndex((tt) => tt > at); // first sample strictly after the switch
    const t = ens.t.slice(i0).map((tt) => tt - at);
    const dev = ens.mean[0].slice(i0).map((p) => p - a0);
    const se = ens.se[0].slice(i0);
    const dev0 = Math.abs(dev[0]); // how far from equilibrium the switch itself finds the gas
    const amp150 = Math.max(...dev.filter((_, j) => t[j] <= 150).map(Math.abs));
    const ampRing = Math.max(...dev.filter((_, j) => t[j] > 100 && t[j] <= 600).map(Math.abs));
    const tailIdx = t.map((tt, j) => j).filter((j) => t[j] >= (cell.T - at) - 700);
    const seTail = tailIdx.reduce((s, j) => s + se[j], 0) / tailIdx.length;
    const noise = tailIdx.reduce((s, j) => s + ens.std[0][i0 + j], 0) / tailIdx.length;
    const mt = tailIdx.map((j) => dev[j]);
    const mbar = mt.reduce((s, v) => s + v, 0) / mt.length;
    const cohTail = Math.sqrt(Math.max(0, mt.reduce((s, v) => s + (v - mbar) ** 2, 0) / mt.length - seTail ** 2));
    const env = rmsEnvelope(dev, 200, dt);
    const fitPts = env.filter((e) => e.t >= 25 && e.r > 4 * seTail && e.t <= (cell.T - at) - 100);
    const fitExp = fitPts.length >= 4 ? linfit(fitPts.map((e) => e.t), fitPts.map((e) => Math.log(e.r))) : null;
    const fitPow = fitPts.length >= 4 ? linfit(fitPts.map((e) => Math.log(e.t)), fitPts.map((e) => Math.log(e.r))) : null;
    const sp = spectrum(dev.slice(1), dt);
    const top = peaks(sp.f, sp.a, 8).filter((p) => p.f >= 0.004 && p.f <= 0.06);
    const family = top.slice(0, 5).map((p) => {
      const best = TABLE_PERIODS.reduce((b, q) => (Math.abs(1 / p.f - q.period) < Math.abs(1 / p.f - b.period) ? q : b));
      return { period: +(1 / p.f).toFixed(1), m2n2: best.j, err: +Math.abs(1 / p.f - best.period).toExponential(1) };
    });
    // S_obs monotonicity during the walls-on phase (the leak), ensemble mean
    const pre = ens.t.map((tt, i) => i).filter((i) => ens.t[i] < at && i > 0);
    const sp0 = pre.map((i) => sObs(ens.mean[0][i], a0));
    let dips = 0;
    for (let j = 1; j < sp0.length; j++) if (sp0[j] < sp0[j - 1] - 1e-12) dips++;
    // R-scaling of the noise: split the seeds into halves, compare tail spread
    const half = Math.floor(cell.r / 2);
    const meanOf = (rs: Run[]) => rs[0].t.map((_, i) => rs.reduce((s, r) => s + r.pin[0][i], 0) / rs.length);
    const h1 = meanOf(ens.raw.slice(0, half));
    const h2 = meanOf(ens.raw.slice(half));
    const full = meanOf(ens.raw);
    const spreadOf = (a: number[]) => {
      const m = a.reduce((s, v) => s + v, 0) / a.length;
      return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
    };
    const j0 = Math.max(1, ens.t.findIndex((tt) => tt >= at));
    const single = spreadOf(ens.raw.map((r) => r.pin[0][r.pin[0].length - 1]));
    const noisePred = Math.sqrt((a0 * (1 - a0)) / n);
    return {
      cell: cell.name,
      at,
      n,
      r: cell.r,
      a0,
      dev0,
      amp150,
      ampRing,
      seTail,
      cohTail,
      noise,
      noisePred,
      halfSpread: [spreadOf(h1.slice(j0).slice(-140)), spreadOf(h2.slice(j0).slice(-140)), spreadOf(full.slice(j0).slice(-140))],
      singleSeedTail: single,
      env: env.filter((_, i) => i % 4 === 0).map((e) => [Math.round(e.t), +e.r.toExponential(2)]),
      fitExp: fitExp ? { rate: +fitExp.slope.toFixed(5), r2: +fitExp.r2.toFixed(3), tHalf: Math.LN2 / -fitExp.slope } : null,
      fitPow: fitPow ? { exponent: +fitPow.slope.toFixed(3), r2: +fitPow.r2.toFixed(3) } : null,
      peaks: top.slice(0, 5).map((p) => ({ period: +(1 / p.f).toFixed(1), amp: +p.a.toExponential(2) })),
      family,
      sObsRise: { from: +sp0[0].toFixed(3), to: +sp0[sp0.length - 1].toFixed(3), dipsInMean: dips, samples: pre.length },
    };
  };

  // ── scenario B: release from the centre; revivals and their decay ────────
  const analyseB = (cell: Cell, ens: Ens) => {
    const surfs = cell.base.surfaces as Surface[];
    const n = cell.base.n as number;
    const a0 = areaOf(surfs[0]);
    const a1 = areaOf(surfs[1]);
    const a3 = areaOf(surfs[3]);
    const revs: { k: number; dirs: number; h1: number; h0: number }[] = [];
    for (let k = 1; 100 * k <= cell.T; k++) {
      const tc = 100 * k;
      const idx = ens.t.map((tt, i) => i).filter((i) => Math.abs(ens.t[i] - tc) <= 15);
      if (idx.length < 2) continue;
      revs.push({
        k,
        dirs: dirsOnCircle(k),
        h1: Math.max(...idx.map((i) => ens.mean[1][i])) - a1,
        h0: Math.max(...idx.map((i) => ens.mean[0][i])) - a0,
      });
    }
    const seBar = ens.se[1].reduce((s, v) => s + v, 0) / ens.se[1].length;
    const res = revs.filter((v) => v.h1 > 8 * seBar);
    const fitPow = res.length >= 4 ? linfit(res.map((v) => Math.log(v.k)), res.map((v) => Math.log(v.h1))) : null;
    const fitExp = res.length >= 4 ? linfit(res.map((v) => 100 * v.k), res.map((v) => Math.log(v.h1))) : null;
    // late-time residual: coherent part of the mean vs the noise floor
    const i600 = ens.t.findIndex((tt) => tt >= 600);
    const tailIdx = ens.t.map((tt, i) => i).filter((i) => ens.t[i] >= cell.T - 700);
    const m0 = tailIdx.map((i) => ens.mean[0][i] - a0);
    const mbar = m0.reduce((s, v) => s + v, 0) / m0.length;
    const cohTail = Math.sqrt(Math.max(0, m0.reduce((s, v) => s + (v - mbar) ** 2, 0) / m0.length - (ens.se[0][i600] ?? 0) ** 2));
    const noise = tailIdx.reduce((s, i) => s + ens.std[0][i], 0) / tailIdx.length;
    const noisePred = Math.sqrt((a0 * (1 - a0)) / n);
    // envelope of the smooth ringing on the coarse uniform stretch (t ≥ 600, dt 10)
    const y = ens.t.map((tt, i) => i).filter((i) => ens.t[i] >= 600);
    const env = rmsEnvelope(y.map((i) => ens.mean[0][i] - a0), 200, 10);
    const seTail = ens.se[0].slice(y[0]).reduce((s, v) => s + v, 0) / (ens.t.length - y[0]);
    const fitPts = env.filter((e) => e.r > 4 * seTail && e.t <= cell.T - 100);
    const envPow = fitPts.length >= 4 ? linfit(fitPts.map((e) => Math.log(e.t)), fitPts.map((e) => Math.log(e.r))) : null;
    const envExp = fitPts.length >= 4 ? linfit(fitPts.map((e) => e.t + 600), fitPts.map((e) => Math.log(e.r))) : null;
    // a far-away control surface must show no revivals
    const far = revs.slice(0, 6).map((v) => ({ k: v.k, h3: Math.max(...ens.t.map((tt, i) => i).filter((i) => Math.abs(ens.t[i] - 100 * v.k) <= 15).map((i) => ens.mean[3][i])) - a3 }));
    return {
      cell: cell.name,
      n,
      r: cell.r,
      scatm: cell.base.scatm,
      spread: cell.base.spread,
      startDisc: cell.base.startDisc,
      a0,
      a1,
      seBar,
      revs: revs.filter((v) => v.k <= 12 || v.k % 5 === 0 || v.dirs > 4).map((v) => ({ k: v.k, dirs: v.dirs, h1: +v.h1.toExponential(2), h0: +v.h0.toExponential(2) })),
      nResolved: res.length,
      fitPow: fitPow ? { exponent: +fitPow.slope.toFixed(3), r2: +fitPow.r2.toFixed(3) } : null,
      fitExp: fitExp ? { rate: +fitExp.slope.toFixed(5), r2: +fitExp.r2.toFixed(3), tDecay: 1 / -fitExp.slope } : null,
      cohTail,
      seTail,
      noise,
      noisePred,
      envPow: envPow ? { exponent: +envPow.slope.toFixed(3), r2: +envPow.r2.toFixed(3) } : null,
      envExp: envExp ? { rate: +envExp.slope.toFixed(5), r2: +envExp.r2.toFixed(3), tDecay: 1 / -envExp.slope } : null,
      farControl: far,
    };
  };

  for (const cell of CELLS) {
    if (only && !only.test(cell.name)) continue;
    const tc0 = Date.now();
    const ens = await series(cell);
    const s = cell.kind === "a" ? analyseA(cell, ens) : analyseB(cell, ens);
    summaries.push(s);
    raws.push({ cell: cell.name, cfg: cell.base, r: cell.r, T: cell.T, t: ens.t, mean: ens.mean, se: ens.se, std: ens.std });
    writeRaw(`play-osc-${cell.name}`, { cell: cell.name, cfg: cell.base, r: cell.r, T: cell.T, t: ens.t, mean: ens.mean, se: ens.se, std: ens.std });
    log(`CELL ${JSON.stringify(s)}`);
    log(`  ${cell.name}: ${cell.r} seeds × ${cell.T} steps in ${((Date.now() - tc0) / 1000).toFixed(0)}s`);
    const audit = await ev("probe.audit(4096)");
    if (audit.nan || audit.escaped || audit.inScat || audit.speedErr > 1e-5) log(`  AUDIT FAIL ${JSON.stringify(audit)}`);
  }
});

log(`SUMMARY ${JSON.stringify(summaries)}`);
const raw = writeRaw("play-oscillation-noise", { provenance: provenance(), summaries, raws });
log(`raw ${raw.file} sha256 ${raw.sha256}`);

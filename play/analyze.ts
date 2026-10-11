// Shared numeric analysis for the playground page, the checks and the sweep
// driver: the two-cell observational entropy, region areas clipped to the
// table, the cell flux/occupancy fields, and Gaussian tail probabilities.

import type { Surf } from "./billiard.ts";

/** Volume-weighted (observational) coarse entropy per particle, in nats:
 * S_obs = −p ln(p/a) − (1−p) ln((1−p)/(1−a)) = ln A_table − D(p‖a); for the
 * unit table this is −D(p‖a), maximal (0) exactly at the equilibrium p = a. */
export const sObs = (p: number, a: number) => {
  const t1 = p <= 0 ? 0 : p * Math.log(p / a);
  const t2 = p >= 1 ? 0 : (1 - p) * Math.log((1 - p) / (1 - a));
  return -(t1 + t2);
};

/** Region area as a fraction of the table. Squares: exact rectangle clip.
 * Circles: πr² when the disc fits, else a 4096² cell-centre supersample
 * (relative error ≲ 1e-3; only reachable by tapping a point near a wall). */
export function areaOf(s: Surf): number {
  const lo = { x: Math.max(0, s.x - s.r), y: Math.max(0, s.y - s.r) };
  const hi = { x: Math.min(1, s.x + s.r), y: Math.min(1, s.y + s.r) };
  if (s.square) return Math.max(0, hi.x - lo.x) * Math.max(0, hi.y - lo.y);
  const unclipped = s.x - s.r >= 0 && s.x + s.r <= 1 && s.y - s.r >= 0 && s.y + s.r <= 1;
  if (unclipped) return Math.PI * s.r * s.r;
  const m = 4096;
  let c = 0;
  const r2 = s.r * s.r;
  for (let j = 0; j < m; j++) {
    const y = lo.y + ((j + 0.5) * (hi.y - lo.y)) / m;
    const dy = y - s.y;
    const w2 = r2 - dy * dy;
    if (w2 <= 0) continue;
    const w = Math.sqrt(w2);
    const xa = Math.max(lo.x, s.x - w);
    const xb = Math.min(hi.x, s.x + w);
    if (xb > xa) c += Math.round(((xb - xa) * m) / (hi.x - lo.x));
  }
  return (c * (hi.x - lo.x) * (hi.y - lo.y)) / (m * m);
}

/** Equivalent radius of a region: √(area/π). Circles and equal-area squares
 * share an x position on the r axis. */
export const rEqOf = (s: Surf) => Math.sqrt(areaOf(s) / Math.PI);

/** Directions of the per-cell crossing tallies in flux: R, L, up, down. */
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];
const OPP = [1, 0, 3, 2];

/** The local fields of one window, from the directed edge tallies `flux`
 * (crossings leaving each cell in each direction, accumulated over the
 * window) and the window-start occupancy `occPrev`:
 *  - sigma[c] = Σ_e (J_e/N)·ln((n_c+½)/(n_e+½)): the cell's entropy
 *    production per particle over the window, edges to the four neighbours;
 *    J_e is the net count leaving c through edge e and the +½ pseudo-count
 *    keeps the log finite in empty cells (all cells have equal area).
 *  - div[c] = Σ_e J_e: the raw net outflow, the discrete divergence of J. */
export function cellFields(flux: Uint32Array, occPrev: Uint32Array, C: number, n: number) {
  const sigma = new Float64Array(C * C);
  const div = new Float64Array(C * C);
  for (let j = 0; j < C; j++) {
    for (let i = 0; i < C; i++) {
      const c = j * C + i;
      for (let d = 0; d < 4; d++) {
        const ni = i + DX[d];
        const nj = j + DY[d];
        if (ni < 0 || ni >= C || nj < 0 || nj >= C) continue;
        const e = nj * C + ni;
        const J = flux[c * 4 + d] - flux[e * 4 + OPP[d]];
        div[c] += J;
        sigma[c] += (J / n) * Math.log((occPrev[c] + 0.5) / (occPrev[e] + 0.5));
      }
    }
  }
  return { sigma, div };
}

/** Ordinary least squares y = slope·x + intercept, with R². */
export function linfit(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: (sxy * sxy) / (sxx * syy) };
}

/** Error function, Abramowitz–Stegun 7.1.26 (|ε| ≤ 1.5e-7). */
export function erf(x: number) {
  const s = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return s * y;
}

/** Gaussian tail probability P(X < 0) for X ~ N(mean, sd²). */
export const pNegGauss = (mean: number, sd: number) =>
  sd <= 0 ? (mean < 0 ? 1 : mean > 0 ? 0 : 0.5) : 0.5 * (1 - erf(mean / (Math.SQRT2 * sd)));

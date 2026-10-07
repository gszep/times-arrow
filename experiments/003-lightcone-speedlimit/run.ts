// The pre-registered 003 protocol: the profile walker ensemble on the GPU
// with bit-exact integer measurements (per-(seed, step) tallies and hop
// counts, per-(window, column) and per-(display time, column) occupancy
// sums, cone and packing checks, the wind/windXOR damage pair), pooled on
// the host in f64 per the stated trust boundary. Everything the estimators
// consume comes from score.ts, the one committed source.
import { watchDevice } from "../../src/gpu.ts";
import { Walk, decodeX, decodeY } from "../../src/walk.ts";
import type { ProfileRun } from "../../src/walk.ts";
import {
  ARMS, ARM_NAMES, REG, circleW1, ehatOf, gridOf, meanDist, profileCounts,
  profileLayout, protocolOf, sigmaOf, tCrossOf, windowsOf,
} from "./score.ts";
import type { ArmName, ConeArm } from "./score.ts";

export type RunConfig = { R: number; blocks?: number; n?: number; m?: number; T?: number };

/** The registered shape of one arm's run. */
const shape = (cfg: RunConfig) => {
  const n = cfg.n ?? REG.n;
  const m = cfg.m ?? REG.m;
  const T = cfg.T ?? REG.T;
  const R = cfg.R;
  const blocks = cfg.blocks ?? REG.blocks;
  const windows = windowsOf(T);
  const grid = gridOf(T);
  return { n, m, T, R, blocks, windows, grid, layout: profileLayout(T), batch: Math.min(blocks, R) };
};

/** Host accumulators of one arm over all batches (f64 pooling of integer
 * GPU counts — every pooled sum stays far below 2⁵³). */
class Pool {
  private readonly cfg: ReturnType<typeof shape>;
  private readonly occupancy: boolean;
  readonly tallyTotal: number[];
  readonly hops1: number[];
  readonly coneMax: number[];
  readonly yAny: number[];
  W1: number[][];
  meanD: number[][];
  readonly pooledWin: Float64Array;
  readonly pooledHops: Float64Array;

  constructor(cfg: ReturnType<typeof shape>, occupancy: boolean) {
    this.cfg = cfg;
    this.occupancy = occupancy;
    this.tallyTotal = Array(cfg.R).fill(0);
    this.hops1 = Array(cfg.R).fill(0);
    this.coneMax = Array(cfg.R).fill(0);
    this.yAny = Array(cfg.R).fill(0);
    this.W1 = Array.from({ length: cfg.R }, () => Array(cfg.grid.length).fill(0));
    this.meanD = Array.from({ length: cfg.R }, () => Array(cfg.grid.length).fill(0));
    this.pooledWin = new Float64Array(occupancy ? cfg.windows.length * cfg.n : 0);
    this.pooledHops = new Float64Array(cfg.windows.length);
  }

  /** Fold one profile batch's readback, seeds `[r0, r0 + batch)`. */
  fold(run: ProfileRun, r0: number): void {
    const { n, m, T, windows, grid, batch } = this.cfg;
    const profile = profileCounts(n, m);
    for (let r = 0; r < batch; r++) {
      const seed = r0 + r;
      if (seed >= this.cfg.R) break;
      let total = 0;
      for (let t = 0; t < T; t++) total += run.tallies[r * T + t];
      this.tallyTotal[seed] = total;
      this.hops1[seed] = run.hops[r * T];
      this.coneMax[seed] = run.chk[2 * r];
      this.yAny[seed] = run.chk[2 * r + 1];
      for (let k = 0; k < windows.length; k++) {
        const [b, e] = windows[k];
        let hops = 0;
        for (let s = b; s < e; s++) hops += run.hops[r * T + s];
        this.pooledHops[k] += hops;
        if (run.win) {
          const base = (r * windows.length + k) * n;
          for (let x = 0; x < n; x++) this.pooledWin[k * n + x] += run.win[base + x];
        }
      }
      if (run.dhist) {
        for (let g = 0; g < grid.length; g++) {
          const base = (r * grid.length + g) * n;
          const counts = run.dhist.subarray(base, base + n);
          this.W1[seed][g] = circleW1(counts, profile);
          this.meanD[seed][g] = meanDist(counts, n);
        }
      }
    }
  }

  /** The committed per-arm record (the pooled window statistics and the
   * per-seed grid measurements). */
  reduce(arm: ArmName): ConeArm {
    const { n, m, T, R, blocks, windows } = this.cfg;
    const a = (ARMS[arm].e + ARMS[arm].w) / 256;
    const sigmaKappa: number[] = [];
    const zeroSites: [number, number][] = [];
    for (let k = 0; k < windows.length; k++) {
      const pooled = this.pooledWin.subarray(k * n, (k + 1) * n);
      const { sigma, zeroSite } = sigmaOf(pooled, arm, R * m * (windows[k][1] - windows[k][0]));
      sigmaKappa.push(sigma);
      if (zeroSite) for (let x = 0; x < n; x++) if (pooled[x] === 0) zeroSites.push([k, x]);
    }
    const Ehat = ehatOf(sigmaKappa, windows, a);
    const base: ConeArm = {
      arm, n, m, T, R, blocks,
      tallyTotal: this.tallyTotal,
      hops1: this.hops1,
      hopsWin: Array.from(this.pooledHops),
      sigmaKappa,
      Ehat,
      tCross: tCrossOf(Ehat, windows),
      W1: this.W1,
      meanD: this.meanD,
      coneMax: this.coneMax,
      yAny: this.yAny,
      ...(zeroSites.length ? { zeroSites } : {}),
    };
    // h8 keeps the pooled window occupancy in the committed compact form:
    // the P gate recomputes σ̂ from the raw counts through the same estimator
    if (arm === "h8")
      base.winPooled = Array.from({ length: windows.length }, (_, k) =>
        Array.from(this.pooledWin.subarray(k * n, (k + 1) * n)));
    return base;
  }
}

/** One arm of the ensemble: `R` seeds of the profile protocol, reduced to
 * the per-seed records and the pooled window statistics. */
export async function runArm(device: GPUDevice, cfg: RunConfig & { arm: ArmName }): Promise<ConeArm> {
  const s = shape(cfg);
  const solo = cfg.arm === "windXOR"; // solo control run: no occupancy statistics
  const walk = new Walk(device, {
    n: s.n, m: s.m, T: s.T, batch: s.batch,
    win: solo ? 0 : s.windows.length,
    grid: solo ? 0 : s.grid.length,
  });
  walk.setProtocol(protocolOf(cfg.arm, s.T));
  const watch = watchDevice(device);
  const pool = new Pool(s, !solo);
  for (let done = 0; done < s.R; done += s.batch) {
    const run = await watch.race(
      walk.profileBatch(1 + done, s.layout, { win: !solo, grid: !solo }),
    );
    pool.fold(run, done);
  }
  walk.destroy();
  return solo
    ? { arm: "windXOR", n: s.n, m: s.m, T: s.T, R: s.R, blocks: s.blocks,
        tallyTotal: pool.tallyTotal, hops1: pool.hops1, coneMax: pool.coneMax, yAny: pool.yAny }
    : pool.reduce(cfg.arm);
}

/** The wind + windXOR pair: both arms run seed for seed, and the damage
 * control X1 is verified per walker — `x_XOR = x_wind − 2·I mod n`, the
 * step-1 damage indicator time-invariant (never grows, never heals), y
 * untouched — with the per-seed damaged counts. The wind arm carries the
 * full measurements; windXOR carries tallies, checks and damage records. */
export async function runPair(device: GPUDevice, cfg: RunConfig): Promise<{ wind: ConeArm; windXOR: ConeArm }> {
  const s = shape(cfg);
  const wind = new Walk(device, { n: s.n, m: s.m, T: s.T, batch: s.batch, win: s.windows.length, grid: s.grid.length });
  const xor = new Walk(device, { n: s.n, m: s.m, T: s.T, batch: s.batch });
  wind.setProtocol(protocolOf("wind", s.T));
  xor.setProtocol(protocolOf("windXOR", s.T));
  const watch = watchDevice(device);
  const poolW = new Pool(s, true);
  const poolX = new Pool(s, false);
  const damaged = Array(s.R).fill(0);
  let identityOk = true;
  for (let done = 0; done < s.R; done += s.batch) {
    const b = Math.min(s.batch, s.R - done);
    const rw = await watch.race(wind.profileBatch(1 + done, s.layout, { win: true, grid: true, pos: true, pos1: true }));
    const rx = await watch.race(xor.profileBatch(1 + done, s.layout, { pos: true, pos1: true }));
    poolW.fold(rw, done);
    poolX.fold(rx, done);
    // X1: per walker over the whole paired batch
    for (let j = 0; j < b * s.m; j++) {
      const yw = decodeY(rw.posT![j]);
      const yx = decodeY(rx.posT![j]);
      const d1 = (decodeX(rw.pos1![j]) - decodeX(rx.pos1![j]) + s.n) % s.n;
      const dT = (decodeX(rw.posT![j]) - decodeX(rx.posT![j]) + s.n) % s.n;
      // the mirror damages exactly the draws in [3, 125): δ ∈ {0, 2}
      if (yw !== yx || d1 !== 0 && d1 !== 2 || dT !== d1) identityOk = false;
      if (d1 === 2) damaged[done + Math.floor(j / s.m)]++;
    }
  }
  wind.destroy();
  xor.destroy();
  return {
    wind: poolW.reduce("wind"),
    windXOR: {
      arm: "windXOR", n: s.n, m: s.m, T: s.T, R: s.R, blocks: s.blocks,
      tallyTotal: poolX.tallyTotal, hops1: poolX.hops1,
      coneMax: poolX.coneMax, yAny: poolX.yAny,
      damaged, identityOk,
    },
  };
}

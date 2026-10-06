// The pre-registered 002 protocol: the walker ensemble on the GPU with
// bit-exact tallies, the corner with its f64 HMM coarse-graining, and the
// run driver used by both the review page and the sweep. Everything
// integer (tallies, edge counts, region counts) is bit-exact; σ and σ_cg
// are f64 per the stated trust boundary.
import type { Adapter } from "../../src/gpu.ts";
import { Walk } from "../../src/walk.ts";
import { ARMS, protocolOf, sigma } from "./score.ts";
import type { ArmName, CornerPaths, CornerResult, MainArm } from "./score.ts";
import { buildHmm, sigmaCg } from "./hmm.ts";
import type { Hmm } from "./hmm.ts";

const MAIN_N = 8;
const MAIN_M = 16;
const CORNER_N = 4;
const CORNER_M = 4;
const CORNER_T = 32;

/** Watches `device.lost` for the lifetime of one run: every readback is
 * raced against it (a lost device can leave a pending readback hanging)
 * and the check throws the moment the promise has settled. `device.lost`
 * settles at most once and never rejects, so leftover subscriptions from
 * finished runs are inert. */
export function watchDevice(device: GPUDevice) {
  let info: GPUDeviceLostInfo | null = null;
  const lost = device.lost.then((i) => {
    info = i;
  });
  const err = () => new Error(`device lost: ${info?.reason ?? "unknown"}, ${info?.message ?? ""}`);
  const check = () => {
    if (info) throw err();
  };
  const race = async <T>(readback: Promise<T>): Promise<T> => {
    const first = await Promise.race([readback.then((r) => ({ r })), lost.then(() => ({ err: err() }))]);
    if ("err" in first) throw first.err;
    check();
    return first.r;
  };
  return { check, race };
}

/** the left half {x < n/2} — reflection-symmetric, hence exactly blind */
export function halfMask(n: number): Uint32Array {
  const mask = new Uint32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n / 2; x++) mask[y * n + x] = 1;
  return mask;
}

/** the L A = {(0,0), (1,0), (0,1)} (x + y ≤ 1 on the 4×4 torus) — the
 * minimal region fixed by no driven→reversed conjugacy */
export function lMask(n: number): Uint32Array {
  const mask = new Uint32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) mask[y * n + x] = x + y <= 1 ? 1 : 0;
  return mask;
}

const sortedPairs = (m: Map<number, number>): [number, number][] =>
  [...m].sort((a, b) => a[0] - b[0]);

export type MainConfig = {
  arm: ArmName;
  T: number;
  R: number;
  blocks?: number;
  n?: number;
  m?: number;
};

/** One arm of the main ensemble: `R` paths of `T` steps, seeds 1…R, reduced
 * to per-block tally histograms (the constant arms) or per-block σ sums and
 * a 0.5-nat histogram (the ramp arms — σ is not a lattice value there). */
export async function runMain(device: GPUDevice, cfg: MainConfig): Promise<MainArm> {
  const n = cfg.n ?? MAIN_N;
  const m = cfg.m ?? MAIN_M;
  const blocks = cfg.blocks ?? 16;
  const protocol = protocolOf(cfg.arm, cfg.T);
  const walk = new Walk(device, { n, m, T: cfg.T, batch: Math.min(4096, cfg.R) });
  walk.setProtocol(protocol);
  const watch = watchDevice(device);
  const { tallies } = await watch.race(walk.runSeeds(1, cfg.R));
  walk.destroy();
  const per = cfg.R / blocks;
  const block = (seed: number) => Math.min(blocks - 1, Math.floor(seed / per));
  if (cfg.arm === "ramp" || cfg.arm === "ramprev") {
    const blockSum = Array.from({ length: blocks }, () => 0);
    const blockSumSq = Array.from({ length: blocks }, () => 0);
    const hist = new Map<number, number>();
    for (let seed = 0; seed < cfg.R; seed++) {
      const sig = sigma(tallies.subarray(seed * cfg.T, (seed + 1) * cfg.T), protocol);
      const b = block(seed);
      blockSum[b] += sig;
      blockSumSq[b] += sig * sig;
      const bin = Math.floor(sig / 0.5);
      hist.set(bin, (hist.get(bin) ?? 0) + 1);
    }
    return { arm: cfg.arm, T: cfg.T, R: cfg.R, blocks, blockSum, blockSumSq, hist: sortedPairs(hist) };
  }
  const blockHist: [number, number][][] = Array.from({ length: blocks }, () => []);
  const blockMap = Array.from({ length: blocks }, () => new Map<number, number>());
  let maxAbs = 0;
  for (let seed = 0; seed < cfg.R; seed++) {
    const slice = tallies.subarray(seed * cfg.T, (seed + 1) * cfg.T);
    const sig = sigma(slice, protocol);
    maxAbs = Math.max(maxAbs, Math.abs(sig));
    let k = 0;
    for (let t = 0; t < cfg.T; t++) k += slice[t];
    const b = block(seed);
    blockMap[b].set(k, (blockMap[b].get(k) ?? 0) + 1);
  }
  for (let b = 0; b < blocks; b++) blockHist[b] = sortedPairs(blockMap[b]);
  return { arm: cfg.arm, T: cfg.T, R: cfg.R, blocks, blockHist, maxAbsSigma: maxAbs };
}

export type CornerConfig = { R: number; blocks?: number; T?: number; hmm?: Hmm };

/** The corner of K5: the 4×4 torus with M = 4 walkers, `R_c` paths of
 * `T_c` steps, with the fine σ, the boundary-crossing tally σ_∂ (from the
 * per-seed out-edge counts), the two region-count paths, and σ_cg of each
 * by the HMM's two forward passes. The null arm's reversed kernel equals
 * its forward kernel (q_E = q_W), so its σ_cg ≡ 0 is exact by the weights. */
export async function runCorner(device: GPUDevice, cfg: CornerConfig): Promise<CornerResult> {
  const n = CORNER_N;
  const m = CORNER_M;
  const T = cfg.T ?? CORNER_T;
  const blocks = cfg.blocks ?? 16;
  const half = halfMask(n);
  const l = lMask(n);
  const walk = new Walk(device, { n, m, T, batch: Math.min(1024, cfg.R) });
  walk.setRegions(half, l);
  const watch = watchDevice(device);
  const hmm = cfg.hmm ?? buildHmm(n, m, ARMS.driven, [half, l]);
  const inL = (x: number, y: number) => l[((y % n) + n) % n * n + ((x % n) + n) % n];

  const armRun = async (armName: "driven" | "null"): Promise<CornerPaths> => {
    const protocol = protocolOf(armName, T);
    walk.setProtocol(protocol);
    const run = await watch.race(walk.runSeeds(1, cfg.R, { edges: true, counts: true }));
    const paths: CornerPaths = { tally: [], cross: [], half: [], l: [], scgHalf: [], scgL: [], maxAbsSigma: 0 };
    const edges = 4 * n * n;
    for (let seed = 0; seed < cfg.R; seed++) {
      // σ_∂: an E-hop from (x, y) crosses ∂A iff A-membership differs
      // between (x, y) and (x+1, y) (wrapped); a W-hop, symmetrically.
      let cross = 0;
      for (let cell = 0; cell < n * n; cell++) {
        const x = cell % n;
        const y = (cell / n) | 0;
        const eHops = run.edges![seed * edges + 4 * cell];
        const wHops = run.edges![seed * edges + 4 * cell + 1];
        if (eHops && (inL(x, y) ? 0 : 1) !== (inL(x + 1, y) ? 0 : 1)) cross += eHops;
        if (wHops && (inL(x, y) ? 0 : 1) !== (inL(x - 1, y) ? 0 : 1)) cross -= wHops;
      }
      const slice = run.tallies.subarray(seed * T, (seed + 1) * T);
      const halfPath: number[] = [];
      const lPath: number[] = [];
      for (let t = 0; t <= T; t++) {
        halfPath.push(run.counts![(seed * (T + 1) + t) * 2]);
        lPath.push(run.counts![(seed * (T + 1) + t) * 2 + 1]);
      }
      paths.tally.push(slice.reduce((a, b) => a + b, 0));
      paths.cross.push(cross);
      paths.half.push(halfPath);
      paths.l.push(lPath);
      paths.maxAbsSigma = Math.max(paths.maxAbsSigma ?? 0, Math.abs(sigma(slice, protocol)));
      if (armName === "driven") {
        paths.scgHalf.push(sigmaCg(hmm, halfPath, 0, ARMS.driven, ARMS.reversed));
        paths.scgL.push(sigmaCg(hmm, lPath, 1, ARMS.driven, ARMS.reversed));
      } else {
        paths.scgHalf.push(sigmaCg(hmm, halfPath, 0, ARMS.null, ARMS.null));
        paths.scgL.push(sigmaCg(hmm, lPath, 1, ARMS.null, ARMS.null));
      }
    }
    return paths;
  };

  const nullArm = await armRun("null");
  const driven = await armRun("driven");
  walk.destroy();
  return { n, m, T, R: cfg.R, blocks, driven, null: nullArm };
}

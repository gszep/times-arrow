// One mandatory contract gate for check:gpu and the sweep, executed in the
// review page: integer trajectories/tallies, f64 σ, exact DP and the K5 HMM.
import contract from "../../contract.json" with { type: "json" };
import { Walk } from "../../src/walk.ts";
import { decodeX, decodeY } from "../../src/walk.ts";
import { watchDevice } from "../../src/gpu.ts";
import { ARMS, protocolOf, protocolTallyDp, sigma, tallyDp } from "./score.ts";
import type { ArmName } from "./score.ts";
import { buildHmm, countMarginal, pathProbability } from "./hmm.ts";
import { halfMask, lMask } from "./run.ts";

export type WalkVector = {
  seed: number; arm: string; n: number; m: number; t: number;
  state: string; nE: number; nW: number; tallies: number[]; sigma: number;
};
type Check = { name: string; pass: boolean; detail: string };
const close = (a: number, b: number) =>
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(b), 1e-300);

/** Same GPU path as the ensemble, with all readbacks in one mapped buffer. */
export async function walkVector(device: GPUDevice, g: Pick<WalkVector, "seed" | "arm" | "n" | "m" | "t">) {
  const protocol = protocolOf(g.arm as ArmName, Math.max(1, g.t));
  const walk = new Walk(device, { n: g.n, m: g.m, T: Math.max(1, g.t), batch: 1, edges: true });
  const watch = watchDevice(device);
  try {
    walk.setProtocol(protocol);
    walk.init(g.seed);
    for (let t = 1; t <= g.t; t++) walk.step(t, g.seed, true);
    const { pos, tallies, edges } = await watch.race(walk.snapshot());
    if (!edges) throw new Error("edge counts were not allocated");
    const counts = [0, 0];
    for (let i = 0; i < edges.length; i++) if (i % 4 < 2) counts[i % 4] += edges[i];
    const plain = g.t === 0 ? new Int32Array() : (await watch.race(walk.runSeeds(g.seed, 1))).tallies;
    return {
      state: Array.from(pos, (s) => `${decodeX(s).toString(16)}${decodeY(s).toString(16)}`).join(""),
      nE: counts[0], nW: counts[1], tallies: Array.from(tallies).slice(0, g.t),
      plainTallies: Array.from(plain), sigma: sigma(plain, protocol),
    };
  } finally { walk.destroy(); }
}

export function compareWalk(g: WalkVector, got: Awaited<ReturnType<typeof walkVector>>): Check[] {
  const name = `walk ${g.arm} seed ${g.seed}, n ${g.n}, m ${g.m}, t ${g.t}`;
  return [
    { name: `${name}: trajectory`, pass: got.state === g.state, detail: "" },
    { name: `${name}: tallies`, pass: got.nE === g.nE && got.nW === g.nW &&
      JSON.stringify(got.tallies) === JSON.stringify(g.tallies), detail: "" },
    { name: `${name}: ensemble tallies`, pass: JSON.stringify(got.plainTallies) === JSON.stringify(g.tallies), detail: "" },
    { name: `${name}: σ`, pass: Number.isFinite(g.sigma) && Number.isFinite(got.sigma) &&
      Math.abs(got.sigma - g.sigma) <= 1e-9, detail: `${got.sigma} vs ${g.sigma}` },
  ];
}

/** Throws on missing required families; no optional σ or skipped goldens. */
export async function checkWalk(device: GPUDevice): Promise<Check[]> {
  const walk = contract.walk;
  if (!walk?.golden?.length || !walk.dp || !walk.corner) throw new Error("missing contract.walk goldens, DP or corner");
  for (const arm of ["null", "driven", "reversed", "ramp", "ramprev"])
    if (!walk.golden.some((g) => g.arm === arm && Number.isFinite(g.sigma) && g.tallies?.length === g.t))
      throw new Error(`missing ${arm} trajectory/σ goldens`);
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });
  for (const g of walk.golden) checks.push(...compareWalk(g, await walkVector(device, g)));

  for (const arm of ["driven", "reversed", "null"] as const) {
    for (const T of arm === "null" ? [1, 4] : [1, 2, 4]) {
      const g = (walk.dp[arm] as Record<string, { e: number; den: string; bins: { k: number; num: string }[] }>)[T];
      if (!g || g.e !== 16 * T || g.bins.length !== 2 * g.e + 1) throw new Error(`missing ${arm} DP T=${T}`);
      // Independent BigInt recurrence checks every Lean rational numerator,
      // not only rounded probabilities (and also checks the f64 scorer).
      let nums = [1n];
      const q = ARMS[arm];
      for (let s = 0; s < g.e; s++) {
        const next = Array<bigint>(nums.length + 2).fill(0n);
        for (let i = 0; i < nums.length; i++)
          [q.w, q.n + q.s + q.zero, q.e].forEach((w, j) => { next[i + j] += nums[i] * BigInt(w); });
        nums = next;
      }
      const den = 256n ** BigInt(g.e);
      check(`DP ${arm} T=${T}: exact integers`, String(den) === g.den &&
        g.bins.every((b, i) => b.k === i - g.e && b.num === String(nums[i])));
      const got = tallyDp(16, T, q);
      check(`DP ${arm} T=${T}: f64`, g.bins.every((b, i) => close(got[i], Number(b.num) / Number(g.den))));
    }
  }
  const deep = walk.dp.driven["64f"];
  if (deep?.e !== 1024 || deep.bins.length !== 2049) throw new Error("missing T=64 DP");
  const got = tallyDp(16, 64, ARMS.driven);
  check("DP driven T=64: f64", deep.bins.every((p, i) => close(got[i], p)));
  check("DP T=64: registered mirror", Array.from({ length: 117 }, (_, i) => 70 + i).every((k) =>
    deep.bins[1024 + k] > 0 && deep.bins[1024 - k] > 0 &&
    Math.abs(Math.log(deep.bins[1024 + k] / deep.bins[1024 - k]) - k * Math.log(3)) < 1e-9));
  for (const arm of ["ramp", "ramprev"] as const) {
    const g = walk.dp[arm];
    if (g?.e !== 256 || g.bins.length !== 513) throw new Error(`missing ${arm} DP`);
    const got = protocolTallyDp(16, protocolOf(arm, 16));
    check(`DP ${arm}: f64 tally histogram`, g.bins.every((p, i) => close(got[i], p)));
  }

  const corner = walk.corner;
  if (corner.n !== 4 || corner.m !== 4 || corner.Tc !== 32) throw new Error("invalid corner configuration");
  const masks = [halfMask(4), lMask(4)];
  const hmm = buildHmm(4, 4, ARMS.driven, masks);
  for (const [r, name] of (["half", "L"] as const).entries()) {
    const g = corner[name];
    if (!g || g.k3driven.length !== 125 || g.k3reversed.length !== 125 ||
      ![2, 3, 4, 5].every((k) => g.kl.some((x) => x.k === k && Number.isFinite(x.kl))))
      throw new Error(`missing ${name} corner goldens`);
    const sites = new Set(g.sites.map(([x, y]) => x + 4 * y));
    check(`corner ${name}: region`, masks[r].every((v, s) => !!v === sites.has(s)));
    check(`corner ${name}: rational 3-time blindness`, g.k3driven.every((p, i) => p === g.k3reversed[i]) &&
      g.kl.find((v) => v.k === 3)!.kl === 0);
    for (const { k, kl } of g.kl) {
      const pf = countMarginal(hmm, r, k, ARMS.driven);
      const pr = countMarginal(hmm, r, k, ARMS.reversed);
      let measured = 0;
      for (let i = 0; i < pf.length; i++) if (pf[i] > 0) measured += pf[i] * Math.log(pf[i] / pr[i]);
      check(`corner ${name}: ${k}-time KL`, Number.isFinite(measured) && Math.abs(measured - kl) < 1e-9,
        `${measured} vs ${kl}`);
      check(`corner ${name}: ${k}-time normalization`, [pf, pr].every((p) => Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-12));
      if (k === 3) for (const [a, probs] of [["driven", pf], ["reversed", pr]] as const) {
        const rational = g[a === "driven" ? "k3driven" : "k3reversed"];
        check(`corner ${name}: ${a} rational table vs HMM`, rational.every((s, i) => {
          const [num, den] = s.split("/").map(Number);
          return close(probs[i], num / den);
        }));
        // Tie the all-path traversal to the per-path forward pass used by runs.
        check(`corner ${name}: ${a} path pass`, rational.every((_, i) => {
          const path = [i % 5, Math.floor(i / 5) % 5, Math.floor(i / 25)];
          return close(pathProbability(hmm, path, r, ARMS[a]), probs[i]);
        }));
      }
    }
  }
  return checks;
}

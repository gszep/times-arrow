// One mandatory contract gate for check:gpu and the sweep, executed in the
// review page: the f64 pipeline constants, a small bit-exact GPU self-check
// of every new kernel path, and the contract.walk.profile goldens the Lean
// lane exports (profile trajectories, per-time occupancies, window sums and
// the rational circle-W₁ values). Returns the checks and the list of
// contract keys still pending from the Lean lane.
import contract from "../../contract.json" with { type: "json" };
import { Walk, decodeX, decodeY } from "../../src/walk.ts";
import type { ProfileLayout } from "../../src/walk.ts";
import { watchDevice } from "../../src/gpu.ts";
import { REG, circleW1, exactLaw, gridOf, pipelineRows, profileCounts, profileLayout, protocolOf, windowsOf } from "./score.ts";
import type { ArmName } from "./score.ts";
import { runPair } from "./run.ts";

export type Check = { name: string; pass: boolean; detail?: string };
export type Gate = { checks: Check[]; pending: string[] };

/** The contract key the Lean lane must export for M1:
 * `contract.walk.profile = { golden, occupancy, windows, circleW1 }` —
 * golden: [{seed, arm, n, m, t, state, tallies, hops, nE, nW}] with the
 * profile start (state = one hex pair x,y per walker), occupancy:
 * [{seed, arm, n, m, t, cols: [t+1][n]}] per-time column counts, windows:
 * [{seed, arm, n, m, t, bounds: [[b,e]…], sums: [k][n]}] window-pooled
 * counts, circleW1: [{arm: "calm", t, num, den}] the rational population
 * W₁ (63/128, 189/256, 945/1024 at t = 1, 2, 3). Randomized differential
 * tests additionally need a `walkprofilejson SEED ARM N M T` command on
 * the timesarrow executable with the golden's shape. */
export const PROFILE_KEY = "profile";

/** The bit-exact GPU self-check on a small configuration: the deterministic
 * profile start, the occupancy passes, the cone/y checks, the max arm's
 * unit activity and the wind/windXOR damage identity — everything integer,
 * deterministic except the draws themselves. */
async function selfCheck(device: GPUDevice): Promise<Check[]> {
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });
  const n = 64, m = 4096, T = 8, batch = 2, R = 2;
  const windows = windowsOf(T);
  const gridTimes = gridOf(T);
  const layout = profileLayout(T);
  const profile = profileCounts(n, m);
  const watch = watchDevice(device);

  // the deterministic start itself: packed positions vs the host constructor
  const walk = new Walk(device, { n, m, T, batch, win: windows.length, grid: gridTimes.length });
  walk.initProfile(1);
  const pos = await watch.race(walk.positions());
  const want = new Uint32Array(batch * m);
  for (let r = 0; r < batch; r++) for (let j = 0; j < m; j++) want[r * m + j] = j % REG.stride === 0 ? (j / REG.stride) % n : 0;
  check(
    "003 self: the profile start is the registered constructor",
    pos.length === want.length && pos.every((v, i) => v === want[i]),
    `${[...pos.slice(0, 4)]} vs ${[...want.slice(0, 4)]}`,
  );

  // one measured arm through the whole production path
  walk.setProtocol(protocolOf("calm", T));
  const run = await watch.race(walk.profileBatch(1, layout, { win: true, grid: true }));
  const dhist = (r: number, g: number) => run.dhist!.subarray((r * gridTimes.length + g) * n, (r * gridTimes.length + g + 1) * n);
  check("003 self: time-0 occupancy is the deterministic profile", (() => {
    for (let r = 0; r < batch; r++) {
      const row = dhist(r, 0);
      for (let x = 0; x < n; x++) if (row[x] !== profile[x]) return false;
    }
    return true;
  })());
  check(
    "003 self: window occupancy sums are m·w_k",
    windows.every(([b, e], k) => {
      for (let r = 0; r < batch; r++) {
        let s = 0;
        for (let x = 0; x < n; x++) s += run.win![(r * windows.length + k) * n + x];
        if (s !== m * (e - b)) return false;
      }
      return true;
    }),
  );
  check(
    "003 self: display occupancy sums are m",
    gridTimes.every((_, g) => {
      for (let r = 0; r < batch; r++) {
        let s = 0;
        for (let x = 0; x < n; x++) s += dhist(r, g)[x];
        if (s !== m) return false;
      }
      return true;
    }),
  );
  check("003 self: Ŵ at time 0 is 0", (() => {
    for (let r = 0; r < batch; r++) if (circleW1(dhist(r, 0), profile) !== 0) return false;
    return true;
  })());
  check(
    "003 self: cone displacement ≤ T and y ≡ 0",
    run.chk.every((v, i) => (i % 2 === 0 ? v <= T : v === 0)),
    `chk ${[...run.chk]}`,
  );
  walk.destroy();

  // the max arm hops on every draw: activity ≡ 1
  const maxWalk = new Walk(device, { n, m, T, batch });
  maxWalk.setProtocol(protocolOf("max", T));
  const maxRun = await watch.race(maxWalk.profileBatch(1, layout));
  check("003 self: max's hop activity ≡ 1", maxRun.hops.every((h) => h === m), `${[...maxRun.hops]}`);
  maxWalk.destroy();

  // the wind/windXOR damage pair through the production path
  const { windXOR } = await runPair(device, { n, m, T, R, blocks: batch });
  check("003 self: the wind/windXOR damage identity holds", windXOR.identityOk === true);
  const damaged = windXOR.damaged!.reduce((a, b) => a + b, 0);
  check(
    "003 self: damaged counts lie in (0, R·m]",
    windXOR.damaged!.every((d) => d >= 0 && d <= m) && damaged > 0 && damaged <= R * m,
    `${damaged} damaged of ${R * m}`,
  );

  return checks;
}

/** Verify the contract.walk.profile goldens, bit for bit where integer. */
async function contractGoldens(device: GPUDevice, profile: any): Promise<Check[]> {
  const checks: Check[] = [];
  const check = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });
  const watch = watchDevice(device);
  for (const g of profile.golden ?? []) {
    const T = Math.max(1, g.t);
    const walk = new Walk(device, { n: g.n, m: g.m, T, batch: 1, edges: true });
    walk.setProtocol(protocolOf(g.arm as ArmName, T));
    walk.initProfile(g.seed);
    for (let t = 1; t <= T; t++) walk.step(t, g.seed, true);
    const snap = await watch.race(walk.snapshot());
    walk.destroy();
    const state = Array.from(snap.pos, (s) => `${decodeX(s).toString(16)}${decodeY(s).toString(16)}`).join("");
    const nE = snap.edges!.reduce((a, e, i) => a + (i % 4 === 0 ? e : 0), 0);
    const nW = snap.edges!.reduce((a, e, i) => a + (i % 4 === 1 ? e : 0), 0);
    check(
      `profile golden ${g.arm} seed ${g.seed}, n ${g.n}, m ${g.m}, t ${g.t}`,
      state === g.state && JSON.stringify(Array.from(snap.tallies)) === JSON.stringify(g.tallies) &&
        JSON.stringify(Array.from(snap.hops)) === JSON.stringify(g.hops) && nE === g.nE && nW === g.nW,
      state === g.state ? "" : "state differs",
    );
  }
  for (const o of profile.occupancy ?? []) {
    const T = o.t;
    const walk = new Walk(device, { n: o.n, m: o.m, T, batch: 1, win: T, grid: T + 1 });
    const layout: ProfileLayout = { winAt: new Int32Array(T), dispAt: new Int32Array(T + 1) };
    for (let t = 0; t < T; t++) layout.winAt[t] = t;
    for (let t = 0; t <= T; t++) layout.dispAt[t] = t;
    walk.setProtocol(protocolOf(o.arm as ArmName, T));
    const run = await watch.race(walk.profileBatch(o.seed, layout, { win: true, grid: true }));
    walk.destroy();
    check(
      `occupancy golden ${o.arm} seed ${o.seed}, n ${o.n}, m ${o.m}, t ${o.t}`,
      o.cols.every((row: number[], t: number) => row.every((v: number, x: number) => v === run.dhist![t * o.n + x])),
    );
  }
  for (const wk of profile.windows ?? []) {
    const T = wk.t;
    const bounds = wk.bounds as [number, number][];
    const walk = new Walk(device, { n: wk.n, m: wk.m, T, batch: 1, win: bounds.length, grid: 0 });
    const layout: ProfileLayout = { winAt: new Int32Array(T).fill(-1), dispAt: new Int32Array(T + 1).fill(-1) };
    bounds.forEach(([b, e], k) => {
      for (let t = b; t < e; t++) layout.winAt[t] = k;
    });
    walk.setProtocol(protocolOf(wk.arm as ArmName, T));
    const run = await watch.race(walk.profileBatch(wk.seed, layout, { win: true }));
    walk.destroy();
    check(
      `window golden ${wk.arm} seed ${wk.seed}, n ${wk.n}, m ${wk.m}, t ${wk.t}`,
      wk.sums.every((row: number[], k: number) => row.every((v: number, x: number) => v === run.win![k * wk.n + x])),
    );
  }
  for (const r of profile.circleW1 ?? []) {
    const law = exactLaw(r.arm as ArmName, { n: REG.n, m: REG.m, T: Math.max(r.t, 3) });
    const got = law.w1Grid[law.grid.indexOf(r.t)];
    check(`rational W₁ ${r.arm} t = ${r.t} (${r.num}/${r.den})`, Math.abs(got - Number(r.num) / Number(r.den)) <= 1e-14, `${got}`);
  }
  return checks;
}

/** The profile differential vector of one run on the GPU — exactly what
 * `timesarrow walkprofilejson` prints: the trajectory fields (state,
 * tallies, hops, nE, nW), the per-time column occupancy and the
 * registered window bounds with their pooled sums. One edges pass plus
 * one profile batch of the same seed, the same production paths the
 * goldens check. */
export async function profileVector(device: GPUDevice, g: { seed: number; arm: ArmName; n: number; m: number; t: number }) {
  const T = Math.max(1, g.t);
  const windows = windowsOf(T);
  const watch = watchDevice(device);
  const walk = new Walk(device, { n: g.n, m: g.m, T, batch: 1, edges: true, win: windows.length, grid: T + 1 });
  try {
    walk.setProtocol(protocolOf(g.arm, T));
    walk.initProfile(g.seed);
    for (let t = 1; t <= T; t++) walk.step(t, g.seed, true);
    const snap = await watch.race(walk.snapshot());
    if (!snap.edges) throw new Error("edge counts were not allocated");
    const layout: ProfileLayout = { winAt: new Int32Array(T), dispAt: new Int32Array(T + 1) };
    windows.forEach(([b, e], k) => {
      for (let t = b; t < e; t++) layout.winAt[t] = k;
    });
    for (let t = 0; t <= T; t++) layout.dispAt[t] = t;
    const run = await watch.race(walk.profileBatch(g.seed, layout, { win: true, grid: true }));
    return {
      state: Array.from(snap.pos, (s) => `${decodeX(s).toString(16)}${decodeY(s).toString(16)}`).join(""),
      tallies: Array.from(snap.tallies).slice(0, g.t),
      hops: Array.from(snap.hops).slice(0, g.t),
      nE: snap.edges.reduce((a, e, i) => a + (i % 4 === 0 ? e : 0), 0),
      nW: snap.edges.reduce((a, e, i) => a + (i % 4 === 1 ? e : 0), 0),
      cols: Array.from({ length: T + 1 }, (_, t) => Array.from(run.dhist!.subarray(t * g.n, (t + 1) * g.n))),
      winBounds: windows,
      winSums: Array.from({ length: windows.length }, (_, k) =>
        Array.from(run.win!.subarray(k * g.n, (k + 1) * g.n))),
    };
  } finally {
    walk.destroy();
  }
}

/** Compare a `walkprofilejson` reference against the GPU vector, field by
 * field — every field integer, so every comparison is exact. */
export function compareProfile(g: any, got: Awaited<ReturnType<typeof profileVector>>): Check[] {
  const name = `profile ${g.arm} seed ${g.seed}, n ${g.n}, m ${g.m}, t ${g.t}`;
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  return [
    { name: `${name}: trajectory`, pass: got.state === g.state, detail: "" },
    { name: `${name}: tallies`, pass: eq(got.tallies, g.tallies), detail: "" },
    { name: `${name}: hops`, pass: eq(got.hops, g.hops), detail: "" },
    { name: `${name}: edge totals`, pass: got.nE === g.nE && got.nW === g.nW, detail: "" },
    { name: `${name}: columns`, pass: eq(got.cols, g.cols), detail: "" },
    { name: `${name}: window bounds`, pass: eq(got.winBounds, g.bounds), detail: "" },
    { name: `${name}: window sums`, pass: eq(got.winSums, g.sums), detail: "" },
  ];
}

/** The full 003 contract gate. */
export async function checkCone(device: GPUDevice): Promise<Gate> {
  const checks: Check[] = [
    ...pipelineRows().map((r) => ({ name: `003 pipeline: ${r.name}`, pass: r.pass, detail: r.detail })),
    ...(await selfCheck(device)),
  ];
  const walk = (contract as Record<string, any>).walk ?? {};
  const profile = walk[PROFILE_KEY];
  const pending: string[] = [];
  if (!profile) {
    pending.push(`contract.walk.${PROFILE_KEY} (golden, occupancy, windows, circleW1 — the schema is documented in experiments/003-lightcone-speedlimit/check.ts)`);
  } else {
    checks.push(...(await contractGoldens(device, profile)));
  }
  return { checks, pending };
}

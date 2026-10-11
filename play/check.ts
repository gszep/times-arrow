// Headless probe checks for the local-arrow playground page: census and
// flux conservation, door sealing, effusion decay, determinism of the seed
// stream across window lengths, the equilibrium null, the door jet against
// that null (paired, same seed), the release ring, and fine-grid/spread/
// scatterer sanity. Run with `node play/check.ts` (Node ≥ 24).
import { headless } from "../scripts/headless.ts";
import type { Surf } from "./billiard.ts";

const results: { name: string; pass: boolean; detail: string }[] = [];
const assert = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

/** The room square: with the door shut its count is frozen (sealed). */
const ROOM_SQUARE: Surf[] = [{ x: 0.5, y: 0.6, r: 0.2, square: true }];

await headless("play/", async (ev) => {
  const reset = (patch: Record<string, unknown>) => ev(`probe.reset(${JSON.stringify(patch)})`) as Promise<{ t: number; ctr: number[] }>;
  const burst = <T,>(w: number, full: boolean, count: number) => ev(`probe.burst(${w}, ${full}, ${count})`) as Promise<T>;
  const config = () => ev("probe.config()") as Promise<{ surfaces: Surf[]; n: number; grid: number }>;
  const invariants = () =>
    ev("probe.invariants()") as Promise<{ occSum: number; divSum: number | null; grossDivPerWindow: number | null; n: number; t: number }>;
  const audit = () => ev("probe.audit()") as Promise<{ nan: number; escaped: number; inScat: number; speedErr: number }>;

  const base = { n: 30000, seed: 1, door: 0.08, w: 25 };

  // 1. Door shut: sealed room, census exact, the room count frozen.
  const s0 = await reset({ ...base, door: 0, surfaces: ROOM_SQUARE });
  const shut = (await burst<{ ctrSeries: number[][] }>(25, false, 8)).ctrSeries;
  const sealed = shut.every((c) => c[0] === s0.ctr[0]);
  const inv1 = await invariants();
  assert("door 0 ⇒ the room count frozen", sealed, `room ${s0.ctr[0]}→${shut.at(-1)![0]} over 200 steps`);
  assert("census sums to n exactly", inv1.occSum === inv1.n, `Σn = ${inv1.occSum}, n = ${inv1.n}`);

  // 2. Determinism: the same seed reproduces the census series exactly,
  //    at every window length.
  await reset({ ...base, seed: 7 });
  const fine = (await burst<{ ctrSeries: number[][] }>(1, false, 50)).ctrSeries;
  await reset({ ...base, seed: 7 });
  const coarse = (await burst<{ ctrSeries: number[][] }>(5, false, 10)).ctrSeries;
  let maxDiff = 0;
  for (let j = 0; j < 10; j++) for (let k = 0; k < coarse[j].length; k++) maxDiff = Math.max(maxDiff, Math.abs(coarse[j][k] - fine[5 * (j + 1) - 1][k]));
  assert("same seed ⇒ identical census series at W = 1 and W = 5", maxDiff === 0, `max |Δcount| = ${maxDiff} over ${coarse[0].length} surfaces × 10 windows`);

  // 3. Door open: conservation, effusion decay measured on the room square.
  await reset({ ...base, surfaces: ROOM_SQUARE });
  const cfg3 = await config();
  const jet = await burst<{ mean: number[]; sd: number[]; pNeg: number[]; heat: Float64Array; ctrSeries?: undefined; tEnd: number }>(25, true, 24);
  const roomEnd = (await burst<{ ctrSeries: number[][] }>(1, false, 1)).ctrSeries[0][0];
  const inv3 = await invariants();
  assert("every window: Σ∇·J = 0 exactly, census = n", inv3.divSum === 0 && inv3.occSum === inv3.n, `Σ∇·J = ${inv3.divSum}, Σn = ${inv3.occSum}, mean |∇·J| = ${inv3.grossDivPerWindow}`);
  const p600 = roomEnd / 30000;
  assert("effusion under way: p_room(600) ∈ [0.2, 0.5], well off the area fraction 0.16", p600 > 0.2 && p600 < 0.5, `p_room(600) = ${p600.toFixed(3)}, mean σ_room/window = ${jet.mean[0].toFixed(4)} nats`);
  assert("room clock runs forward on average", jet.mean[0] > 0.01, `mean σ_room = ${jet.mean[0].toFixed(4)} nats/window over 600 steps`);
  const audit3 = await audit();
  assert("door scenario: no NaN/escape/scatterer hits, speeds exact", audit3.nan === 0 && audit3.escaped === 0 && audit3.inScat === 0 && audit3.speedErr < 1e-5, JSON.stringify(audit3));

  // 4. Equilibrium null (same seed, paired): flat clock, backward windows ~½.
  await reset({ ...base, spawn: "table" });
  const nul = await burst<{ mean: number[]; sd: number[]; pNeg: number[]; heat: Float64Array }>(25, true, 24);
  const worstNull = Math.max(...nul.mean.map((m, k) => Math.abs(m) / (nul.sd[k] / Math.sqrt(24) || 1e-9)));
  assert("null: |mean σ| within 4 SE for every surface", worstNull < 4, `worst |mean|/SE = ${worstNull.toFixed(2)}`);
  const pNegRange = [Math.min(...nul.pNeg), Math.max(...nul.pNeg)];
  assert("null: P(σ<0) between 0.25 and 0.75 for every surface", pNegRange[0] > 0.25 && pNegRange[1] < 0.75, `P range [${pNegRange[0].toFixed(3)}, ${pNegRange[1].toFixed(3)}]`);

  // 5. The door jet against the null, same cell (paired by seed).
  const C = cfg3.grid;
  const cell = Math.min(C - 1, Math.floor(0.84 * C)) * C + Math.floor(0.5 * C); // just outside the door line y = 0.8
  const doorCell = jet.heat[cell];
  const nullCell = nul.heat[cell];
  assert(
    "door jet: cell below the door produces ≫ the same cell in the null (same seed)",
    doorCell > 10 * Math.abs(nullCell) && doorCell > 1e-3,
    `σ_cell door = ${doorCell.toExponential(2)}, null = ${nullCell.toExponential(2)} nats/particle/window`,
  );

  // 6. Release from the centre: the first windows run forward on every
  //    centred (A) surface.
  await reset({ ...base, proto: "release" });
  const rel = await burst<{ mean: number[] }>(25, true, 4);
  const relCfg = await config();
  const nA = relCfg.surfaces.filter((s) => s.x === 0.5 && s.y === 0.5).length;
  assert(
    "release: first 100 steps produce entropy on every A surface",
    rel.mean.slice(0, nA).every((v) => v > 0),
    `A-surface mean σ over 100 steps: ${rel.mean.slice(0, nA).map((v) => v.toFixed(3)).join(", ")}`,
  );
  const audit6 = await audit();
  assert("release: no NaN/escape, speeds exact", audit6.nan === 0 && audit6.escaped === 0 && audit6.speedErr < 1e-5, JSON.stringify(audit6));

  // 7. Fine grid + spread + scatterers: mechanics and invariants hold.
  await reset({ ...base, grid: 64, spread: 0.25, scatm: 1 });
  await burst<unknown>(25, true, 4);
  const inv7 = await invariants();
  const audit7 = await audit();
  assert(
    "C = 64 + spread ±25% + Sinai: invariants exact, no NaN/escape",
    inv7.divSum === 0 && inv7.occSum === inv7.n && audit7.nan === 0 && audit7.escaped === 0 && audit7.inScat === 0 && audit7.speedErr < 1e-5,
    `Σ∇·J = ${inv7.divSum}, Σn = ${inv7.occSum}, ${JSON.stringify(audit7)}`,
  );
});

const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} check(s) failed` : "\nall checks passed");
process.exit(failed.length ? 1 : 0);

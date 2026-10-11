// Headless probe checks for the playground page: door-shut sealing, the
// aligned effusion decay, multi-surface consistency, wall flips without
// respawn, reverse retrace, circle recrossing, centre release without
// rephasing, and multi-scatterer/speed-spread sanity.
// Run with `node play/check.ts` (Node ≥ 24).
import { headless } from "../scripts/headless.ts";

const results: { name: string; pass: boolean; detail: string }[] = [];
const assert = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
type Sample = { t: number; pin: number[]; cin: number; cout: number };

/** Each set carries a duplicate surface: the per-surface atomic tallies must
 * agree exactly, every sampled step. */
const ALIGNED = [
  { x: 0.5, y: 0.6, r: 0, aligned: true },
  { x: 0.5, y: 0.6, r: 0, aligned: true },
];
const CIRCLE = [
  { x: 0.5, y: 0.35, r: 0.18, aligned: false },
  { x: 0.5, y: 0.35, r: 0.18, aligned: false },
];
const RELEASE = [
  { x: 0.5, y: 0.5, r: 0.12, aligned: false },
  { x: 0.5, y: 0.5, r: 0.02, aligned: false },
];
const base = { n: 30000, seed: 1, door: 0.08, walls: true, scatm: 0, startIn: true, startDisc: 0, spread: 0, surfaces: ALIGNED };

await headless("play/", async (ev) => {
  const reset = (patch: Record<string, unknown>) => ev(`probe.reset(${JSON.stringify({ ...base, ...patch })})`);
  const run = (k: number) => ev(`probe.run(${k})`) as Promise<Sample>;

  // 1. Door shut: sealed room, nothing may cross (this also proves no tunnelling).
  await reset({ door: 0 });
  const shut = await run(600);
  assert(
    "door 0 ⇒ N_in constant, zero crossings, duplicate surfaces agree",
    shut.pin[0] === 1 && shut.pin[1] === 1 && shut.cin === 0 && shut.cout === 0,
    `p=${shut.pin[0]}=${shut.pin[1]}, in=${shut.cin}/step, out=${shut.cout}/step after 600 steps`,
  );

  // 2. Aligned surface, open door: clean one-way leak then relaxation.
  await reset({ door: 0.08 });
  const early = await run(100);
  const ratio = Math.abs(early.cin - early.cout) / Math.max(1e-9, early.cin + early.cout);
  assert(
    "aligned, first 100 steps: crossings are one-way (|net|/gross > 0.8)",
    ratio > 0.8,
    `gross ${(early.cin + early.cout).toFixed(1)}/step, ratio ${ratio.toFixed(3)}`,
  );
  const at300 = await run(200);
  assert(
    "aligned: decays near the rough estimate (p(300) ∈ [0.38, 0.55])",
    at300.pin[0] > 0.38 && at300.pin[0] < 0.55,
    `p(300) = ${at300.pin[0].toFixed(3)} (leak-only 0.385; τ ≈ 314)`,
  );
  const at1500 = await run(1200);
  assert(
    "aligned, plain rectangle: still relaxing toward the area fraction, but slowly",
    at1500.pin[0] < at300.pin[0] - 0.08 && at1500.pin[0] > 0.18,
    `p(1500) = ${at1500.pin[0].toFixed(3)}, above the area fraction 0.16 (|v_x|, |v_y| conserved: the outer gas spreads in columns)`,
  );
  const plain = await run(7500);
  assert("aligned, plain rectangle: still descending at t = 9000", plain.pin[0] < at1500.pin[0], `p(9000) = ${plain.pin[0].toFixed(3)}`);
  await reset({ door: 0.08, scatm: 1 });
  const sinai = await run(9000);
  assert(
    "aligned + scatterer (Sinai, chaotic outer table): within 0.05 of the area fraction by t = 9000",
    Math.abs(sinai.pin[0] - 0.16) < 0.05,
    `p(9000) = ${sinai.pin[0].toFixed(3)}`,
  );
  assert(
    "paired (same seed): the scatterer relaxes faster than the plain rectangle",
    sinai.pin[0] < plain.pin[0],
    `Sinai p(9000) = ${sinai.pin[0].toFixed(3)} < plain ${plain.pin[0].toFixed(3)}`,
  );

  // 3. Wall flip mid-run: the walls vanish without touching the particles.
  await reset({ door: 0.08 });
  const pre = await run(300);
  await ev("probe.setWalls(false)");
  const after = await run(200);
  const auditFlip = await ev("probe.audit()");
  assert(
    "wall flip: particles survive (no NaN/escape), the count keeps evolving",
    auditFlip.nan === 0 && auditFlip.escaped === 0 && after.pin[0] > 0.16 && after.pin[0] < pre.pin[0],
    `p: ${pre.pin[0].toFixed(3)} → ${after.pin[0].toFixed(3)}, ${JSON.stringify(auditFlip)}`,
  );

  // 4. Reverse: negate all velocities, the history must retrace.
  await reset({ door: 0.08 });
  const fwd: Sample[] = [];
  for (let j = 0; j < 10; j++) fwd.push(await run(50));
  await ev("probe.reverse()");
  const back: Sample[] = [];
  for (let j = 0; j < 10; j++) back.push(await run(50));
  let fold = 0;
  for (let j = 0; j <= 8; j++) fold = Math.max(fold, Math.abs(fwd[j].pin[0] - back[8 - j].pin[0]));
  assert(
    "reverse ⇒ N_in(t) retraces (max fold deviation < 0.01)",
    fold < 0.01 && Math.abs(back[9].pin[0] - 1) <= 0.001,
    `max |Δp| over the 9 folded pairs = ${fold.toFixed(5)}, final p = ${back[9].pin[0].toFixed(4)}`,
  );

  // 5. Circle off the walls, walls removed: recrossing dominates, no arrow.
  await reset({ walls: false, surfaces: CIRCLE, startIn: true });
  await run(1000);
  let gross = 0;
  let net = 0;
  for (let j = 0; j < 5; j++) {
    const r = await run(200);
    gross += (r.cin + r.cout) / 2;
    net += Math.abs(r.cin - r.cout);
  }
  gross /= 5;
  net /= 5;
  assert("circle ⇒ recrossing dominates (|net| < gross/10)", net < gross / 10, `gross ${gross.toFixed(1)}/step, |net| ${net.toFixed(2)}/step`);

  // 6. Centre release: everything starts inside the centred surface, spreads out.
  await reset({ walls: false, surfaces: RELEASE, startIn: false, startDisc: 0.01 });
  const rel0 = await run(2);
  const rel20 = await run(18);
  assert("release: p(2) ≈ 1 inside the r = 0.12 circle, p(20) < 0.9", rel0.pin[0] > 0.999 && rel20.pin[0] < 0.9, `p(2) = ${rel0.pin[0].toFixed(4)}, p(20) = ${rel20.pin[0].toFixed(3)}`);
  let maxp = 0;
  for (let j = 0; j < 40; j++) maxp = Math.max(maxp, (await run(50)).pin[0]);
  assert("release, plain table: no global rephasing out to t = 2200 (max p ≤ 0.15)", maxp <= 0.15, `max p = ${maxp.toFixed(3)} of the r = 0.12 circle`);

  // 7. Multi-scatterer release (9 on a grid): mechanics stay sane.
  await reset({ walls: false, surfaces: RELEASE, startIn: false, startDisc: 0.01, scatm: 9 });
  await run(300);
  const audit9 = await ev("probe.audit()");
  assert(
    "release + 9 scatterers: no NaN, no escape, none inside a scatterer, speeds exact",
    audit9.nan === 0 && audit9.escaped === 0 && audit9.inScat === 0 && audit9.speedErr < 1e-5,
    JSON.stringify(audit9),
  );

  // 8. Speed spread: speeds vary within the band, mechanics still exact.
  await reset({ spread: 0.25 });
  await run(200);
  const auditS = await ev("probe.audit()");
  assert(
    "spread ±25%: no NaN/escape/scatterer hits, speeds within [0.75, 1.25]·v",
    auditS.nan === 0 && auditS.escaped === 0 && auditS.inScat === 0 && auditS.speedErr < 1e-5,
    JSON.stringify(auditS),
  );
});

const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} check(s) failed` : "\nall checks passed");
process.exit(failed.length ? 1 : 0);

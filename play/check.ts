// Headless probe checks for the playground page: the door-shut constant, the
// aligned effusion decay, the reverse retrace, and circle recrossing. Run
// with `node play/check.ts` (Node ≥ 24).
import { headless } from "../scripts/headless.ts";

const results: { name: string; pass: boolean; detail: string }[] = [];
const assert = (name: string, pass: boolean, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};
type Sample = { t: number; nin: number; pin: number; cin: number; cout: number; s: number; clock: number };

const base = { n: 30000, seed: 1, walls: true, scatter: false, circle: false, startIn: true };

await headless("play/", async (ev) => {
  const reset = (patch: Record<string, unknown>) => ev(`probe.reset(${JSON.stringify({ ...base, ...patch })})`);
  const run = (k: number) => ev(`probe.run(${k})`) as Promise<Sample>;

  // 1. Door shut: sealed room, nothing may cross (this also proves no tunnelling).
  await reset({ door: 0 });
  const shut = await run(600);
  assert(
    "door 0 ⇒ N_in constant, zero crossings",
    shut.nin === 30000 && shut.cin === 0 && shut.cout === 0,
    `nin=${shut.nin}, in=${shut.cin}/step, out=${shut.cout}/step after 600 steps`,
  );

  // 2. Aligned surface, open door: clean one-way leak then relaxation to the area fraction.
  await reset({ door: 0.08 });
  const early = await run(100);
  const ratio = Math.abs(early.cin - early.cout) / Math.max(1e-9, early.cin + early.cout);
  assert(
    "aligned, first 100 steps: crossings are one-way (|net|/gross > 0.8)",
    ratio > 0.8,
    `gross ${(early.cin + early.cout).toFixed(1)}/step, |net| ${Math.abs(early.cin - early.cout).toFixed(1)}/step, ratio ${ratio.toFixed(3)}`,
  );
  const at300 = await run(200);
  assert(
    "aligned: decays near the rough estimate (p(300) ∈ [0.38, 0.55])",
    at300.pin > 0.38 && at300.pin < 0.55,
    `p(300) = ${at300.pin.toFixed(3)} (leak-only 0.385, two-box 0.429; τ ≈ 314)`,
  );
  const at1500 = await run(1200);
  assert(
    "aligned, plain rectangle: still relaxing toward the area fraction, but slowly",
    at1500.pin < at300.pin - 0.08 && at1500.pin > 0.18,
    `p(1500) = ${at1500.pin.toFixed(3)}, above the area fraction 0.16 (every reflection flips one velocity component, so |v_x| and |v_y| are conserved: the outer gas spreads in columns and mixes poorly)`,
  );
  const plain = await run(7500);
  assert("aligned, plain rectangle: still descending at t = 9000", plain.pin < at1500.pin, `p(9000) = ${plain.pin.toFixed(3)}`);
  await reset({ door: 0.08, scatter: true });
  const sinai = await run(9000);
  assert(
    "aligned + scatterer (Sinai, chaotic outer table): within 0.05 of the area fraction by t = 9000",
    Math.abs(sinai.pin - 0.16) < 0.05,
    `p(9000) = ${sinai.pin.toFixed(3)}`,
  );
  assert(
    "paired (same seed): the scatterer relaxes faster than the plain rectangle",
    sinai.pin < plain.pin,
    `Sinai p(9000) = ${sinai.pin.toFixed(3)} < plain ${plain.pin.toFixed(3)}`,
  );

  // 3. Reverse: negate all velocities, the history must retrace.
  await reset({ door: 0.08 });
  const fwd: Sample[] = [];
  for (let j = 0; j < 10; j++) fwd.push(await run(50));
  await ev("probe.reverse()");
  const back: Sample[] = [];
  for (let j = 0; j < 10; j++) back.push(await run(50));
  let fold = 0;
  for (let j = 0; j <= 8; j++) fold = Math.max(fold, Math.abs(fwd[j].pin - back[8 - j].pin));
  assert(
    "reverse ⇒ N_in(t) retraces (max fold deviation < 0.01)",
    fold < 0.01 && Math.abs(back[9].nin - 30000) <= 30,
    `max |Δp| over the 9 folded pairs = ${fold.toFixed(5)}, final N_in = ${back[9].nin}/30000`,
  );;

  // 4. Arbitrary circle off the walls, walls removed: recrossing dominates, no arrow.
  await reset({ walls: false, circle: true, cx: 0.5, cy: 0.35, cr: 0.18 });
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

  // 5. Microdynamics sanity on a particle sample.
  const audit = await ev("probe.audit()");
  assert(
    "audit: no NaN, no escape, speed conserved, none inside the scatterer",
    audit.nan === 0 && audit.escaped === 0 && audit.speedErr < 1e-5 && audit.inScat === 0,
    JSON.stringify(audit),
  );

  // 6. Integrable vs Sinai mixing of the outer table (reported, not asserted).
  const spread = async (scatter: boolean) => {
    await reset({ walls: false, scatter, startIn: true });
    for (let j = 0; j < 3; j++) await run(500);
    const pins: number[] = [];
    for (let j = 0; j < 15; j++) pins.push((await run(100)).pin);
    const mean = pins.reduce((a, b) => a + b, 0) / pins.length;
    return Math.sqrt(pins.reduce((a, b) => a + (b - mean) ** 2, 0) / pins.length);
  };
  const stdPlain = await spread(false);
  const stdSinai = await spread(true);
  console.log(`REPORT  aligned count fluctuation after spreading: plain rectangle σ(p) = ${stdPlain.toFixed(4)}, with scatterer σ(p) = ${stdSinai.toFixed(4)}`);
});

const failed = results.filter((r) => !r.pass);
console.log(failed.length ? `\n${failed.length} check(s) failed` : "\nall checks passed");
process.exit(failed.length ? 1 : 0);

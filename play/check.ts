import assert from "node:assert/strict";
import { headless } from "../scripts/headless.ts";
import contract from "../contract.json" with { type: "json" };
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";

await headless("play/?paused=1", async ev => {
  console.log("adapter", await ev("probe.adapter"));
  await ev("probe.reset({n:256,radius:64,rho:6,outside:0,seed:1})");
  const disc = await ev("probe.state()");
  for (let i = 0; i < 256 ** 2; i++) {
    const row = Math.floor(i / 256), x = i % 256 + (row & 1) / 2 - 128, y = row - 128;
    // Physical embedding: x spacing 1, y spacing √3/2. Rational squared
    // distances avoid the square root without copying the shader arithmetic.
    assert.equal(disc[i], x * x + 0.75 * y * y <= 64 ** 2 ? 63 : 0, `disc boundary site ${i}`);
  }
  console.log("PASS exact squared-distance disc membership, including boundary sites");
  for (const rho of [1, 3]) {
    const start = await ev(`probe.reset({n:64, radius:16, rho:${rho}, outside:0.15, seed:73, window:8})`);
    const initial = await ev("probe.state()");
    assert.deepEqual(initial.slice(0, 4096), initial.slice(4096), "paired initial states");
    const result = await ev("probe.run(64)");
    assert.deepEqual(result.sample.invariants, start.invariants, "mass and integer momentum conserved in both runs");
    assert.equal(result.sample.invariants[0].invalid, 0);
    const echo = await ev("probe.rewind()");
    assert.equal(echo.mismatch, 0, "bit-exact rewind");
    assert.deepEqual(await ev("probe.state()"), initial);
    await ev("probe.run(64)");
    assert.deepEqual((await ev("probe.audit()")).sample, result.sample, "replay deterministic");
    console.log(`PASS rho=${rho}: paired start, mass/momentum, 64-step exact rewind, replay`);
  }
  // Off is pure streaming: 2n steps is a period for all six directions
  // (diagonals shift x by n/2 after n steps). On must differ from off.
  await ev("probe.reset({n:64, radius:16, rho:3, seed:9})");
  const initial = await ev("probe.state()");
  await ev("probe.run(128)");
  const final = await ev("probe.state()");
  assert.deepEqual(final.slice(4096), initial.slice(4096), "free-stream period 2n");
  assert.notDeepEqual(final.slice(0, 4096), final.slice(4096), "collisions change trajectories");
  console.log("PASS free-stream torus period; collision trajectory differs");
  const compare = async (g: typeof contract.fhp.golden[number]) => {
    await ev(`probe.reset(${JSON.stringify({ n: g.n, seed: g.seed, rho: g.rhoIn[0] / g.rhoIn[1], outside: g.rhoOut[0] / g.rhoOut[1], radius: g.radius, window: 16 })})`);
    if (g.t) await ev(`probe.run(${g.t})`);
    const state = await ev("probe.state()");
    assert.equal(g.state.filter((v, i) => v !== state[i]).length, 0, `Lean n=${g.n} seed=${g.seed} t=${g.t}`);
    assert.equal((await ev("probe.rewind()")).mismatch, 0);
  };
  for (const golden of contract.fhp.golden) await compare(golden);
  console.log(`PASS ${contract.fhp.golden.length}/${contract.fhp.golden.length} Lean FHP goldens, including initialization and exact rewind`);
  const binary = process.env.FHP_LEAN;
  if (binary) {
    for (let i = 0; i < 8; i++) {
      const args = [randomInt(0x100000000), i % 2 ? 16 : 32, i % 2 ? randomInt(1, 51) : 0, i % 2 ? 4 : 8,
        randomInt(1, 17), 4, randomInt(0, 10), 20];
      const golden = JSON.parse(execFileSync(binary, ["fhp", ...args.map(String)], { encoding: "utf8", timeout: 30000 }));
      await compare(golden);
    }
    console.log("PASS 8/8 fresh random-seed Lean CLI differentials (4 initialization, 4 evolution), exact rewind");
  } else console.log("FHP_LEAN unset: CLI differentials not run");
});

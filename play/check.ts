import assert from "node:assert/strict";
import { headless } from "../scripts/headless.ts";

await headless("play/?paused=1", async ev => {
  console.log("adapter", await ev("probe.adapter"));
  await ev("probe.reset({n:256,radius:64,rho:6,outside:0,seed:1})");
  const disc = await ev("probe.state()");
  for (let i = 0; i < 256 ** 2; i++) {
    const y = Math.floor(i / 256), dx = 2 * (i % 256) + (y & 1) - 256, dy = 2 * y - 256;
    assert.equal(disc[i], dx * dx + 3 * dy * dy < 4 * 64 ** 2 ? 63 : 0, `disc boundary site ${i}`);
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
});

import assert from "node:assert/strict";
import { headless } from "../scripts/headless.ts";

const close = (actual: number, expected: number, label: string) =>
  assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= 1e-9 * Math.abs(expected), `${label}: ${actual} != ${expected}`);
await headless("play/", async (ev, cdp) => {
  const p = await ev("probe()");
  assert.equal(p.adapter.fallback, false);
  assert.equal(p.nan, 0);
  assert.ok(p.maxDiff < 1e-5, `GPU field error ${p.maxDiff}`);
  assert.ok(p.minSigma >= -1e-12);
  assert.equal(p.wallEdge, 0);
  assert.equal(p.supportInside, true);
  close(p.D0, 158.51548539442516, "D0");
  close(p.DT, 11.372956964196078, "D768");
  close(p.sumSigma, 147.14252843022908, "sum sigma");
  close(p.D0minusDT, p.sumSigma, "balance");
  for (const [u, expected] of [[0, 39.69702694070011], [.25, 39.276420782158084], [.5, 40.41389053878386],
    [.75, 42.588467699925765], [-.75, 47.47744384102725]]) close(p.frame[u].D100, expected, `D_${u}(100)`);
  assert.equal(Object.keys(p.frame).length, 7);
  for (const f of Object.values(p.frame) as any[]) {
    assert.equal(f.rises, 0);
    assert.equal(f.gpuRises, 0);
    assert.ok(f.maxCurveDiff < 1e-3);
  }
  const walls = [[0, 10, 1.1847602936203998], [.25, 7, 1.4050985298825793], [.5, 88, 1.3823606607867198],
    [.75, 61, .620127609944543], [.9, 28, .061571688173641004], [.95, 10, .002803276096848606],
    [1, 0, 0], [1.25, 0, 0], [1.5, 0, 0]];
  for (const [v, rises, largest] of walls) {
    const w = p.wall[v];
    assert.equal(w.rises, rises, `wall ${v} rises`);
    assert.equal(w.gpuRises, rises, `GPU wall ${v} rises`);
    close(w.largest, largest, `wall ${v} largest rise`);
    close(w.D0, 79.25774269721258, `wall ${v} D0`);
    assert.ok(w.maxCurveDiff < 1e-3);
  }
  assert.deepEqual(p.parameters, { view: "frame", u: .5, v: .5, a: 1 / 64 });
  for (const [width, height] of [[390, 844], [360, 740]]) {
    await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
    for (const view of ["frame", "wall"]) {
      await ev(`document.getElementById('v${view}').click(); new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      const q = await ev("probe()");
      assert.equal(q.parameters.view, view);
      assert.equal(q.scrollHeight, height, `${width}×${height} ${view} scrollHeight`);
      assert.equal(q.innerHeight, height);
      assert.equal(q.width, width);
      assert.equal(await ev("document.documentElement.scrollWidth"), width);
      const boxes = await ev("[...document.body.children].filter(e=>e.tagName!=='SCRIPT').map(e=>{const r=e.getBoundingClientRect();return [r.top,r.bottom,r.height]})");
      assert.ok(boxes.every(([top, bottom, h]: number[]) => top >= 0 && bottom <= height && h > 0), "visible, unclipped content");
      console.log(`PASS ${width}×${height} ${view}: scrollHeight = innerHeight = ${height}`);
    }
  }
  for (const v of [0, 1, 1.5]) {
    await ev(`document.getElementById('speed').value='${v}'; document.getElementById('speed').dispatchEvent(new Event('input'))`);
    assert.equal((await ev("probe()")).parameters.v, v);
    assert.equal(await ev("new URL(location.href).searchParams.get('v')"), String(v));
    assert.ok((await ev("document.getElementById('status').textContent")).includes(v < 1 ? "leaks" : "sealed"));
  }
  assert.equal(await ev("window.probeError"), undefined);
  console.log("PASS f64 references, GPU field and curves, dissipation, zero right boundary, URL controls", JSON.stringify(p));
});

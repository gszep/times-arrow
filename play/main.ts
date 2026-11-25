import { gpu } from "../src/gpu.ts";
import { C, LINKS, N, R, T, XR, Gas, phi, cpuField, frameCurve, wallCurve, type FrameCurve, type WallCurve } from "./model.ts";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const image = el<HTMLCanvasElement>("diagram"), plot = el<HTMLCanvasElement>("curve"), caption = el("caption");
const frameBtn = el<HTMLButtonElement>("vframe"), wallBtn = el<HTMLButtonElement>("vwall");
const slider = el<HTMLInputElement>("speed"), play = el<HTMLButtonElement>("play");
const slabel = el("slabel"), svalue = el("svalue"), status = el("status"), tick = el("tick");
const url = new URL(location.href);
const param = (key: string) => url.searchParams.get(key);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

// Guards: the field's support |x − c| ≤ R + t stays inside the ring
// (R + T < N/2), frame slices are only evaluated at valid levels, and the
// reversal probability must lie in (0, 1). Out-of-range values are clamped.
const num = (key: string, dflt: number) => {
  const x = param(key) === null ? dflt : Number(param(key));
  return Number.isFinite(x) ? x : dflt;
};
let a = 1 / 64;
{
  const [p, q = "1"] = (param("a") ?? "").split("/");
  const value = Number(p) / Number(q);
  if (Math.fround(value) > 0 && Math.fround(value) < 1) a = value;
}
let view: "frame" | "wall" = param("view") === "wall" ? "wall" : "frame";
let u = clamp(num("u", 0.5), -0.75, 0.75);
let v = clamp(num("v", 0.5), 0, 1.5);
if (R + T >= N / 2) throw new Error("field support leaves the ring");

const FRAME_US = [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75];
const WALL_VS = [0, 0.25, 0.5, 0.75, 0.9, 0.95, 1, 1.25, 1.5];
const CAPTIONS = {
  frame: "Every observer slices space-time differently. Slide the speed: the curve only ever falls. Observers disagree about rates, never about the direction.",
  wall: "A partition is a wall that things can cross. Slower than light, the curve can rise: information leaks in and the region's clock runs backwards. At light speed the wall is a horizon and nothing can.",
};
const RED = "#ff6b66", GOLD = "#f4cf72", SEALED = "#7fd4a8";

function fail(error: unknown) {
  (window as any).probeError ??= String(error);
  caption.textContent = String(error);
  caption.style.color = RED;
  stop();
  for (const control of [frameBtn, wallBtn, slider, play]) control.disabled = true;
}

function canvas(element: HTMLCanvasElement) {
  const { width: w, height: h } = element.getBoundingClientRect(), dpr = devicePixelRatio;
  element.width = Math.round(w * dpr);
  element.height = Math.round(h * dpr);
  const ctx = element.getContext("2d")!;
  ctx.scale(dpr, dpr);
  ctx.font = "10px system-ui";
  return { ctx, w, h };
}

/** φ(r) + φ(l) as a 401×401 log-scale heat map, row 0 at the top (t = 400). */
function heatMap(phiF: Float64Array) {
  const heat = document.createElement("canvas");
  heat.width = 401;
  heat.height = 401;
  const ctx = heat.getContext("2d")!;
  const img = ctx.createImageData(401, 401);
  const ramp = (q: number) => {
    const a0 = [16, 40, 66], a1 = [36, 145, 128], a2 = [244, 207, 114];
    const [p, s, e] = q < 0.5 ? [a0, a1, q * 2] : [a1, a2, q * 2 - 1];
    return [0, 1, 2].map(k => Math.round(p[k] + (s[k] - p[k]) * e)) as [number, number, number];
  };
  for (let t = 0; t <= 400; t++) {
    const base = t * N * 2;
    for (let x = 0; x <= 400; x++) {
      const s = phiF[base + (C - 200 + x) * 2] + phiF[base + (C - 200 + x) * 2 + 1];
      const i = ((400 - t) * 401 + x) * 4;
      const rgb = s > 0 ? ramp(clamp((Math.log10(s) + 7) / 7.9, 0, 1)) : [11, 20, 32];
      img.data.set(rgb, i);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return heat;
}

async function compute() {
  caption.textContent = "Computing the gas…";
  const { device, adapter } = await gpu();
  device.addEventListener("uncapturederror", (event) => fail((event as GPUUncapturedErrorEvent).error.message));
  device.lost.then((info) => fail(`GPU lost: ${info.message}`));
  const gas = new Gas(device, a);
  // Null first: remove only the preparation, using the same GPU recursion.
  device.queue.writeBuffer(gas.hist, 0, new Float32Array(N * 2));
  const nullField = await gas.run();
  const nullMax = nullField.reduce((m, d) => Math.max(m, Math.abs(d)), 0);
  const nullPhi = Float64Array.from(nullField, phi);
  const nullCheck = {
    maxDeviation: nullMax,
    maxInformation: nullPhi.reduce((m, d) => Math.max(m, Math.abs(d)), 0),
    frameRises: FRAME_US.map(x => frameCurve(nullPhi, x).rises),
    wallRises: WALL_VS.map(x => wallCurve(nullPhi, x).rises),
  };
  gas.dispatch("init");
  const gpuField = await gas.run();
  gas.destroy();
  const cpu = cpuField(a);
  let maxDiff = 0, nan = 0;
  for (let i = 0; i < LINKS; i++) {
    const g = gpuField[i];
    if (!Number.isFinite(g)) nan++;
    const d = Math.abs(g - cpu.field[i]);
    if (d > maxDiff) maxDiff = d;
  }
  let wallEdge = 0; // the field is exactly zero at the retreating right end
  for (let t = 0; t <= 399; t++) for (let x = C + XR - t - 2; x <= C + XR - t + 2; x++) {
    const i = t * N * 2 + x * 2;
    wallEdge = Math.max(wallEdge, Math.abs(cpu.field[i]), Math.abs(cpu.field[i + 1]), Math.abs(gpuField[i]), Math.abs(gpuField[i + 1]));
  }
  const phiF = Float64Array.from(gpuField, phi);
  const frame = Object.fromEntries(FRAME_US.map(x => {
    const f = frameCurve(cpu.phiF, x);
    const g = frameCurve(phiF, x);
    return [String(x), { rises: f.rises, D100: f.D[100 - f.s0], gpuRises: g.rises,
      maxCurveDiff: Math.max(...f.D.map((d, i) => Math.abs(d - g.D[i]))) }];
  }));
  const wall = Object.fromEntries(WALL_VS.map(x => {
    const w = wallCurve(cpu.phiF, x);
    const g = wallCurve(phiF, x);
    return [String(x), { rises: w.rises, largest: w.largest, D0: w.D[0], gpuRises: g.rises,
      maxCurveDiff: Math.max(...w.D.map((d, i) => Math.abs(d - g.D[i]))) }];
  }));
  return {
    phiF,
    heat: heatMap(phiF),
    probe: {
      adapter,
      null: nullCheck,
      maxDiff,
      nan,
      wallEdge,
      supportInside: R + T < N / 2,
      minSigma: cpu.minSigma,
      sumSigma: cpu.sumSigma,
      D0: cpu.D0,
      DT: cpu.DT,
      D0minusDT: cpu.D0 - cpu.DT,
      frame,
      wall,
    },
  };
}

let data: Awaited<ReturnType<typeof compute>> | null = null;
const frameCache = new Map<number, FrameCurve>();
const wallCache = new Map<number, WallCurve>();
const frameOf = (speed: number) => {
  if (!frameCache.has(speed)) frameCache.set(speed, frameCurve(data!.phiF, speed));
  return frameCache.get(speed)!;
};
const wallOf = (speed: number) => {
  if (!wallCache.has(speed)) wallCache.set(speed, wallCurve(data!.phiF, speed));
  return wallCache.get(speed)!;
};

let playing = false, fraction = 0.5, lastFrame = 0, animation = 0;
const frameLevel = () => {
  const f = frameOf(u);
  return Math.round(f.s0 + fraction * (Math.min(399, f.s1) - f.s0));
};
const wallTime = () => Math.floor(fraction * Math.min(399, v ? 198 / v : 399));

function draw() {
  if (!data) return;
  drawDiagram();
  drawCurve();
}

function drawDiagram() {
  const { ctx, w, h } = canvas(image);
  ctx.fillStyle = "#0b1420";
  ctx.fillRect(0, 0, w, h);
  const side = Math.min(w, h) - 4; // equal space/time scales: light rays are 45°
  const rect = { x: (w - side) / 2, y: (h - side) / 2, width: side, height: side };
  const X = (x: number) => rect.x + (x - (C - 200)) / 400 * rect.width;
  const Y = (t: number) => rect.y + (1 - t / 400) * rect.height;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(data!.heat, 0, 0, 401, 401, rect.x, rect.y, rect.width, rect.height);
  ctx.fillStyle = "rgba(228,237,244,0.55)";
  ctx.fillText("time ↑", 5, 12);
  ctx.fillText("space →", 5, h - 5);
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  const line = (x0: number, t0: number, x1: number, t1: number) => {
    ctx.beginPath(); ctx.moveTo(X(x0), Y(t0)); ctx.lineTo(X(x1), Y(t1)); ctx.stroke();
  };
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  for (const xc of [C - 20, C + 40]) {
    for (const d of [-1, 1]) {
      line(xc, 0, xc + d * 400, 400);
    }
  }
  if (view === "frame") {
    const f = frameOf(u);
    ctx.strokeStyle = "rgba(228,237,244,0.35)";
    for (let k = 0; k <= 4; k++) {
      const s = f.s0 + (Math.min(399, f.s1) - f.s0) * k / 4;
      line(C - 200, s - u * 200, C + 200, s + u * 200);
    }
    const s = frameLevel();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    line(C - 200, s - u * 200, C + 200, s + u * 200);
  } else {
    ctx.fillStyle = "rgba(159,196,224,0.10)";
    ctx.beginPath();
    ctx.moveTo(X(C), Y(0));
    ctx.lineTo(X(C + v * 400), Y(400));
    ctx.lineTo(X(C + 200), Y(400));
    ctx.lineTo(X(C + 200), Y(0));
    ctx.closePath();
    ctx.fill();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(228,237,244,0.5)";
    ctx.lineWidth = 1;
    line(C, 0, C + 400, 400);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(228,237,244,0.75)";
    ctx.textAlign = "right";
    ctx.fillText("light", X(C + 200) - 3, Y(200) + 4);
    ctx.textAlign = "left";
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    line(C, 0, C + v * 400, 400);
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(X(C + v * wallTime()), Y(wallTime()), 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawCurve() {
  const { ctx: g, w, h } = canvas(plot);
  g.fillStyle = "#0b1420";
  g.fillRect(0, 0, w, h);
  const left = 8, right = w - 10, top = 16, bottom = h - 12;
  const f = view === "frame" ? frameOf(u) : null;
  const D = f ? f.D : wallOf(v).D;
  const x0 = f ? f.s0 * f.gamma : 0, x1 = f ? f.s1 * f.gamma : 399;
  const lo = Math.min(...D), hi = Math.max(...D), pad = (hi - lo) * .05 + 1e-9;
  const X = (t: number) => left + (t - x0) / (x1 - x0) * (right - left);
  const Y = (d: number) => bottom - (d - lo + pad) / (hi - lo + 2 * pad) * (bottom - top);
  const xs = (i: number) => X(f ? (f.s0 + i) * f.gamma : i);
  g.save();
  g.beginPath(); g.rect(left, top, right - left, bottom - top); g.clip();
  if (f) {
    const f0 = frameOf(0);
    g.strokeStyle = "rgba(137,182,211,0.4)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < f0.D.length; i++) {
      const px = X(f0.s0 + i), py = Y(f0.D[i]);
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
  }
  g.lineWidth = 2;
  g.lineCap = "round";
  for (let i = 1; i < D.length; i++) {
    g.strokeStyle = D[i] - D[i - 1] > 1e-12 ? RED : GOLD;
    g.beginPath(); g.moveTo(xs(i - 1), Y(D[i - 1])); g.lineTo(xs(i), Y(D[i])); g.stroke();
  }
  g.restore();
  g.strokeStyle = "#273443";
  g.beginPath();
  g.moveTo(left, bottom);
  g.lineTo(right, bottom);
  g.stroke();
  g.fillStyle = "#95a6b7";
  g.fillText("information left", 3, 12);
  g.textAlign = "right";
  g.fillText(view === "frame" ? "observer's proper time" : "time", right, h - 3);
  if (f) g.fillText("faint: observer at rest", right, 12);
  g.textAlign = "left";
  const marker = f ? frameLevel() - f.s0 : wallTime();
  g.fillStyle = GOLD;
  g.beginPath(); g.arc(xs(marker), Y(D[marker]), 3.5, 0, 2 * Math.PI); g.fill();
  g.strokeStyle = "#0b1420"; g.stroke();
}

function sync() {
  url.searchParams.set("view", view);
  url.searchParams.set("u", String(u));
  url.searchParams.set("v", String(v));
  url.searchParams.set("a", Number.isInteger(1 / a) ? `1/${Math.round(1 / a)}` : String(a));
  history.replaceState(null, "", url);
  frameBtn.setAttribute("aria-pressed", String(view === "frame"));
  wallBtn.setAttribute("aria-pressed", String(view === "wall"));
  caption.style.color = "";
  caption.textContent = CAPTIONS[view];
  const frame = view === "frame";
  slabel.textContent = frame ? "observer speed" : "wall speed";
  slider.min = frame ? "-0.75" : "0";
  slider.max = frame ? "0.75" : "1.5";
  slider.value = String(frame ? u : v);
  svalue.textContent = `${(frame ? u : v).toFixed(2)} c`;
  status.textContent = frame ? "" : v < 1 ? "slower than light: leaks" : v === 1 ? "light speed: a horizon, sealed" : "faster than light: sealed";
  status.style.color = v < 1 ? RED : SEALED;
  tick.hidden = frame;
  draw();
}

function loop(now: number) {
  if (!playing || !data) return;
  const span = view === "frame" ? 12000 : 9000;
  fraction += ((lastFrame ? now - lastFrame : 16) / span);
  lastFrame = now;
  if (fraction >= 1) {
    fraction = 1;
    stop();
  }
  draw();
  if (playing) animation = requestAnimationFrame(loop);
}

function stop() {
  cancelAnimationFrame(animation);
  playing = false;
  lastFrame = 0;
  play.textContent = "▶";
  play.ariaLabel = "Play slice";
}
for (const mode of ["frame", "wall"] as const) el(`v${mode}`).onclick = () => {
  view = mode; stop(); sync();
};
slider.oninput = () => {
  if (view === "frame") u = clamp(Number(slider.value), -0.75, 0.75);
  else v = clamp(Number(slider.value), 0, 1.5);
  sync();
};
play.onclick = () => {
  if (!data) return;
  if (playing) return stop();
  if (fraction >= 1) fraction = 0;
  playing = true;
  play.textContent = "Ⅱ";
  play.ariaLabel = "Pause slice";
  animation = requestAnimationFrame(loop);
};

new ResizeObserver(() => draw()).observe(document.body);

async function main() {
  data = await compute();
  const probe = async () => ({
    ...data!.probe,
    scrollHeight: document.documentElement.scrollHeight,
    innerHeight,
    width: innerWidth,
    parameters: { view, u, v, a },
  });
  (window as any).probe = probe;
  (window as any).probe.adapter = data.probe.adapter;
  sync();
}

void main().catch(fail);

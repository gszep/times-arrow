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

type Data = {
  adapter: Awaited<ReturnType<typeof gpu>>["adapter"];
  phiF: Float64Array;
  heat: HTMLCanvasElement;
  probe: Record<string, unknown>;
};

function fail(error: unknown) {
  (window as any).probeError ??= String(error);
  caption.textContent = String(error);
  caption.style.color = RED;
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

async function compute(): Promise<Data> {
  caption.textContent = "Computing the gas…";
  const { device, adapter } = await gpu();
  device.addEventListener("uncapturederror", (event) => fail((event as GPUUncapturedErrorEvent).error.message));
  device.lost.then((info) => fail(`GPU lost: ${info.message}`));
  const gas = new Gas(device, a);
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
    adapter,
    phiF,
    heat: heatMap(phiF),
    probe: {
      adapter,
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

let data: Data | null = null;
const frameCache = new Map<string, FrameCurve>();
const wallCache = new Map<string, WallCurve>();
const frameOf = (speed: number) => {
  const key = String(speed);
  if (!frameCache.has(key)) frameCache.set(key, frameCurve(data!.phiF, speed));
  return frameCache.get(key)!;
};
const wallOf = (speed: number) => {
  const key = String(speed);
  if (!wallCache.has(key)) wallCache.set(key, wallCurve(data!.phiF, speed));
  return wallCache.get(key)!;
};

let playing = false, fraction = 0.5, lastFrame = 0;

function draw() {
  if (!data) return;
  drawDiagram();
  drawCurve();
}

function drawDiagram() {
  const { ctx, w, h } = canvas(image);
  ctx.fillStyle = "#0b1420";
  ctx.fillRect(0, 0, w, h);
  const rect = { x: 2, y: 2, width: w - 4, height: h - 4 };
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
  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;
  for (const xc of [C - 20, C + 40]) {
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(X(xc), Y(0));
      ctx.lineTo(X(xc + d * 400), Y(400));
      ctx.stroke();
    }
  }
  if (view === "frame") {
    const f = frameOf(u);
    ctx.strokeStyle = "rgba(228,237,244,0.35)";
    for (let k = 0; k <= 4; k++) {
      const s = f.s0 + (f.s1 - f.s0) * k / 4;
      ctx.beginPath();
      ctx.moveTo(X(C - 200), Y(s - u * 200));
      ctx.lineTo(X(C + 200), Y(s + u * 200));
      ctx.stroke();
    }
    const s = f.s0 + (f.s1 - f.s0) * fraction;
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(C - 200), Y(s - u * 200));
    ctx.lineTo(X(C + 200), Y(s + u * 200));
    ctx.stroke();
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
    ctx.beginPath();
    ctx.moveTo(X(C), Y(0));
    ctx.lineTo(X(C + 400), Y(400));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(228,237,244,0.75)";
    ctx.textAlign = "right";
    ctx.fillText("light", X(C + 200) - 3, Y(200) + 4);
    ctx.textAlign = "left";
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(C), Y(0));
    ctx.lineTo(X(C + v * 400), Y(400));
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(X(C + v * fraction * 399), Y(fraction * 399), 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.restore();
}

function drawCurve() {
  const { ctx: g, w, h } = canvas(plot);
  g.fillStyle = "#0b1420";
  g.fillRect(0, 0, w, h);
  if (!data) return;
  const left = 8, right = w - 10, top = 16, bottom = h - 12;
  let xs: (i: number) => number, ys: (i: number) => number, count: number, marker: [number, number] | null;
  if (view === "frame") {
    const f = frameOf(u), f0 = frameOf(0);
    const x0 = f.s0 * f.gamma, x1 = f.s1 * f.gamma;
    const lo = Math.min(...f.D), hi = Math.max(...f.D);
    const padY = (hi - lo) * 0.05 + 1e-9;
    const X = (x: number) => left + (x - x0) / (x1 - x0) * (right - left);
    const Y = (d: number) => bottom - (d - (lo - padY)) / (hi - lo + 2 * padY) * (bottom - top);
    g.strokeStyle = "rgba(137,182,211,0.4)";
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < f0.D.length; i++) {
      const px = X(f0.s0 * f0.gamma + i * f0.gamma), py = Y(f0.D[i]);
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
    xs = i => X((f.s0 + i) * f.gamma);
    ys = i => Y(f.D[i]);
    count = f.D.length;
    const i = Math.round(fraction * (count - 1));
    marker = [xs(i), ys(i)];
  } else {
    const c = wallOf(v);
    const lo = Math.min(...c.D), hi = Math.max(...c.D);
    const padY = (hi - lo) * 0.05 + 1e-9;
    const X = (t: number) => left + t / 399 * (right - left);
    const Y = (d: number) => bottom - (d - (lo - padY)) / (hi - lo + 2 * padY) * (bottom - top);
    xs = X;
    ys = t => Y(c.D[t]);
    count = c.D.length;
    const i = Math.round(fraction * (count - 1));
    marker = [xs(i), ys(i)];
  }
  g.strokeStyle = "#273443";
  g.beginPath();
  g.moveTo(left, bottom);
  g.lineTo(right, bottom);
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = GOLD;
  const D = view === "frame" ? frameOf(u).D : wallOf(v).D;
  g.beginPath();
  g.moveTo(xs(0), ys(0));
  for (let i = 1; i < count; i++) {
    const rise = D[i] - D[i - 1] > 1e-12;
    if (rise) {
      g.stroke();
      g.strokeStyle = RED;
      g.beginPath();
      g.moveTo(xs(i - 1), ys(i - 1));
    }
    g.lineTo(xs(i), ys(i));
    if (rise) {
      g.stroke();
      g.strokeStyle = GOLD;
      g.beginPath();
      g.moveTo(xs(i), ys(i));
    }
  }
  g.stroke();
  g.fillStyle = "#95a6b7";
  g.fillText("information left", 3, 12);
  g.textAlign = "right";
  g.fillText(view === "frame" ? "observer's proper time" : "time", right, h - 3);
  g.textAlign = "left";
  if (marker) {
    g.fillStyle = GOLD;
    g.beginPath();
    g.arc(marker[0], marker[1], 3.5, 0, 2 * Math.PI);
    g.fill();
    g.strokeStyle = "#0b1420";
    g.stroke();
  }
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
  if (view === "frame") {
    slabel.textContent = "observer speed";
    slider.min = "-0.75";
    slider.max = "0.75";
    slider.value = String(u);
    svalue.textContent = `${u.toFixed(2)} c`;
    status.textContent = "";
    status.style.color = "";
    tick.hidden = true;
  } else {
    slabel.textContent = "wall speed";
    slider.min = "0";
    slider.max = "1.5";
    slider.value = String(v);
    svalue.textContent = `${v.toFixed(2)} c`;
    status.textContent = v < 1 ? "slower than light: leaks" : v === 1 ? "light speed: a horizon, sealed" : "faster than light: sealed";
    status.style.color = v < 1 ? RED : SEALED;
    tick.hidden = false;
  }
  draw();
}

function loop(now: number) {
  if (!playing || !data) return;
  const span = view === "frame" ? 12000 : 9000;
  fraction += ((lastFrame ? now - lastFrame : 16) / span);
  lastFrame = now;
  if (fraction >= 1) {
    fraction = 1;
    playing = false;
    play.textContent = "▶";
  }
  draw();
  if (playing) requestAnimationFrame(loop);
  else lastFrame = 0;
}

frameBtn.onclick = () => {
  if (view === "frame") return;
  view = "frame";
  playing = false;
  play.textContent = "▶";
  sync();
};
wallBtn.onclick = () => {
  if (view === "wall") return;
  view = "wall";
  playing = false;
  play.textContent = "▶";
  sync();
};
slider.oninput = () => {
  if (view === "frame") u = clamp(Number(slider.value), -0.75, 0.75);
  else v = clamp(Number(slider.value), 0, 1.5);
  sync();
};
play.onclick = () => {
  if (!data) return;
  if (playing) {
    playing = false;
    play.textContent = "▶";
    return;
  }
  if (fraction >= 1) fraction = 0;
  playing = true;
  play.textContent = "Ⅱ";
  requestAnimationFrame(loop);
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
  (window as any).probe.adapter = data.adapter;
  sync();
}

void main().catch(fail);

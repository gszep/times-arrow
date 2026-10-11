import { Billiard, ROOM, SCATTERERS, scatR, surfacesFor, GRIDS } from "./billiard.ts";
import type { Config, Surf } from "./billiard.ts";
import { gpu, watchDevice } from "../src/gpu.ts";
import { sObs, areaOf, rEqOf, cellFields, pNegGauss } from "./analyze.ts";

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => {
  const v = Number(params.get(k));
  return params.has(k) && !Number.isNaN(v) ? v : d;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// A-family (point A) red, B-family teal; circles solid, squares dashed.
const FAM = [
  { label: "A circles", color: "#b91c1c" },
  { label: "A squares", color: "#ef4444" },
  { label: "B circles", color: "#0d9488" },
  { label: "B squares", color: "#14b8a6" },
];

let proto: "door" | "release" = params.get("proto") === "release" ? "release" : "door";
let knobs: Record<string, unknown> = {
  n: clamp(Math.round(num("n", 50000)), 1000, 200000),
  seed: clamp(Math.round(num("seed", 1)), 0, 2 ** 31 - 1),
  spread: num("spread", 0) === 0.25 ? 0.25 : 0,
  scatm: ([0, 1, 4, 9] as const).includes(Math.round(num("scatm", 0)) as 0 | 1 | 4 | 9) ? (Math.round(num("scatm", 0)) as 0 | 1 | 4 | 9) : 0,
  spawn: (["room", "disc", "table"] as const).includes(params.get("spawn") as "room") ? (params.get("spawn") as "room" | "disc" | "table") : proto === "door" ? "room" : "disc",
  startDisc: num("r0", 0.01) === 0 ? 0 : 0.01,
};
let door = clamp(num("door", 0.08), 0, 2 * ROOM.h);
let grid = (GRIDS as readonly number[]).includes(Math.round(num("c", 32))) ? Math.round(num("c", 32)) : 32;
let W = clamp(Math.round(num("w", 25)), 1, 200);
let pts = {
  a: { x: clamp(num("ax", proto === "door" ? 0.5 : 0.5), 0, 1), y: clamp(num("ay", proto === "door" ? 0.82 : 0.5), 0, 1) },
  b: { x: clamp(num("bx", proto === "door" ? 0.25 : 0.75), 0, 1), y: clamp(num("by", proto === "door" ? 0.25 : 0.25), 0, 1) },
};
let tap = params.get("tap") === "b" ? "b" : "a";
let speed = clamp(Math.round(num("speed", 1)), 1, 4);
let ensR = num("ens", 8) === 32 ? 32 : 8;
let playing = params.get("play") !== "0";
let view: "single" | "ensemble" = params.get("view") === "ensemble" ? "ensemble" : "single";
let heatAvg = params.get("heat") === "avg";

let customSurfaces: Surf[] | null = null;

/** Default knobs and points when the protocol switches. */
const setProto = (p: "door" | "release") => {
  proto = p;
  if (p === "door") {
    knobs.spawn = "room";
    pts = { a: { x: 0.5, y: 0.82 }, b: { x: 0.25, y: 0.25 } };
  } else {
    knobs.spawn = "disc";
    pts = { a: { x: 0.5, y: 0.5 }, b: { x: 0.75, y: 0.25 } };
  }
};

const mkcfg = (): Config => ({
  n: knobs.n as number,
  seed: knobs.seed as number,
  door: proto === "door" ? door : 0,
  walls: proto === "door",
  scatm: (knobs.scatm as 0 | 1 | 4 | 9) && proto === "door" ? ((knobs.scatm as 0 | 1 | 4 | 9) === 1 ? 1 : 0) : (knobs.scatm as 0 | 1 | 4 | 9),
  spawn: knobs.spawn as Config["spawn"],
  startDisc: knobs.startDisc as number,
  spread: knobs.spread as number,
  grid,
  surfaces: customSurfaces ?? surfacesFor([pts.a, pts.b], grid),
});

const url = () => {
  const q = new URLSearchParams({
    proto,
    ...Object.fromEntries(Object.entries(knobs).map(([k, v]) => [k, String(v)])),
    door: String(door),
    c: String(grid),
    w: String(W),
    ax: pts.a.x.toFixed(3),
    ay: pts.a.y.toFixed(3),
    bx: pts.b.x.toFixed(3),
    by: pts.b.y.toFixed(3),
    tap,
    speed: String(speed),
    ens: String(ensR),
    view,
    heat: heatAvg ? "avg" : "last",
  });
  if (!playing) q.set("play", "0");
  history.replaceState(null, "", `?${q.toString()}`);
};

type Win = { t: number; sig: number[]; sigma: Float64Array; div: Float64Array };
const windows: Win[] = [];
let lastOcc: Uint32Array | null = null;
let lastField: { sigma: Float64Array; div: Float64Array; divInt: Float64Array } | null = null;
let sigSum: Float64Array | null = null;
let divSum: Float64Array | null = null;
type Ens = { r: number; mean: number[]; se: number[]; pNeg: number[]; pNegSe: number[]; heat: Float64Array };
let ens: Ens | null = null;
let ensBusy = false;
let probeBusy = false;

type Series = { pts: [number, number][]; color: string; dash?: boolean; label?: string; lo?: number[]; hi?: number[] };
type Mark = { y: number; color: string; label?: string };

function plot(canvas: HTMLCanvasElement, series: Series[], marks: Mark[] = [], xLabel = "", yLabel = "") {
  const dpr = devicePixelRatio;
  const rect = canvas.getBoundingClientRect();
  const w = (canvas.width = Math.max(60, Math.round(rect.width * dpr)));
  const h = (canvas.height = Math.max(60, Math.round(rect.height * dpr)));
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const all = [
    ...series.flatMap((s) => [...s.pts, ...(s.lo ?? []).map((v, i) => [s.pts[i][0], v] as [number, number]), ...(s.hi ?? []).map((v, i) => [s.pts[i][0], v] as [number, number])]),
    ...marks.map((m) => [0, m.y] as [number, number]),
  ];
  if (!all.length) return;
  const x1 = Math.max(1e-9, ...all.map((p) => p[0]));
  const y0 = Math.min(0, ...all.map((p) => p[1]));
  const y1 = Math.max(...all.map((p) => p[1]));
  const m = 34 * dpr;
  const px = (x: number) => m + (x / x1) * (w - 2 * m);
  const py = (y: number) => h - m - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * m);
  ctx.strokeStyle = "#ddd";
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  ctx.font = `${11 * dpr}px system-ui`;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toExponential(0) : String(Math.round(v * 1000) / 1000));
  ctx.fillStyle = "#666";
  ctx.fillText(fmt(y1), 4 * dpr, m + 10 * dpr);
  ctx.fillText(fmt(y0), 4 * dpr, h - m);
  for (const mk of marks) {
    ctx.strokeStyle = mk.color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(m, py(mk.y));
    ctx.lineTo(w - m, py(mk.y));
    ctx.stroke();
    ctx.setLineDash([]);
    if (mk.label) {
      ctx.fillStyle = mk.color;
      ctx.fillText(mk.label, m + 4 * dpr, py(mk.y) - 4 * dpr);
    }
  }
  let legend = m;
  for (const s of series) {
    if (s.lo && s.hi && s.pts.length) {
      ctx.fillStyle = s.color + "26";
      ctx.beginPath();
      s.pts.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), py(s.hi![i])) : ctx.moveTo(px(p[0]), py(s.hi![i]))));
      for (let i = s.pts.length - 1; i >= 0; i--) ctx.lineTo(px(s.pts[i][0]), py(s.lo[i]));
      ctx.closePath();
      ctx.fill();
    }
    if (!s.pts.length) continue;
    ctx.strokeStyle = s.color;
    ctx.setLineDash(s.dash ? [5, 4] : []);
    ctx.lineWidth = s.dash ? 1 : 1.5;
    ctx.beginPath();
    s.pts.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), py(p[1])) : ctx.moveTo(px(p[0]), py(p[1]))));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    if (s.label) {
      ctx.fillStyle = s.color;
      ctx.fillText(s.label, legend, m - 6 * dpr);
      legend += ctx.measureText(s.label).width + 16 * dpr;
    }
  }
  if (xLabel) {
    ctx.fillStyle = "#666";
    ctx.fillText(xLabel, w - m - ctx.measureText(xLabel).width, h - 6 * dpr);
  }
  if (yLabel) {
    ctx.save();
    ctx.translate(10 * dpr, m + 4 * dpr);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}

const out = $("out");

try {
  const { device, adapter } = await gpu();
  const watch = watchDevice(device);
  const bill = await Billiard.create(device, mkcfg());

  // ── window machinery ──────────────────────────────────────────────────────
  const areas = () => bill.cfg.surfaces.map(areaOf);

  const advanceWindow = async (k: number, full = true) => {
    const r = await watch.race(bill.advance(k, full));
    const A = areas();
    const sig = A.map((a, j) => sObs(r.ctr[j] / bill.cfg.n, a) - sObs(r.prevCtr[j] / bill.cfg.n, a));
    let sigma: Float64Array | null = null;
    let div: Float64Array | null = null;
    if (full && r.flux) {
      const f = cellFields(r.flux, r.prevOcc, bill.cfg.grid, bill.cfg.n);
      sigma = f.sigma;
      div = f.div;
      lastOcc = r.occ!;
      lastField = { sigma, div, divInt: div };
      if (!sigSum || !divSum) {
        sigSum = new Float64Array(sigma);
        divSum = new Float64Array(div);
      } else {
        for (let i = 0; i < sigSum.length; i++) {
          sigSum[i] += sigma[i];
          divSum[i] += div[i];
        }
      }
      windows.push({ t: r.t, sig, sigma, div });
    }
    return { t: r.t, sig, ctr: r.ctr, prevCtr: r.prevCtr, flux: r.flux, occ: r.occ, sigma, div };
  };

  const reinit = async (opts: { keepCustom?: boolean; keepEns?: boolean } = {}) => {
    if (!opts.keepCustom) customSurfaces = null;
    const s = await bill.reset(mkcfg());
    windows.length = 0;
    sigSum = null;
    divSum = null;
    lastOcc = s.occ;
    lastField = null;
    if (!opts.keepEns) ens = null;
    view = "single";
    url();
    controls();
    draw();
    readout();
    plots();
    return s;
  };

  // ── drawing ────────────────────────────────────────────────────────────────
  const table = $("table") as HTMLCanvasElement;
  const tctx = table.getContext("2d")!;
  const off = document.createElement("canvas");
  const octx = off.getContext("2d")!;

  const geometry = (ctx: CanvasRenderingContext2D, px: number, light: boolean) => {
    const X = (x: number) => x * px;
    const Y = (y: number) => (1 - y) * px;
    const lw = Math.max(1.5, px / 220);
    ctx.lineWidth = lw;
    ctx.strokeStyle = light ? "#94a3b8" : "#1f2937";
    ctx.strokeRect(lw / 2, lw / 2, px - lw, px - lw);
    const sr = scatR(bill.cfg.scatm);
    for (const [sx, sy] of SCATTERERS[bill.cfg.scatm]) {
      ctx.fillStyle = "#cbd5e1";
      ctx.beginPath();
      ctx.arc(X(sx), Y(sy), sr * px, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    const rx = ROOM.x - ROOM.h;
    const rb = ROOM.y - ROOM.h;
    const rs = 2 * ROOM.h;
    const dw = bill.cfg.door / 2;
    if (bill.cfg.walls) {
      ctx.beginPath();
      ctx.moveTo(X(rx), Y(rb));
      ctx.lineTo(X(rx), Y(rb + rs));
      ctx.moveTo(X(rx + rs), Y(rb));
      ctx.lineTo(X(rx + rs), Y(rb + rs));
      ctx.moveTo(X(rx), Y(rb));
      ctx.lineTo(X(rx + rs), Y(rb));
      ctx.moveTo(X(rx), Y(rb + rs));
      ctx.lineTo(X(ROOM.x - dw), Y(rb + rs));
      ctx.moveTo(X(ROOM.x + dw), Y(rb + rs));
      ctx.lineTo(X(rx + rs), Y(rb + rs));
      ctx.stroke();
      if (bill.cfg.door > 0) {
        ctx.strokeStyle = "#d97706";
        const tick = 0.022 * px;
        ctx.beginPath();
        ctx.moveTo(X(ROOM.x - dw), Y(rb + rs));
        ctx.lineTo(X(ROOM.x - dw), Y(rb + rs) - tick);
        ctx.moveTo(X(ROOM.x + dw), Y(rb + rs));
        ctx.lineTo(X(ROOM.x + dw), Y(rb + rs) - tick);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = light ? "#cbd5e1" : "#333";
    for (const [k, s] of bill.cfg.surfaces.entries()) {
      const famA = Math.abs(s.x - pts.a.x) < 1e-9 && Math.abs(s.y - pts.a.y) < 1e-9;
      ctx.strokeStyle = light ? "#cbd5e1" : famA ? "#b91c1c" : "#0d9488";
      if (light) ctx.globalAlpha = 0.35;
      ctx.setLineDash(s.square ? [4, 3] : []);
      ctx.lineWidth = Math.max(1, px / 500);
      ctx.beginPath();
      if (s.square) {
        ctx.rect(X(s.x - s.r), Y(s.y + s.r), 2 * s.r * px, 2 * s.r * px);
      } else {
        ctx.arc(X(s.x), Y(s.y), s.r * px, 0, 2 * Math.PI);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  };

  const drawTable = () => {
    const dpr = devicePixelRatio;
    const px = Math.max(60, Math.round(table.clientWidth * dpr));
    if (table.width !== px) {
      table.width = px;
      table.height = px;
    }
    tctx.clearRect(0, 0, px, px);
    const C = bill.cfg.grid;
    if (lastOcc && off.width !== C) {
      off.width = C;
      off.height = C;
    }
    if (lastOcc) {
      const img = octx.createImageData(C, C);
      const bar = bill.cfg.n / (C * C);
      for (let r = 0; r < C; r++) {
        for (let c = 0; c < C; c++) {
          const i = r * C + c;
          const q = ((C - 1 - r) * C + c) * 4;
          const a = Math.min(1, (lastOcc[i] / bar) * 0.5);
          img.data[q] = 30;
          img.data[q + 1] = 41;
          img.data[q + 2] = 59;
          img.data[q + 3] = Math.round(255 * a);
        }
      }
      octx.putImageData(img, 0, 0);
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(off, 0, 0, px, px);
    }
    geometry(tctx, px, false);
    const mark = (p: { x: number; y: number }, color: string) => {
      tctx.strokeStyle = color;
      tctx.lineWidth = Math.max(2, px / 150);
      const s = 0.012 * px;
      tctx.beginPath();
      tctx.moveTo(p.x * px - s, (1 - p.y) * px);
      tctx.lineTo(p.x * px + s, (1 - p.y) * px);
      tctx.moveTo(p.x * px, (1 - p.y) * px - s);
      tctx.lineTo(p.x * px, (1 - p.y) * px + s);
      tctx.stroke();
    };
    mark(pts.a, "#b91c1c");
    mark(pts.b, "#0d9488");
  };

  const heat = (canvas: HTMLCanvasElement, field: Float64Array | null, sum: Float64Array | null) => {
    const dpr = devicePixelRatio;
    const rect = canvas.getBoundingClientRect();
    const px = Math.max(60, Math.round(rect.width * dpr));
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, px, px);
    const C = bill.cfg.grid;
    const f = heatAvg && sum ? sum.map((v) => v / windows.length) : field;
    if (!f) {
      ctx.fillStyle = "#666";
      ctx.fillText(playing ? "…" : "press ▶", 10 * dpr, 20 * dpr);
      return;
    }
    if (off.width !== C) {
      off.width = C;
      off.height = C;
    }
    const abs = [...f].map(Math.abs).sort((x, y) => x - y);
    const scale = (abs[abs.length - 1] ?? 0) <= 0 ? 1 : abs[Math.floor(abs.length * 0.98)] || abs[abs.length - 1];
    const img = octx.createImageData(C, C);
    for (let r = 0; r < C; r++) {
      for (let c = 0; c < C; c++) {
        const i = r * C + c;
        const q = ((C - 1 - r) * C + c) * 4;
        const t = Math.max(-1, Math.min(1, f[i] / scale));
        img.data[q] = t > 0 ? 250 : 37;
        img.data[q + 1] = t > 0 ? 128 + t * 70 : 99 + Math.abs(t) * 60;
        img.data[q + 2] = t > 0 ? 114 - t * 60 : 235;
        img.data[q + 3] = Math.round(255 * Math.min(1, Math.abs(t) * 3));
      }
    }
    octx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, px, px);
    geometry(ctx, px, true);
  };

  const draw = () => {
    drawTable();
    heat($("sigmah") as HTMLCanvasElement, lastField?.sigma ?? null, sigSum);
    heat($("divh") as HTMLCanvasElement, lastField?.div ?? null, divSum);
  };

  // ── stats ────────────────────────────────────────────────────────────────
  const family = (s: Surf) =>
    Math.abs(s.x - pts.a.x) < 1e-9 && Math.abs(s.y - pts.a.y) < 1e-9 ? 0 : Math.abs(s.x - pts.b.x) < 1e-9 && Math.abs(s.y - pts.b.y) < 1e-9 ? 2 : -1;

  const surfStats = () => {
    const K = bill.cfg.surfaces.length;
    const n = windows.length;
    const mean = new Array(K).fill(0);
    const sd = new Array(K).fill(0);
    const pNeg = new Array(K).fill(0);
    for (const w of windows) for (let k = 0; k < K; k++) mean[k] += w.sig[k];
    if (n) for (let k = 0; k < K; k++) mean[k] /= n;
    if (n > 1) {
      for (const w of windows) for (let k = 0; k < K; k++) sd[k] += (w.sig[k] - mean[k]) ** 2;
      for (let k = 0; k < K; k++) sd[k] = Math.sqrt(sd[k] / (n - 1));
    }
    for (const w of windows) for (let k = 0; k < K; k++) if (w.sig[k] < 0) pNeg[k]++;
    if (n) for (let k = 0; k < K; k++) pNeg[k] /= n;
    return { n, mean, sd, pNeg };
  };

  // ── controls ──────────────────────────────────────────────────────────────
  const link = (text: string, data: string) => `<a href="#" ${data}>${text}</a>`;
  const controls = () => {
    $("parline").textContent =
      proto === "door"
        ? `room full, door ${door.toFixed(3)} · walls stay on · A at the door mouth, B far · grid ${grid}², window ${W} steps`
        : `released from the centre (r₀ = ${bill.cfg.startDisc}) · walls off · A at the centre, B far · grid ${grid}², window ${W} steps`;
    $("doorrow").style.display = proto === "door" ? "" : "none";
    $("r0row").style.display = proto === "release" ? "" : "none";
    $("wlinks").innerHTML = [5, 10, 25, 50, 100]
      .filter((v) => v >= 1)
      .map((v) => (W === v ? String(v) : link(String(v), `data-w="${v}"`)))
      .join(" · ");
    $("clinks").innerHTML = GRIDS.map((v) => (grid === v ? `${v}²` : link(`${v}²`, `data-c="${v}"`))).join(" · ");
    $("nlinks").innerHTML = [12500, 50000, 200000]
      .map((v) => (bill.cfg.n === v ? `${v / 1000}k` : link(`${v / 1000}k`, `data-n="${v}"`)))
      .join(" · ");
    $("enslinks").innerHTML = [8, 32]
      .map((v) => (ensR === v ? String(v) : link(String(v), `data-ens="${v}"`)))
      .join(" · ");
    $("speedlinks").innerHTML = [1, 2, 4]
      .map((v) => (speed === v ? String(v) : link(String(v), `data-speed="${v}"`)))
      .join(" · ");
    $("seedlinks").innerHTML = `${link("−", `data-seed="${bill.cfg.seed - 1}"`)} ${bill.cfg.seed} ${link("+", `data-seed="${bill.cfg.seed + 1}"`)}`;
    $("spreadlinks").innerHTML = [0, 0.25]
      .map((v) => (bill.cfg.spread === v ? (v ? "±25%" : "one speed") : link(v ? "±25%" : "one speed", `data-spread="${v}"`)))
      .join(" · ");
    $("scatlinks").innerHTML = (proto === "door" ? [0, 1] : [0, 1, 4, 9])
      .map((v) => (bill.cfg.scatm === v ? String(v) : link(String(v), `data-scatm="${v}"`)))
      .join(" · ");
    $("r0links").innerHTML = [0.01, 0]
      .map((v) => (bill.cfg.startDisc === v ? (v ? `disc r₀=${v}` : "point") : link(v ? `disc r₀=${v}` : "point", `data-r0="${v}"`)))
      .join(" · ");
    $("taplinks").innerHTML = [tap === "a" ? "A (red)" : link("A (red)", 'data-tap="a"'), tap === "b" ? "B (teal)" : link("B (teal)", 'data-tap="b"')].join(" · ");
    $("heatlinks").innerHTML = heatAvg ? link("latest window", 'data-heat="last"') : link("average so far", 'data-heat="avg"');
    $("doorlabel").textContent = door.toFixed(3);
    ($("play") as HTMLButtonElement).textContent = playing ? "⏸" : "▶";
    ($("view") as HTMLButtonElement).textContent = `view: ${view === "single" ? "single run" : `ensemble of ${ens?.r ?? ensR}`}`;
    if (!ensBusy) $("ensline").textContent = view === "ensemble" && !ens ? "computing ensemble…" : "";
  };

  $("play").onclick = () => {
    playing = !playing;
    url();
    controls();
  };
  $("reset").onclick = () => void reinit();
  $("protoDoor").onclick = () => {
    setProto("door");
    void reinit();
  };
  $("protoRel").onclick = () => {
    setProto("release");
    void reinit();
  };
  $("view").onclick = () => {
    view = view === "single" ? "ensemble" : "single";
    if (view === "ensemble" && !ens) void runEnsemble(ensR);
    url();
    controls();
    plots();
  };
  $("runens").onclick = () => void runEnsemble(ensR);
  const doorEl = $("door") as HTMLInputElement;
  doorEl.value = String(door);
  doorEl.oninput = () => {
    door = Number(doorEl.value);
    void reinit();
  };
  const onlink = (id: string, fn: (a: HTMLElement) => void) =>
    $(id).addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a");
      if (a) {
        e.preventDefault();
        fn(a);
      }
    });
  onlink("wlinks", (a) => {
    W = Number(a.dataset.w);
    void reinit();
  });
  onlink("clinks", (a) => {
    grid = Number(a.dataset.c);
    void reinit();
  });
  onlink("nlinks", (a) => {
    knobs.n = Number(a.dataset.n);
    void reinit();
  });
  onlink("enslinks", (a) => {
    ensR = Number(a.dataset.ens);
    url();
    controls();
  });
  onlink("speedlinks", (a) => {
    speed = Number(a.dataset.speed);
    url();
    controls();
  });
  onlink("seedlinks", (a) => {
    knobs.seed = clamp(Number(a.dataset.seed), 0, 2 ** 31 - 1);
    void reinit();
  });
  onlink("spreadlinks", (a) => {
    knobs.spread = Number(a.dataset.spread);
    void reinit();
  });
  onlink("scatlinks", (a) => {
    knobs.scatm = Number(a.dataset.scatm);
    void reinit();
  });
  onlink("r0links", (a) => {
    knobs.startDisc = Number(a.dataset.r0);
    void reinit();
  });
  onlink("taplinks", (a) => {
    tap = a.dataset.tap === "b" ? "b" : "a";
    url();
    controls();
  });
  onlink("heatlinks", (a) => {
    heatAvg = a.dataset.heat === "avg";
    url();
    controls();
    draw();
  });

  table.addEventListener("pointerdown", (e) => {
    const rect = table.getBoundingClientRect();
    const x = clamp((e.clientX - rect.left) / rect.width, 0.001, 0.999);
    const y = clamp(1 - (e.clientY - rect.top) / rect.height, 0.001, 0.999);
    if (tap === "b") pts.b = { x, y };
    else pts.a = { x, y };
    void reinit();
  });

  // ── readout and plots ────────────────────────────────────────────────────
  const readout = () => {
    const occSum = lastOcc ? lastOcc.reduce((s, v) => s + v, 0) : 0;
    const divSum = lastField ? lastField.divInt.reduce((s, v) => s + v, 0) : 0;
    const gross = lastField ? lastField.div.reduce((s, v) => s + Math.abs(v), 0) : 0;
    $("live").textContent = lastField
      ? `t = ${bill.t} · ${windows.length} windows of ${W} · census Σn = ${occSum} (n = ${bill.cfg.n}) · Σ ∇·J = ${divSum} (0 exactly) · mean |∇·J| = ${gross}`
      : playing
        ? "…"
        : "press ▶";
  };

  const plots = () => {
    const st = surfStats();
    if (!windows.length) {
      plot($("phi") as HTMLCanvasElement, [], [], "r", "");
      plot($("pneg") as HTMLCanvasElement, [], [], "r", "");
      plot($("ft") as HTMLCanvasElement, [], [], "⟨σ⟩/sd", "");
      return;
    }
    const e = view === "ensemble" && ens ? ens : null;
    const phiY = (k: number, s: Surf) => (e ? e.mean[k] / W / areaOf(s) : st.mean[k] / W / areaOf(s));
    const phiSeries: Series[] = [];
    const pnegSeries: Series[] = [];
    for (let f = 0; f < 4; f++) {
      const idx = bill.cfg.surfaces
        .map((s, k) => ({ s, k }))
        .filter(({ s }) => family(s) === f - (f % 2) && s.square === (f % 2 === 1))
        .map(({ k }) => k)
        .sort((k1, k2) => rEqOf(bill.cfg.surfaces[k1]) - rEqOf(bill.cfg.surfaces[k2]));
      const mk = (y: (k: number) => number, se?: (k: number) => number): Series => {
        const s: Series = {
          pts: idx.map((k) => [rEqOf(bill.cfg.surfaces[k]), y(k)] as [number, number]),
          color: FAM[f].color,
          dash: f % 2 === 1,
          label: FAM[f].label,
        };
        if (se) {
          s.lo = s.pts.map((p, i) => p[1] - 2 * se(idx[i]));
          s.hi = s.pts.map((p, i) => p[1] + 2 * se(idx[i]));
        }
        return s;
      };
      phiSeries.push(mk((k) => phiY(k, bill.cfg.surfaces[k]), e ? (k) => (e.se[k] / W) / areaOf(bill.cfg.surfaces[k]) : undefined));
      pnegSeries.push(mk((k) => (e ? e.pNeg[k] : st.pNeg[k]), e ? (k) => e.pNegSe[k] : undefined));
    }
    plot($("phi") as HTMLCanvasElement, phiSeries, [], "r", "Φ/area");
    plot($("pneg") as HTMLCanvasElement, pnegSeries, [{ y: 0.5, color: "#9ca3af", label: "½ (equilibrium)" }], "r", "P(σ<0)");

    // fluctuation check: P(σ<0) against ⟨σ⟩/sd, one Gaussian tail curve over all
    const ft: Series[] = [{ pts: Array.from({ length: 60 }, (_, i) => {
      const x = (i * 3) / 59;
      return [x, pNegGauss(x, 1)] as [number, number];
    }), color: "#111827", dash: true, label: "½erfc(x/√2)" }];
    for (let f = 0; f < 4; f++) {
      const idx = bill.cfg.surfaces
        .map((s, k) => ({ s, k }))
        .filter(({ s }) => family(s) === f - (f % 2) && s.square === (f % 2 === 1))
        .map(({ k }) => k);
      ft.push({
        pts: idx
          .map((k) => [st.mean[k] / (st.sd[k] || 1e-9), st.pNeg[k]] as [number, number])
          .filter((p) => p[0] >= 0),
        color: FAM[f].color,
        dash: f % 2 === 1,
        label: f === 0 ? "measured" : undefined,
      });
    }
    plot($("ft") as HTMLCanvasElement, ft, [], "⟨σ⟩/sd per window", "P(σ<0)");
  };

  // ── the ensemble ──────────────────────────────────────────────────────────
  const frameGap = () => new Promise<void>((res) => {
    let done = false;
    requestAnimationFrame(() => {
      if (!done) {
        done = true;
        res();
      }
    });
    setTimeout(() => {
      if (!done) {
        done = true;
        res();
      }
    }, 100);
  });

  const T_ENS = 1200;

  const runEnsemble = async (R: number): Promise<Ens | null> => {
    if (ensBusy) return ens;
    ensBusy = true;
    ens = null;
    view = "ensemble";
    controls();
    url();
    const K = bill.cfg.surfaces.length;
    const nWin = Math.floor(T_ENS / W);
    const perSeedMean: number[][] = [];
    const perSeedPNeg: number[][] = [];
    const heatSum = new Float64Array(grid * grid);
    for (let s = 0; s < R; s++) {
      await bill.reset({ ...mkcfg(), seed: (bill.cfg.seed + s) as number });
      let sum = new Array(K).fill(0);
      let neg = new Array(K).fill(0);
      for (let j = 0; j < nWin; j++) {
        const r = await watch.race(bill.advance(W, true));
        const A = areas();
        for (let k = 0; k < K; k++) {
          const sg = sObs(r.ctr[k] / bill.cfg.n, A[k]) - sObs(r.prevCtr[k] / bill.cfg.n, A[k]);
          sum[k] += sg;
          if (sg < 0) neg[k]++;
        }
        const f = cellFields(r.flux!, r.prevOcc, grid, bill.cfg.n);
        f.sigma.forEach((v, i) => (heatSum[i] += v));
      }
      perSeedMean.push(sum.map((v) => v / nWin));
      perSeedPNeg.push(neg.map((v) => v / nWin));
      $("ensline").textContent = `ensemble: seed ${s + 1}/${R} done`;
      await frameGap();
    }
    const mean = perSeedMean[0].map((_, k) => perSeedMean.reduce((s, a) => s + a[k], 0) / R);
    const se = perSeedMean[0].map((_, k) => {
      const v = perSeedMean.reduce((s, a) => s + (a[k] - mean[k]) ** 2, 0) / (R - 1);
      return Math.sqrt(v / R);
    });
    const pNeg = perSeedPNeg[0].map((_, k) => perSeedPNeg.reduce((s, a) => s + a[k], 0) / R);
    const pNegSe = perSeedPNeg[0].map((_, k) => {
      const v = perSeedPNeg.reduce((s, a) => s + (a[k] - pNeg[k]) ** 2, 0) / (R - 1);
      return Math.sqrt(v / R);
    });
    ens = { r: R, mean, se, pNeg, pNegSe, heat: heatSum.map((v) => v / (R * nWin)) };
    ensBusy = false;
    await reinit({ keepCustom: true, keepEns: true });
    view = "ensemble";
    url();
    controls();
    plots();
    return ens;
  };

  // ── the loop ──────────────────────────────────────────────────────────────
  let busy = false;
  const frame = () => {
    if (!probeBusy && !ensBusy) {
      if (playing && !busy) {
        busy = true;
        void advanceWindow(W)
          .then(() => {
            draw();
            readout();
            plots();
          })
          .catch((e) => {
            playing = false;
            out.textContent = String(e instanceof Error ? e.message : e);
          })
          .finally(() => {
            busy = false;
          });
      } else if (!busy) {
        draw();
      }
    }
    requestAnimationFrame(frame);
  };

  // ── the probe ─────────────────────────────────────────────────────────────
  Object.assign(window, {
    probe: {
      adapter,
      config: () => ({ ...bill.cfg, proto, W, view, speed, ensR, tap, points: { ...pts } }),
      run: async (k?: number, full?: boolean) => {
        probeBusy = true;
        try {
          const n = k ?? W;
          return await advanceWindow(n, full ?? true);
        } finally {
          probeBusy = false;
          controls();
          readout();
          plots();
          draw();
        }
      },
      burst: async (w: number, full: boolean, count: number) => {
        probeBusy = true;
        try {
          const K = bill.cfg.surfaces.length;
          const A = areas();
          if (!full) {
            const K = bill.cfg.surfaces.length;
            const ctrSeries: number[][] = [];
            for (let j = 0; j < count; j++) {
              const r = await watch.race(bill.advance(w, false));
              ctrSeries.push([...r.ctr.subarray(0, K)]);
            }
            return { t0: bill.t - w * count, tEnd: bill.t, w, count, ctrSeries };
          }
          const sum = new Array(K).fill(0);
          const sumsq = new Array(K).fill(0);
          const neg = new Array(K).fill(0);
          const heatSum = new Float64Array(grid * grid);
          const divSum2 = new Float64Array(grid * grid);
          const sigs: number[][] = Array.from({ length: K }, () => []);
          let occLast: Uint32Array | null = null;
          for (let j = 0; j < count; j++) {
            const r = await watch.race(bill.advance(w, true));
            occLast = r.occ!;
            const f = cellFields(r.flux!, r.prevOcc, grid, bill.cfg.n);
            f.sigma.forEach((v, i) => (heatSum[i] += v));
            f.div.forEach((v, i) => (divSum2[i] += v));
            for (let k = 0; k < K; k++) {
              const sg = sObs(r.ctr[k] / bill.cfg.n, A[k]) - sObs(r.prevCtr[k] / bill.cfg.n, A[k]);
              sum[k] += sg;
              sumsq[k] += sg * sg;
              if (sg < 0) neg[k]++;
              sigs[k].push(sg);
            }
          }
          lastOcc = occLast;
          lastField = { sigma: heatSum.map((v) => v / count), div: divSum2.map((v) => v / count), divInt: divSum2 };
          const mean = sum.map((v) => v / count);
          const sd = sumsq.map((v, k) => Math.sqrt(Math.max(0, v / count - mean[k] * mean[k])));
          return { t0: bill.t - w * count, tEnd: bill.t, w, count, mean, sd, pNeg: neg.map((v) => v / count), heat: lastField.sigma, div: lastField.div, sigs };
        } finally {
          probeBusy = false;
          controls();
          readout();
          plots();
          draw();
        }
      },
      reset: async (patch: Record<string, unknown> = {}) => {
        probeBusy = true;
        playing = false;
        let s: Awaited<ReturnType<typeof reinit>>;
        try {
          if ("proto" in patch) setProto(patch.proto as "door" | "release");
          customSurfaces = (patch.surfaces as Surf[] | undefined) ?? null;
          if ("ax" in patch) pts.a = { x: patch.ax as number, y: (patch.ay as number) ?? pts.a.y };
          if ("bx" in patch) pts.b = { x: patch.bx as number, y: (patch.by as number) ?? pts.b.y };
          const skip = ["surfaces", "ax", "ay", "bx", "by", "proto"];
          for (const [k, v] of Object.entries(patch)) if (!skip.includes(k)) knobs[k] = v;
          if ("door" in patch) door = patch.door as number;
          if ("grid" in patch) grid = patch.grid as number;
          if ("w" in patch) W = patch.w as number;
          s = await reinit({ keepCustom: true });
        } finally {
          probeBusy = false;
        }
        return { t: s.t, ctr: [...s.ctr.subarray(0, bill.cfg.surfaces.length)] };
      },
      summary: () => {
        const st = surfStats();
        return {
          t: bill.t,
          W,
          nWin: st.n,
          n: bill.cfg.n,
          surfaces: bill.cfg.surfaces.map((s, k) => ({
            x: s.x,
            y: s.y,
            r: s.r,
            square: s.square,
            rEq: rEqOf(s),
            area: areaOf(s),
            meanSig: st.mean[k],
            sdSig: st.sd[k],
            pNeg: st.pNeg[k],
            phi: st.mean[k] / W,
            phiPerArea: st.mean[k] / W / areaOf(s),
          })),
          ens,
        };
      },
      windows: () => ({ W, t: windows.map((w) => w.t), sig: windows.map((w) => w.sig) }),
      heatmap: () => {
        const last = windows[windows.length - 1];
        return {
          C: grid,
          mode: heatAvg ? "avg" : "last",
          sigma: heatAvg && sigSum ? sigSum.map((v) => v / windows.length) : (last?.sigma ?? null),
          div: heatAvg && divSum ? divSum.map((v) => v / windows.length) : (last?.div ?? null),
          occ: lastOcc,
          invariants: probeInvariants(),
        };
      },
      invariants: () => probeInvariants(),
      ensemble: (r?: number) => runEnsemble(r ?? ensR),
      audit: (m?: number) => bill.audit(m),
    },
  });

  function probeInvariants() {
    const occSum = lastOcc ? lastOcc.reduce((s, v) => s + v, 0) : -1;
    const divSum = lastField ? lastField.divInt.reduce((s, v) => s + v, 0) : null;
    const gross = lastField ? lastField.div.reduce((s, v) => s + Math.abs(v), 0) : null;
    return { t: bill.t, n: bill.cfg.n, occSum, divSum, grossDivPerWindow: gross, nWindows: windows.length };
  }

  await reinit();
  requestAnimationFrame(frame);
} catch (e) {
  out.textContent = String(e instanceof Error ? e.message : e);
  Object.assign(window, { probeError: out.textContent });
}

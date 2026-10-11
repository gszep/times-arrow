import { Billiard, GRID, ROOM, SCATTERERS, SURF_A, SURF_B, scatR, tauOf, areaOf } from "./billiard.ts";
import type { Config } from "./billiard.ts";
import { gpu } from "../src/gpu.ts";
import { sObs, sUnw, spectrum, peaks, TABLE_PERIODS } from "./analyze.ts";

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const num = (k: string, d: number) => {
  const v = Number(params.get(k));
  return params.has(k) && !Number.isNaN(v) ? v : d;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const COLORS = ["#b91c1c", "#d97706", "#0d9488", "#64748b"];

const A: Config = { n: 50000, seed: 1, door: 0.08, walls: true, scatm: 0, startIn: true, startDisc: 0, spread: 0, surfaces: SURF_A };
const B: Config = { n: 50000, seed: 1, door: 0, walls: false, scatm: 0, startIn: false, startDisc: 0.01, spread: 0, surfaces: SURF_B };

let proto: "a" | "b" = params.get("proto") === "b" ? "b" : "a";
let knobs: Partial<Config> = {
  n: clamp(Math.round(num("n", 50000)), 1000, 200000),
  seed: clamp(Math.round(num("seed", 1)), 0, 2 ** 31 - 1),
  spread: num("spread", 0) === 0.25 ? 0.25 : 0,
  scatm: ([0, 1, 4, 9] as const).includes(Math.round(num("scatm", 0)) as 0 | 1 | 4 | 9) ? (Math.round(num("scatm", 0)) as 0 | 1 | 4 | 9) : 0,
};
if (proto === "a") knobs.door = clamp(num("door", 0.08), 0, 2 * ROOM.h);
else knobs.startDisc = params.get("r0") === "0" ? 0 : 0.01;
let tOff = clamp(Math.round(num("toff", 600)), 50, 6000);
let speed = clamp(Math.round(num("speed", 2)), 1, 16);
let ensR = num("ens", 8) === 32 ? 32 : 8;
let playing = params.get("play") !== "0";
let view: "single" | "ensemble" = params.get("view") === "ensemble" ? "ensemble" : "single";

const mkcfg = (): Config => {
  const base = { ...(proto === "a" ? A : B), ...knobs };
  if (base.walls) base.scatm = base.scatm ? 1 : 0; // only the room-safe presets with walls on
  return base;
};

const url = () => {
  const q = new URLSearchParams({ proto, ...Object.fromEntries(Object.entries(knobs).map(([k, v]) => [k, String(v)])) } as Record<string, string>);
  q.set("toff", String(tOff));
  q.set("speed", String(speed));
  q.set("ens", String(ensR));
  q.set("view", view);
  if (!playing) q.set("play", "0");
  history.replaceState(null, "", `?${q.toString()}`);
};

type Sample = { t: number; pin: number[]; cin: number; cout: number };
const samples: Sample[] = [];
let grids: { gridIn: Uint32Array; gridOut: Uint32Array } | null = null;
type Ens = { r: number; t: number[]; mean: number[][]; se: number[][] };
let ens: Ens | null = null;
let ensBusy = false;
let probeBusy = false;

type Series = { pts: [number, number][]; color: string; dash?: boolean; label?: string; lo?: number[]; hi?: number[] };
type Mark = { y: number; color: string; label?: string };
type VMark = { x: number; color: string; label?: string };

function plot(canvas: HTMLCanvasElement, series: Series[], marks: Mark[] = [], vmarks: VMark[] = []) {
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
  const x1 = Math.max(1, ...all.map((p) => p[0]));
  const y0 = Math.min(0, ...all.map((p) => p[1]));
  const y1 = Math.max(...all.map((p) => p[1]));
  const m = 34 * dpr;
  const px = (x: number) => m + (x / x1) * (w - 2 * m);
  const py = (y: number) => h - m - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * m);
  ctx.strokeStyle = "#ddd";
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  ctx.font = `${11 * dpr}px system-ui`;
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toExponential(0) : String(Math.round(v * 100) / 100));
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
  for (const vm of vmarks) {
    ctx.strokeStyle = vm.color;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(px(vm.x), m);
    ctx.lineTo(px(vm.x), h - m);
    ctx.stroke();
    ctx.setLineDash([]);
    if (vm.label) {
      ctx.fillStyle = vm.color;
      ctx.fillText(vm.label, px(vm.x) + 3 * dpr, m + 10 * dpr);
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
    if (s.pts.length < 2) continue;
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
  ctx.fillStyle = "#666";
  ctx.fillText(proto === "a" ? "steps" : "cycles/step", w - m - 52 * dpr, h - 6 * dpr);
}

const out = $("out");

try {
  const { device, adapter } = await gpu();
  const bill = await Billiard.create(device, mkcfg());

  const advance = async (k: number, grid = true): Promise<Sample> => {
    const r = await bill.advance(k, grid);
    if (grid && r.gridIn) grids = { gridIn: r.gridIn, gridOut: r.gridOut! };
    const sample = { t: bill.t, pin: r.counts.map((c) => c / bill.cfg.n), cin: r.cin, cout: r.cout };
    samples.push(sample);
    return sample;
  };

  // ── drawing ────────────────────────────────────────────────────────────────
  const canvas = $("table") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const off = document.createElement("canvas");
  off.width = GRID;
  off.height = GRID;
  const offctx = off.getContext("2d")!;
  const img = offctx.createImageData(GRID, GRID);

  const draw = () => {
    const dpr = devicePixelRatio;
    const px = Math.max(60, Math.round(canvas.clientWidth * dpr));
    if (canvas.width !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    ctx.clearRect(0, 0, px, px);
    if (grids) {
      const d = img.data;
      const gi = grids.gridIn;
      const go = grids.gridOut;
      for (let r = 0; r < GRID; r++) {
        const flip = (GRID - 1 - r) * GRID; // world y grows upward, image rows downward
        for (let c = 0; c < GRID; c++) {
          const i = r * GRID + c;
          const nin = gi[i];
          const nout = go[i];
          const q = (flip + c) * 4;
          if (nin + nout === 0) {
            d[q + 3] = 0;
            continue;
          }
          const f = nin / (nin + nout); // crimson inside surface 0, teal outside
          d[q] = 13 + f * 177;
          d[q + 1] = 148 - f * 130;
          d[q + 2] = 136 - f * 76;
          d[q + 3] = Math.round(255 * (1 - Math.exp(-(nin + nout) / 1.6)));
        }
      }
      offctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(off, 0, 0, px, px);
    }
    const X = (x: number) => x * px;
    const Y = (y: number) => (1 - y) * px;
    const lw = Math.max(2, px / 200);
    ctx.lineWidth = lw;
    ctx.strokeStyle = "#333";
    ctx.strokeRect(lw / 2, lw / 2, px - lw, px - lw);
    const sr = scatR(bill.cfg.scatm);
    for (const [sx, sy] of SCATTERERS[bill.cfg.scatm]) {
      ctx.fillStyle = "#cbd5e1";
      ctx.strokeStyle = "#475569";
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
      ctx.strokeStyle = "#1f2937";
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
    for (const [k, s] of bill.cfg.surfaces.entries()) {
      ctx.strokeStyle = COLORS[k] ?? "#7c3aed";
      ctx.setLineDash(k === 0 ? [8, 6] : [3, 4]);
      ctx.lineWidth = Math.max(1.5, px / (k === 0 ? 280 : 400));
      ctx.beginPath();
      if (s.aligned) {
        ctx.moveTo(X(rx), Y(rb));
        ctx.lineTo(X(rx), Y(rb + rs));
        ctx.lineTo(X(rx + rs), Y(rb + rs));
        ctx.lineTo(X(rx + rs), Y(rb));
        ctx.closePath();
      } else {
        ctx.arc(X(s.x), Y(s.y), s.r * px, 0, 2 * Math.PI);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!bill.cfg.startIn) {
      ctx.strokeStyle = "#111827";
      ctx.beginPath();
      ctx.arc(X(0.5), Y(0.5), Math.max(2, bill.cfg.startDisc * px), 0, 2 * Math.PI);
      ctx.stroke();
    }
  };

  // ── controls ──────────────────────────────────────────────────────────────
  const link = (text: string, data: string) => `<a href="#" ${data}>${text}</a>`;
  const controls = () => {
    $("parline").textContent =
      proto === "a"
        ? `walls on, off at t = ${tOff} · door ${bill.cfg.door.toFixed(3)} · scatterer ${bill.cfg.scatm ? "on" : "off"} · surfaces: room + 3 circles`
        : `release from the centre (r₀ = ${bill.cfg.startDisc}) · walls off · scatterers ${bill.cfg.scatm} · surfaces: centred circles + far circle`;
    $("toffrow").style.display = proto === "a" ? "" : "none";
    $("doorrow").style.display = proto === "a" ? "" : "none";
    $("r0row").style.display = proto === "b" ? "" : "none";
    $("nlinks").innerHTML = [12500, 50000, 200000]
      .map((v) => (bill.cfg.n === v ? `${v / 1000}k` : link(`${v / 1000}k`, `data-n="${v}"`)))
      .join(" · ");
    $("enslinks").innerHTML = [8, 32]
      .map((v) => (ensR === v ? String(v) : link(String(v), `data-ens="${v}"`)))
      .join(" · ");
    $("speedlinks").innerHTML = [1, 2, 4, 8, 16]
      .map((v) => (speed === v ? String(v) : link(String(v), `data-speed="${v}"`)))
      .join(" · ");
    $("seedlinks").innerHTML = `${link("−", `data-seed="${bill.cfg.seed - 1}"`)} ${bill.cfg.seed} ${link("+", `data-seed="${bill.cfg.seed + 1}"`)}`;
    $("spreadlinks").innerHTML = [0, 0.25]
      .map((v) => (bill.cfg.spread === v ? (v ? "±25%" : "one speed") : link(v ? "±25%" : "one speed", `data-spread="${v}"`)))
      .join(" · ");
    $("scatlinks").innerHTML = (proto === "a" ? [0, 1] : [0, 1, 4, 9])
      .map((v) => (bill.cfg.scatm === v ? String(v) : link(String(v), `data-scatm="${v}"`)))
      .join(" · ");
    $("r0links").innerHTML = [0.01, 0]
      .map((v) => (bill.cfg.startDisc === v ? (v ? `disc r₀=${v}` : "point") : link(v ? `disc r₀=${v}` : "point", `data-r0="${v}"`)))
      .join(" · ");
    $("tofflabel").textContent = String(tOff);
    $("doorlabel").textContent = bill.cfg.door.toFixed(3);
    ($("play") as HTMLButtonElement).textContent = playing ? "⏸" : "▶";
    ($("view") as HTMLButtonElement).textContent = `view: ${view === "single" ? "single run" : `ensemble of ${ens?.r ?? ensR}`}`;
    if (!ensBusy) $("ensline").textContent = view === "ensemble" && !ens ? "computing ensemble…" : ens ? `ensemble of ${ens.r} seeds — mean, ±2·SE band` : "";
  };

  const reinit = () => {
    bill.configure(mkcfg());
    samples.length = 0;
    grids = null;
    ens = null;
    view = "single";
    url();
    controls();
    draw();
    readout();
    plots();
  };

  $("play").onclick = () => {
    playing = !playing;
    url();
    controls();
  };
  $("reverse").onclick = () => bill.reverse();
  $("reset").onclick = () => reinit();
  $("protoA").onclick = () => setProto("a");
  $("protoB").onclick = () => setProto("b");
  $("view").onclick = () => {
    view = view === "single" ? "ensemble" : "single";
    if (view === "ensemble" && !ens) void runEnsemble(ensR);
    url();
    controls();
    plots();
  };
  $("runens").onclick = () => void runEnsemble(ensR);
  const toff = $("toff") as HTMLInputElement;
  toff.value = String(tOff);
  toff.oninput = () => {
    tOff = Number(toff.value);
    reinit();
  };
  const door = $("door") as HTMLInputElement;
  door.value = String(bill.cfg.door);
  door.oninput = () => {
    knobs.door = Number(door.value);
    reinit();
  };
  const onlink = (id: string, fn: (a: HTMLElement) => void) =>
    $(id).addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest("a");
      if (a) {
        e.preventDefault();
        fn(a);
      }
    });
  onlink("nlinks", (a) => {
    knobs.n = Number(a.dataset.n);
    reinit();
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
    reinit();
  });
  onlink("spreadlinks", (a) => {
    knobs.spread = Number(a.dataset.spread);
    reinit();
  });
  onlink("scatlinks", (a) => {
    knobs.scatm = Number(a.dataset.scatm) as 0 | 1 | 4 | 9;
    reinit();
  });
  onlink("r0links", (a) => {
    knobs.startDisc = Number(a.dataset.r0);
    reinit();
  });

  const setProto = (p: "a" | "b") => {
    const keep: Partial<Config> = {};
    for (const k of ["n", "seed", "spread", "scatm"] as const) if (knobs[k] !== undefined) (keep as Record<string, unknown>)[k] = knobs[k];
    knobs = keep;
    proto = p;
    reinit();
  };

  // ── readouts and plots ────────────────────────────────────────────────────
  const readout = () => {
    const last = samples[samples.length - 1];
    $("live").textContent = last
      ? `t = ${last.t} · walls ${bill.cfg.walls ? "on" : "off"} · p per surface: ${last.pin.map((p, k) => `S${k} ${p.toFixed(3)}`).join(" · ")} · crossings/step (S0): in ${last.cin.toFixed(2)} · out ${last.cout.toFixed(2)}`
      : playing
        ? "…"
        : "press ▶";
    const a0 = areaOf(bill.cfg.surfaces[0]);
    $("clockline").textContent = last
      ? `S_obs(S0) = ${sObs(last.pin[0], a0).toFixed(3)} nats — volume-weighted, max 0 at p = a₀ = ${a0.toFixed(3)} · unweighted S(p₀) = ${sUnw(last.pin[0]).toFixed(3)}`
      : "";
    $("tauline").textContent =
      proto === "b"
        ? "released from the centre: each surface's count relaxes to its area fraction; the question is whether coherent echoes return (spectrum ticks = table periods)"
        : bill.cfg.door > 0
          ? `walls on: effusion τ = π·A_room/(door·⟨v⟩) ≈ ${Math.round(tauOf(bill.cfg.door))} steps, then the walls vanish at t = ${tOff} and the free table rings`
          : "door shut: nothing crosses while the walls are on";
  };

  const decimate = (pts: [number, number][]) =>
    pts.length > 1500 ? pts.filter((_, i) => i % Math.ceil(pts.length / 1500) === 0 || i === pts.length - 1) : pts;

  const plots = () => {
    const K = bill.cfg.surfaces.length;
    const as = bill.cfg.surfaces.map(areaOf);
    const ensv = view === "ensemble" && ens && ens.t.length ? ens : null;
    const T = ensv ? ensv.t : samples.map((s) => s.t);
    const pin = (k: number) => (ensv ? ensv.mean[k] : samples.map((s) => s.pin[k]));
    const se = (k: number) => (ensv ? ensv.se[k] : null);
    const band = (k: number) => (se(k) ? { lo: pin(k).map((v, i) => v - 2 * se(k)![i]), hi: pin(k).map((v, i) => v + 2 * se(k)![i]) } : {});
    const pinSeries: Series[] = [];
    for (let k = 0; k < K; k++)
      pinSeries.push({
        pts: decimate(T.map((t, i) => [t, pin(k)[i]] as [number, number])),
        color: COLORS[k],
        label: `S${k}`,
        ...band(k),
      });
    const marks: Mark[] = [{ y: as[0], color: "#6b7280", label: `a₀ = ${as[0].toFixed(3)}` }];
    const vmarks: VMark[] = [];
    if (proto === "a") {
      vmarks.push({ x: tOff, color: "#111827", label: "walls off" });
      if (bill.cfg.door > 0) {
        const tau = tauOf(bill.cfg.door);
        const a0 = as[0];
        pinSeries.push({
          pts: Array.from({ length: 40 }, (_, i) => {
            const t = (tOff * i) / 39;
            return [t, a0 + (1 - a0) * Math.exp(-t / tau)] as [number, number];
          }),
          color: "#111827",
          dash: true,
          label: `exp(−t/τ), τ ≈ ${Math.round(tau)}`,
        });
      }
    }
    plot($("nin") as HTMLCanvasElement, pinSeries, marks, vmarks);

    const sSeries: Series[] = [];
    const sBand = (k: number) => {
      if (!se(k)) return {};
      const a = as[k];
      return {
        lo: pin(k).map((v, i) => sObs(Math.max(0, v - 2 * se(k)![i]), a)),
        hi: pin(k).map((v, i) => sObs(Math.min(1, v + 2 * se(k)![i]), a)),
      };
    };
    for (let k = 0; k < K; k++) {
      if (proto === "b" && k === 1) continue; // the tiny "near-centre" probe: shown in p only
      sSeries.push({
        pts: decimate(T.map((t, i) => [t, sObs(pin(k)[i], as[k])] as [number, number])),
        color: COLORS[k],
        label: `S_obs ${k}`,
        ...sBand(k),
      });
    }
    sSeries.push({ pts: decimate(T.map((t, i) => [t, sUnw(pin(0)[i]) as number] as [number, number])), color: "#9ca3af", dash: true, label: "unweighted S(p₀)" });
    plot($("sent") as HTMLCanvasElement, sSeries, [], vmarks);

    const dt = ensv ? (proto === "a" ? 5 : 10) : speed;
    const idx = T.map((t, i) => i).filter((i) => (proto === "a" ? T[i] > tOff + 5 : T[i] > 20));
    const y = idx.map((i) => pin(0)[i]);
    if (y.length >= 8) {
      const s = spectrum(y, dt);
      const top = peaks(s.f, s.a, 4).filter((p) => p.f <= 0.05);
      plot(
        $("spec") as HTMLCanvasElement,
        [{ pts: s.f.map((f, i) => [f, s.a[i]] as [number, number]), color: "#7c3aed", label: `|FFT| of p̄(S0), dt=${dt}` }],
        [],
        TABLE_PERIODS.map((p) => ({ x: p.f, color: "#d1d5db", label: String(Math.round(p.period)) })),
      );
      $("specline").textContent = `strongest peaks: ${top.map((p) => `period ≈ ${Math.round(1 / p.f)} steps (amp ${p.a.toExponential(1)})`).join(" · ") || "none"} — dashed ticks mark the geometric periods 100/√(m²+n²)`;
    }
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
  const runSeed = async (sd: number, T: number, chunk: number, prog: (t: number) => void) => {
    bill.configure({ ...mkcfg(), seed: sd });
    const t: number[] = [];
    const pin: number[][] = bill.cfg.surfaces.map(() => []);
    while (bill.t < T) {
      const k = Math.min(chunk, T - bill.t);
      if (proto === "a" && bill.cfg.walls && bill.t >= tOff) bill.setWalls(false);
      const r = await bill.advance(k, false);
      t.push(bill.t);
      r.counts.forEach((c, i) => pin[i].push(c / bill.cfg.n));
      if (t.length % 24 === 0) {
        prog(bill.t);
        await frameGap();
      }
    }
    return { t, pin };
  };

  const runEnsemble = async (R: number): Promise<Ens | null> => {
    if (ensBusy) return ens;
    ensBusy = true;
    ens = null;
    view = "ensemble";
    controls();
    url();
    const T = proto === "a" ? tOff + 2000 : 4000;
    const chunk = proto === "a" ? 5 : 10;
    const K = bill.cfg.surfaces.length;
    const sum: number[][] = Array.from({ length: K }, () => []);
    const sumsq: number[][] = Array.from({ length: K }, () => []);
    let t: number[] | null = null;
    for (let s = 0; s < R; s++) {
      const one = await runSeed((bill.cfg.seed + s) as number, T, chunk, (tt) => {
        $("ensline").textContent = `ensemble: seed ${s + 1}/${R} · t = ${tt}`;
      });
      t = one.t;
      for (let k = 0; k < K; k++)
        for (let i = 0; i < one.t.length; i++) {
          sum[k][i] = (sum[k][i] ?? 0) + one.pin[k][i];
          sumsq[k][i] = (sumsq[k][i] ?? 0) + one.pin[k][i] ** 2;
        }
    }
    const mean = sum.map((a) => a.map((v) => v / R));
    const se = sum.map((a, k) => a.map((_, i) => Math.sqrt(Math.max(0, sumsq[k][i] / R - mean[k][i] ** 2) / (R - 1))));
    ens = { r: R, t: t!, mean, se };
    ensBusy = false;
    controls();
    readout();
    plots();
    return ens;
  };

  // ── the loop ──────────────────────────────────────────────────────────────
  let busy = false;
  const frame = () => {
    if (!probeBusy && !ensBusy) {
      if (playing && !busy) {
        busy = true;
        if (proto === "a" && bill.cfg.walls && bill.t >= tOff) bill.setWalls(false);
        void advance(speed)
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
      } else {
        draw();
      }
    }
    requestAnimationFrame(frame);
  };

  controls();
  url();
  draw();
  readout();
  requestAnimationFrame(frame);

  // ── the probe ──────────────────────────────────────────────────────────────
  Object.assign(window, {
    probe: {
      adapter,
      config: () => ({ ...bill.cfg, proto, tOff, view, speed, ensR }),
      run: async (k: number, grid?: boolean) => {
        probeBusy = true;
        try {
          return await advance(k, grid ?? true);
        } finally {
          probeBusy = false;
        }
      },
      setWalls: (on: boolean) => bill.setWalls(on),
      reverse: () => bill.reverse(),
      reset: (patch: Record<string, unknown> = {}) => {
        probeBusy = true;
        playing = false;
        try {
          Object.assign(knobs, patch);
          bill.configure(mkcfg());
          samples.length = 0;
          grids = null;
          ens = null;
          view = "single";
        } finally {
          probeBusy = false;
        }
        controls();
        readout();
        plots();
      },
      series: () => {
        const K = bill.cfg.surfaces.length;
        const pin = Array.from({ length: K }, (_, k) => samples.map((s) => s.pin[k]));
        return {
          t: samples.map((s) => s.t),
          pin,
          sObs: pin.map((a, k) => a.map((p) => sObs(p, areaOf(bill.cfg.surfaces[k])))),
          sUnw0: pin[0].map(sUnw),
          cin: samples.map((s) => s.cin),
          cout: samples.map((s) => s.cout),
          ens,
        };
      },
      spectrum: () => {
        const ensv = view === "ensemble" && ens;
        const T = ensv ? ens!.t : samples.map((s) => s.t);
        const p0 = ensv ? ens!.mean[0] : samples.map((s) => s.pin[0]);
        const dt = ensv ? (proto === "a" ? 5 : 10) : speed;
        const idx = T.map((t, i) => i).filter((i) => (proto === "a" ? T[i] > tOff + 5 : T[i] > 20));
        const y = idx.map((i) => p0[i]);
        const s = spectrum(y, dt);
        return { f: s.f, a: s.a, dt, peaks: peaks(s.f, s.a, 8), predicted: TABLE_PERIODS, window: { from: idx.length ? T[idx[0]] : 0, n: y.length } };
      },
      ensemble: (r?: number) => runEnsemble(r ?? ensR),
      state: () => samples[samples.length - 1] ?? null,
      audit: (m?: number) => bill.audit(m),
    },
  });
} catch (e) {
  out.textContent = String(e instanceof Error ? e.message : e);
  Object.assign(window, { probeError: out.textContent });
}

import { Billiard, GRID, MAXN, ROOM, SCAT, roomFraction, tauOf } from "./billiard.ts";
import type { Config } from "./billiard.ts";
import { gpu } from "../src/gpu.ts";

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const num = (v: string | null, d: number) => (v === null || Number.isNaN(Number(v)) ? d : Number(v));
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const cfg: Config = {
  n: clamp(Math.round(num(params.get("n"), 30000)), 1000, MAXN),
  seed: clamp(Math.round(num(params.get("seed"), 1)), 0, 2 ** 31 - 1),
  door: clamp(num(params.get("door"), 0.08), 0, 2 * ROOM.h),
  walls: params.get("walls") !== "0",
  scatter: params.get("scatter") === "1",
  circle: params.get("surface") === "circle",
  cx: clamp(num(params.get("cx"), 0.5), 0.05, 0.95),
  cy: clamp(num(params.get("cy"), 0.35), 0.05, 0.95),
  cr: clamp(num(params.get("cr"), 0.18), 0.03, 0.45),
  startIn: params.get("start") !== "out",
};
let speed = clamp(Math.round(num(params.get("speed"), 2)), 1, 16);
let playing = params.get("play") !== "0";

const url = () => {
  const q = new URLSearchParams({
    n: String(cfg.n),
    seed: String(cfg.seed),
    door: cfg.door.toFixed(3),
    walls: cfg.walls ? "1" : "0",
    scatter: cfg.scatter ? "1" : "0",
    surface: cfg.circle ? "circle" : "aligned",
    start: cfg.startIn ? "in" : "out",
    cx: cfg.cx.toFixed(3),
    cy: cfg.cy.toFixed(3),
    cr: cfg.cr.toFixed(3),
    speed: String(speed),
    play: playing ? "1" : "0",
  });
  history.replaceState(null, "", `?${q}`);
};

type Sample = { t: number; nin: number; nout: number; pin: number; cin: number; cout: number; s: number; clock: number };
const samples: Sample[] = [];
let s0: number | null = null;
const entropy = (p: number) => (p <= 0 || p >= 1 ? 0 : -p * Math.log(p) - (1 - p) * Math.log(1 - p));

type Series = { pts: [number, number][]; color: string; dash?: boolean; label?: string };
type Mark = { y: number; color: string; label?: string };

function plot(canvas: HTMLCanvasElement, series: Series[], marks: Mark[] = []) {
  const dpr = devicePixelRatio;
  const rect = canvas.getBoundingClientRect();
  const w = (canvas.width = Math.max(60, Math.round(rect.width * dpr)));
  const h = (canvas.height = Math.max(60, Math.round(rect.height * dpr)));
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const all = [...series.flatMap((s) => s.pts), ...marks.map((m) => [0, m.y] as [number, number])];
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
  ctx.fillText("steps", w - m - 34 * dpr, h - 6 * dpr);
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
    if (s.pts.length < 2) continue;
    ctx.strokeStyle = s.color;
    ctx.setLineDash(s.dash ? [5, 4] : []);
    ctx.beginPath();
    s.pts.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), py(p[1])) : ctx.moveTo(px(p[0]), py(p[1]))));
    ctx.stroke();
    ctx.setLineDash([]);
    if (s.label) {
      ctx.fillStyle = s.color;
      ctx.fillText(s.label, legend, m - 6 * dpr);
      legend += ctx.measureText(s.label).width + 16 * dpr;
    }
  }
}

const out = $("out");

try {
  const { device, adapter } = await gpu();
  const bill = await Billiard.create(device, cfg);
  let probeBusy = false;
  let grids: { gridIn: Uint32Array; gridOut: Uint32Array } | null = null;

  const advance = async (k: number): Promise<Sample> => {
    const r = await bill.advance(k);
    grids = r;
    const pin = r.nin / cfg.n;
    const s = entropy(pin);
    if (s0 === null) s0 = s;
    const sample = { t: bill.t, nin: r.nin, nout: r.nout, pin, cin: r.cin, cout: r.cout, s, clock: s - s0 };
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
          const f = nin / (nin + nout); // crimson inside the surface, teal outside
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
    if (cfg.scatter) {
      ctx.fillStyle = "#cbd5e1";
      ctx.strokeStyle = "#475569";
      ctx.beginPath();
      ctx.arc(X(SCAT.x), Y(SCAT.y), SCAT.r * px, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
    }
    const rx = ROOM.x - ROOM.h;
    const rb = ROOM.y - ROOM.h;
    const rs = 2 * ROOM.h;
    const dw = cfg.door / 2;
    if (cfg.walls) {
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
      if (cfg.door > 0) {
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
    ctx.strokeStyle = "#7c3aed"; // the counting surface
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = Math.max(1.5, px / 280);
    if (cfg.circle) {
      ctx.beginPath();
      ctx.arc(X(cfg.cx), Y(cfg.cy), cfg.cr * px, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeRect(X(rx), Y(rb + rs), rs * px, rs * px);
    }
    ctx.setLineDash([]);
  };

  // ── controls ──────────────────────────────────────────────────────────────
  const link = (text: string, data: string) => `<a href="#" ${data}>${text}</a>`;
  const controls = () => {
    $("nlinks").innerHTML = [10000, 30000, 100000, 200000]
      .map((v) => (v === cfg.n ? `${v / 1000}k` : link(`${v / 1000}k`, `data-n="${v}"`)))
      .join(" · ");
    $("speedlinks").innerHTML = [1, 2, 4, 8, 16]
      .map((v) => (v === speed ? String(v) : link(String(v), `data-speed="${v}"`)))
      .join(" · ");
    $("seedlinks").innerHTML = `${link("−", `data-seed="${cfg.seed - 1}"`)} ${cfg.seed} ${link("+", `data-seed="${cfg.seed + 1}"`)}`;
    $("doorlabel").textContent = cfg.door.toFixed(3);
    ($("walls") as HTMLButtonElement).textContent = `walls: ${cfg.walls ? "on" : "off"}`;
    ($("scatterb") as HTMLButtonElement).textContent = `scatterer: ${cfg.scatter ? "on" : "off"}`;
    ($("surfaceb") as HTMLButtonElement).textContent = `surface: ${cfg.circle ? "circle (drag it)" : "aligned with room"}`;
    ($("startb") as HTMLButtonElement).textContent = `start: ${cfg.startIn ? "inside" : "outside"} (restarts)`;
    ($("play") as HTMLButtonElement).textContent = playing ? "⏸" : "▶";
    $("tauline").textContent = cfg.circle
      ? "an arbitrary surface has no clean prediction — watch it recross"
      : !cfg.walls
        ? "walls off: no door, no effusion — the aligned count is pure noise over an area fraction"
        : cfg.door > 0
          ? `rough estimate: τ = π·A_room/(door·⟨v⟩) ≈ ${Math.round(tauOf(cfg.door))} steps for the leak into an empty table — quick returns from the chamber outside the door (and, on the plain rectangle, conserved |v_x|, |v_y|) make the real relaxation slower; the scatterer speeds it up`
          : "door shut: nothing can cross, the clock never starts";
    $("hint").textContent = cfg.circle ? "drag inside to move · drag the rim to resize" : "";
  };

  const reinit = () => {
    samples.length = 0;
    s0 = null;
    bill.configure(cfg);
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
  $("walls").onclick = () => {
    cfg.walls = !cfg.walls;
    url();
    controls();
    draw();
    plots();
  };
  $("scatterb").onclick = () => {
    cfg.scatter = !cfg.scatter;
    url();
    controls();
    draw();
  };
  $("surfaceb").onclick = () => {
    cfg.circle = !cfg.circle;
    url();
    controls();
    draw();
    plots();
  };
  $("startb").onclick = () => {
    cfg.startIn = !cfg.startIn;
    reinit();
  };
  const door = $("door") as HTMLInputElement;
  door.value = String(cfg.door);
  door.oninput = () => {
    cfg.door = Number(door.value);
    url();
    controls();
    draw();
    plots();
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
    cfg.n = clamp(Number(a.dataset.n), 1000, MAXN);
    reinit();
  });
  onlink("speedlinks", (a) => {
    speed = clamp(Number(a.dataset.speed), 1, 16);
    url();
    controls();
  });
  onlink("seedlinks", (a) => {
    cfg.seed = clamp(Number(a.dataset.seed), 0, 2 ** 31 - 1);
    reinit();
  });

  // drag the circle surface (circle mode only)
  const world = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height };
  };
  let drag: "move" | "resize" | null = null;
  canvas.addEventListener("pointerdown", (e) => {
    if (!cfg.circle) return;
    const w = world(e);
    const d = Math.hypot(w.x - cfg.cx, w.y - cfg.cy);
    drag = Math.abs(d - cfg.cr) < 0.04 ? "resize" : d < cfg.cr ? "move" : null;
    if (drag) {
      canvas.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const w = world(e);
    if (drag === "move") {
      cfg.cx = clamp(w.x, 0.05, 0.95);
      cfg.cy = clamp(w.y, 0.05, 0.95);
    } else {
      cfg.cr = clamp(Math.hypot(w.x - cfg.cx, w.y - cfg.cy), 0.03, 0.45);
    }
    draw();
    readout();
  });
  const undrag = () => {
    if (drag) {
      drag = null;
      url();
    }
  };
  canvas.addEventListener("pointerup", undrag);
  canvas.addEventListener("pointercancel", undrag);

  // ── readouts ──────────────────────────────────────────────────────────────
  const readout = () => {
    const last = samples[samples.length - 1];
    $("live").textContent = last
      ? `t = ${last.t} steps · N_in/N = ${last.pin.toFixed(3)} (${last.nin}/${cfg.n}) · crossings/step: in ${last.cin.toFixed(2)} · out ${last.cout.toFixed(2)} · net ${(last.cin - last.cout).toFixed(2)}`
      : playing
        ? "…"
        : "press ▶";
    $("clockline").textContent = last
      ? `S = ${last.s.toFixed(3)} nats · clock: ${last.clock >= 0 ? "+" : ""}${last.clock.toFixed(3)} nats of coarse entropy since start`
      : "";
  };

  const decimate = (pts: [number, number][]) =>
    pts.length > 1500 ? pts.filter((_, i) => i % Math.ceil(pts.length / 1500) === 0 || i === pts.length - 1) : pts;

  const plots = () => {
    const hs = [...samples].sort((a, b) => a.t - b.t);
    const tNow = hs.length ? hs[hs.length - 1].t : 1;
    const pinSeries: Series[] = [{ pts: decimate(hs.map((s) => [s.t, s.pin] as [number, number])), color: "#b91c1c", label: "N_in/N" }];
    const pinMarks: Mark[] = [];
    if (!cfg.circle) {
      pinMarks.push({ y: roomFraction, color: "#6b7280", label: "area fraction" });
      if (cfg.walls) {
        const p0 = cfg.startIn ? 1 : 0;
        const decay = (t: number) => (cfg.door > 0 ? Math.exp(-t / tauOf(cfg.door)) : 1);
        pinSeries.push({
          pts: Array.from({ length: 100 }, (_, i) => {
            const t = (i / 99) * tNow;
            return [t, roomFraction + (p0 - roomFraction) * decay(t)] as [number, number];
          }),
          color: "#111827",
          dash: true,
          label: cfg.door > 0 ? `rough exp(−t/τ), τ ≈ ${Math.round(tauOf(cfg.door))}` : "door shut: no flow",
        });
      }
    }
    plot($("nin") as HTMLCanvasElement, pinSeries, pinMarks);
    const pick = (f: (s: Sample) => number) => decimate(hs.map((s) => [s.t, f(s)] as [number, number]));
    plot($("flux") as HTMLCanvasElement, [
      { pts: pick((s) => s.cin), color: "#0d9488", label: "in /step" },
      { pts: pick((s) => s.cout), color: "#d97706", label: "out /step" },
      { pts: pick((s) => s.cin - s.cout), color: "#111827", dash: true, label: "net" },
    ]);
    plot($("sent") as HTMLCanvasElement, [{ pts: pick((s) => s.s), color: "#7c3aed", label: "S(p)" }], [
      { y: Math.LN2, color: "#d1d5db", label: "ln 2" },
    ]);
  };

  // ── the loop ───────────────────────────────────────────────────────────────
  let busy = false;
  const frame = () => {
    if (!probeBusy) {
      if (playing && !busy) {
        busy = true;
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
  requestAnimationFrame(frame);

  // ── the probe ──────────────────────────────────────────────────────────────
  Object.assign(window, {
    probe: {
      adapter,
      config: () => ({ ...cfg, speed }),
      run: async (k: number) => {
        probeBusy = true;
        try {
          return await advance(k);
        } finally {
          probeBusy = false;
        }
      },
      reverse: () => bill.reverse(),
      reset: (patch: Partial<Config> = {}) => {
        playing = false;
        Object.assign(cfg, patch);
        probeBusy = true;
        try {
          samples.length = 0;
          s0 = null;
          bill.configure(cfg);
          url();
          controls();
          draw();
        } finally {
          probeBusy = false;
        }
      },
      series: () => ({
        t: samples.map((s) => s.t),
        nin: samples.map((s) => s.nin),
        pin: samples.map((s) => s.pin),
        cin: samples.map((s) => s.cin),
        cout: samples.map((s) => s.cout),
        s: samples.map((s) => s.s),
        clock: samples.map((s) => s.clock),
      }),
      state: () => samples[samples.length - 1] ?? null,
      audit: (m?: number) => bill.audit(m),
    },
  });
} catch (e) {
  out.textContent = String(e instanceof Error ? e.message : e);
  Object.assign(window, { probeError: out.textContent });
}

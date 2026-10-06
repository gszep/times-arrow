import contract from "../../contract.json" with { type: "json" };
import { gpu } from "../../src/gpu.ts";
import { Hpp, nullState, packedState } from "../../src/hpp.ts";
import { run } from "./run.ts";
import type { RunConfig, RunResult } from "./run.ts";

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const config = {
  n: Number(params.get("n") ?? 256),
  seed: Number(params.get("seed") ?? 1),
  mode: params.get("mode") === "null" ? ("null" as const) : ("packed" as const),
  b: [4, 8, 16, 32, 64].includes(Number(params.get("b"))) ? Number(params.get("b")) : 16,
  tMax: Number(params.get("tMax") ?? 2048),
  tE: Number(params.get("tE") ?? 1024),
};
const url = (patch: Record<string, string | number>) =>
  `?${new URLSearchParams({ ...Object.fromEntries(params), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })}`;
const registered = { n: 1024, tMax: 32768, tE: 16384, S16_0: 1.81e5 };

type Series = { points: [number, number][]; color: string; dash?: boolean; label?: string };
type Spec = {
  series: Series[];
  band?: { points: [number, number][]; half: number[]; color: string };
  marks?: { y?: number; x?: number; color: string; label?: string }[];
  logX?: boolean;
  yLabel: string;
  xLabel: string;
};

function plot(canvas: HTMLCanvasElement, spec: Spec) {
  const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const h = (canvas.height = canvas.height || 300);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const all = [
    ...spec.series.flatMap((s) => s.points),
    ...(spec.band?.points ?? []),
    ...(spec.marks?.map((m) => [m.x ?? 0, m.y ?? 0] as [number, number]) ?? []),
  ];
  if (!all.length) return;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const lx = (x: number) => (spec.logX ? Math.log10(x + 1) : x);
  const x0 = lx(Math.min(...xs));
  const x1 = lx(Math.max(...xs));
  const y0 = Math.min(...ys, ...(spec.band ? spec.band.points.map((_, i) => spec.band!.points[i][1] - spec.band!.half[i]) : []));
  const y1 = Math.max(...ys, ...(spec.band ? spec.band.points.map((_, i) => spec.band!.points[i][1] + spec.band!.half[i]) : []));
  const m = 44 * devicePixelRatio;
  const px = (x: number) => m + ((lx(x) - x0) / (x1 - x0 || 1)) * (w - 2 * m);
  const py = (y: number) => h - m - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * m);
  ctx.strokeStyle = "#ddd";
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  ctx.fillStyle = "#666";
  ctx.font = `${11 * devicePixelRatio}px system-ui`;
  const exp = (v: number) => (v === 0 ? "0" : Math.abs(v) >= 1e4 || Math.abs(v) < 1e-2 ? v.toExponential(1) : String(Math.round(v)));
  ctx.fillText(`${exp(y1)}`, 4 * devicePixelRatio, m + 10);
  ctx.fillText(`${exp(y0)}`, 4 * devicePixelRatio, h - m);
  ctx.fillText(spec.yLabel, 4 * devicePixelRatio, m - 6 * devicePixelRatio);
  const xr = `${exp(Math.min(...xs))} … ${exp(Math.max(...xs))} ${spec.xLabel}`;
  ctx.fillText(xr, w - m - ctx.measureText(xr).width, h - 8 * devicePixelRatio);
  if (spec.band) {
    ctx.globalAlpha = 0.18;
    ctx.beginPath();
    spec.band.points.forEach((p, i) => ctx.lineTo(px(p[0]), py(p[1] + spec.band!.half[i])));
    [...spec.band.points].reverse().forEach((p, i) => ctx.lineTo(px(p[0]), py(p[1] - spec.band!.half[spec.band!.points.length - 1 - i])));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const mk of spec.marks ?? []) {
    ctx.strokeStyle = mk.color;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    if (mk.y !== undefined) {
      ctx.moveTo(m, py(mk.y));
      ctx.lineTo(w - m, py(mk.y));
    } else {
      ctx.moveTo(px(mk.x!), m);
      ctx.lineTo(px(mk.x!), h - m);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    if (mk.label) ctx.fillText(mk.label, m + 4, py(mk.y ?? 0) - 4);
  }
  let legend = m;
  for (const s of spec.series) {
    ctx.strokeStyle = s.color;
    ctx.setLineDash(s.dash ? [5, 4] : []);
    ctx.beginPath();
    s.points.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), py(p[1])) : ctx.moveTo(px(p[0]), py(p[1]))));
    ctx.stroke();
    ctx.setLineDash([]);
    if (s.label) {
      ctx.fillStyle = s.color;
      ctx.fillText(s.label, legend, m - 6 * devicePixelRatio);
      legend += ctx.measureText(s.label).width + 20 * devicePixelRatio;
    }
  }
}

const out = $("out");
try {
  const { device, adapter } = await gpu();
  const { n, seed, mode, tE } = config;
  const b = config.b;
  if ((n & (n - 1)) !== 0 || n < 64) throw new Error(`n = ${n} must be a power of two ≥ 64`);

  const centre = (n / 2) * n + n / 2;
  const live = new Hpp(device, n);
  let flipped = false;
  const loadInitial = async () => {
    live.load(mode === "packed" ? await packedState(device, seed, n) : await nullState(device, seed, n));
    flipped = false;
  };
  await loadInitial();

  let direction: "forward" | "reverse" = "forward";
  let playing = false;
  let result: RunResult | null = null;
  let bandRuns: RunResult[] | null = null;

  const popcount = (s: number) => (s & 1) + ((s >>> 1) & 1) + ((s >>> 2) & 1) + ((s >>> 3) & 1);
  const link = (text: string, patch: Record<string, string | number>) =>
    `<a href="${url(patch)}">${text}</a>`;
  $("params").innerHTML = [
    `n: ${[64, 256, 1024].map((k) => (k === n ? k : link(String(k), { n: k }))).join(" · ")}`,
    `seed: ${link("−", { seed: Math.max(1, seed - 1) })} ${seed} ${link("+", { seed: seed + 1 })}`,
    `start: ${mode === "packed" ? "packed" : link("packed", { mode: "packed" })} · ${mode === "null" ? "null" : link("null", { mode: "null" })}`,
    `b: ${[4, 8, 16, 32, 64].filter((k) => k <= n).map((k) => (k === b ? k : link(String(k), { b: k }))).join(" · ")}`,
    `tMax: ${link("÷2", { tMax: Math.max(tE, Math.round(config.tMax / 2)) })} ${config.tMax} ${link("×2", { tMax: config.tMax * 2 })}`,
    `tE: ${link("÷2", { tE: Math.max(1, Math.round(tE / 2)) })} ${tE} ${link("×2", { tE: Math.min(config.tMax, tE * 2) })}`,
  ].join(" · ");

  const displayN = Math.min(n, 512);
  const factor = n / displayN;
  const lattice = $("lattice") as HTMLCanvasElement;
  lattice.width = lattice.height = displayN;
  const lctx = lattice.getContext("2d")!;
  const image = lctx.createImageData(displayN, displayN);
  let lastDraw = 0;
  async function drawLattice(now: number) {
    if (now - lastDraw < 150) return;
    lastDraw = now;
    const words = await live.words();
    const occ = image.data;
    for (let y = 0; y < displayN; y++)
      for (let x = 0; x < displayN; x++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++)
          for (let dx = 0; dx < factor; dx++) sum += popcount(words[(y * factor + dy) * n + x * factor + dx]);
        const v = 255 - Math.round((255 * sum) / (4 * factor * factor));
        const i = 4 * (y * displayN + x);
        occ[i] = occ[i + 1] = occ[i + 2] = v;
        occ[i + 3] = 255;
      }
    lctx.putImageData(image, 0, 0);
    let mass = 0;
    for (const s of words) mass += popcount(s);
    $("live").textContent = `t is live; ${mass} particles (expected ${n * n / 8}); ${flipped ? "one bit flipped" : "pristine"}`;
  }

  const stepsPerFrame = n >= 1024 ? 1 : 4;
  const frame = (now: number) => {
    if (playing) (direction === "forward" ? live.step(stepsPerFrame) : live.inv(stepsPerFrame));
    drawLattice(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  $("reset").onclick = loadInitial;
  $("play").onclick = () => {
    playing = !playing;
    $("play").textContent = playing ? "⏸" : "▶";
    $("play").classList.toggle("on", playing);
  };
  $("forward").onclick = () => (direction = "forward");
  $("reverse").onclick = () => {
    if (($("paired") as HTMLInputElement).checked && !flipped && direction === "forward") {
      live.xorEast(centre);
      flipped = true;
    }
    direction = "reverse";
  };
  $("flipbit").onclick = () => {
    live.xorEast(centre);
    flipped = !flipped;
  };

  const fullConfig = (over: Partial<RunConfig>): RunConfig => ({
    n,
    seed,
    mode,
    tMax: config.tMax,
    tE,
    b: [4, 8, 16, 32, 64].filter((k) => k <= n),
    ...over,
  });
  const doRun = async (over: Partial<RunConfig>, button: string, note: string) => {
    const el = $(button) as HTMLButtonElement;
    el.disabled = true;
    out.textContent = note;
    await new Promise((r) => setTimeout(r, 30));
    try {
      return await run(device, adapter, fullConfig(over));
    } catch (e) {
      out.textContent = String(e instanceof Error ? e.message : e);
      return null;
    } finally {
      el.disabled = false;
    }
  };

  const entropySpec = (): Spec => {
    const series: Series[] = [];
    if (result)
      series.push({
        points: result.forward.map((s) => [s.t, s.S[b] as number]),
        color: "#047857",
        label: `S_${b}(t) ${mode}`,
      });
    if (result?.echo.length)
      series.push({
        points: result.echo.map((s) => [tE - s.r, s.Sp[b] as number]),
        color: "#b45309",
        dash: true,
        label: "echo (exact inverse)",
      });
    if (result?.echo.length)
      series.push({
        points: result.echo.map((s) => [tE - s.r, s.Sd[b] as number]),
        color: "#dc2626",
        dash: true,
        label: "echo, one bit flipped",
      });
    const spec: Spec = { series, logX: true, yLabel: "nats", xLabel: "t" };
    if (bandRuns) {
      const ts = bandRuns[0].forward.map((s) => s.t);
      const band = ts.map((t) => {
        const at = bandRuns!.map((r) => r.forward.find((s) => s.t === t)!.S[b] as number);
        const mu = at.reduce((x, y) => x + y, 0) / at.length;
        const varr = at.reduce((x, y) => x + (y - mu) ** 2, 0) / (at.length - 1);
        return { t, mu, s: 3 * Math.sqrt(varr) };
      });
      spec.band = { points: band.map((p) => [p.t, p.mu] as [number, number]), half: band.map((p) => p.s), color: "#047857" };
    }
    if (n === registered.n) {
      spec.marks = [
        { y: registered.S16_0, color: "#999", label: `E[S_16(0)] = ${registered.S16_0.toExponential(2)} (registered)` },
        { x: registered.tE, color: "#999" },
      ];
    }
    return spec;
  };
  const damageSpec = (): Spec => {
    if (!result?.echo.length) return { series: [], yLabel: "H(r)", xLabel: "r" };
    const h = result.echo.filter((s) => s.H > 0);
    return {
      series: [{ points: h.map((s) => [s.r, s.H]), color: "#dc2626", label: "H(r) XOR slots" }],
      marks: config.n === registered.n
        ? [{ y: 1000, color: "#999", label: "S1(b): H(512) ≥ 1000" }, { y: 0.0605 * 4 * n * n, color: "#999", label: "S1(c): H(T_e)/4n² ≈ 0.0605" }]
        : [],
      logX: true,
      yLabel: "slots",
      xLabel: "reverse depth r",
    };
  };
  const coneSpec = (): Spec => {
    if (!result?.echo.length) return { series: [], yLabel: "diamond", xLabel: "r" };
    return {
      series: [
        { points: result.echo.map((s) => [s.r, s.maxDist]), color: "#7c3aed", label: "max torus distance of damage" },
        { points: result.echo.map((s) => [s.r, s.r]), color: "#999", dash: true, label: "bound: diamond radius r" },
      ],
      logX: true,
      yLabel: "cells",
      xLabel: "reverse depth r",
    };
  };
  const redraw = () => {
    plot($("splot") as HTMLCanvasElement, entropySpec());
    plot($("hplot") as HTMLCanvasElement, damageSpec());
    plot($("cplot") as HTMLCanvasElement, coneSpec());
    const e = result?.echo;
    $("eresults").textContent = e?.length
        ? `echo: final Hamming ${result!.finalHamming} (L1 predicts 0) · undo U: pristine ${result!.undo!.pristine.toPrecision(3)} (predict 1), damaged ${result!.undo!.damaged.toPrecision(3)} (S1(d): ≤ 0.05) · naive flip-only Hamming ${result!.naiveHamming} (R1 predicts ≥ 1) · H(T_e)/4n² = ${(e.at(-1)!.H / (4 * n * n)).toPrecision(3)} (S1(c): 0.05–0.07)`
      : "";
    $("snotes").textContent =
      n === registered.n
        ? "Registered predictions: E[S_16(0)] ≈ 1.81 × 10⁵ nats; the band level ≈ 5.7 × 10⁵ nats; entry into μ̂ ± 3σ̂ by t = 16384 and no long downward excursion afterwards (E1)."
        : `Scaled preview (n = ${n}); the registered predictions are for n = 1024, tMax = 32768, tE = 16384.`;
  };
  redraw();

  $("runForward").onclick = async () => {
    result = await doRun({}, "runForward", `running the forward grid to t = ${config.tMax}…`);
    redraw();
  };
  $("runBand").onclick = async () => {
    bandRuns = [] as RunResult[];
    for (let s = 1; s <= 16; s++) {
      out.textContent = `null band: seed ${s}/16…`;
      const r = await doRun({ mode: "null", seed: s }, "runBand", "");
      if (r) bandRuns.push(r);
    }
    redraw();
  };
  $("runEcho").onclick = async () => {
    result = await doRun({}, "runEcho", `running the echo (T_e = ${tE} forward, exact inverse back, paired damage and naive control)…`);
    redraw();
  };

  // The claims panel: contract statuses plus the registered predictions.
  const rows: [string, string, string, string][] = [
    ["L1", "step is a bijection; the exact echo returns the state bit for bit, S_b aligned sample for sample", "any nonzero Hamming distance or curve mismatch", "proved (Lean); verified once the WGSL reproduces the inverse golden vectors"],
    ["L2", "particle number is conserved at every sample", "any drift", "proved"],
    ["L3", "light cone of one cell per step; damage support stays inside the torus diamond of radius r (r ≤ n/2)", "any support violation", "proved; verified in S1a"],
    ["E1", "S_16 rises from 1.81 × 10⁵ nats into the null band μ̂ ± 3σ̂ by t = 16384 and stays (no downward excursion > 32 samples)", "entry fails in ≥ 2 of 16 seeds, or S_16(0) off by > 1%", "supported (statistical)"],
    ["E2", "the rise is nondecreasing in b ∈ {4, 8, 16, 32, 64}; seed-mean ratio rise(64)/rise(4) ≈ 1.33", "ratio leaves [1.2, 1.5], per-seed s.d. > 0.05, or monotonicity inverts in ≥ 2 of 16", "supported (statistical)"],
    ["R1", "exact echo recovers; the naive flip-only reversal does not (final Hamming of order 2.5 × 10⁵ slots)", "echo fails (implementation error); the control recovering is a negative-control result", "exact echo verified; control supported/refuted"],
    ["S1", "one flipped bit destroys the reversal: (a) support ⊆ diamond, (b) H(512) ≥ 1000, (c) H(T_e)/4n² ∈ [0.05, 0.07], (d) damaged reverse stays in band, U ≤ 0.05", "(b), (c) or (d) failing in ≥ 2 of 16 runs; (b) failing at all is a major negative result", "(a) verified; (b)–(d) supported (statistical); β̂ exploratory"],
  ];
  $("claims").innerHTML = `
    <table>
      ${rows.map(([id, claim, refutes, label]) => `<tr><td><b>${id}</b></td><td>${claim}</td><td>refuted if: ${refutes}</td><td><i>${label}</i></td></tr>`).join("")}
    </table>
    <h3>Contract claims (from Lean)</h3>
    <table>
      ${contract.claims.map((c: { name: string; status: string; doc: string }) => `<tr><td><b>${c.name.split(".").pop()}</b></td><td>${c.doc}</td><td>${c.status}</td></tr>`).join("")}
    </table>
    <h3>Assumptions</h3>
    <ul>
      <li>2+1 dimensions, square periodic n × n lattice, n a power of two; lattice light-cone speed one cell per step (the L1 diamond |dx| + |dy| ≤ t, not a Euclidean disc).</li>
      <li>Checkerboard parity: every particle carries the label (x + y + t) mod 2 for life, and the particle number on each labelled sublattice is separately conserved (proved, for even n); the two populations never collide with one another. A lattice artefact.</li>
      <li>Per-row x-momentum and per-column y-momentum are conserved exactly (proved); the transverse pairings — x-momentum per column, y-momentum per row — are not, by a proved 4×4 counterexample. The packed and null starts differ in these conserved profiles.</li>
      <li>S_b is f64 computed from exact integer block counts; the echo, Hamming and cone checks are bit-level. No analytic S_max is assumed: the band is the empirical μ̂ ± 3σ̂ of the 16 null seeds.</li>
      <li>16 paired seeds; a single run can go against the trend — every criterion reports the count of paired wins.</li>
    </ul>`;

  Object.assign(window, {
    probe: {
      adapter,
      config,
      run: (cfg: RunConfig) => run(device, adapter, cfg),
      // The reverse-step reference probes, for differential tests against the
      // Lean executable's `hppinv` / `hppecho`.
      hppinv: async (seed: number, n: number, t: number) => {
        const h = new Hpp(device, n);
        h.init(seed);
        h.step(t);
        h.inv(t);
        const s = await h.state();
        h.destroy();
        return s;
      },
      hppecho: async (seed: number, n: number, t: number) => {
        const h = new Hpp(device, n);
        h.init(seed);
        h.step(t);
        h.rev();
        h.step(t);
        h.rev();
        const s = await h.state();
        h.destroy();
        return s;
      },
      live: {
        words: () => live.words(),
        step: (t: number) => live.step(t),
        inv: (t: number) => live.inv(t),
        flip: () => live.xorEast(centre),
        reset: loadInitial,
      },
      result: () => result,
      band: () => bandRuns,
    },
  });
} catch (e) {
  out.textContent = String(e instanceof Error ? e.message : e);
  Object.assign(window, { probeError: out.textContent });
}

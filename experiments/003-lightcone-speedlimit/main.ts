/// <reference types="vite/client" />
import contract from "../../contract.json" with { type: "json" };
import { gpu } from "../../src/gpu.ts";
import { Walk } from "../../src/walk.ts";
import {
  ARMS, ARM_NAMES, REG, exactLaw, gridOf, paramsOf, profileLayout, protocolOf, renderVerdict,
  score, windowsOf,
} from "./score.ts";
import type { ArmName, Results } from "./score.ts";
import { runArm, runPair } from "./run.ts";
import { checkCone } from "./check.ts";

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const config = {
  arm: (params.get("arm") ?? "wind") as ArmName,
  n: Number(params.get("n") ?? 256),
  m: Number(params.get("m") ?? 16384),
  T: Number(params.get("T") ?? 256),
  R: Number(params.get("R") ?? 16),
  seed: Number(params.get("seed") ?? 1),
};
const url = (patch: Record<string, string | number>) =>
  `?${new URLSearchParams({ ...Object.fromEntries(params), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })}`;
const link = (text: string, patch: Record<string, string | number>) => `<a href="${url(patch)}">${text}</a>`;

// The committed compact results, if the registered ensemble has run. The
// scorer's own `<results>.score.json` outputs are excluded — they are
// verdicts, not data.
const committed = Object.values(
  import.meta.glob(["./results/*.json", "!./results/*.score.json"], { import: "default", eager: true }),
) as Results[];
try {
  const ensemble = committed.find((r) => !r.smoke);
  if (ensemble) {
    const s = score(ensemble, "results (committed compact form)");
    $("mnote").textContent =
      `The registered ensemble — 8 arms at n = ${ensemble.n}, m = ${ensemble.m}, R = ${ensemble.R}, T = ${ensemble.T}, ` +
      `seeds 1…${ensemble.R} — run headless on ${ensemble.host} at commit ${ensemble.commit}. Verdict by the committed scorer.`;
    $("verdict").textContent = renderVerdict(s);
  } else {
    $("mnote").textContent =
      "The registered ensemble (n = 1024, m = 65536, R = 256, T = 512) has not run — this page shows the " +
      "live simulation and the registered predictions only. " +
      link("load the registered configuration for the live view", { n: REG.n, m: REG.m, T: REG.T, R: 16 });
  }
} catch (e) {
  $("mnote").textContent = `the committed results could not be scored: ${String(e instanceof Error ? e.message : e)}`;
}

type Series = { points: [number, number][]; color: string; dash?: boolean; label?: string };
type Spec = {
  series: Series[];
  marks?: { y?: number; x?: number; color: string; label?: string }[];
  yLabel: string;
  xLabel: string;
};

function plot(canvas: HTMLCanvasElement, spec: Spec) {
  const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
  const h = (canvas.height = canvas.height || 300);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  const all = [...spec.series.flatMap((s) => s.points), ...(spec.marks?.map((m) => [m.x ?? 0, m.y ?? 0] as [number, number]) ?? [])];
  if (!all.length) return;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(...ys);
  const m = 44 * devicePixelRatio;
  const px = (x: number) => m + ((x - x0) / (x1 - x0 || 1)) * (w - 2 * m);
  const py = (y: number) => h - m - ((y - y0) / (y1 - y0 || 1)) * (h - 2 * m);
  ctx.strokeStyle = "#ddd";
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
  ctx.fillStyle = "#666";
  ctx.font = `${11 * devicePixelRatio}px system-ui`;
  const exp = (v: number) => (v === 0 ? "0" : Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-2) ? v.toExponential(1) : String(Math.round(v * 100) / 100));
  ctx.fillText(`${exp(y1)}`, 4 * devicePixelRatio, m + 10);
  ctx.fillText(`${exp(y0)}`, 4 * devicePixelRatio, h - m);
  ctx.fillText(spec.yLabel, 4 * devicePixelRatio, m - 6 * devicePixelRatio);
  const xr = `${exp(x0)} … ${exp(x1)} ${spec.xLabel}`;
  ctx.fillText(xr, w - m - ctx.measureText(xr).width, h - 8 * devicePixelRatio);
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

// ── the arm table and parameters ───────────────────────────────────────────
{
  const rows = ARM_NAMES.map((a) => {
    const { mu, a: act } = paramsOf(a);
    const env = Math.sqrt(act * mu * Math.log(ARMS[a].e / ARMS[a].w));
    return `<tr><td>${a === config.arm ? `<b>${a}</b>` : link(a, { arm: a })}</td><td>(${ARMS[a].e}, ${ARMS[a].w}, ${ARMS[a].zero})</td><td>${mu.toFixed(5)}</td><td>${env.toFixed(8)}</td><td>${(1 - env).toFixed(8)}</td></tr>`;
  }).join("");
  $("armtable").innerHTML = `
    <table>
      <tr><td>arm (e, w, stay)</td><td>μ</td><td>√(aμρ)</td><td>δ</td></tr>
      ${rows}
      <tr><td colspan="4">windXOR: ${config.arm === ("windXOR" as ArmName) ? "<b>windXOR</b>" : link("windXOR (the damage control)", { arm: "windXOR" })} — wind with E↔W at step 1 only</td></tr>
    </table>`;
  $("params").innerHTML = [
    `n: ${[64, 256, 1024].map((k) => (k === config.n ? k : link(String(k), { n: k, m: 64 * k }))).join(" · ")}`,
    `T: ${[64, 256, 512].map((k) => (k === config.T ? k : link(String(k), { T: k }))).join(" · ")}`,
    `R: ${[4, 16, 64].map((k) => (k === config.R ? k : link(String(k), { R: k }))).join(" · ")}`,
    `light-cone speed 1 cell/step · lattice 2+1, periodic, q_N = q_S = 0`,
  ].join(" · ");
}

try {
  const { device, adapter } = await gpu();
  const { n, m, T, R, arm } = config;
  if (n < 2 || n > 1024 || (n & (n - 1)) !== 0) throw new Error(`n = ${n} must be a power of two ≤ 1024`);
  const windows = windowsOf(T);
  const grid = gridOf(T);
  const law = exactLaw(arm === "windXOR" ? "wind" : arm, { n, m, T });

  // ── the live packet ──────────────────────────────────────────────────────
  const live = new Walk(device, { n, m, T, batch: 1, win: windows.length, grid: grid.length });
  live.setProtocol(protocolOf(arm, T));
  live.initProfile(config.seed);
  const strip = $("strip") as HTMLCanvasElement;
  strip.width = n;
  strip.height = 160;
  const sctx = strip.getContext("2d")!;
  let t = 0;
  let playing = false;
  let pathSeed = config.seed;

  const drawStrip = async () => {
    const pos = await live.positions();
    const counts = new Float64Array(n);
    for (let j = 0; j < m; j++) counts[pos[j] & 1023]++;
    const max = Math.max(...counts);
    sctx.fillStyle = "#fff";
    sctx.fillRect(0, 0, n, 160);
    sctx.fillStyle = "#047857";
    for (let x = 0; x < n; x++) {
      const h = Math.max(counts[x] > 0 ? 1 : 0, Math.round((160 * Math.log(1 + counts[x])) / Math.log(1 + max)));
      sctx.fillRect(x, 160 - h, 1, h);
    }
    $("live").textContent = `t = ${t}/${T} · seed ${pathSeed} · ${arm} · speed 1 cell/step · max column ${max}`;
  };
  await drawStrip();

  const restart = () => {
    pathSeed = config.seed + Math.floor(Math.random() * 1e6);
    live.initProfile(pathSeed);
    live.zeroTally();
    t = 0;
  };

  const frame = async () => {
    if (playing && t < T) {
      live.step(t + 1, pathSeed);
      t++;
      await drawStrip();
      if (t >= T) restart();
    }
    requestAnimationFrame(() => void frame());
  };
  requestAnimationFrame(() => void frame());

  $("play").onclick = () => {
    playing = !playing;
    $("play").textContent = playing ? "⏸" : "▶";
    $("play").classList.toggle("on", playing);
  };
  $("reset").onclick = () => {
    restart();
    void drawStrip();
  };

  // ── the ensemble against the envelopes ──────────────────────────────────
  const drawEnsemble = async (r: Awaited<ReturnType<typeof runArm>>) => {
    const meas = grid.map((_, g) => r.W1!.reduce((s, row) => s + row[g], 0) / r.R);
    const marks: { x: number; color: string; label?: string }[] = [];
    const popCross = law.EdissStep.findIndex((e, i) => e - i <= 0 && i > 0 && law.EdissStep[i - 1] - (i - 1) > 0);
    if (popCross > 0) marks.push({ x: popCross, color: "#0891b2", label: "population t×" });
    if (r.tCross !== null && r.tCross !== undefined) marks.push({ x: r.tCross, color: "#dc2626", label: "measured t̂×" });
    plot($("wplot") as HTMLCanvasElement, {
      series: [
        { points: grid.map((g) => [g, g]), color: "#999", dash: true, label: "cone t" },
        { points: grid.map((g) => [g, law.EdissGrid[g]]), color: "#7c3aed", dash: true, label: "E_diss (exact chain)" },
        { points: grid.map((g) => [g, law.w1Grid[g]]), color: "#f59e0b", dash: true, label: "population W₁" },
        { points: grid.map((g, i) => [g, meas[i]]), color: "#047857", label: `measured W̄₁ (R = ${r.R})` },
      ],
      marks,
      yLabel: "distance",
      xLabel: "steps",
    });
    const sigmaHat = r.sigmaKappa!;
    const eta = grid.map((g, i) => (law.DGrid[i] > 0 ? meas[i] / law.DGrid[i] : 0));
    const etaLin = grid.map((g, i) => (law.DGrid[i] > 0 ? (r.meanD!.reduce((s, row) => s + row[i], 0) / r.R - law.d0) / law.DGrid[i] : 0));
    $("ens").innerHTML = [
      `W̄₁(${T}) = ${meas[meas.length - 1].toFixed(4)} vs population ${law.w1Grid[law.w1Grid.length - 1].toFixed(4)} · D(${T}) = ${law.DGrid[law.DGrid.length - 1].toFixed(3)} (${law.DGrid[law.DGrid.length - 1] === T ? "cone" : "dissipation"} bound)`,
      `η̂(${T}) = ${eta[eta.length - 1].toFixed(5)} · η̂_lin(${T}) = ${etaLin[etaLin.length - 1].toFixed(5)}`,
      `t̂× = ${r.tCross === null || r.tCross === undefined ? "no crossing" : r.tCross.toFixed(5)} · Ê(${windows[windows.length - 1][1]}) = ${r.Ehat![r.Ehat!.length - 1].toFixed(3)} · σ̂₁ = ${sigmaHat[1]?.toFixed(6) ?? "—"}`,
      ...(r.zeroSites?.length
        ? [`pooled zero occupancy at windows ${[...new Set(r.zeroSites.map(([k]) => k))].join(", ")} — a statistical failure under the registered law (probability ≤ exp(−256) at the registered R·m); σ̂ and Ê past the first zero are not evaluated`]
        : []),
    ].join("<br>");
  };

  $("runEns").onclick = async () => {
    const button = $("runEns") as HTMLButtonElement;
    button.disabled = true;
    $("ensStatus").textContent = ` running ${R} seeds of ${arm} (${n}×${n}, m = ${m}, T = ${T})…`;
    await new Promise((r) => setTimeout(r, 30));
    try {
      const r = await runArm(device, { arm, n, m, T, R });
      await drawEnsemble(r);
    } catch (e) {
      $("ens").textContent = String(e instanceof Error ? e.message : e);
    } finally {
      button.disabled = false;
      $("ensStatus").textContent = "";
    }
  };

  // ── the claims panel ────────────────────────────────────────────────────
  const rows: [string, string, string, string][] = [
    ["M1", "the model fits the library: profile constructor, packing, occupancy passes, window sums and the rational circle-W₁ goldens, bit for bit against contract.walk.profile", "any golden vector or differential test fails (an implementation error; nothing is promoted until fixed)", "verified only after the contract gate passes; contract.walk.profile pending the Lean lane"],
    ["C1", "every walker's circle displacement from its own start ≤ t, and Ŵ ≤ t on the display grid", "any cone or packing violation (bit-exact)", "verified in the run; the induction lemma is the Lean lane's conjecture → proved"],
    ["C2", "population W₁ ≤ min(t, E_diss) on the display grid for the seven base arms", "a numerical violation flags arithmetic or model formalization, not the theorem", "verified numerically here; proved in the Lean lane"],
    ["U1", "if a_cone means activity at locations inside each trajectory's own cone, then a_cone = a", "a counterexample trajectory (none exists: own-trajectory induction)", "negative result for that reading only; Lean lane"],
    ["F1", "a one-sided nonzero population edge has +∞ flux EP; the registered full-support law has none", "a sampled zero count is statistical, not a counterexample", "front lemma: Lean lane"],
    ["X1", "the same-draw step-1 mirror (windXOR) damages exactly the draws in [3, 125): x_XOR = x_wind − 2·I mod n forever, never growing or healing; total damaged 7,995,392 ± 8,429", "the identity fails on any walker (implementation error), or the count leaves its Bernstein band", "identity verified bit for bit; count supported/refuted (statistical)"],
    ["T1", "eight cumulative E−W totals at T = 512 and the wind hop-1 activity, each at its registered Bernstein band", "any total leaves its band", "supported/refuted (statistical)"],
    ["P", "the h8 pipeline gate: pooled σ̂ at times 1 and 2 and Ê(24) inside the rank-protected box (Z ≤ 1)", "Z > 1 blocks physics promotion (a pipeline failure, not a proof of a bug)", "supported/refuted (statistical), size ≤ 1/4096"],
    ["C3", "the held-out crossover: t̂×_h8 within 10.5938460336 ± 1.8390769050, calibrated on w5 and w4 only", "|t̂×_h8 − 10.5938460336| > 1.8390769050 (a missing crossing counts as +∞)", "supported/refuted (statistical); the lock is frozen before any h8 run"],
    ["C4", "calm's finite-size relaxation: η̂_lin(512) within 0.5289774930939531 ± 0.0007", "|η̂_lin − c₅₁₂| > 0.0007", "supported/refuted (statistical); the acceptance interval excludes 1/√π at this size"],
    ["C5", "the branches at t = 512: b_d = A√(tanh(ρ/2)/ρ) (w5, w4, wind, h8, ±0.0061) and b_c = Aμ (c2, max, ±0.0002)", "any arm's |η̂ − branch| beyond its tolerance (6 sub-tests)", "supported/refuted (statistical)"],
  ];
  $("claims").innerHTML = `
    <p><b>Trust boundary (verbatim from the registration).</b> “The GPU computes integer positions
    and counts only. W₁, L̂, σ̂, Ê, η and E_diss are evaluated in host f64; ordinary per-operation
    rounding is of order 10⁻¹⁵ relative, not f32-level estimator noise. Accumulated arithmetic
    error is distinct from finite-count bias and sampling error.”</p>
    <table>
      ${rows.map(([id, claim, refutes, label]) => `<tr><td><b>${id}</b></td><td>${claim}</td><td>refuted if: ${refutes}</td><td><i>${label}</i></td></tr>`).join("")}
    </table>
    <h3>Contract claims (from Lean)</h3>
    <table>
      ${contract.claims.map((c: { name: string; status: string; doc: string }) => `<tr><td><b>${c.name.split(".").pop()}</b></td><td>${c.doc}</td><td>${c.status}</td></tr>`).join("")}
    </table>
    <h3>Assumptions</h3>
    <ul>
      <li>2+1 dimensions, periodic n×n torus (n a power of two ≤ 1024), synchronous update, one Philox word per (walker, step) — counter (walker, step, 0, 0), key (seed, 0); lattice light-cone speed 1 cell/step. All 003 arms have q_N = q_S = 0: y ≡ 0 and the active chain is 1D.</li>
      <li>The deterministic start: walkers j ≡ 0 (mod 64) at x₀ = (j/64) mod n, all others at 0 — p₀ = (63/64)δ₀ + (1/64)u at the registered m = 64n.</li>
      <li>Registered ensemble: n = 1024, m = 65536, R = 256 seeds (16 blocks of 16), T = 512; all arms paired by seed and walker. Bonferroni FWER ≤ ${(7 * 0.001 + 10 * 0.001 + 2 / 4096 + 6e-6).toFixed(11)} over the 19 registered tests plus six 10⁻⁶ certificate risks; a single run can go against the trend.</li>
      <li>Lattice scope: the finite speed is imposed by synchronous hopping; the branch relation μ/a = tanh(ρ/2), the ε-cliff and the crossover fit belong to this lattice family. No Lorentz-invariant or continuum-universal claim is made.</li>
      <li>What would refute the composition: W₁ leaving min(t, E_diss) on the grid (C2's arithmetic aside), the held-out crossover outside its locked band (C3), calm's finite-size centre off 0.52898 (C4), or any branch test failing at its tolerance (C5).</li>
    </ul>`;

  // ── the probe ────────────────────────────────────────────────────────────
  Object.assign(window, {
    probe: {
      adapter,
      config,
      check: () => checkCone(device),
      run: (cfg: { arm: ArmName; R: number; blocks?: number; n?: number; m?: number; T?: number }) => runArm(device, cfg),
      pair: (cfg: { R: number; blocks?: number; n?: number; m?: number; T?: number }) => runPair(device, cfg),
      law: () => law,
      layout: () => profileLayout(T),
      live: {
        step: (t: number, s: number) => live.step(t, s),
        init: (s: number) => live.initProfile(s),
        positions: () => live.positions(),
      },
    },
  });
} catch (e) {
  out.textContent = String(e instanceof Error ? e.message : e);
  Object.assign(window, { probeError: out.textContent });
}

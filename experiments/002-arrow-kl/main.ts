import contract from "../../contract.json" with { type: "json" };
import ensembleJson from "./results/artemis.json" with { type: "json" };
import { gpu } from "../../src/gpu.ts";
import { Walk } from "../../src/walk.ts";
import { ARMS, LN3, exactSigmaStats, renderVerdict, score, sigma, tallyDp, T15, Z } from "./score.ts";
import { runMain, runCorner, halfMask, lMask } from "./run.ts";
import type { LiveCornerResult } from "./run.ts";
import { buildHmm } from "./hmm.ts";
import type { ArmName, Results } from "./score.ts";
import type { Weights } from "../../src/walk.ts";
import type { Hmm } from "./hmm.ts";
import { checkWalk, walkVector } from "./check.ts";
import type { WalkVector } from "./check.ts";

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const config = {
  n: Number(params.get("n") ?? 8),
  m: Number(params.get("m") ?? 16),
  T: Number(params.get("T") ?? 64),
  seed: Number(params.get("seed") ?? 1),
  /** the drive numerator: q_E = (32+d)/256, q_W = (32−d)/256 — the
   * registered arms are d = 16 (driven, a = ln 3), d = −16 (reversed) and
   * d = 0 (null: same activity, no drive) */
  d: Number(params.get("d") ?? 16),
  rc: Number(params.get("rc") ?? 32),
};
const url = (patch: Record<string, string | number>) =>
  `?${new URLSearchParams({ ...Object.fromEntries(params), ...Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, String(v)])) })}`;
const link = (text: string, patch: Record<string, string | number>) => `<a href="${url(patch)}">${text}</a>`;

/** the constant live protocol at drive `d` */
const driveWeights = (d: number): Weights => ({ ...ARMS.null, e: ARMS.null.e + d, w: ARMS.null.w - d });

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

// The measured registered ensemble (results/artemis.json, headless on
// Artemis), rendered with the same committed scoring functions the CLI
// scorer uses (score, renderVerdict). Pure data — no GPU — so the verdict
// is readable even without WebGPU.
{
  const r = ensembleJson as unknown as Results;
  const s = score(r, "experiments/002-arrow-kl/results/artemis.json");
  $("mprov").textContent =
    `The full registered ensemble — 11 arms at n = ${r.n}, m = ${r.m}, R = 65536 paired seeds per arm ` +
    `(16 blocks × 4096; seeds 1…65536), plus the K5 corner (n = ${r.corner.n}, m = ${r.corner.m}, T = ${r.corner.T}, R_c = ${r.corner.R}) — ` +
    `run headless on ${r.host} (${r.adapter!.vendor} ${r.adapter!.architecture}, hardware adapter) at commit ${r.commit}, ${r.date}. ` +
    `Verdict by the committed scorer (score.ts): the χ² bins are the dof-preserving contiguous sets ` +
    `T = 1 [−5, 9], T = 4 [−6, 22], T = 64 [70, 186] (the frozen thresholds are χ² at dof 14/28/116; issue #7).`;
  $("verdict").textContent = renderVerdict(s);
}

try {
  const { device, adapter } = await gpu();
  const { n, m, T, seed, d } = config;
  if (n < 2 || (n & (n - 1)) !== 0) throw new Error(`n = ${n} must be a power of two`);
  if (m < 1 || m > 256 || T < 1) throw new Error(`m ∈ [1, 256], T ≥ 1`);
  if (Math.abs(d) > 31) throw new Error(`|d| ≤ 31 keeps q_W > 0`);

  const live = new Walk(device, { n, m, T, batch: 1 });
  let drive = d;
  live.setProtocol(Array.from({ length: T }, () => driveWeights(drive)));
  live.init(seed);

  let t = 0;
  let pathSeed = seed;
  let playing = false;
  const hist = new Map<number, number>();
  let recorded = 0;
  let corner: LiveCornerResult | null = null;
  let hmm: Hmm | null = null;

  $("params").innerHTML = [
    `n: ${[4, 8, 16].map((k) => (k === n ? k : link(String(k), { n: k }))).join(" · ")}`,
    `m: ${[4, 16, 64].map((k) => (k === m ? k : link(String(k), { m: k }))).join(" · ")}`,
    `T: ${[1, 4, 16, 64, 256].map((k) => (k === T ? k : link(String(k), { T: k }))).join(" · ")}`,
    `seed: ${link("−", { seed: Math.max(1, seed - 1) })} ${seed} ${link("+", { seed: seed + 1 })}`,
    `arm: ${drive === 16 ? "driven" : link("driven (d = 16)", { d: 16 })} · ${drive === -16 ? "reversed" : link("reversed (d = −16)", { d: -16 })} · ${drive === 0 ? "null" : link("null (d = 0)", { d: 0 })}`,
    `corner paths: ${[16, 32, 128].map((k) => (k === config.rc ? k : link(String(k), { rc: k }))).join(" · ")}`,
  ].join(" · ");
  $("dlabel").textContent = String(drive);
  ($("drive") as HTMLInputElement).value = String(drive);

  // ── the live walkers ──────────────────────────────────────────────────────
  const canvas = $("torus") as HTMLCanvasElement;
  const size = canvas.width;
  const cell = Math.floor(size / n);
  const ctx = canvas.getContext("2d")!;
  const drawTorus = async () => {
    const words = await live.positions();
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#eee";
    for (let k = 0; k <= n; k++) {
      ctx.beginPath();
      ctx.moveTo(k * cell, 0);
      ctx.lineTo(k * cell, size);
      ctx.moveTo(0, k * cell);
      ctx.lineTo(size, k * cell);
      ctx.stroke();
    }
    ctx.fillStyle = "#047857";
    for (let i = 0; i < m; i++) {
      const x = (words[i] & 1023) * cell;
      const y = ((words[i] >> 10) & 1023) * cell;
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, Math.max(2, cell / 3), 0, 2 * Math.PI);
      ctx.fill();
    }
    $("live").textContent =
      `t = ${t}/${T} · path seed ${pathSeed} · ${recorded} paths recorded · light-cone speed 1 cell/step`;
  };
  await drawTorus();

  const restartPath = () => {
    live.zeroTally();
    pathSeed = seed + recorded;
    live.init(pathSeed);
    t = 0;
  };
  const setDrive = (nd: number) => {
    drive = Math.max(-31, Math.min(31, nd));
    live.setProtocol(Array.from({ length: T }, () => driveWeights(drive)));
    $("dlabel").textContent = String(drive);
    ($("drive") as HTMLInputElement).value = String(drive);
    restartPath();
  };

  const frame = async () => {
    if (playing) {
      live.step(t + 1, pathSeed);
      t++;
      if (t >= T) {
        if (($("record") as HTMLInputElement).checked) {
          const { tallies } = await live.snapshot();
          const ratio = Math.log((32 + drive) / (32 - drive));
          const s = sigma(tallies, Array.from({ length: T }, () => driveWeights(drive)));
          const k = Math.round(s / ratio);
          hist.set(k, (hist.get(k) ?? 0) + 1);
          recorded++;
        }
        restartPath();
      }
      await drawTorus();
      redraw();
    }
    requestAnimationFrame(() => void frame());
  };
  requestAnimationFrame(() => void frame());

  $("reset").onclick = () => {
    restartPath();
    void drawTorus();
  };
  $("play").onclick = () => {
    playing = !playing;
    $("play").textContent = playing ? "⏸" : "▶";
    $("play").classList.toggle("on", playing);
  };
  ($("drive") as HTMLInputElement).oninput = (e) => setDrive(Number((e.target as HTMLInputElement).value));
  $("reverse").onclick = () => setDrive(-drive);

  // ── the histogram against the exact DP prediction ────────────────────────
  const redraw = () => {
    const protocol = Array.from({ length: T }, () => driveWeights(drive));
    const dp = tallyDp(m, T, driveWeights(drive));
    const bars = [...hist].sort((a, b) => a[0] - b[0]).map(([k, c]) => [k, c] as [number, number]);
    const expected = bars.map(([k]) => [k, recorded * dp[k + m * T]] as [number, number]);
    plot($("hplot") as HTMLCanvasElement, {
      series: [
        { points: bars, color: "#047857", label: `n(K), ${recorded} paths` },
        { points: expected, color: "#dc2626", dash: true, label: "exact DP · R" },
      ],
      marks: [{ x: 2 * T, color: "#999" }],
      yLabel: "paths",
      xLabel: `tally K = n_E − n_W (σ = K·a, a = ln((32+d)/(32−d)) = ${Math.log((32 + drive) / (32 - drive)).toFixed(3)})`,
    });
    const mirror = bars.filter(([k, c]) => k >= 1 && (hist.get(-k) ?? 0) > 0 && c > 0).map(
      ([k, c]) => [k, Math.log(c / hist.get(-k)!)] as [number, number],
    );
    plot($("mplot") as HTMLCanvasElement, {
      series: [
        { points: mirror, color: "#7c3aed", label: "ln(n(K)/n(−K)) — the dFT mirror" },
        { points: [[-2 * T, -2 * T * LN3], [2 * T, 2 * T * LN3]], color: "#999", dash: true, label: "slope ln 3" },
      ],
      yLabel: "ln ratio",
      xLabel: "K (populated mirror bins only)",
    });
    if (!recorded) {
      $("estimates").textContent = "play to record paths; each completed T-step path adds its σ.";
      return;
    }
    const stats = exactSigmaStats(protocol, m);
    const meanSigma = bars.reduce((a, [k, c]) => a + k * c * LN3, 0) / recorded;
    const varSigma = bars.reduce((a, [k, c]) => a + c * (k * LN3 - meanSigma) ** 2, 0) / (recorded - 1);
    const ift = bars.reduce((a, [k, c]) => a + c * Math.exp(-k * LN3), 0) / recorded;
    const meanExp = bars.reduce((a, [k, c]) => a + c * Math.exp(k * LN3), 0) / recorded;
    const stdHat = Math.sqrt(Math.max(0, (meanExp - 1) / recorded));
    const tStar = Math.log(recorded) / (m * Math.log(4 / 3));
    const seMean = stats.std / Math.sqrt(recorded);
    $("estimates").textContent =
      `⟨σ⟩ = ${meanSigma.toFixed(3)} vs 2T·a-family prediction ${stats.mean.toFixed(3)} (band ±${(Z * seMean).toFixed(3)}) · ` +
      `ŝ = ${Math.sqrt(varSigma).toFixed(3)} vs ${stats.std.toFixed(3)} · ` +
      `⟨e^−σ⟩ = ${ift.toPrecision(3)} vs 1 (4σ̂ band ±${(4 * stdHat).toPrecision(3)}) · ` +
      `T*(R = ${recorded}) = ${tStar.toFixed(2)}: the exponential average is reliable only for T < T* — here T = ${T}, ` +
      `${T < tStar ? "inside" : T < 30 ? "in the unreliable regime (T* < T ≲ 30)" : "collapsed outright"}. ` +
      (drive === 0 ? "The null arm: every path has σ = 0 exactly (d = 0 ⇒ a = ln 1 = 0)." : "");
  };
  redraw();

  // ── the corner ────────────────────────────────────────────────────────────
  $("runCorner").onclick = async () => {
    const button = $("runCorner") as HTMLButtonElement;
    button.disabled = true;
    $("cornerStatus").textContent = " building the occupancy HMM…";
    await new Promise((r) => setTimeout(r, 30));
    try {
      hmm ??= buildHmm(4, 4, ARMS.driven, [halfMask(4), lMask(4)]);
      $("cornerStatus").textContent = ` running ${config.rc} corner paths (driven + null, T = 32)…`;
      corner = await runCorner(device, { R: config.rc, blocks: 16, hmm });
      const c = corner;
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      const sdB = (xs: number[]) => {
        const mu = mean(xs);
        return Math.sqrt(xs.reduce((a, x) => a + (x - mu) ** 2, 0) / (xs.length - 1));
      };
      const per = c.R / c.blocks;
      const blocksL = Array.from({ length: c.blocks }, (_, i) => mean(c.driven.scgL.slice(i * per, (i + 1) * per)));
      const seL = sdB(blocksL) / Math.sqrt(c.blocks);
      const maxHalf = Math.max(0, ...c.driven.scgHalf.map(Math.abs));
      $("cornerOut").innerHTML = [
        `⟨σ⟩_c = ${(mean(c.driven.tally) * LN3).toFixed(3)} vs 16 ln 3 = ${(16 * LN3).toFixed(3)} ± ${(Z * Math.sqrt(30) * LN3 / Math.sqrt(c.R)).toFixed(3)}`,
        `⟨σ_∂⟩ = ${(mean(c.driven.cross) * LN3).toFixed(3)} vs 4 ln 3 = ${(4 * LN3).toFixed(3)} ± ${(Z * Math.sqrt(6.4349) * LN3 / Math.sqrt(c.R)).toFixed(3)} (the boundary share — a fine-path functional)`,
        `half-count: max |σ_cg| = ${maxHalf.toExponential(2)} ${maxHalf <= 1e-12 ? "≤" : "ABOVE"} 1e-12 — the reflection-symmetric region is exactly blind (a torus artefact)`,
        `L-count: ⟨σ_cg⟩ = ${mean(c.driven.scgL).toExponential(3)} vs the pipeline null |·| ≤ ${(T15 * seL).toExponential(3)} (t₁₅ · ${c.blocks}-block SE); the registered bound E[σ_cg] ≥ 1.28 × 10⁻⁵ nats is untestable at any feasible R_c`,
        `null corner: σ ≡ 0 (${c.null.maxAbsSigma === 0 ? "holds" : "FAILS"}), σ_cg ≡ 0 (${[...c.null.scgHalf, ...c.null.scgL].every((s) => Math.abs(s) <= 1e-12) ? "holds" : "FAILS"}) — measured pathwise by two HMM passes`,
        `first driven path, L-count sequence: ${c.driven.l[0].join(", ")}`,
      ].join("<br>");
    } catch (e) {
      $("cornerOut").textContent = String(e instanceof Error ? e.message : e);
    } finally {
      button.disabled = false;
      $("cornerStatus").textContent = "";
    }
  };

  // ── the claims panel ──────────────────────────────────────────────────────
  const rows: [string, string, string, string][] = [
    ["M1", "the model fits the library: constructor stationary, kernel support symmetric, σ = hop tally — goldens bit for bit", "any golden vector or differential test fails (an implementation error; nothing is promoted until fixed)", "verified by the contract gate; one-walker stationarity and support symmetry proved; product/path instantiation conjecture"],
    ["K1", "the second law is linear: ⟨σ⟩ = 2T ln 3, Var(σ) = (15/4)T(ln 3)², the histogram matches the exact DP", "any mean or std leaves its 3.1σ band, χ² exceeds its threshold, or ≥ 2 of 16 block means fall outside", "supported (statistical); the library theorem is proved (faec5f1)"],
    ["K2", "the arrow is the state, not the law: the null (q_E = q_W) has σ ≡ 0 pathwise", "any null path with σ ≠ 0 (bit-exact), or the driven mean ≤ 0", "null reversibility proved (on main); null runs verified bit for bit"],
    ["K3", "the detailed FT: P_F(σ=s)/P_F(σ=−s) = e^s exactly; the reversed arm realizes reversedPathPMF", "any mirror bin test fails at its threshold, or the T = 64 cross-arm mirror fails in ≥ 10% of bins", "supported (statistical); the dFT is proved (281f5db)"],
    ["K4", "the integral FT: ⟨e^−σ⟩ = 1, with the measurability boundary T* = ln R/(16 ln(4/3)) ≈ 2.41 and the deep collapse", "the T = 1 average leaves its 4σ̂ band, or the T = 64 estimate ≥ 10⁻³", "supported (statistical); the IFT is proved (281f5db); the variance identity is a round-3 conjecture"],
    ["K5", "coarse-graining loses the arrow: the half is exactly blind, the L keeps a certified-positive but undetectably small share", "⟨σ⟩_c or ⟨σ_∂⟩ leaves its band. Half-count σ_cg off 0 by > 10⁻¹² or L pipeline null |⟨σ_cg⟩| > 3.73 SE is an implementation error", "blindness conjecture (Lean round-3 target) + verified exact DP; L-positivity verified (exact DP)"],
    ["K6", "the estimator story: D̂_mean unbiased, the plug-in the same quantity with bias (K̂−1)/(2R) ≈ 8.9 × 10⁻⁴. At T=64 the estimator uses the dFT tilt to reconstruct the inaccessible reverse tail, so K6 effectively tests the reversed-arm mirror, not an independent tail measurement.", "the difference leaves its t₁₅ band (a systematically negative plug-in, or a blow-up)", "supported (statistical); the sufficiency identity is a round-3 conjecture"],
    ["C1", "Crooks/Jarzynski for the ramp protocol: Crooks ratio holds with slope 1, the histograms cross at s* ∈ [−1,1] (ΔF = 0); Jarzynski is certified only through the ratio", "the mean leaves its band, or the slope/bin/crossing checks fail", "supported/refuted (statistical); the inhomogeneous path law is a round-3 conjecture"],
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
      <li>2+1 dimensions, periodic n×n torus (n a power of two), synchronous update, one Philox word per (walker, step) — counter (walker, step, 0, 0), key (seed, 0); light-cone speed 1 cell per step.</li>
      <li>Independence is the design choice: it makes every distributional prediction exact. Interactions are deferred (the ring-colloid case carries the thermodynamic content).</li>
      <li>Integer tallies, DP tables and golden vectors are bit-exact; the ln 3 products and the HMM are f64 — goldens at tolerance 10⁻⁹. Lean's Float cannot be reasoned about in proofs: that is the trust boundary.</li>
      <li>Statistical claims: R = 65536 paired seeds per arm (16 blocks × 4096), corner R_c = 1024 (16 × 64); Bonferroni α = 0.002 per test over 25 checks; a single run can go against the trend.</li>
      <li>T* and the ramp's T_eff are sample-size artefacts; the half-count blindness is a torus artefact of the observable (any reflection-symmetric region is blind at every lattice size); the 2-time blindness of any region count is physics of stationarity.</li>
      <li>What would refute the title claim: the measured D_KL failing the registered bands, a null path with σ ≠ 0, a dFT mirror bin off its band, or the corner bands above.</li>
    </ul>`;

  // ── the probe ─────────────────────────────────────────────────────────────
  Object.assign(window, {
    probe: {
      adapter,
      config,
      run: (cfg: { arm: ArmName; T: number; R: number; blocks?: number }) => runMain(device, cfg),
      runCorner: (cfg: { R: number; blocks?: number; T?: number }) => runCorner(device, cfg),
      check: () => checkWalk(device),
      walk: (g: Pick<WalkVector, "seed" | "arm" | "n" | "m" | "t">) => walkVector(device, g),
      corner: () => corner,
      hmm: () => hmm,
      live: {
        step: (t: number, s: number) => live.step(t, s),
        init: (s: number) => live.init(s),
        positions: () => live.positions(),
      },
    },
  });
} catch (e) {
  out.textContent = String(e instanceof Error ? e.message : e);
  Object.assign(window, { probeError: out.textContent });
}

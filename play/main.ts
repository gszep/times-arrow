import { gpu } from "../src/gpu.ts";
import { Circles, Gas, defaults, pop, type Config, type Curve, type Sample } from "./fhp.ts";

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const image = el<HTMLCanvasElement>("gas"), plot = el<HTMLCanvasElement>("plot"), caption = el("caption");
const toggle = el<HTMLButtonElement>("toggle"), pause = el<HTMLButtonElement>("pause"), rewind = el<HTMLButtonElement>("rewind"), slider = el<HTMLInputElement>("rho");
const url = new URL(location.href);
const c = { ...defaults };
for (const key of Object.keys(c) as (keyof Config)[]) if (url.searchParams.has(key)) c[key] = Number(url.searchParams.get(key));
if (![64, 128, 256, 512].includes(c.n)) c.n = defaults.n;
c.seed = c.seed >>> 0;
c.rho = Math.min(4, Math.max(0.5, c.rho || defaults.rho));
c.outside = Math.min(6, Math.max(0, Number.isFinite(c.outside) ? c.outside : defaults.outside));
c.radius = Math.min(c.n / 3, Math.max(4, c.radius || c.n / 4));
c.window = Math.min(128, Math.max(1, Math.round(c.window || 16)));
c.x = Math.min(1, Math.max(0, Number.isFinite(c.x) ? c.x : 0.5)); c.y = Math.min(1, Math.max(0, Number.isFinite(c.y) ? c.y : 0.5));
let on = url.searchParams.get("collisions") !== "off", playing = url.searchParams.get("paused") !== "1";
const end = Math.min(2048, Math.max(c.window, Number(url.searchParams.get("end")) || 128));
let gas: Gas, circles: Circles, state: Uint32Array, initial: Uint32Array, previous: Sample, curve: Curve | null = null;
let busy = false, rewinding = false, ready = false;
let drawRect = { x: 0, y: 0, width: 1, height: 1 };
function sync() {
  for (const [key, value] of Object.entries(c)) url.searchParams.set(key, String(value));
  url.searchParams.set("collisions", on ? "on" : "off"); url.searchParams.set("paused", playing ? "0" : "1"); url.searchParams.set("end", String(end));
  history.replaceState(null, "", url);
  toggle.textContent = `Collisions ${on ? "on" : "off"}`; toggle.setAttribute("aria-pressed", String(on));
  pause.textContent = playing ? "Ⅱ" : "▶"; pause.setAttribute("aria-label", playing ? "Pause" : "Play");
  slider.value = String(c.rho); el("density").textContent = `mean free path ≈ ${(6 / c.rho).toFixed(1)} cells`;
}
function canvas(canvas: HTMLCanvasElement) {
  const { width: w, height: h } = canvas.getBoundingClientRect(), dpr = devicePixelRatio;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d")!; ctx.scale(dpr, dpr); ctx.font = "10px system-ui";
  return { ctx, w, h };
}
function draw() {
  if (!ready) return;
  const { ctx, w, h } = canvas(image), height = c.n * Math.sqrt(3) / 2;
  const scale = Math.min(w / c.n, (h - 25) / height), width = scale * c.n, hh = scale * height;
  drawRect = { x: (w - width) / 2, y: (h - hh) / 2 + 8, width, height: hh };
  ctx.fillStyle = "#9eb2c3"; ctx.fillText(`tap a point · density · t = ${gas.time}`, 5, 13);
  ctx.textAlign = "right"; ctx.fillStyle = "#f4cf72"; ctx.fillText("watch the gold rings ↓", w - 5, 13); ctx.textAlign = "left";
  const cell = Math.max(2, c.n / 64), offset = on ? 0 : c.n ** 2;
  for (let y = 0; y < c.n; y += cell) for (let x = 0; x < c.n; x += cell) {
    let sum = 0;
    for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) sum += pop[state[offset + (y + j) * c.n + x + i]];
    const v = Math.min(1, sum / (cell ** 2 * c.rho));
    ctx.fillStyle = `rgb(${Math.round(12 + 40 * v)},${Math.round(28 + 171 * v)},${Math.round(44 + 174 * v)})`;
    ctx.fillRect(drawRect.x + x * scale, drawRect.y + (c.n - y - cell) * Math.sqrt(3) / 2 * scale, cell * scale + 0.5, cell * Math.sqrt(3) / 2 * scale + 0.5);
  }
  ctx.save(); ctx.beginPath(); ctx.rect(drawRect.x, drawRect.y, width, hh); ctx.clip();
  const cx = drawRect.x + c.x * width, cy = drawRect.y + (1 - c.y) * hh;
  for (const r of [18 / c.rho, Math.sqrt(18 / c.rho * c.radius), c.radius]) {
    ctx.strokeStyle = "#f4cf7270"; ctx.lineWidth = 1;
    for (const dx of [-width, 0, width]) for (const dy of [-hh, 0, hh]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r * scale, 0, 2 * Math.PI); ctx.stroke(); }
  }
  ctx.fillStyle = "#ffdf83"; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
  const p = canvas(plot), g = p.ctx, left = 49, right = p.w - 12, top = 31, bottom = p.h - 28;
  const radii = circles.radii, lx = (r: number) => left + Math.log(r / radii[0]) / Math.log(radii.at(-1)! / radii[0]) * (right - left);
  const values = curve?.rates.flat().map(Math.abs).filter(v => v > 0 && Number.isFinite(v)) ?? [];
  const ymax = values.length ? Math.ceil(Math.log10(Math.max(...values))) : -6;
  const ymin = values.length ? Math.max(ymax - 6, Math.floor(Math.log10(Math.min(...values)))) : -10;
  const ly = (v: number) => bottom - (Math.log10(v) - ymin) / Math.max(1, ymax - ymin) * (bottom - top);
  const bandStart = Math.max(radii[0], 18 / c.rho), bandEnd = Math.min(c.radius, radii.at(-1)!);
  if (bandEnd > bandStart) { g.fillStyle = "#f4cf7218"; g.fillRect(lx(bandStart), top, lx(bandEnd) - lx(bandStart), bottom - top); }
  g.fillStyle = "#f4cf72"; g.fillText("Φ / area", 3, 12); g.fillStyle = "#97acbc";
  g.fillText(`3λ–R · ${curve ? `t ${curve.from}–${curve.time}` : `window ${c.window}`} · dashed < 0`, left, 12);
  g.textAlign = "right"; g.fillText("faint = paired opposite", right, 25); g.textAlign = "left";
  for (let j = ymin; j <= ymax; j++) { const y = ly(10 ** j); g.strokeStyle = "#273443"; g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke(); g.fillText(`1e${j}`, 3, y + 3); }
  for (const r of [2, 4, 8, 16, 32, 64, 128]) if (r <= radii.at(-1)!) { g.fillText(String(r), lx(r) - 5, bottom + 13); }
  g.textAlign = "right"; g.fillText("r · cells (log)", right, p.h - 2); g.textAlign = "left";
  if (curve) for (const side of [on ? 1 : 0, on ? 0 : 1]) {
    g.strokeStyle = side === (on ? 0 : 1) ? "#f4cf72" : "#89b6d36b"; g.lineWidth = side === (on ? 0 : 1) ? 2.5 : 1.5;
    for (let j = 1; j < radii.length; j++) {
      const a = curve.rates[side][j - 1], b = curve.rates[side][j];
      if (a * b <= 0 || Math.min(Math.abs(a), Math.abs(b)) < 10 ** ymin) continue;
      g.setLineDash(b < 0 ? [3, 3] : []); g.beginPath(); g.moveTo(lx(radii[j - 1]), ly(Math.abs(a))); g.lineTo(lx(radii[j]), ly(Math.abs(b))); g.stroke();
    }
    g.setLineDash([]);
  }
  const side = on ? 0 : 1, slope = curve?.slopes[side], spread = curve?.spread[side];
  const flat = slope != null && spread != null && Math.abs(slope) <= 0.25 && spread <= 2;
  caption.textContent = rewinding ? "Rewinding: the same collisions, exactly undone" : !curve ? "Tap the gas; look for a flat curve in the gold band" : `Collisions ${on ? "on" : "off"}: ${flat ? "flat here — compare the faint curve" : slope == null ? "no positive plateau in this window" : `no flat band · slope ${slope.toFixed(2)}`}`;
}
function fail(error: unknown) { playing = false; (window as any).probeError ??= String(error); caption.textContent = (window as any).probeError; }
async function main() {
  const { device, adapter } = await gpu();
  device.addEventListener("uncapturederror", event => fail(event.error.message));
  device.lost.then(info => fail(`GPU lost: ${info.message}`));
  async function reset(patch: Partial<Config> = {}) {
    if (gas) await gas.destroy(); Object.assign(c, patch);
    gas = new Gas(device, c); circles = new Circles(c); state = await gas.state(); initial = state.slice();
    previous = circles.sample(state, 0); curve = null; ready = true; sync(); draw(); return previous;
  }
  async function run(steps: number) {
    const samples: Curve[] = [];
    while (steps > 0) {
      const batch = Math.min(c.window, steps); await gas.advance(batch); steps -= batch;
      state = await gas.state(); const next = circles.sample(state, gas.time);
      curve = circles.curve(previous, next); samples.push(curve); previous = next;
    }
    draw(); return { sample: previous, curve, samples };
  }
  async function undo() {
    rewinding = true; draw();
    while (gas.time > 0) { await gas.advance(Math.min(c.window, gas.time), true); state = await gas.state(); draw(); }
    let mismatch = 0; for (let i = 0; i < state.length; i++) if (state[i] !== initial[i]) mismatch++;
    previous = circles.sample(state, 0); curve = null; rewinding = false; draw();
    caption.textContent = mismatch ? `Rewind mismatch: ${mismatch} sites` : "Rewound exactly · every bit restored";
    return { mismatch, sample: previous };
  }
  async function exclusive(fn: () => Promise<unknown>) {
    if (busy) return;
    busy = true; slider.disabled = true; rewind.disabled = true;
    try { return await fn(); } finally { busy = false; slider.disabled = false; rewind.disabled = false; }
  }
  await reset();
  (window as any).probe = { adapter, config: () => ({ ...c }),
    reset: async (patch: Partial<Config>) => { playing = false; return exclusive(() => reset(patch)); },
    run: (steps: number) => exclusive(() => run(steps)), rewind: () => exclusive(undo),
    state: async () => Array.from(await gas.state()),
    audit: () => ({ sample: previous, curve, radii: circles.radii, areas: circles.areas, scrollHeight: document.documentElement.scrollHeight, innerHeight, width: innerWidth }),
  };
  toggle.onclick = () => { on = !on; sync(); draw(); };
  pause.onclick = () => {
    if (busy) return;
    if (gas.time >= end) void exclusive(async () => { await reset(); playing = true; sync(); }).catch(fail);
    else { playing = !playing; sync(); }
  };
  slider.onchange = () => { playing = false; void exclusive(() => reset({ rho: Number(slider.value) })).catch(fail); };
  rewind.onclick = () => { playing = false; sync(); void exclusive(undo).catch(fail); };
  image.onpointerdown = event => {
    if (busy) return;
    const bounds = image.getBoundingClientRect();
    c.x = Math.min(1, Math.max(0, (event.clientX - bounds.left - drawRect.x) / drawRect.width));
    c.y = Math.min(1, Math.max(0, 1 - (event.clientY - bounds.top - drawRect.y) / drawRect.height));
    circles = new Circles(c); previous = circles.sample(state, gas.time); curve = null; sync(); draw();
  };
  new ResizeObserver(draw).observe(document.body);
  let lastFrame = 0;
  async function frame() {
    if (playing && !busy && performance.now() - lastFrame >= 600) {
      lastFrame = performance.now();
      await exclusive(async () => {
        if (gas.time >= end) { playing = false; sync(); return; }
        await run(Math.min(c.window, end - gas.time));
      });
    }
    requestAnimationFrame(() => void frame().catch(fail));
  }
  sync(); void frame().catch(fail);
}
void main().catch(fail);

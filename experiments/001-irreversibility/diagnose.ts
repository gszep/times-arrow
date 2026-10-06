// Exploratory diagnosis of the refuted 001 predictions (issue #2). The
// orchestrator's conjecture: once the packed block has spread to per-slot
// density 1/32, HPP turns only lone head-on pairs (states 0101/1010), so the
// collision rate falls like p² and the gas is nearly collisionless; free
// streaming then recurs with period n/2, matching the observed limit cycle.
// This measures the collision rate directly: per sampled step, one reduction
// counts the sites in state 0101 (east+west) and 1010 (north+south) on the
// pre-collide state — exactly the collisions that step performs — plus the
// particle number, on the pre-registered configuration (n = 1024, packed and
// uniform-null starts, same Philox constructors and step kernels, unchanged).
//
// Nothing here is registered: every number it writes is exploratory.
//   node experiments/001-irreversibility/diagnose.ts [--smoke]
// writes results/<host>-collisions[-smoke].json with provenance.
import contract from "../../contract.json" with { type: "json" };
import { gpu, read } from "../../src/gpu.ts";
import { Hpp, nullState, packedState } from "../../src/hpp.ts";
import { watchDevice } from "./run.ts";

export type DiagnoseConfig = {
  n: number;
  seed: number;
  mode: "packed" | "null";
  tMax: number;
  /** every step is sampled up to here, then every `every`; tMax always is. */
  everyStepTo: number;
  every: number;
};
export type CollisionSample = { t: number; ew: number; ns: number };

// The pair count, the shape of run.ts's `mass` kernel: sites in state 0101
// into out[0], 1010 into out[1], particle number into out[2] (zero all three
// first). State 0101 = bits 0|2 (east+west), 1010 = bits 1|3 (north+south).
const countWgsl = /* wgsl */ `
struct Params { n: u32, pad0: u32, pad1: u32, pad2: u32 }
@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read> src: array<u32>;
@group(0) @binding(2) var<storage, read_write> out: array<atomic<u32>>;

var<workgroup> w: array<u32, 256>;
var<workgroup> w2: array<u32, 256>;
var<workgroup> w3: array<u32, 256>;

fn mass4(s: u32) -> u32 {
  let t = s & 0xfu;
  return (t & 1u) + ((t >> 1u) & 1u) + ((t >> 2u) & 1u) + ((t >> 3u) & 1u);
}

@compute @workgroup_size(16, 16)
fn pairs(@builtin(global_invocation_id) g: vec3u, @builtin(local_invocation_id) l: vec3u) {
  let i = l.y * 16u + l.x;
  w[i] = 0u;
  w2[i] = 0u;
  w3[i] = 0u;
  if (g.x < p.n && g.y < p.n) {
    let s = src[g.y * p.n + g.x];
    w[i] = mass4(s);
    w2[i] = select(0u, 1u, s == 5u);
    w3[i] = select(0u, 1u, s == 10u);
  }
  workgroupBarrier();
  var s = 128u;
  while (s > 0u) {
    if (i < s) { w[i] += w[i + s]; w2[i] += w2[i + s]; w3[i] += w3[i + s]; }
    workgroupBarrier();
    s = s >> 1u;
  }
  if (i == 0u) {
    atomicAdd(&out[0u], w2[0]);
    atomicAdd(&out[1u], w3[0]);
    atomicAdd(&out[2u], w[0]);
  }
}
`;

/** The sampled times: every step to `everyStepTo`, then every `every`, always
 * including `tMax`. Sample `t` records the collisions of the step t → t+1. */
export function sampleTimes(cfg: Pick<DiagnoseConfig, "tMax" | "everyStepTo" | "every">): number[] {
  const ts = new Set<number>();
  for (let t = 0; t <= Math.min(cfg.everyStepTo, cfg.tMax); t++) ts.add(t);
  for (let t = cfg.everyStepTo + cfg.every; t <= cfg.tMax; t += cfg.every) ts.add(t);
  ts.add(cfg.tMax);
  return [...ts].sort((a, b) => a - b);
}

let sharedDevice: Promise<GPUDevice> | null = null;

/** One diagnostic run: the packed or null constructor, the unchanged `step`
 * kernel, and per sampled step one reduction of the lone head-on pair count. */
export async function diagnose(cfg: DiagnoseConfig): Promise<{ config: DiagnoseConfig; mass: number; samples: CollisionSample[] }> {
  const { n, seed, mode } = cfg;
  if (n < 16 || (n & (n - 1)) !== 0) throw new Error(`n = ${n} must be a power of two ≥ 16`);
  const device = await (sharedDevice ??= gpu().then((g) => g.device));
  const watch = watchDevice(device);
  const initial = mode === "packed" ? await packedState(device, seed, n) : await nullState(device, seed, n);
  watch.check();
  let mass = 0;
  for (const s of initial) mass += (s & 1) + ((s >>> 1) & 1) + ((s >>> 2) & 1) + ((s >>> 3) & 1);
  if (mass !== (n * n) / 8) throw new Error(`constructor drew ${mass} particles, expected ${(n * n) / 8}`);

  const h = new Hpp(device, n);
  h.load(initial);
  const module = device.createShaderModule({ code: countWgsl });
  const bind = (type: GPUBufferBindingType) => ({ visibility: GPUShaderStage.COMPUTE, buffer: { type } });
  const layout = device.createBindGroupLayout({
    entries: [bind("uniform"), bind("read-only-storage"), bind("storage")].map((e, i) => ({ binding: i, ...e })),
  });
  const pipeline = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module, entryPoint: "pairs" },
  });
  const params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  device.queue.writeBuffer(params, 0, new Uint32Array([n, 0, 0, 0]));
  const out = device.createBuffer({ size: 12, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST });

  const samples: CollisionSample[] = [];
  let prev = 0;
  for (const t of sampleTimes(cfg)) {
    h.step(t - prev);
    prev = t;
    device.queue.writeBuffer(out, 0, new Uint32Array(3));
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        layout,
        entries: [
          { binding: 0, resource: { buffer: params } },
          { binding: 1, resource: { buffer: h.buffer } },
          { binding: 2, resource: { buffer: out } },
        ],
      }),
    );
    pass.dispatchWorkgroups(n / 16, n / 16);
    pass.end();
    device.queue.submit([enc.finish()]);
    const words = (await watch.race(read(device, out)))[0];
    if (words[2] !== mass) throw new Error(`particle number drifted at t = ${t}: ${words[2]}, expected ${mass}`);
    samples.push({ t, ew: words[0], ns: words[1] });
  }
  h.destroy();
  params.destroy();
  out.destroy();
  return { config: cfg, mass, samples };
}

// The node driver. It does not run when the page imports this module for the
// measurement above (node-only imports are dynamic, inside `driver`).
if (typeof process !== "undefined") {
  const smoke = process.argv.includes("--smoke");
  const { execSync } = await import("node:child_process");
  const { mkdirSync, writeFileSync } = await import("node:fs");
  const { hostname } = await import("node:os");
  const { headless } = await import("../../scripts/headless.ts");
  const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
  const vendor = process.env.TIMES_ARROW_VENDOR ?? (process.platform === "darwin" ? "intel" : "nvidia");
  const full = { n: 1024, tMax: 32768, everyStepTo: 1024, every: 16, seeds: [1, 2] };
  const tiny = { n: 256, tMax: 1024, everyStepTo: 256, every: 32, seeds: [1] };
  const cfg = smoke ? tiny : full;
  const provenance = {
    commit: git("rev-parse HEAD"),
    dirty: git("status --porcelain --untracked-files=no") !== "",
    host: hostname().split(".")[0],
    date: new Date().toISOString(),
  };

  const { adapter, runs } = await headless("experiments/001-irreversibility/", async (evaluate) => {
    const adapter = await evaluate("probe.adapter");
    for (const g of contract.hpp.init as { seed: number; n: number; mode: "packed" | "null"; state: string }[]) {
      const got = (await evaluate(`probe.construct(${JSON.stringify(g.mode)}, ${g.seed}, ${g.n})`)) as string;
      const diff = [...got].filter((c, i) => c !== g.state[i]).length;
      if (diff !== 0)
        throw new Error(
          `the GPU ${g.mode} constructor (seed ${g.seed}, n = ${g.n}) differs from contract.hpp.init at ${diff} sites`,
        );
    }
    const runs = [];
    for (const mode of ["packed", "null"] as const)
      for (const seed of cfg.seeds) {
        const r = (await evaluate(
          `import("./diagnose.ts").then(m => m.diagnose(${JSON.stringify({ ...cfg, seed, mode })}))`,
        )) as Awaited<ReturnType<typeof diagnose>>;
        runs.push(r);
        const c = r.samples.map((s) => s.ew + s.ns);
        console.log(`seed ${seed} ${mode}: ${r.samples.length} samples, mass ${r.mass}, collisions/step ${c[0]} → ${c[c.length - 1]}`);
      }
    return { adapter, runs };
  }, vendor);

  mkdirSync(new URL("results", import.meta.url), { recursive: true });
  // Concatenated outside `new URL` so Vite's dev transform leaves it runtime.
  const name = "results/" + provenance.host + "-collisions" + (smoke ? "-smoke" : "") + ".json";
  const file = new URL(name, import.meta.url);
  writeFileSync(
    file,
    JSON.stringify(
      {
        ...provenance,
        label: "exploratory",
        question:
          "issue #2 diagnosis: is the gas nearly collisionless once the packed block has spread (per-slot density 1/32), or does the independent-slot rate hold?",
        note: "each sample t is one reduction of the pre-collide state: sites in state 0101 (ew) and 1010 (ns) — the collisions the step t → t+1 performs — with the unchanged Hpp kernels and constructors",
        params: { ...cfg, modes: ["packed", "null"] },
        // Independent-slot theory: q_site(p) = 2p²(1−p)², per-particle hazard
        // h(p) = p(1−p)², λ = 1/h. The pre-registered λ ≈ 34 is the p = 1/32
        // value; at the packed fill p = 1/2 it is 8.
        independentSlotsTheory: {
          q_site_p_half: 0.125,
          q_site_p_1_32: 961 / 524288,
          lambda_p_half: 8,
          lambda_p_1_32: 32768 / 961,
          collisions_per_particle_32768: 961,
          collisions_per_particle_512: 961 / 64,
          packed_t0_per_step: 8192.06,
          null_per_step: 1921.99,
        },
        adapter,
        runs,
      },
      null,
      1,
    ) + "\n",
  );
  console.log(file.pathname);
}

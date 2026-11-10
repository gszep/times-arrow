import contract from "../contract.json" with { type: "json" };
import { read, storage } from "./gpu.ts";
import { Hpp, mass4, nullState, packedState } from "./hpp.ts";
import { philoxWgsl } from "./philox.ts";

type Result = { name: string; pass: boolean; detail: string };

const philoxTest = /* wgsl */ `
${philoxWgsl}
@group(0) @binding(0) var<storage, read> input: array<vec4u>;
@group(0) @binding(1) var<storage, read_write> output: array<vec4u>;

// Row i: (ctr, key) in rows 2i, 2i+1 of the input.
@compute @workgroup_size(1)
fn kat(@builtin(global_invocation_id) g: vec3u) {
  output[g.x] = philox(input[2u * g.x], input[2u * g.x + 1u].xy);
}

// Row i: (seed, step, site) in input i; output rows 2i (words) and 2i+1 (u01 bits).
@compute @workgroup_size(1)
fn stream(@builtin(global_invocation_id) g: vec3u) {
  let a = input[g.x];
  let r = rand(a.x, a.y, a.z);
  output[2u * g.x] = r;
  output[2u * g.x + 1u] = bitcast<vec4u>(vec4f(u01(r.x), u01(r.y), u01(r.z), u01(r.w)));
}
`;

async function runPhilox(device: GPUDevice, entryPoint: string, input: number[], rows: number) {
  const module = device.createShaderModule({ code: philoxTest });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint } });
  const src = storage(device, new Uint32Array(input));
  const dst = storage(device, new Uint32Array(4 * rows));
  const enc = device.createCommandEncoder();
  const pass = enc.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(
    0,
    device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: src } },
        { binding: 1, resource: { buffer: dst } },
      ],
    }),
  );
  pass.dispatchWorkgroups(input.length / (entryPoint === "kat" ? 8 : 4));
  pass.end();
  device.queue.submit([enc.finish()]);
  const [out] = await read(device, dst);
  src.destroy();
  dst.destroy();
  return Array.from(out);
}

/** The f32 bits of `m · 2⁻²⁴`, the uniform the contract's `u01` integer denotes. */
export function f32Bits(m: number): number {
  return new Uint32Array(new Float32Array([m / 16777216]).buffer)[0];
}

export const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Exact comparison of one-hex-digit-per-site HPP states, including missing sites. */
export function compareState(name: string, actual: string, expected: string): Result {
  let diff = Math.abs(actual.length - expected.length);
  for (let i = 0; i < Math.min(actual.length, expected.length); i++) diff += Number(actual[i] !== expected[i]);
  return { name, pass: diff === 0, detail: `${diff} sites differ` };
}

/** `rand(seed, step, site)` words and `u01` bits for each triple, on the GPU. */
export async function philoxStream(device: GPUDevice, triples: number[][]): Promise<number[][]> {
  const out = await runPhilox(device, "stream", triples.flatMap(([a, b, c]) => [a, b, c, 0]), 2 * triples.length);
  return triples.map((_, i) => out.slice(8 * i, 8 * i + 8));
}

/** Actual GPU words for the contract's known-answer inputs, in contract order. */
export async function philoxKnownAnswers(device: GPUDevice): Promise<number[][]> {
  const { kat } = contract.philox;
  const out = await runPhilox(device, "kat", kat.flatMap((v) => [...v.ctr, ...v.key, 0, 0]), kat.length);
  return kat.map((_, i) => out.slice(4 * i, 4 * i + 4));
}

const hamming = (a: Uint32Array, b: Uint32Array) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += mass4(a[i] ^ b[i]);
  return d;
};

/** Inverse, echo and negative-control checks. The exact inverse
 * (`collide ∘ stream⁻¹`) is always verified against the forward step; the
 * conjugated forms are the proved statements of `step_inverse` and
 * `loschmidt_echo`, run op for op. */
async function checkInverse(device: GPUDevice): Promise<Result[]> {
  const results: Result[] = [];
  const u32 = () => Math.floor(Math.random() * 2 ** 32);

  // Round trips over the contract's golden trajectories, the (seed, n) with a
  // t = 0 golden also checked against that vector.
  for (const g of contract.hpp.golden) {
    const hpp = new Hpp(device, g.n);
    hpp.init(g.seed);
    const start = await hpp.words();
    hpp.step(g.t);
    hpp.inv(g.t);
    const back = await hpp.words();
    hpp.destroy();
    const diff = hamming(start, back);
    results.push({
      name: `HPP echo seed ${g.seed}, n ${g.n}, t ${g.t}`,
      pass: diff === 0,
      detail: `${diff} slots differ`,
    });
  }

  // Random states: step then inverse, inverse then step.
  for (let i = 0; i < 3; i++) {
    const seed = u32();
    const n = [16, 32, 64][i];
    const t = 1 + Math.floor(Math.random() * 99);
    for (const order of ["step-inv", "inv-step"] as const) {
      const hpp = new Hpp(device, n);
      hpp.init(seed);
      const start = await hpp.words();
      if (order === "step-inv") {
        hpp.step(t);
        hpp.inv(t);
      } else {
        hpp.inv(t);
        hpp.step(t);
      }
      const back = await hpp.words();
      hpp.destroy();
      const diff = hamming(start, back);
      results.push({
        name: `HPP ${order} seed ${seed}, n ${n}, t ${t}`,
        pass: diff === 0,
        detail: `${diff} slots differ`,
      });
    }
  }

  // The two conjuncts of `step_inverse` and the `loschmidt_echo` protocol,
  // op for op: S(R(S(R(s)))) = s, R(S(R(S(s)))) = s, and R S^t R S^t = id.
  {
    const seed = u32();
    const n = 32;
    const t = 1 + Math.floor(Math.random() * 99);
    for (const ops of [
      ["rev", "step", "rev", "step"],
      ["step", "rev", "step", "rev"],
    ] as const) {
      const hpp = new Hpp(device, n);
      hpp.init(seed);
      const start = await hpp.words();
      for (const op of ops) (op === "step" ? hpp.step(1) : hpp.rev());
      const back = await hpp.words();
      hpp.destroy();
      const diff = hamming(start, back);
      results.push({
        name: `HPP conjugation ${ops.join("∘")} seed ${seed}`,
        pass: diff === 0,
        detail: `${diff} slots differ`,
      });
    }
    const hpp = new Hpp(device, n);
    hpp.init(seed);
    const start = await hpp.words();
    hpp.step(t);
    hpp.rev();
    hpp.step(t);
    hpp.rev();
    const back = await hpp.words();
    hpp.destroy();
    const diff = hamming(start, back);
    results.push({
      name: `Loschmidt echo (conjugated) seed ${seed}, t ${t}`,
      pass: diff === 0,
      detail: `${diff} slots differ`,
    });
  }

  // The naive flip-only reversal, run literally: k steps, flip, k flip-conjugated
  // steps. It must equal flip ∘ step^(2k) of the initial state and not recover it.
  {
    const seed = u32();
    const n = 32;
    const k = 3;
    const naive = new Hpp(device, n);
    naive.init(seed);
    const start = await naive.words();
    naive.step(k);
    naive.flip();
    for (let j = 0; j < k; j++) {
      naive.flip();
      naive.step(1);
      naive.flip();
    }
    const literal = await naive.words();
    naive.destroy();
    const derived = new Hpp(device, n);
    derived.init(seed);
    derived.step(2 * k);
    derived.flip();
    const collapsed = await derived.words();
    derived.destroy();
    results.push({
      name: `Flip-only reversal equals flip∘step^${2 * k} seed ${seed}`,
      pass: hamming(literal, collapsed) === 0,
      detail: `${hamming(literal, collapsed)} slots differ`,
    });
    results.push({
      name: `Flip-only reversal does not recover seed ${seed}`,
      pass: hamming(literal, start) >= 1,
      detail: `${hamming(literal, start)} slots differ from the initial state`,
    });
  }

  // The exact-N initial-state constructors against the contract's pinned
  // golden states (`hpp.init`, Lean's selection-sampling constructors).
  for (const v of contract.hpp.init) {
    const words = v.mode === "packed" ? await packedState(device, v.seed, v.n) : await nullState(device, v.seed, v.n);
    const got = Array.from(words, (w) => w.toString(16)).join("");
    results.push(compareState(`Initial state ${v.mode} seed ${v.seed}, n ${v.n}`, got, v.state));
  }

  return results;
}

/** Philox and HPP contract vectors plus HPP round-trip controls, run on `device`. */
export async function checkContract(device: GPUDevice): Promise<Result[]> {
  const { kat, stream } = contract.philox;
  const katOut = await philoxKnownAnswers(device);
  const katPass = kat.filter((v, i) => same(katOut[i], v.out)).length;
  const sOut = await philoxStream(device, stream.map((v) => [v.seed, v.step, v.site]));
  const sPass = stream.filter((v, i) => same(sOut[i], [...v.out, ...v.u01.map(f32Bits)])).length;
  const results: Result[] = [
    { name: "Philox known-answer vectors", pass: katPass === kat.length, detail: `${katPass}/${kat.length}` },
    { name: "Philox stream and u01", pass: sPass === stream.length, detail: `${sPass}/${stream.length}` },
  ];
  for (const mode of ["golden", "inverse", "echo"] as const) {
    for (const g of contract.hpp[mode]) {
      const h = new Hpp(device, g.n);
      try {
        h.init(g.seed);
        h.step(g.t);
        if (mode === "inverse") h.inv(g.t);
        if (mode === "echo") { h.rev(); h.step(g.t); h.rev(); }
        const name = `${mode === "golden" ? "HPP" : `Contract ${mode}`} seed ${g.seed}, n ${g.n}, t ${g.t}`;
        results.push(compareState(name, await h.state(), g.state));
      } finally {
        h.destroy();
      }
    }
  }
  results.push(...(await checkInverse(device)));
  return results;
}

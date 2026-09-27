import contract from "../contract.json" with { type: "json" };
import { read, storage } from "./gpu.ts";
import { Hpp } from "./hpp.ts";
import { philoxWgsl } from "./philox.ts";

export type Result = { name: string; pass: boolean; detail: string };

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

/** `rand(seed, step, site)` words and `u01` bits for each triple, on the GPU. */
export async function philoxStream(device: GPUDevice, triples: number[][]): Promise<number[][]> {
  const out = await runPhilox(device, "stream", triples.flatMap(([a, b, c]) => [a, b, c, 0]), 2 * triples.length);
  return triples.map((_, i) => out.slice(8 * i, 8 * i + 8));
}

/** Every golden vector in the contract, run on `device`. */
export async function checkContract(device: GPUDevice): Promise<Result[]> {
  const { kat, stream } = contract.philox;
  const katOut = await runPhilox(device, "kat", kat.flatMap((v) => [...v.ctr, ...v.key, 0, 0]), kat.length);
  const katPass = kat.filter((v, i) => same(katOut.slice(4 * i, 4 * i + 4), v.out)).length;
  const sOut = await philoxStream(device, stream.map((v) => [v.seed, v.step, v.site]));
  const sPass = stream.filter((v, i) => same(sOut[i], [...v.out, ...v.u01.map(f32Bits)])).length;
  const results: Result[] = [
    { name: "Philox known-answer vectors", pass: katPass === kat.length, detail: `${katPass}/${kat.length}` },
    { name: "Philox stream and u01", pass: sPass === stream.length, detail: `${sPass}/${stream.length}` },
  ];
  for (const g of contract.hpp.golden) {
    const hpp = new Hpp(device, g.n);
    hpp.init(g.seed);
    hpp.step(g.t);
    const s = await hpp.state();
    hpp.destroy();
    const diff = [...s].filter((c, i) => c !== g.state[i]).length;
    results.push({ name: `HPP seed ${g.seed}, n ${g.n}, t ${g.t}`, pass: diff === 0, detail: `${diff} sites differ` });
  }
  return results;
}

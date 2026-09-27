// Golden vectors and randomised differential tests against the Lean
// reference, in headless Chrome. Exits non-zero on any mismatch.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { f32Bits, same } from "../src/check.ts";
import { headless } from "./headless.ts";

const lean = ".lake/build/bin/timesarrow";
const u32 = () => Math.floor(Math.random() * 2 ** 32);
const ref = (...args: (string | number)[]) => execFileSync(lean, args.map(String), { encoding: "utf8" }).trim();

const failures = await headless("experiments/000-plumbing/", async (evaluate) => {
  console.log("adapter", await evaluate("probe.adapter"));
  const results: { name: string; pass: boolean; detail: string }[] = await evaluate("probe.check()");
  if (!existsSync(lean)) {
    console.log(`${lean} not built: skipping differential tests against Lean`);
  } else {
    const triples = Array.from({ length: 8 }, () => [u32(), u32(), u32()]);
    const gpu: number[][] = await evaluate(`probe.rand(${JSON.stringify(triples)})`);
    triples.forEach((t, i) => {
      const words = ref("rand", ...t).split(" ").map(Number);
      const pass = same(gpu[i], [...words, ...words.map((w) => f32Bits(w >>> 8))]);
      results.push({ name: `random Philox ${t.join(" ")}`, pass, detail: "" });
    });
    for (const n of [16, 32, 64]) {
      const seed = u32();
      const t = Math.floor(Math.random() * 200);
      const pass = (await evaluate(`probe.hpp(${seed}, ${n}, ${t})`)) === ref("hpp", seed, n, t);
      results.push({ name: `random HPP seed ${seed}, n ${n}, t ${t}`, pass, detail: "" });
    }
  }
  for (const r of results) console.log(r.pass ? "pass" : "FAIL", r.name, r.detail);
  return results.filter((r) => !r.pass).length;
});
process.exit(failures ? 1 : 0);

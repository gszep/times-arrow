import assert from "node:assert/strict";
import { marginal, productDist, uniformDist, rand, u01 } from "./lib.ts";

/** Unit test for `marginal`: agreement with a brute-force sum over all
 * configurations, and normalization. The fold in `marginal` removes bits at
 * arbitrary positions, so the load-bearing cases keep high sites while
 * removing their neighbours. */
const n = 10;
const probs = Array.from({ length: n }, (_, i) => (2 + Math.floor(u01(rand(3, 0, i)[0]) * 13)) / 16);
const mu = productDist(n, probs);

function brute(dist: Float64Array, sites: number[]): Float64Array {
  const out = new Float64Array(1 << sites.length);
  for (let c = 0; c < dist.length; c++) {
    let k = 0;
    for (let i = 0; i < sites.length; i++) k |= ((c >> sites[i]) & 1) << i;
    out[k] += dist[c];
  }
  return out;
}

const sets: number[][] = [
  [0], [9], [3, 4], [8, 9, 0],
  [n - 1],                 // keep the top site only
  [n - 1, 0],              // keep top, remove n-2 … 1
  [n - 2],                 // keep n-2 but NOT n-1
  [2, 5, n - 1],           // high and low kept sites mixed
  [0, 1, 2, 3, 4, 5, 6, 7, 8],
].map(s => [...s].sort((a, b) => a - b));
const rnd: number[] = [];
for (let i = 0; i < 5; i++) rnd.push(Math.floor(u01(rand(7, 0, i)[0]) * n));
sets.push([...new Set(rnd)].sort((a, b) => a - b));
for (const s of sets) {
  const m = marginal(mu, n, s);
  assert.equal(m.length, 1 << s.length);
  assert.ok(Math.abs(m.reduce((a, b) => a + b, 0) - 1) < 1e-12, `marginal on ${s} not normalized`);
  const b = brute(mu, s);
  for (let k = 0; k < m.length; k++) assert.ok(Math.abs(m[k] - b[k]) < 1e-15, `marginal ${s}[${k}]: ${m[k]} vs ${b[k]}`);
  // a product measure stays product on any region
  let prod = true;
  for (let k = 0; k < m.length && prod; k++) {
    let e = 1;
    for (let i = 0; i < s.length; i++) e *= (k >> i) & 1 ? probs[s[i]] : 1 - probs[s[i]];
    prod = Math.abs(m[k] - e) < 1e-15;
  }
  assert.ok(prod, `product measure not product on ${s}`);
}
const u = uniformDist(n);
for (const s of [[4], [0, 9], [1, 2, 3, 8]]) {
  const m = marginal(u, n, s);
  assert.ok(m.every(x => Math.abs(x - 1 / m.length) < 1e-18), `uniform marginal on ${s}`);
}
console.log(`lib-check: marginal matches brute force and stays normalized on ${sets.length} site sets (N=${n})`);

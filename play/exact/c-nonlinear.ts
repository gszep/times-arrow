import { kl, productDist, rand, u01 } from "./lib.ts";

/** Experiment C (issue #14): does the coarse-grained (one-site) part of a
 * region's information, Σ_x D(μ_x ‖ uniform), rise inside a causally
 * shrinking region when the rule is nonlinear? Reversible Margolus automaton
 * on a ring of N four-state sites (two bits each). Block rules: one Feistel
 * round, (a, b) ↦ (b, a ⊕ g(b)), a bijection for any g, whose left output is
 * a pass-through; and generic bijections of the 16 block states drawn with
 * the project RNG. Cone: one site per step. Product initial states; the uniform measure is stationary.
 * Only one-site marginals are needed, so the full distribution over 4^N
 * configurations is evolved exactly and never stored per region.
 * Rises are tabulated by time step, because a shrinking arc of length ≤ N−1
 * lives at most ⌊(N−2)/2⌋ steps and the comparison with fixed arcs must be
 * made at equal times. With the argument `reversed` the trajectory is read
 * backwards: the inverse dynamics (same cone) started from the correlated
 * state that the forward run reached. */

const N = 10, Q = 4, T = 4, SEEDS = Array.from({ length: 16 }, (_, i) => i + 1);
const feistel = (g: number[]) => Array.from({ length: 16 }, (_, k) => { const a = k & 3, b = k >> 2; return b | (a ^ g[b]) << 2; });
const shuffled = (seed: number) => {
  const p = Array.from({ length: 16 }, (_, k) => k);
  for (let i = 15; i > 0; i--) { const j = Math.floor(u01(rand(seed, 2, i)[0]) * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
};
/** Block tables: index a | b << 2 (a = left site), value left' | right' << 2. */
const RULES: Record<string, number[]> = {
  linear: feistel([0, 1, 2, 3]),
  and: feistel([0, 0, 0, 1]),
  mix: feistel([0, 3, 1, 1]),
  perm1: shuffled(1), perm2: shuffled(2), perm3: shuffled(3), perm4: shuffled(4),
};
const digit = (c: number, i: number) => (c >> (2 * i)) & 3;
const uniform = new Float64Array(Q).fill(1 / Q);

for (const [name, rule] of Object.entries(RULES)) {
  const P = [0, 1].map(phase => {
    const p = new Uint32Array(Q ** N);
    for (let c = 0; c < p.length; c++) {
      let out = 0;
      for (let k = 0; k < N / 2; k++) {
        const l = (2 * k + phase) % N, r = (2 * k + phase + 1) % N;
        const o = rule[digit(c, l) | digit(c, r) << 2];
        out |= (o & 3) << (2 * l) | (o >> 2) << (2 * r);
      }
      p[c] = out;
    }
    return p;
  });
  const stat = { shrink: Array.from({ length: T }, () => [0, 0, 0]), fixed: Array.from({ length: T }, () => [0, 0, 0]) };
  for (const seed of SEEDS) {
    const bits = Array.from({ length: 2 * N }, (_, i) => (2 + Math.floor(u01(rand(seed, 1, i)[0]) * 13)) / 16);
    let dist = productDist(2 * N, bits);
    const one: number[][] = [];
    for (let t = 0; t <= T; t++) {
      const m = Array.from({ length: N }, () => new Float64Array(Q));
      for (let c = 0; c < dist.length; c++) for (let x = 0; x < N; x++) m[x][digit(c, x)] += dist[c];
      one.push(m.map(p => kl(p, uniform)));
      if (t < T) {
        const next = new Float64Array(dist.length), p = P[t % 2];
        for (let c = 0; c < next.length; c++) next[p[c]] = dist[c];
        dist = next;
      }
    }
    if (process.argv.includes("reversed")) one.reverse();
    const sum = (t: number, l: number, len: number) => { let s = 0; for (let j = 0; j < len; j++) s += one[t][(l + j) % N]; return s; };
    for (let l = 0; l < N; l++) for (let len = 3; len <= N - 1; len++) for (let t = 0; t < T; t++) {
      for (const pattern of ["shrink", "fixed"] as const) {
        const len0 = pattern === "shrink" ? len - 2 * t : len, len1 = pattern === "shrink" ? len - 2 * (t + 1) : len;
        if (len1 < 1) continue;
        const rise = sum(t + 1, pattern === "shrink" ? l + t + 1 : l, len1) - sum(t, pattern === "shrink" ? l + t : l, len0);
        const s = stat[pattern][t];
        s[0]++;
        if (rise > 1e-10) { s[1]++; s[2] = Math.max(s[2], rise); }
      }
    }
  }
  for (const pattern of ["shrink", "fixed"] as const)
    console.log(`${name.padEnd(6)} ${pattern.padEnd(6)} ` + stat[pattern].map((s, t) => `t=${t}: ${s[1]}/${s[0]}${s[1] ? ` (max ${s[2].toFixed(3)})` : ""}`).join("   "));
}

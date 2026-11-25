import { arcAt, arcSites, kl, klBern, marginal, margolusPerms, productDist, rand, step, u01, uniformDist } from "./lib.ts";

/** Experiment B (issue #14): in a causally shrinking region the full relative
 * entropy to the uniform measure cannot rise (theorem). Does its one-site
 * (coarse-grained, "thermodynamic") part, Σ_x D(μ_x ‖ ν_x), ever rise? The
 * remainder is the multi-information among the region's sites. Reversible
 * Margolus automaton a1, product initial states, every initial arc. */

const N = 12, T = 6, SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const perms = margolusPerms(N), nu = uniformDist(N);
for (const pattern of ["shrink1", "fixed"] as const) {
  let steps = 0, fullRises = 0, oneRises = 0, largest = 0, at = "", largestFrac = 0;
  for (const seed of SEEDS) {
    const probs = Array.from({ length: N }, (_, i) => (2 + Math.floor(u01(rand(seed, 0, i)[0]) * 13)) / 16);
    const dist = [productDist(N, probs)];
    for (let t = 0; t < T; t++) dist.push(step(dist[t], t, perms, false));
    const one = dist.map(d => Array.from({ length: N }, (_, x) => klBern(marginal(d, N, [x])[1], 0.5)));
    for (let l = 0; l < N; l++) for (let len = 3; len <= N - 1; len++) {
      for (let t = 0; t < T; t++) {
        const here = arcAt(pattern, N, l, len, t), next = arcAt(pattern, N, l, len, t + 1);
        if (!here || !next) break;
        const s0 = arcSites(N, here[0], here[1]), s1 = arcSites(N, next[0], next[1]);
        const full0 = kl(marginal(dist[t], N, s0), marginal(nu, N, s0)), full1 = kl(marginal(dist[t + 1], N, s1), marginal(nu, N, s1));
        const one0 = s0.reduce((a, x) => a + one[t][x], 0), one1 = s1.reduce((a, x) => a + one[t + 1][x], 0);
        steps++;
        if (full1 - full0 > 1e-10) fullRises++;
        if (one1 - one0 > 1e-10) {
          oneRises++;
          if (one1 - one0 > largest) { largest = one1 - one0; largestFrac = largest / full0; at = `seed ${seed} arc(l=${l},len=${len}) t=${t}: one-site ${one0.toFixed(4)} → ${one1.toFixed(4)}, full ${full0.toFixed(4)} → ${full1.toFixed(4)}`; }
        }
      }
    }
  }
  console.log(`B (${pattern}). ring N=${N}, a1, ${SEEDS.length} product states, every arc of length ≥ 3, ${steps} steps`);
  console.log(`   full relative entropy: ${fullRises} rises (theorem: 0)`);
  console.log(`   one-site part: ${oneRises} rises (${(100 * oneRises / steps).toFixed(1)}% of steps); largest ${largest.toFixed(4)} nats (${(100 * largestFrac).toFixed(1)}% of the region's full information), at ${at}`);
}

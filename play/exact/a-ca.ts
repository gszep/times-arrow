import {
  arcAt, arcSites, CAUSAL, collarSites, kl, marginal, margolusPerms,
  noise, PATTERNS, productDist, projectIndex, rand, step, u01, uniformDist, type Pattern,
} from "./lib.ts";
import contract from "../../contract.json" with { type: "json" };

/** Experiment A (issue #14): full-distribution enumeration of the causal
 * second law on small rings. a1 = reversible Margolus CA π(a,b) = (b, a⊕b)
 * (cone speed 1), a2 = a1 then independent bit flips. Wall families from
 * every initial arc; how often D(μ_t ‖ ν_t) on the region increases.
 *
 * a1 keeps probabilities dyadic-exact in f64; a2 accumulates ~1e-15 relative
 * rounding (checked against BigInt rationals in exact-check.ts). Tolerance
 * for a "violation": 1e-10, three orders above the observed rounding. */

const N = 10, T = 10, TOL = 1e-10, RESID = 1e-12;

const productProbs = (seed: number): number[] =>
  Array.from({ length: N }, (_, i) => (2 + Math.floor(u01(rand(seed, 0, i)[0]) * 13)) / 16);

const defectProbs = (): number[] => {
  const p = Array(N).fill(0.5);
  p[0] = 0.25; p[1] = 0.25; p[2] = 0.75;
  return p;
};

const MUS = [
  { name: "rand1", probs: productProbs(1) },
  { name: "rand2", probs: productProbs(2) },
  { name: "rand3", probs: productProbs(3) },
  { name: "defect", probs: defectProbs() },
];
const NUS = [
  { name: "uniform", probs: null },
  { name: "rand4", probs: productProbs(4) },
];

type Dynamics = { name: string; back: boolean; eps: number };
const DYN: Dynamics[] = [
  { name: "a1", back: false, eps: 0 },
  { name: "a1-back", back: true, eps: 0 },
  { name: "a2(eps=1/8)", back: false, eps: 1 / 8 },
  { name: "a2(eps=1/4)", back: false, eps: 1 / 4 },
];

/** One full sweep for one dynamics: evolve every μ and ν, then walk every
 * wall family from every arc. */
function sweep(dyn: Dynamics) {
  const perms = margolusPerms(N);
  // dists[id][t]: id 0..MUS-1 are the μ, then the ν.
  const dists: Float64Array[][] = [];
  for (const m of MUS) dists.push(evolve(productDist(N, m.probs), dyn, perms));
  for (const v of NUS) dists.push(evolve(v.probs ? productDist(N, v.probs) : uniformDist(N), dyn, perms));

  const margCache = new Map<string, Float64Array>();
  const marg = (id: number, t: number, sites: number[]) => {
    const key = `${id}|${t}|${sites.join(",")}`;
    let m = margCache.get(key);
    if (!m) { m = marginal(dists[id][t], N, sites); margCache.set(key, m); }
    return m;
  };
  const dOn = (pair: [number, number], t: number, sites: number[]) =>
    kl(marg(pair[0], t, sites), marg(pair[1], t, sites));

  const stats = new Map<Pattern, { fam: number; steps: number; rises: number; max: number; at: string }>();
  for (const p of PATTERNS) stats.set(p, { fam: 0, steps: 0, rises: 0, max: -Infinity, at: "" });

  // item 4, fixed regions
  let inflowMin = Infinity, lossMin = Infinity, identMax = 0, condMax = 0;
  let condChecked = 0;

  for (const pair of MUS.flatMap((_, i) => NUS.map((_, j) => [i, MUS.length + j] as [number, number]))) {
    for (const pattern of PATTERNS) {
      const st = stats.get(pattern)!;
      for (let l = 0; l < N; l++) for (let len = 1; len <= N - 1; len++) {
        let stepped = false;
        for (let t = 0; t < T; t++) {
          const here = arcAt(pattern, N, l, len, t), next = arcAt(pattern, N, l, len, t + 1);
          if (!here || !next) break;
          const sHere = arcSites(N, here[0], here[1]);
          const dHere = dOn(pair, t, sHere), dNext = dOn(pair, t + 1, arcSites(N, next[0], next[1]));
          stepped = true;
          st.steps++;
          const rise = dNext - dHere;
          if (rise > st.max) { st.max = rise; st.at = `${MUS[pair[0]].name}/ν${NUS[pair[1] - MUS.length].name} arc(l=${l},len=${len}) t=${t}`; }
          if (rise > TOL) st.rises++;
          if (pattern === "fixed") {
            const sCollar = collarSites(N, here[0], here[1]);
            const dCollar = dOn(pair, t, sCollar);
            const inflow = dCollar - dHere, loss = dCollar - dNext;
            inflowMin = Math.min(inflowMin, inflow);
            lossMin = Math.min(lossMin, loss);
            identMax = Math.max(identMax, Math.abs(rise - (inflow - loss)));
            if (condChecked < 40) {
              // inflow must equal the conditional relative entropy of the collar given R
              const pC = marg(pair[0], t, sCollar), pR = marg(pair[0], t, sHere);
              const qC = marg(pair[1], t, sCollar), qR = marg(pair[1], t, sHere);
              const proj = projectIndex(sHere, sCollar);
              let cond = 0;
              for (let j = 0; j < pC.length; j++) if (pC[j] > 0)
                cond += pC[j] * Math.log((pC[j] / pR[proj[j]]) / (qC[j] / qR[proj[j]]));
              condMax = Math.max(condMax, Math.abs(cond - inflow));
              condChecked++;
            }
          }
        }
        if (stepped) st.fam++;
      }
    }
  }
  return { stats, inflowMin, lossMin, identMax, condMax, condChecked, dists };
}

function evolve(start: Float64Array, dyn: Dynamics, perms: { perm: Uint32Array[]; inv: Uint32Array[] }): Float64Array[] {
  const out = [start];
  for (let t = 0; t < T; t++) {
    let d = step(out[t], t, perms, dyn.back);
    if (dyn.eps > 0) d = noise(d, N, dyn.eps);
    out.push(d);
  }
  return out;
}

// ---- invariants -----------------------------------------------------------
{
  const kat = (contract.philox as { kat: { out: number[] }[] }).kat[0].out;
  const got = rand(0, 0, 0);
  if (got.join(",") !== kat.join(",")) throw new Error(`philox stream mismatch: ${got} vs ${kat}`);
  const perms = margolusPerms(N);
  const mu = productDist(N, MUS[0].probs), nu = uniformDist(N);
  let m: Float64Array<ArrayBufferLike> = mu, v: Float64Array<ArrayBufferLike> = nu, dFull = kl(m, v);
  for (let t = 0; t < T; t++) {
    m = step(m, t, perms, false); v = step(v, t, perms, false);
    const d1 = kl(m, v);
    if (Math.abs(d1 - dFull) > 1e-12) throw new Error("a1: full-ring D not invariant");
    dFull = d1;
  }
  m = mu; v = nu; dFull = kl(m, v);
  for (let t = 0; t < T; t++) {
    m = noise(step(m, t, perms, false), N, 1 / 8); v = noise(step(v, t, perms, false), N, 1 / 8);
    const d1 = kl(m, v);
    if (d1 > dFull + 1e-12) throw new Error("a2: full-ring D increased");
    dFull = d1;
  }
  for (let i = 1 << N; i-- > 0;) if (v[i] !== 2 ** -N) throw new Error("uniform not stationary under a2");
  console.log(`invariants: a1 full-ring D constant, a2 full-ring D decreasing, uniform stationary — OK (N=${N})`);
}

// ---- main table ------------------------------------------------------------
console.log(`\nA. ring N=${N}, T=${T}, ${MUS.length} μ × ${NUS.length} ν pairs, every initial arc × ${PATTERNS.length} wall patterns`);
console.log(`   rise tolerance ${TOL}; μ = random products (seeds 1-3) + defect(1/4,1/4,3/4 at sites 0-2); ν = uniform, product(seed 4)\n`);
for (const dyn of DYN) {
  const { stats, inflowMin, lossMin, identMax, condMax, condChecked } = sweep(dyn);
  console.log(`${dyn.name}${dyn.back ? " (item 3: inverse dynamics)" : ""}`);
  for (const p of PATTERNS) {
    const s = stats.get(p)!;
    const tag = CAUSAL.includes(p) ? "*" : " ";
    console.log(`  ${tag}${p.padEnd(8)} families ${String(s.fam).padStart(4)}  steps ${String(s.steps).padStart(5)}  rises ${String(s.rises).padStart(4)}  maxRise ${s.max.toExponential(2)}  ${s.rises ? "at " + s.at : ""}`);
  }
  console.log(`  item4 fixed: min inflow ${inflowMin.toExponential(2)}, min loss ${lossMin.toExponential(2)}, |ΔD−(inflow−loss)| ≤ ${identMax.toExponential(2)}, |inflow−D(collar|R)| ≤ ${condMax.toExponential(2)} (${condChecked} checks)`);
  const causalBad = CAUSAL.flatMap(p => stats.get(p)!).filter(s => s.max > RESID);
  if (causalBad.length) console.log(`  CAUSAL VIOLATION beyond ${RESID}: ${JSON.stringify(causalBad)}`);
}

// ---- item 2: smallest explicit violating examples --------------------------
// Growing family, one step, point mass vs uniform: D rises by exactly ln 2.
{
  const perms = margolusPerms(4);
  const mu = new Float64Array(16); mu[0b0000] = 1; // δ_{0000}
  const nu = uniformDist(4);
  const d0 = kl(marginal(mu, 4, [0]), marginal(nu, 4, [0]));
  const mu1 = step(mu, 0, perms, false);
  const d1 = kl(marginal(mu1, 4, [0, 1]), marginal(nu, 4, [0, 1]));
  console.log(`\nitem 2, growing family: N=4, μ₀=δ_{0000}, ν=uniform, R₀={0} → R₁={0,1}`);
  console.log(`  D_R(t)=|R|ln2 exactly: D_R(0)=${d0.toFixed(6)}=ln2, D_R(1)=${d1.toFixed(6)}=2ln2, rise ${d1 - d0} = ln2 (exact: ${Math.abs(d1 - d0 - Math.LN2) < 1e-12})`);
  console.log(`  site 1 ∈ R₁ depends on site 0 and site 1 at t=0; site 1 ∉ R₀. Rise predicted by item 2.`);
}
// Fixed families: exhaustive small search over product states with dyadic bias.
function searchFixed(n: number, eps: number, maxT: number) {
  const perms = margolusPerms(n);
  const nu = uniformDist(n);
  const biases = [0.25, 0.5, 0.75];
  let found: string[] = [];
  const rec = (probs: number[], i: number) => {
    if (found.length) return;
    if (i === n) {
      const mu = productDist(n, probs);
      const dFixed: number[][] = [];
      const cur: Float64Array[] = [mu];
      for (let t = 0; t <= maxT; t++) {
        dFixed.push([]);
        for (let l = 0; l < n; l++) for (let len = 1; len <= n - 1; len++) {
          const s = arcSites(n, l, len);
          dFixed[t].push(kl(marginal(cur[t], n, s), marginal(nu, n, s)));
        }
        if (t < maxT) {
          let d = step(cur[t], t, perms, false);
          if (eps > 0) d = noise(d, n, eps);
          cur.push(d);
        }
      }
      for (let t = 0; t < maxT; t++)
        for (let l = 0; l < n && !found.length; l++)
          for (let len = 1; len <= n - 1 && !found.length; len++) {
            const idx = l * (n - 1) + (len - 1);
            const rise = dFixed[t + 1][idx] - dFixed[t][idx];
            if (rise > 1e-12) found.push(`N=${n} ${eps ? "a2 eps=1/8" : "a1"} μ=product(${probs.join(",")}) R=(l=${l},len=${len}) fixed, t=${t}: D ${dFixed[t][idx].toFixed(6)} → ${dFixed[t + 1][idx].toFixed(6)}, rise ${rise.toFixed(6)}`);
          }
      return;
    }
    for (const b of biases) { probs.push(b); rec(probs, i + 1); probs.pop(); if (found.length) return; }
  };
  rec([], 0);
  return found;
}
console.log(`\nitem 2, fixed family: smallest rise among product states with site bias ∈ {1/4, 1/2, 3/4}, ν=uniform:`);
for (const [n, eps] of [[4, 0], [6, 0], [4, 1 / 8], [6, 1 / 8]] as const) {
  const f = searchFixed(n, eps, 4);
  if (f.length) { console.log(`  ${f[0]}`); break; }
  console.log(`  none at N=${n} ${eps ? "a2" : "a1"} within the scanned family`);
}

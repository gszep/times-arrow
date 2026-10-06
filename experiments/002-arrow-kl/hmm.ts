// The K5 coarse observer of 002, in f64 (WGSL has no f64; the contract
// pins the corner goldens as Lean rationals, compared at 1e-9).
// The count observer sees only region occupancies, so its "fine" space is
// the compositions of M into N parts (C(19,15) = 3876 states at the
// 4×4 corner): the occupancy chain of M independent walkers, with the
// multinomial hop-flow kernel
//   K(c, c') = Σ_{hop assignments} Π q(d)/256,
// evaluated from one canonical arrangement (all arrangements are equally
// likely for iid walkers). A region-count path ξ is an emission-constrained
// HMM over that space, and the per-path coarse log-ratio is the two
// forward passes
//   σ_cg(ξ) = ln(P_F^cg(ξ)/P_R^cg(ξ)) = −ln E_F[e^{−σ} | ξ],
// the identity P_R^cg(ξ) = P_F^cg(ξ)·E[e^{−σ}|ξ] being pathwise
// (P_R(ω) = e^{−σ(ω)}P_F(ω) under uniform π, summed over fine paths).
import type { Weights } from "../../src/walk.ts";

export type Hmm = {
  n: number;
  m: number;
  states: number;
  /** the multinomial initial law π(c) = M!/Π c_s! · N^(−M) */
  pi: Float64Array;
  /** kernel rows in CSR form, aggregated over hop assignments */
  rowPtr: Int32Array;
  col: Int32Array;
  /** K_F(c, c') under the base (driven) weights */
  val: Float64Array;
  /** per entry: the assignment's E- and W-hop counts — the factor to any
   * other arm's kernel is (e/e')^nE · (w/w')^nW, all other weights shared */
  ne: Int8Array;
  nw: Int8Array;
  /** per region: the occupancy count of each state */
  emit: Uint8Array[];
  base: Weights;
};

/** Every composition of `m` into `n·n` parts, with its radix-(m+1) key. */
function compositions(m: number, n: number) {
  const N = n * n;
  const index = new Map<number, number>();
  const flat: number[] = [];
  const c = new Int32Array(N);
  const walk = (site: number, left: number, key: number) => {
    if (site === N - 1) {
      index.set(key + left * (m + 1) ** (N - 1), flat.length / N);
      for (let s = 0; s < N; s++) flat.push(c[s]);
      flat[flat.length - 1] = left;
      return;
    }
    for (let v = 0; v <= left; v++) {
      c[site] = v;
      walk(site + 1, left - v, key + v * (m + 1) ** site);
    }
  };
  walk(0, m, 0);
  return { index, comp: new Int32Array(flat), N };
}

/** The occupancy chain of `m` walkers on the `n×n` torus under the base
 * weights, with `masks` the per-site membership of the observed regions. */
export function buildHmm(n: number, m: number, base: Weights, masks: Uint32Array[]): Hmm {
  if (m > 8) throw new Error("the radix-(m+1) key and the factorial weights assume m ≤ 8");
  const N = n * n;
  const { index, comp } = compositions(m, n);
  const states = comp.length / N;
  const pi = new Float64Array(states);
  for (let s = 0; s < states; s++) {
    let perm = 1;
    for (let i = 1; i <= m; i++) perm *= i;
    for (let site = 0; site < N; site++) {
      const c = comp[s * N + site];
      for (let i = 1; i <= c; i++) perm /= i;
    }
    pi[s] = perm * Math.pow(N, -m);
  }
  // the base hop weights and the wrapped targets of each site
  const q = [base.e, base.w, base.n, base.s, base.zero].map((x) => x / 256);
  const target: Int32Array[] = [0, 1, 2, 3, 4].map((d) => {
    const t = new Int32Array(N);
    for (let site = 0; site < N; site++) {
      const x = site % n;
      const y = (site / n) | 0;
      t[site] =
        d === 0 ? y * n + ((x + 1) % n)
        : d === 1 ? y * n + ((x - 1 + n) % n)
        : d === 2 ? ((y + 1) % n) * n + x
        : d === 3 ? ((y - 1 + n) % n) * n + x
        : site;
    }
    return t;
  });
  const rowPtr = new Int32Array(states + 1);
  const col: number[] = [];
  const val: number[] = [];
  const ne: number[] = [];
  const nw: number[] = [];
  const c2 = new Int32Array(N);
  const touched: number[] = [];
  const row = new Map<number, number>();
  const radix = m + 1;
  for (let s = 0; s < states; s++) {
    row.clear();
    // the canonical arrangement: walker w at the w-th site of the sorted list
    const at: number[] = [];
    for (let site = 0; site < N; site++) for (let i = 0; i < comp[s * N + site]; i++) at.push(site);
    for (let tuple = 0; tuple < 5 ** m; tuple++) {
      let key = 0;
      let nE = 0;
      let nW = 0;
      let prob = 1;
      let digits = tuple;
      touched.length = 0;
      for (let w = 0; w < m; w++) {
        const d = digits % 5;
        digits = (digits / 5) | 0;
        prob *= q[d];
        if (d === 0) nE++;
        else if (d === 1) nW++;
        const t = target[d][at[w]];
        if (c2[t] === 0) touched.push(t);
        c2[t]++;
      }
      for (const t of touched) key += c2[t] * radix ** t;
      const entry = index.get(key)! * radix * radix + nE * radix + nW;
      row.set(entry, (row.get(entry) ?? 0) + prob);
      for (const t of touched) c2[t] = 0;
    }
    rowPtr[s] = col.length;
    const sorted = [...row].sort((a, b) => a[0] - b[0]);
    for (const [entry, p] of sorted) {
      col.push((entry / (radix * radix)) | 0);
      ne.push(((entry / radix) | 0) % radix);
      nw.push(entry % radix);
      val.push(p);
    }
  }
  rowPtr[states] = col.length;
  const emit = masks.map((mask) => {
    const e = new Uint8Array(states);
    for (let s = 0; s < states; s++) {
      let count = 0;
      for (let site = 0; site < N; site++) if (mask[site]) count += comp[s * N + site];
      e[s] = count;
    }
    return e;
  });
  return {
    n,
    m,
    states,
    pi,
    rowPtr,
    col: new Int32Array(col),
    val: new Float64Array(val),
    ne: new Int8Array(ne),
    nw: new Int8Array(nw),
    emit,
    base,
  };
}

/** The (m+1)² entry-factor table that maps the base kernel onto arm `w`. */
function factors(hmm: Hmm, w: Weights): Float64Array {
  const r = hmm.m + 1;
  const fe = w.e / hmm.base.e;
  const fw = w.w / hmm.base.w;
  const table = new Float64Array(r * r);
  for (let e = 0; e < r; e++) for (let w2 = 0; w2 < r; w2++) table[e * r + w2] = fe ** e * fw ** w2;
  return table;
}

/** The coarse path law of a region-count path under arm `w`: the
 * emission-constrained forward pass over the occupancy chain. */
export function pathProbability(hmm: Hmm, path: number[], region: number, w: Weights): number {
  const f = factors(hmm, w);
  const em = hmm.emit[region];
  let alpha = new Float64Array(hmm.states);
  for (let s = 0; s < hmm.states; s++) alpha[s] = em[s] === path[0] ? hmm.pi[s] : 0;
  for (let t = 1; t < path.length; t++) {
    alpha = advance(hmm, alpha, f);
    for (let s = 0; s < hmm.states; s++) if (em[s] !== path[t]) alpha[s] = 0;
  }
  let p = 0;
  for (let s = 0; s < hmm.states; s++) p += alpha[s];
  return p;
}

function advance(hmm: Hmm, alpha: Float64Array, f: Float64Array): Float64Array<ArrayBuffer> {
  const next = new Float64Array(hmm.states);
  const r = hmm.m + 1;
  for (let c = 0; c < hmm.states; c++) {
    const a = alpha[c];
    if (a === 0) continue;
    for (let k = hmm.rowPtr[c]; k < hmm.rowPtr[c + 1]; k++)
      next[hmm.col[k]] += a * hmm.val[k] * f[hmm.ne[k] * r + hmm.nw[k]];
  }
  return next;
}

/** All k-time count probabilities in the contract's little-endian base-(m+1)
 * order. Shared prefixes reuse the same forward pass as pathProbability. */
export function countMarginal(hmm: Hmm, region: number, k: number, w: Weights): Float64Array {
  const base = hmm.m + 1;
  const law = new Float64Array(base ** k);
  const f = factors(hmm, w);
  const em = hmm.emit[region];
  const visit = (prior: Float64Array, t: number, code: number) => {
    for (let obs = 0; obs < base; obs++) {
      const alpha = new Float64Array(hmm.states);
      let mass = 0;
      for (let s = 0; s < hmm.states; s++) if (em[s] === obs) mass += alpha[s] = prior[s];
      const nextCode = code + obs * base ** t;
      if (t + 1 === k) law[nextCode] = mass;
      else if (mass > 0) visit(advance(hmm, alpha, f), t + 1, nextCode);
    }
  };
  visit(hmm.pi, 0, 0);
  return law;
}

/** The per-path coarse log-ratio of a region-count path, forward arm against
 * reversed arm — the two forward passes of the registration. */
export function sigmaCg(hmm: Hmm, path: number[], region: number, fwd: Weights, rev: Weights): number {
  return Math.log(pathProbability(hmm, path, region, fwd)) - Math.log(pathProbability(hmm, path, region, rev));
}

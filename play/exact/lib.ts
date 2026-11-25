import contract from "../../contract.json" with { type: "json" };

/** Exact-enumeration machinery for the causal-second-law exploration
 * (issue #14, exact-numerics lane). Everything here is f64 over full
 * distributions on small rings; a1 keeps dyadic probabilities exact, a2
 * accumulates only float rounding (see exact-check.ts for a BigInt check).
 * Nothing in this directory is a claim or a kernel: it is exploration. */

const { M, W, rounds } = contract.philox;
const u32 = (x: number) => x >>> 0;

function mulhilo(a: number, b: number): [number, number] {
  const al = a & 0xffff, ah = u32(a) >>> 16, bl = b & 0xffff, bh = u32(b) >>> 16;
  const ll = u32(Math.imul(al, bl)), lh = u32(Math.imul(al, bh)), hl = u32(Math.imul(ah, bl));
  const mid = ((ll >>> 16) + (lh & 0xffff) + (hl & 0xffff)) >>> 16;
  return [u32(u32(Math.imul(ah, bh)) + (lh >>> 16) + (hl >>> 16) + mid), u32(Math.imul(a, b))];
}

/** The project RNG stream (TimesArrow/Philox.lean): counter (site, step, 0, 0),
 * key (seed, 0). Only used to draw initial measures; all evolution below is
 * deterministic. */
export function rand(seed: number, step: number, site: number): number[] {
  let c = [u32(site), u32(step), 0, 0], k = [u32(seed), 0];
  for (let r = 0; r < rounds; r++) {
    const p0 = mulhilo(M[0], c[0]), p1 = mulhilo(M[1], c[2]);
    c = [u32(p1[0] ^ c[1] ^ k[0]), p1[1], u32(p0[0] ^ c[3] ^ k[1]), p0[1]];
    k = [u32(k[0] + W[0]), u32(k[1] + W[1])];
  }
  return c;
}

/** Top-24-bit uniform, as in the WGSL `u01`. */
export const u01 = (x: number) => (x >>> 8) / 2 ** 24;

/** The block rule π on 2-site Margolus blocks: (a,b) ↦ (b, a⊕b), i.e.
 * 00→00, 01→11, 10→01, 11→10. A bijection (hence a reversible CA once the
 * partition alternates) that mixes both sites and is neither a pure shift nor
 * the 01↔10 swap. Every 2-bit permutation is affine over 𝔽₂, so no genuinely
 * nonlinear choice exists at this block size; noise (a2) breaks the global
 * affinity. Light cone: one site per step. */
export function margolusPerms(n: number): { perm: Uint32Array[]; inv: Uint32Array[] } {
  const perm: Uint32Array[] = [], inv: Uint32Array[] = [];
  for (const phase of [0, 1]) {
    const P = new Uint32Array(1 << n), I = new Uint32Array(1 << n);
    for (let c = 0; c < 1 << n; c++) {
      let out = 0;
      for (let k = 0; k < n / 2; k++) {
        const l = (2 * k + phase) % n, r = (2 * k + phase + 1) % n;
        const a = (c >> l) & 1, b = (c >> r) & 1;
        out |= b << l | (a ^ b) << r;
      }
      P[c] = out;
      I[out] = c;
    }
    perm.push(P);
    inv.push(I);
  }
  return { perm, inv };
}

/** Independent bit-flip channel, probability eps per site, applied after the
 * deterministic step (a2). Dyadic eps keeps the arithmetic as exact as f64
 * allows. */
export function noise(dist: Float64Array, n: number, eps: number): Float64Array {
  let cur = dist;
  for (let i = 0; i < n; i++) {
    const bit = 1 << i, out = new Float64Array(cur.length);
    for (let c = 0; c < cur.length; c++) {
      if (c & bit) continue;
      const p0 = cur[c], p1 = cur[c | bit];
      out[c] = (1 - eps) * p0 + eps * p1;
      out[c | bit] = eps * p0 + (1 - eps) * p1;
    }
    cur = out;
  }
  return cur;
}

/** One forward step of a1 at time t (partition phase alternates), or of the
 * inverse dynamics when `back` is set (item 3: the inverse also has cone
 * speed one). */
export function step(dist: Float64Array, t: number, p: { perm: Uint32Array[]; inv: Uint32Array[] }, back: boolean): Float64Array {
  const m = back ? p.inv[t % 2] : p.perm[t % 2];
  const out = new Float64Array(dist.length);
  for (let c = 0; c < dist.length; c++) out[m[c]] = dist[c];
  return out;
}

/** Product measure from per-site probabilities. */
export function productDist(n: number, probs: number[]): Float64Array {
  let d = new Float64Array([1]);
  for (let i = 0; i < n; i++) {
    const out = new Float64Array(d.length * 2);
    for (let c = 0; c < d.length; c++) {
      out[c] = d[c] * (1 - probs[i]);
      out[c | 1 << i] = d[c] * probs[i];
    }
    d = out;
  }
  return d;
}

export const uniformDist = (n: number) => new Float64Array(1 << n).fill(2 ** -n);

/** Marginal of `dist` on `sites`, by folding out every other site. The result
 * is indexed so that bit j of the index is the value of the j-th smallest
 * site of `sites`. */
export function marginal(dist: Float64Array, n: number, sites: number[]): Float64Array {
  const keep = new Set(sites);
  let cur = dist;
  let live: number[] = Array.from({ length: n }, (_, i) => i); // bit p = value of site live[p]
  for (let pos = live.length - 1; pos >= 0; pos--) {
    if (keep.has(live[pos])) continue;
    const bit = 1 << pos;
    const out = new Float64Array(cur.length / 2);
    for (let j = 0; j < cur.length; j++) {
      if (j & bit) continue;
      out[(j & (bit - 1)) | ((j >> (pos + 1)) << pos)] = cur[j] + cur[j | bit];
    }
    cur = out;
    live.splice(pos, 1);
  }
  return cur;
}

/** Relative entropy between two marginals over the same sites. */
export function kl(p: Float64Array, q: Float64Array): number {
  let d = 0;
  for (let k = 0; k < p.length; k++) if (p[k] > 0) d += p[k] * Math.log(p[k] / q[k]);
  return d;
}

/** D((p,1−p) ‖ (q,1−q)) in nats. */
export function klBern(p: number, q: number): number {
  let d = 0;
  if (p > 0) d += p * Math.log(p / q);
  if (p < 1) d += (1 - p) * Math.log((1 - p) / (1 - q));
  return d;
}

/** Sites of the arc [l, l+len−1] (mod n) as a sorted list. */
export function arcSites(n: number, lRaw: number, len: number): number[] {
  const l = ((lRaw % n) + n) % n;
  const s: number[] = [];
  for (let j = 0; j < len; j++) s.push((l + j) % n);
  return s.sort((a, b) => a - b);
}

/** The one-site collar of an arc, capped at the full ring. */
export function collarSites(n: number, l: number, len: number): number[] {
  if (len >= n - 1) return arcSites(n, 0, n);
  return arcSites(n, l - 1, len + 2);
}

/** For every collar-marginal index, the index of its restriction to the
 * region, given both sorted site lists. */
export function projectIndex(regionSites: number[], collarSitesList: number[]): number[] {
  const pos = regionSites.map(s => collarSitesList.indexOf(s));
  return Array.from({ length: 1 << collarSitesList.length }, (_, j) =>
    pos.reduce((k, p, i) => k | ((j >> p) & 1) << i, 0));
}

/** Wall-speed families: how the arc (l, len) evolves per step.
 * Causal (wall recedes at cone speed ≥ 1 per side): shrink1, shrink2. */
export type Pattern =
  | "fixed" | "shrink1" | "shrink2" | "grow1" | "trans+1" | "trans-1";

export const PATTERNS: Pattern[] = ["shrink2", "shrink1", "fixed", "grow1", "trans+1", "trans-1"];
export const CAUSAL: Pattern[] = ["shrink2", "shrink1"];

/** Arc (l, len) at time t under a pattern, or null when the family has ended
 * (region empty, or the growing region would swallow the ring). */
export function arcAt(pattern: Pattern, n: number, l: number, len: number, t: number): [number, number] | null {
  switch (pattern) {
    case "fixed": return [l, len];
    case "shrink1": return len - 2 * t >= 1 ? [l + t, len - 2 * t] : null;
    case "shrink2": return len - 4 * t >= 1 ? [l + 2 * t, len - 4 * t] : null;
    case "grow1": return len + 2 * t <= n - 1 ? [(((l - t) % n) + n) % n, len + 2 * t] : null;
    case "trans+1": return [(l + t) % n, len];
    case "trans-1": return [(((l - t) % n) + n) % n, len];
  }
}

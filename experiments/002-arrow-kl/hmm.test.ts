// Tests for the K5 coarse pipeline (hmm.ts), all against the locked
// registration:
//   node experiments/002-arrow-kl/hmm.test.ts
// (1) The occupancy-chain HMM against brute-force enumeration of every fine
//     path (n = 4, M = 2, T = 2: 256 position pairs × 625 direction tuples),
//     exact in f64, for both corner regions and both arms — the differential
//     test of the kernel, the initial law and the forward pass.
// (2) The registered marginal facts: the 2-time marginal is drive-blind for
//     both regions (any region, by the flux argument), and the 3-time
//     marginal of both corner regions is blind too — the value the contract
//     must pin as a golden (KL = 0 exactly, rational arithmetic). The 4-
//     and 5-time KLs (1.28e-5, 3.00e-5) are deferred to the goldens: the
//     f64 enumeration that would check them here costs ~10⁹ entry visits.
// (3) The half-count blindness at the registered corner: σ_cg ≡ 0 on
//     synthetic populated half paths, within the 1e-12 the falsifier
//     allows (exactly 0 in the rational goldens).
// (4) The null structure: the null's reversed kernel equals its forward
//     kernel (q_E = q_W), so σ_cg ≡ 0 — checked both on the weights and by
//     an identical-passes computation returning exactly 0.
import assert from "node:assert/strict";
import { ARMS, LN3 } from "./score.ts";
import { buildHmm, pathProbability, sigmaCg } from "./hmm.ts";
import { halfMask, lMask } from "./run.ts";
import type { Weights } from "../../src/walk.ts";

const N = 4;

/** the exact count-path law by enumerating every fine path */
function bruteLaw(m: number, T: number, q: Weights, mask: Uint32Array): Map<string, number> {
  const sites = N * N;
  const law = new Map<string, number>();
  const hop = (site: number, d: number) => {
    const x = site % N;
    const y = (site / N) | 0;
    return d === 0 ? y * N + ((x + 1) % N)
      : d === 1 ? y * N + ((x + N - 1) % N)
      : d === 2 ? ((y + 1) % N) * N + x
      : d === 3 ? ((y + N - 1) % N) * N + x
      : site;
  };
  const w = [q.e, q.w, q.n, q.s, q.zero].map((x) => x / 256);
  const counts: number[] = [];
  const rec = (pos: number[], t: number, prob: number) => {
    if (t === T) {
      const key = counts.join(",");
      law.set(key, (law.get(key) ?? 0) + prob);
      return;
    }
    for (let tuple = 0; tuple < 5 ** m; tuple++) {
      let p = prob;
      let digits = tuple;
      const next: number[] = [];
      for (let i = 0; i < m; i++) {
        const d = digits % 5;
        digits = (digits / 5) | 0;
        p *= w[d];
        next.push(hop(pos[i], d));
      }
      counts.push(next.reduce((a, s) => a + mask[s], 0));
      rec(next, t + 1, p);
      counts.pop();
    }
  };
  for (let p0 = 0; p0 < sites; p0++)
    for (let p1 = 0; p1 < sites; p1++) {
      counts.length = 0;
      counts.push(mask[p0] + mask[p1]);
      rec([p0, p1], 0, 1 / (sites * sites));
    }
  return law;
}

// (1) brute force against the HMM, both regions, both arms.
{
  const masks = [halfMask(N), lMask(N)];
  const hmm = buildHmm(N, 2, ARMS.driven, masks);
  for (const [region, mask] of masks.entries()) {
    for (const arm of [ARMS.driven, ARMS.reversed]) {
      const law = bruteLaw(2, 2, arm, mask);
      let worst = 0;
      for (const [key, p] of law) {
        const path = key.split(",").map(Number);
        const got = pathProbability(hmm, path, region, arm);
        worst = Math.max(worst, Math.abs(got - p) / p);
      }
      assert.ok(worst < 1e-10, `region ${region}: HMM off brute force by ${worst.toExponential(2)}`);
      assert.ok(law.size > 10, `region ${region}: only ${law.size} count paths`);
      console.log(`pass: region ${region}, arm e/w ${arm.e}/${arm.w}: ${law.size} count paths, worst relative error ${worst.toExponential(2)}`);
    }
  }
}

/** the KL between the arms' k-time count marginals, by enumerating the
 * count sequences (every sequence with P_F > 0) */
function marginalKl(hmm: ReturnType<typeof buildHmm>, region: number, k: number): number {
  const m = hmm.m;
  let kl = 0;
  const rec = (path: number[]) => {
    if (path.length === k) {
      const pf = pathProbability(hmm, path, region, ARMS.driven);
      if (pf <= 0) return;
      const pr = pathProbability(hmm, path, region, ARMS.reversed);
      kl += pf * Math.log(pf / pr);
      return;
    }
    for (let c = 0; c <= m; c++) {
      if (path.length && Math.abs(c - path[path.length - 1]) > m) continue;
      path.push(c);
      rec(path);
      path.pop();
    }
  };
  rec([]);
  return kl;
}

// (2) the registered marginal facts at the corner.
{
  const masks = [halfMask(N), lMask(N)];
  const hmm = buildHmm(N, 4, ARMS.driven, masks);
  assert.equal(hmm.states, 3876, "C(19,15) = 3876 compositions");
  for (const [region, name] of masks.entries()) {
    const kl2 = marginalKl(hmm, region, 2);
    const kl3 = marginalKl(hmm, region, 3);
    assert.ok(Math.abs(kl2) < 1e-12, `region ${name}: 2-time KL ${kl2.toExponential(2)} ≠ 0`);
    assert.ok(Math.abs(kl3) < 1e-12, `region ${name}: 3-time KL ${kl3.toExponential(2)} ≠ 0`);
    console.log(`pass: region ${region}: 2-time KL ${kl2.toExponential(2)}, 3-time KL ${kl3.toExponential(2)} — both drive-blind (registered goldens: exactly 0)`);
  }

  // (3) the half-count blindness on synthetic populated half paths.
  let worstHalf = 0;
  for (let j = 0; j < 5; j++) {
    const path: number[] = [];
    let c = j % 5;
    for (let t = 0; t <= 32; t++) {
      path.push(c);
      c = Math.max(0, Math.min(4, c + [0, 1, -1, 2, -2, 0, 1, -1][(t + j) % 8]));
    }
    const scg = sigmaCg(hmm, path, 0, ARMS.driven, ARMS.reversed);
    worstHalf = Math.max(worstHalf, Math.abs(scg));
  }
  assert.ok(worstHalf <= 1e-12, `half-count σ_cg off 0 by ${worstHalf.toExponential(2)} (registered falsifier: 1e-12)`);
  console.log(`pass: half-count σ_cg ≡ 0 within ${worstHalf.toExponential(2)} on synthetic populated paths`);
  // the L keeps a finite σ_cg (sanity: the passes run and produce numbers)
  const lPath = [1, 1, 0, 1, 2, 1, 1, 0, 1, 1];
  const scgL = sigmaCg(hmm, lPath.concat(Array.from({ length: 23 }, (_, t) => t % 3)), 1, ARMS.driven, ARMS.reversed);
  assert.ok(Number.isFinite(scgL), `L-count σ_cg = ${scgL}`);
  console.log(`pass: L-count σ_cg finite (${scgL.toExponential(2)} nats on a synthetic path)`);

  // (4) the null structure.
  assert.equal(ARMS.null.e, ARMS.null.w, "the null swaps nothing: q_E = q_W");
  const hmmNull = buildHmm(N, 4, ARMS.null, masks);
  const path = Array.from({ length: 33 }, (_, t) => t % 5);
  const scgNull = sigmaCg(hmmNull, path, 1, ARMS.null, ARMS.null);
  assert.ok(Object.is(scgNull, 0) || Math.abs(scgNull) < 1e-300, `null σ_cg = ${scgNull}`);
  console.log("pass: the null's σ_cg is exactly 0 — its reversed kernel is its own (identical passes)");

  // the registered corner mean, from the HMM's own kernel: the per-step
  // drift Σ_c π(c)·Σ_{c'} K_F(c,c')·(nE−nW) = m(q_E−q_W)/256, so
  // E[σ] = T·that·ln 3 = 16 ln 3 — an independent check of the kernel
  // under the multinomial initial law.
  let drift = 0;
  for (let c = 0; c < hmm.states; c++) {
    let d = 0;
    for (let k = hmm.rowPtr[c]; k < hmm.rowPtr[c + 1]; k++) d += hmm.val[k] * (hmm.ne[k] - hmm.nw[k]);
    drift += hmm.pi[c] * d;
  }
  assert.ok(Math.abs(drift * 32 * LN3 - 16 * LN3) < 1e-9, `corner ⟨σ⟩ prediction ${drift * 32 * LN3} ≠ 16 ln 3`);
  console.log(`pass: the HMM's own per-step drift gives ⟨σ⟩_c = 16 ln 3 (drift ${drift}/step, T = 32)`);
}


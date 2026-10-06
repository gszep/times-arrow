# 002 implementation and validation

The pre-registration in `README.md` is frozen. No registered ensemble has
been run. Smoke data validates plumbing; statistical verdicts are `n/a`.

## Contract

`Main.lean` exports `contract.walk`:

- `lightCone`, `arms` (integer weights and the two ramp schedules), `draw`.
- `golden`: `{seed, arm, n, m, t, state, nE, nW, tallies, sigma}`. `state`
  has two hex digits per walker, x then y (these vectors use n ≤ 16).
  `tallies[t−1]` is the integer E−W count at hop t. Constant-arm σ is one
  product of the total tally and log-ratio; ramp σ sums the per-hop products.
- `dp`: constant-arm tally laws at the listed horizons, exact integer
  numerator strings over `den = 256^(mT)`; index k is in each bin.
  `driven.64f` and `ramp`/`ramprev` contain f64 probabilities with
  `e = mT`, bin index `k+e`. The ramp tables describe tally, not σ.
- `corner`: n=4, m=4, Tc=32, regions `half` and `L`, each with site lists,
  2–5-time KL goldens and exact rational 3-time driven/reversed tables.
  Count paths are indexed little-endian in base 5.

**Verified** is the gate's numerical assurance level, not a proof about
floating-point arithmetic. `check.ts` is shared by the review page's
`probe.check()`, `npm run check:gpu`, and both sweep modes. Every trajectory,
constructor, total/per-step tally and exact DP numerator must match bit for
bit. Per-path σ and marginal KL use absolute tolerance 10⁻⁹; DP/HMM
probabilities use relative tolerance 10⁻⁹ (absolute floor 10⁻³⁰⁹ for
underflow). The T=64 mirror is checked over the registered bins 70…186.
The full occupancy-chain HMM reproduces all corner KLs and every rational
3-time cell; the same forward step serves the per-path and all-path passes.
Missing or failing goldens prevent either sweep from starting.

Both WGSL entry points share one hop function; the gate checks the edge-count
path and the ensemble's tally-only path against the same Lean vectors.
With the Lean executable built, `check:gpu` additionally draws fresh seeds,
lattice sizes, walker counts and horizons for all five arms and compares
`probe.walk()` with `timesarrow walkjson SEED ARM N M T`.
Without the executable the harness explicitly reports differential checks
as skipped; the contract gate still runs.

The null corner stores measured `sigmaCg` from two forward passes. K5's
half/null failures and L pipeline-null failure are **implementation error**;
only the fine/boundary means leaving their bands earn **refuted**. Invalid
pipeline output takes precedence over a physics interpretation. K6 uses the
dFT tilt to reconstruct the inaccessible tail, effectively testing the
reversed-arm mirror. χ² uses the registered dof-preserving contiguous bins
T=1 [−5,9], T=4 [−6,22], T=64 [70,186].

## Lean assurance

**Proved**, exported as claims and mirrored in `Challenge.lean`: uniform
stationarity of the one-walker chain for normalized weights, unconditional
support symmetry for positive weights, and symmetry of the null kernel.

**Conjecture**: the synchronous product-chain instantiation; the constructor
law and pathwise hop-tally/log-ratio identification; the reversed chain's
identification with `reversedPathPMF`; the variance/tilt identity; σ-sufficiency;
the conditional coarse log-ratio and DPI; arbitrary-region 2-time blindness,
corner 3-time blindness and half-count conjugacy; strict positivity; and the
time-inhomogeneous path law (C1). Exact rational DP values are **verified**
executions, not theorem proofs of these identities. The abstract Markov
library's existing second-law and fluctuation theorems remain **proved**.

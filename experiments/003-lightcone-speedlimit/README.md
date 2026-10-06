# 003-lightcone-speedlimit

**Can a causal cone and entropy production bound the same transport?**
(issue #9; Q3). No published bound puts a causal cone and entropy
production into one inequality (`docs/background.md`, "Cones and speed
limits"); the candidate, from issue #9's exploration:

> `W₁(p₀, p_t) ≤ min(v·t, ∫₀ᵗ √(σ(s)·a(s)) ds)`,  `v = 1` cell/step.

The two halves are derived separately: causality — mass displaces ≤ 1
cell/step, so `W₁(p_s, p_{s+1}) ≤ 1` and `W₁ ≤ t` (001's L3, restated for
the walker); dissipation — the net edge fluxes are a transport plan,
`dW₁/ds ≤ Σ_e |J_e|`, the per-edge lemma
`(F−R)·ln(F/R) ≥ (F−R)²/(F+R)` (traffic form; equality iff `F = R`),
and Cauchy–Schwarz give `(Σ|J|)² ≤ a·σ` with the activity
`a = Σ_e (F_e+R_e) = q_E+q_W`, the hop rate. This experiment measures
the composite bound where both halves are live, and registers where each
half is void. The dynamics kernel is 002's (`src/walk.ts`), shared
one-source; the RNG stream is 002's hop draws, bit-exact.

## Setup (pre-registered)

- `n = 16` torus (light-cone speed 1 cell/step, stated on the page),
  `m = 32768` independent walkers per seed, `R = 256` seeds (16 blocks ×
  16, seeds 1…256, all arms paired by seed and walker index), `T = 1024`
  steps (S arms) / 64 (L arms).
- Weights, dyadic in 256ths: **wind** `(125, 3, 0, 0, 128)` — drive
  `ln(125/3) = 3.7297` nats/hop, `q_N = q_S = 0`; **calm** `(64, 64, 0, 0,
  128)`. The calm differs from the wind in exactly one respect (the E/W
  split): same stay rate, same hop rate `a = 1/2`, same frozen y. With
  `q_N = q_S = 0` the y-marginal never moves (a bit-exact invariant) and
  each walker's x-marginal is the exact 16-state lazy biased chain
  (`q_E` east, `q_W` west, `1/2` stay) — the ensemble law is exactly
  solvable, and every prediction below is exact calculation under it
  (f64, error < 10⁻¹²; rational goldens at `t ∈ {1,2,3}` in the
  contract). `σ_step = (122/256)·ln(125/3) = 1.7774` nats/walker-step,
  `√(σ_step·a) = 0.943 < v = 1`.
- Starts: **S** — deterministic profile, left half `x ∈ {0..7}` 255
  walkers per site, right half 1 per site (`m = 128·(255+1)`; per-column
  counts 4080 | 16; contrast ρ = 255; strictly positive support — any p₀
  with an empty site makes the flux EP +∞, which is arm L's story);
  **L** — all walkers at `(8,8)`. The constructor is deterministic (no
  `t = 0` draw): walker `j < 32640` → left site `(q mod 8, ⌊q/8⌋)` with
  `q = ⌊j/255⌋`; `j ≥ 32640` → right site `(8+(j' mod 8), ⌊j'/8⌋)`,
  `j' = j−32640`. Arms: **S-wind, S-calm, L-wind, L-calm**, plus
  **S-wind-XOR**: the same seed, the wind protocol with E↔W mirrored at
  step 1 only.
- Kernel: `hop`, the Philox layout `(walker, step)` and the thresholds of
  `src/walk.ts` are untouched (single dynamics source, goldens as in
  002). 003 adds measurement passes to the same WGSL module:
  `initProfile` (the constructor above), `colCount` (per-(seed, t, x)
  column occupancy) and a windowed `edges` readback (zero between
  windows). Tallies (per-step `n_E − n_W`) are 002's buffer.
- **Observables, exact.** `W₁^circle` of the x-marginal: the min-cost
  flow on the cycle `= min over cuts c of Σ_i |cumulative difference|,
  starting the accumulation at c` — integer counts throughout, one
  division by `m` (verified against an independent flow computation on
  3000 random integer pairs, 0 mismatches; pinned as goldens — the
  L-calm's exact values at `t ∈ {1,2,3}` are dyadic: 1/2, 3/4, 15/16). `σ̂` per
  window: pooled over all R seeds, `F̂_e, R̂_e` = E/W-crossing counts of
  edge e divided by `R·m·w`; `σ̂ = Σ_e (F̂−R̂)·ln(F̂/R̂) ≥ 0` in
  nats/walker-step; a one-sided edge (`F̂ = 0 ≠ R̂` or vice versa) gives
  `σ̂ = +∞`. `â` = total hops `/ (R·m·w)`. Envelopes: causal `t`;
  dissipative `E_diss(t) = Σ_{s<t} √(σ(s)·a)` (exact chain), estimated
  at the 32-step window boundaries by `Ê(32j) = Σ_{k<j} 32·√(σ̂_k â_k)`
  (the windowed plug-in is biased low by smearing — the calm's by 13% —
  so all registered targets are the windowed-exact centers). σ̂ windows:
  single-step `s = 0…15` (fine) and `w = 32` (coarse, `k = 0…31`).
  Sample grid (S arms): `t = 0…8`, then 12, 16, 20, 24, 32, 40, 48, 64,
  96, 128, then every 32 to 1024. Damage: XOR of paired positions.
- Sweep: headless (`scripts/headless.ts`), hardware-adapter-guarded,
  provenance JSON (commit, parameters, seeds, adapter), probe on
  `window`, batched readbacks, `device.lost` checked; every parameter in
  the page URL; page shows hypothesis, live W₁ vs both envelopes, the
  crossover, the assumptions panel and each claim's refuter. All tier 0
  (the sweep is ~10¹⁰ walker-steps).

## Hypothesis (pre-registered)

Exact-chain predictions (the 16-state chain; all values per walker):
`W₁` limits to `W₁(p₀, u) = 1.984375 = 32·254/4096` (both S arms);
key points — S-wind: `W₁(1) = 0.4757`, `W₁(16) = 3.4672`,
`W₁(32) = 1.0572`, `W₁(1024) = 1.9844`; S-calm: `W₁(32) = 1.3928`,
`W₁(1024) = 1.9844`. `σ(0)·a = 1.0605 > 1` (wind, step 0), `σ(1)·a =
0.9714 < 1`; the naive crossover `t× = σ_step·a/v² = 0.889 ≈ 1`; the
cumulative envelope crossing `t_c = 3` (`E_diss(3) = 2.9837`); calm:
`σ(0)·a = 0.172` — dissipative at every step. The **composite bound
holds at every step of both S arms in the exact chain** (min slack
0.524 at wind `t = 1`, 0.353 at calm `t = 1`) — this pre-registered
calculation is the candidate's first test: had it failed anywhere, the
bound would be refuted by exact calculation before any run.

| # | Claim | Prediction and criterion (size) | Falsified if | Label it earns |
|---|---|---|---|---|
| M1 | The model fits the library and the harness is exact: weights, profile constructor, colCount, windowed edges, XOR pairing reproduce the Lean reference bit for bit; differential tests vs `timesarrow` pass; y invariant (no walker changes row, every arm, every step) | Goldens and differential tests pass (bit-exact, size 0) | Any golden, differential test or the y-invariant fails: implementation error; nothing is promoted until fixed | structure **conjecture** (round-1 model lemmas) + **verified** (bit-exact) |
| C1 | The causal envelope: `W₁^circle(p₀, p_t) ≤ t` (each hop displaces ≤ 1 cell; proved for HPP as 001 L3, here for the walker) | L arms: columns outside `[8−s, 8+s] mod 16` empty at every sampled `s ≤ 7` — bit-exact, and `W₁^L ≤ s` follows exactly (max ratio 1/2 at `s = 1`). S arms: `Ŵ₁(seed, t) ≤ t` at every sample; tightest margin `(1−0.4757)/0.0132 = 39.7σ` (size ≈ 0) | Any support escape or any `Ŵ₁ > t`: implementation error | cone lemma **conjecture** (round-1 Lean target; **proved** when it lands) + **verified** (L, bit-exact) + **supported** (S, size ≈ 0) |
| C2 | The composite bound is never violated, and the measured windowed envelope agrees with the exact chain | (i) Exact chain: no violation `t ≤ 1024`, both S arms (the pre-registered calculation above); (ii) measured: `W̄₁(32j) ≤ Ê(32j)` at all 32 window boundaries, both arms — tightest margin 1072σ (calm, j = 1; 86σ per seed), size ≈ 0; (iii) `Ê(1024) ∈ 965.35 ± 0.015` (wind), `3.4748 ± 0.0040` (calm) (size 0.001 each); (iv) `W̄₁` landmarks — wind `t ∈ {16,128,1024}`: 3.4672, 1.9534, 1.9844; calm `t ∈ {64,128,1024}`: 1.8135, 1.9701, 1.9844; all `± 0.0027` (size 0.001 each) | Any violation (implementation error, or a refutation of the bound); any band escape | bound **conjecture** (Lean round 2) + exact-chain check **verified** (f64 + rational goldens) + **supported** (statistical) |
| C3 | The crossover: the drive lifts the dissipative envelope above the causal one for exactly the first step; the naive `t× = σa/v²` gets the scale | Measured slope classification `σ̂(s)·â(s)` vs 1, fine windows: wind — causal at `s = 0` (`σ(0)·a = 1.0605`, z = 12.5σ; size < 10⁻³⁰), dissipative at `s ∈ {1,2,3}` (z = 12.1, 42, 66); calm — dissipative at `s ∈ {0..3}` (z ≥ 1100). Measured `t̂× = 1` vs naive `0.889`. Cumulative `t_c = 3` is an exact-chain statement (its 0.016 margin sits at the σ̂-path noise floor: `t̂_c` reported, predicted 2 or 3, `P(2) = 0.002`, not a falsifier) | Any classification flips where the margin is ≥ 12σ (8 sub-tests, composite size < 10⁻²⁹) | **supported** (statistical) |
| C4 | The null transports by relaxation alone: no drive, no causal phase, `W₁` rises to the same limit under a dissipative-only envelope with O(1) slack | `W̄₁` landmarks (above); `η̂_N(1024) = W̄₁^N/Ê^N ∈ 0.4988 ± 0.0015` (size 0.001); the measured classification is dissipative at every step (C3's calm subs) | Any band escape — η̂ plus the calm landmarks of C2(iv) (sizes 0.001 each) | **supported** (statistical) |
| C5 | Drive vs calm, paired: the wind laps the torus at 0.477 cells/step (Péclet 15) — `W₁^D` peaks at half-lap and dips **below** the diffusing calm at full-lap realignment: the sign sequence `{+,+,+,−,−,−}` at `t ∈ {4,8,16,32,64,128}` | Paired wins `≥ k` of 256 seeds per t: `k = 256` for `t ≤ 64` (z ≥ 28, sizes ~10⁻¹⁷⁰), `k = 245` at `t = 128` (`p_win = 0.9855`, size 2 × 10⁻⁴; a single seed goes against the trend with probability 1.45% — stated on the page) | Any `t`'s wins fall below its `k` (6 sub-tests, composite size ≤ 0.002) | **supported** (statistical) |
| F1 | A strict cone voids the EP bound: the flux EP is `+∞` while the support grows (sharp front ⇒ one-sided edges), so the composite degenerates to the causal bound at every `t` for localized starts — the halves are complementary *because* the cone is sharp | Exact law: `σ = +∞` for `s ≤ 7` (both L arms; Lean round 1). Measured: `σ̂(s) = +∞` for `s = 0…7`, both L arms — deterministic, bit-exact. Resolution boundary: the wind's behind-the-drift columns stay empty until the packet laps around — expected pooled counts at `s = 8…11`: 10⁻⁶…0.73, so `σ̂ = +∞` there with `P ≈ 1−10⁻¹², 1−2·10⁻⁶, 0.99, 0.61` (reported, not falsifiers); finite from `s = 12` (count 1540): `σ̂ ∈ 1.8554, 1.8490, 1.8437, 1.8391 ± 0.0072` at `s = 12…15` (wind). Calm: finite from `s = 8` (far-column count 127): `σ̂ ∈ 0.0628 ± 0.00083, 0.04955 ± 0.00073` at `s ∈ {8,10}` (sizes 0.001) | `σ̂(s) < ∞` at any `s ≤ 7` (bit-exact: implementation error); any finite-era band escape (6 sub-tests) | front lemma **conjecture** (round-1 Lean target; **proved** when it lands) + **verified** (bit-exact) + **supported** (statistical) |
| X1 | Damage: XOR of the step-1-mirrored pair. Damaged = exactly the step-1 east-drawers (`u < 125/256`), displaced `|Δx| = 2` at every later step, undamaged walkers bit-identical — damage neither grows nor heals (the butterfly velocity of the independent model is degenerate; 001's interacting gas spread one flipped slot to 2.4% of slots) | Per seed: `#damaged = n_E(1)` (bit-exact identity); ensemble `4.096 × 10⁶ ± 4778` (size 0.001); `|Δx|_circle = 2` and y-equality at every sampled `t ≥ 1` (bit-exact) | Any mismatch of the identity, any `|Δx| ≠ 2` among damaged, any bit-difference among undamaged: implementation error | **verified** (bit-exact) + difference lemma **conjecture** (round-1 Lean target; **proved** when it lands) |
| T1 | Second-law linearity at the new weights: per-seed pathwise `σ = (n_E−n_W)·ln(125/3)` (integer tallies), `⟨σ⟩ = m·t·σ_step` with iid increments | R-mean tallies `∈ 999424 ± 156` (t = 64), `3997696 ± 312` (256), `15990784 ± 624` (1024); per-seed std `756.5 ∈ [646, 867]` at t = 64; ≥ 15/16 block means in band (5 sub-tests, size 0.001 each) | Any band escape | **supported** (statistical); `EP = T·σ_step` **proved** (faec5f1), instantiated conditionally on 002's round-3 per-walker stationarity lemma (**conjecture**) |
| — | Pipeline: the pooled σ̂/â estimators match the exact chain where resolution allows | `σ̂(0) ∈ 2.1219 ± 0.032` (wind, fine; center includes the plug-in bias +0.0008, sd 9.7 × 10⁻³ by pooled-count MC); `σ̂ ∈ 1.77787 ± 3.1 × 10⁻⁴, 1.77750 ± 3.1 × 10⁻⁴` (wind coarse k = 0, 1); `σ̂ ∈ 0.01250 ± 2.1 × 10⁻⁵` (calm k = 0); `â(0) ∈ 0.5 ± 5.7 × 10⁻⁴`; `W̄₁^L-calm(16) ∈ 2.2337 ± 0.0027` — the δ-null's √t law, ratio 0.5584 vs the continuum `√(1/π) = 0.5642` of #9's 1D check (6 sub-tests, size 0.001 each) | Any escape: a pooled-count pipeline error | **supported** (statistical) |

### Sizing method (pre-registered, no kernel run)

Every size above is exact calculation or exact-law Monte Carlo under the
16-state chain, before any run: `Ŵ₁`'s law from multinomial column
counts (2000 reps at `m = 32768`: sd 0.0122–0.0132, |skew| ≤ 0.06 —
`W̄₁` sd 8.3 × 10⁻⁴); `σ̂(0)`'s law by pooled-count MC (1500 reps at
quarter pooled scale, min frontier count 12; sd scales as `(R·m)^(−1/2)`
→ 9.7 × 10⁻³, mean 2.1243, skew +0.66 — the relevant left tail is
lighter than Gaussian; the s = 0 classification also carries a
Poisson-excursion bound: the frontier edge's pooled count is Poisson(48),
needing an e²-fold excursion, ~10⁻¹⁵); windowed σ̂ sds from exact
per-walker covariances (2-point functions of the chain); the paired
D−N law from the exact joint `(x^D, x^N)` chain (256 states, shared
draws) by the delta method; C5's binomial `k` from those p_win's.
The scratch scripts stay out of Git.

### Assumptions, artefacts, α

- **Family-wise error:** 43 registered statistical sub-tests; per-test
  α = 0.001 (≈ 3.3σ two-sided; exact quantiles where the law is not
  normal); Bonferroni FWER ≤ 4.3%. Per-sample W̄₁ bands are conservative
  (samples share seeds). Nulls first: M1, T1 and the pipeline checks
  certify the harness before any structured claim is read. 16 blocks;
  paired seeds; the page states when a single run can go against the
  trend (C5 at t = 128).
- **Measurability boundaries** (002's `T*` tradition): (i) the flux EP of
  a localized start is unmeasurable until the lightest tail column
  carries ≥ 1/(R·m) mass — the calm's ∞-era ends at s = 8 (count 127),
  the wind's at s = 12 (the lap refills the starved columns; count 1540):
  the drive *stretches* the measured ∞-era from 8 to 12 steps; (ii) the
  calm's coarse σ̂ beyond k ≈ 4 sits at the plug-in noise floor
  (floor ≈ 10⁻⁷ ≫ true σ̄): those windows are page diagnostics only;
  (iii) the cumulative envelope crossing t_c = 3 is below the σ̂-path
  noise floor (3σ): registered as exact-chain statement, not a run
  criterion.
- **Plug-in bias:** +0.0008 at the wind's fine s = 0 window (exact-law
  MC), included in the center; below 1% of value elsewhere (delta).
- **Lattice artefact or physics?** C1: a finite causal speed is physics;
  the diamond/circle geometry is the lattice. C2: the transport
  inequality is finite-chain physics (lattice-free in content); η ≈ ½
  slack is a model number (the δ-null's √t ratio 0.5584 vs continuum
  √(1/π) = 0.5642: the ~1% is lattice + circle). C3: the crossover scale
  σa/v² is physics; `t_c = 3` is a lattice transient — the causal phase
  is microscopic, and a long one would need σ_step·a tuned within ~2% of
  v²: flagged, not run (no-tuning). C4: relaxation transport is physics.
  C5: advection-vs-diffusion is physics; the 33.6-step lap is a model
  number. F1: the `+∞` front is the signature of finite propagation
  speed — it survives any continuum limit that keeps a causal speed and
  is absent in parabolic (heat-kernel) dynamics; the general statement
  ("strict cone ⇔ EP bound void at fronts") is **conjecture**, the
  lattice instance proved. X1: the no-spread of damage is independence
  (001's spread needed interactions), not the lattice. T1: finite-chain
  physics. The 8-bit draw and the synchronous update are implementation
  facts; all registered numbers are model numbers.
- **Float trust boundary:** positions, counts, tallies, goldens and all
  bit-exact checks are integer-level; W₁, σ̂, â and the exact-chain
  predictions are f64 from exact integers (chain error < 10⁻¹² ≪ the
  tightest registered band 2 × 10⁻⁵); rational goldens at `t ∈ {1,2,3}`.

### Lean lane (round 1, cheap)

Per-step displacement ≤ 1 in each coordinate and the diamond support
lemma (induction); `W₁^circle(p₀, p_t) ≤ t` (per-step coupling cost ≤ 1
+ W₁ triangle; search Mathlib's `Wasserstein` first); the front lemma
(σ_flux = +∞ while support grows; needs `fluxEP` for the walker chain,
Σ_e (F−R)·ln(F/R) in ℝ≥0 ∪ {∞}); the XOR-difference lemma (|Δ| ≤ 2 per
differing draw, constant thereafter); the per-edge traffic inequality;
support symmetry generalized to `w d = 0 ↔ w (opp d) = 0` (003's weights
have `q_N = q_S = 0`, so 002's all-positive `walkerK_support` does not
apply). Round 2: `W₁^circle` = the min-cut cumulative formula (cycle
min-cost flow); the net-flux transport lemma; the composite bound —
mirrored in `Challenge.lean`. T1 inherits 002's round-3 conditioning
(per-walker doubly-stochastic stationarity).

## Result

Not run. Pre-registered 2026-10-07 on `prereg/003`; the outcome will be
filled in a separate section after the sweep, without editing any
prediction above.

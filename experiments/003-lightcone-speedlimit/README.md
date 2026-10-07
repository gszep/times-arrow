# 003-lightcone-speedlimit

**Does dissipation, not causality, limit transport — and where is the crossover?**
(issue #9; Q3). The candidate bound from issue #9's exploration, with `v = 1`
cell/step:

> `W₁(p₀, p_t) ≤ min(v·t, ∫₀ᵗ √(σ(s)·a(s)) ds)`

The two halves are derived separately: causality — mass displaces ≤ 1
cell/step, so `W₁(p_s, p_{s+1}) ≤ 1` and `W₁ ≤ t` (001's L3, restated for
the walker); dissipation — the net edge fluxes are a transport plan,
`dW₁/ds ≤ Σ_e |J_e|`, the per-edge traffic inequality
`(F−R)·ln(F/R) ≥ (F−R)²/(F+R)` and Cauchy–Schwarz give `(Σ|J|)² ≤ a·σ`
with `a` the hop rate. No published bound puts a causal cone and entropy
production into one inequality (`docs/background.md`, "Cones and speed
limits"). This registration makes the core claim falsifiable: a torus large
enough that `W₁` can approach either envelope, a drive sweep that places
the envelope crossover at observable time with a registered scaling law,
and a test of the cone-restricted-activity variant (#9 open problem 1),
which closes. The dynamics kernel is 002's (`src/walk.ts`), shared
one-source; the RNG stream is 002's hop draws, bit-exact.

## Setup (pre-registered)

- `n = 1024` torus (light-cone speed 1 cell/step, stated on the page),
  `m = 65536` walkers per seed, `R = 256` seeds (16 blocks × 16, seeds
  1…256, all arms paired by seed and walker index), `T = 512` steps
  (`n ≫ v·T`; the cone guarantees `|x_t − x₀| ≤ t`, so no walker ever
  wraps). `q_N = q_S = 0` in every arm: no walker ever changes row — a
  bit-exact invariant — and each walker's x-marginal is the exact
  1024-state lazy biased chain. Every prediction below is exact
  calculation under it (f64, chain error < 10⁻¹²; dyadic rational
  goldens at `t ∈ {1, 2, 3}`).
- **Start — localized but full support** (no `t = 0` draw, deterministic):
  walker `j ≡ 0 (mod 64)` → the ε-column: `x₀ = (j/64) mod 1024`, exactly
  one walker per column (1024 walkers); `j ≢ 0 (mod 64)` → the block at
  `x₀ = 0` (63·1024 walkers). `y₀ = 0` for all. So
  `p₀ = (63/64)δ₀ + (1/64)u`: full support keeps the flux EP finite at
  every step (one empty site behind a front is enough for `+∞` — F1), the
  ε-mass is exactly uniform at every `t` (translation-invariant kernel),
  transports `u → u` at zero cost, and
  `W₁(p₀, p_t) = (63/64)·W₁(δ₀, K_t)` exactly. The ε-cliffs at the block's
  edges make `σ(0)` scale as `ln(1/ε)` — the `+∞` front of a δ-start in
  ε-regularization (the table under F1).
- **Arms — the drive sweep** (weights `(e, w, n, s, stay)` in 256ths;
  `ρ = ln(e/w)`, `a = (e+w)/256`, `μ = (e−w)/256`, `σ_step = μρ`). All but
  the last keep `stay = 128`, so the chain's parity mode is exactly dead
  (eigenvalue `1−2a = 0`); a no-stay chain is period-2 and its empty-parity
  sites put the flux EP on the ε-floor — the `max` arm uses that
  deliberately. The sweep brackets the envelope crossover `√(σ_step·a) = 1`
  between `wind` and `c2`; `max` is the causal-tightness anchor.

  | arm | (e, w, stay) | ρ | a | μ | σ_step | √(σ_step·a) |
  |---|---|---|---|---|---|---|
  | calm | (64, 64, 128) | 0 | 1/2 | 0 | 0 | 0 |
  | w5 | (123, 5, 128) | 3.2027 | 1/2 | 0.460938 | 1.4763 | 0.8591 |
  | w4 | (124, 4, 128) | 3.4340 | 1/2 | 0.468750 | 1.6097 | 0.8971 |
  | wind | (125, 3, 128) | 3.7297 | 1/2 | 0.476563 | 1.7774 | 0.9427 |
  | c2 | (126, 2, 128) | 4.1431 | 1/2 | 0.484375 | 2.0068 | 1.0017 |
  | max | (255, 1, 0) | 5.5413 | 1 | 0.992188 | 5.4980 | 2.3448 |

  plus **windXOR**: the wind protocol with E↔W mirrored at step 1 only
  (the damage arm), same seeds.
- Kernel: `hop`, the Philox layout `(walker, step)` and the thresholds of
  `src/walk.ts` untouched (single dynamics source, the 002 goldens). 003
  adds measurement passes to the same WGSL module: `initProfile` (the
  constructor above), `colCount` (per-`(seed, t, x)` column occupancy) and
  the windowed `edges` readback (zeroed between windows; per-step tallies
  are 002's buffer).
- **Observables.** `W₁^circle` of the x-marginal: the integer min-cut
  cumulative formula (cycle min-cost flow), one division by `m`; dyadic at
  `t ≤ 3` for every arm (the calm: `63/128`, `189/256`, `945/1024` at
  `t = 1, 2, 3`; the per-arm values are pinned as rational goldens in the
  contract). `σ̂` per window: pooled over all `R`
  seeds, `F̂_e, R̂_e` = the pooled E/W-crossing counts of edge `e` divided
  by `R·m·w`; `σ̂ = Σ_e (F̂−R̂)·ln(F̂/R̂) ≥ 0` in nats/walker-step. The
  window partition is pinned: single-step `s = 0…23`, then `[24, 32)`, then
  32-step chunks to 512. `â = total hops / (R·m·w) ≡ a` exactly (bit-exact:
  `â ≡ 1` for `max`). `Ê(t) = Σ` over the partition's full pieces `≤ t` of
  `w_k·√(σ̂_k·â_k)`. **η's denominator is pinned**: every η centre and band
  below uses `E_diss(t) ≡ Σ_{s<t} √(σ(s)·a)` — the exact per-step envelope
  under the exact chain, the quantity the bound is a claim about; the
  windowed `Ê` is a pipeline estimator (the P row) and the basis of the
  `t̂×` statistic. Sample grid: `t ∈ {0, 1, 2, 3, 4, 8, 16, 24, 32, 64,
  128, 256, 384, 512}`. Damage: XOR of the paired wind/windXOR positions.
- Sweep: headless (`scripts/headless.ts`), hardware-adapter-guarded,
  provenance JSON (commit, parameters, seeds, adapter), probe on
  `window`, batched readbacks, `device.lost` checked; every parameter in
  the page URL; the page shows the hypothesis, live `W₁` against both
  envelopes, the crossover, the assumptions panel and each claim's
  refuter. All tier 0: the sweep is ~6×10¹⁰ walker-steps — minutes on
  Artemis at 000's measured rate.

## Hypothesis (pre-registered)

### Held-out prediction lock

**Conjecture; frozen before evaluating this arm's chain or sampling law.**
Add held-out `h8 = (e,w,stay) = (120,8,128)` with the same constructor,
seeds, horizon and observables. Only `w5` and `w4` calibrate
`C_fit = [17.167·δ_w5 + 23.935·δ_w4]/2`, where
`δ_q = 1 − √(a_q μ_q ln(e_q/w_q))`.
Predict its per-step-envelope crossover `t_h = C_fit/δ_h8` to within
15% (finite-start/model tolerance); for the windowed measured crossing
allow a further 0.25 step of estimation/pipeline error. Predict its
`η_d(512)` at the closed-form branch
`b_h = (63/64)√(tanh(ln(15)/2)/ln(15))`, with absolute model tolerance
0.006 and sampling allowance 0.0001. These centres and tolerances will not
be fitted to the held-out exact answer. Alternatives: an inverse-square
crossover law normalized at `w5`, and a drive-independent dissipative
tightness equal to the `w5` closed-form branch. Exact-law sizing may reject this design but
cannot change this lock; any failure will be reported in the result section.

Exact-chain predictions, all per walker (`f64`; the scratch sizing scripts
stay out of Git):

- **The shape law:** `σ(s) = σ_step + 1/(2s) + O(s^{−3/2})` for every arm
  from the localized start — the packet's own spreading dissipation,
  verified in the exact chain: the wind at `s = 256` within 9×10⁻⁴ relative
  (`1.78094` vs `σ_step + 1/512 = 1.77939`), the calm within 5×10⁻³
  (`0.00191` vs `0.00192` — the `O(s⁻²)` block corrections sit on a
  `1/(2s)` that is itself heading to zero).
- **Binding envelope:** dissipative for `{calm, w5, w4, wind}`
  (`√(σ_step·a) < 1`), causal for `{c2, max}` (causal at every `t ≥ 1`).
  The sweep crossover `√(σ_step·a) = 1` lies between `wind` (0.9427) and
  `c2` (1.0017).
- **The time crossover** `t×` — where the binding envelope switches from
  causal to dissipative inside one arm — solves
  `∫₀^{t×} √(σ(s)·a) ds = v·t×`; it exists because the localized start's
  `σ(s)` rides above `σ_step` (the ε-cliff spike, then the `1/(2s)` shape
  law), and obeys
  **`t× ≈ C/(1 − √(σ_step·a))`** with `C = t×·(1 − √(σ_step·a))` the
  ε-cliff lead. Exact values (`E_diss` crossing; the estimator's own
  windowed value in brackets, used as the centre of `t̂×`):
  calm `2.821`, w5 `17.167`, w4 `23.935`, wind `44.74 [43.58]`;
  `C ∈ [2.42, 2.82]` across a 16× range of `1 − √(σ_step·a)`; `c2`, `max`:
  no crossing within `T`. (The exploration report's `t× = σa/v²` is the
  constant-σ heuristic; two constant-slope rays cross only at 0, and only
  the crossing equation above is registerable. Both say the same thing:
  the crossover is set by the drive's `σa` relative to `v²`.)
- **Tightness — where transport approaches an envelope.** The calm's
  `η_d(512) = E[W̄₁]/E_diss = 0.5309` against the continuum `1/√π =
  0.5642`: the Cauchy–Schwarz √π slack is all that separates relaxation
  transport from the dissipative envelope. The sweep at `t = 512`:
  w5 `0.5243`, w4 `0.5107`, wind `0.4944` (dissipative branch
  `(63/64)√(tanh(ρ/2)/ρ)`), c2 `0.4769`, max `0.9767` (causal branch
  `(63/64)μ`). Causal saturation is paid for in dissipation: `η_c → 1`
  needs `μ → 1`, i.e. `q_W → 0` and `σ_step → ∞`. **Dissipation, not
  causality, is the fundamental limit; the causal envelope binds only
  where dissipation is void (fronts) or so abundant that the cone is the
  tighter statement (near-max drive).**
- `t×`, `C` and the tightness values are model numbers of the registered
  start (the ε-cliff); the scaling in the drive — the `δ^{-1}` law and the
  two tightness branches — is the physics.

| # | Claim | Prediction and criterion (size) | Falsified if | Label it earns |
|---|---|---|---|---|
| M1 | The harness is exact: the 002 kernel goldens, the new `initProfile`/`colCount`/windowed-edges goldens, the dyadic `W₁` at `t ∈ {1,2,3}`, the `t = 0` column counts (64513 \| 1 per column), differential tests vs `timesarrow`, the y-invariant, `â ≡ a` (`â ≡ 1` for max) | Goldens and differential tests pass bit for bit (size 0) | Any failure: implementation error; nothing is promoted until fixed | structure **conjecture** (round-1 model lemmas) + **verified** (bit-exact) |
| C1 | The causal cone: `W₁^circle(p₀, p_t) ≤ t` (each hop displaces ≤ 1 cell) | Exact chain: holds at every sampled (arm, t), all arms — the registration-time check (tightest margin: max at `t = 512`, 11.94). Measured: `max_j \|x_t − x₀\|_circle ≤ t` at every sampled t, every arm, and `W̄₁ ≤ t` everywhere — bit-exact; the max margin 11.93 ± 0.00095 (z ≈ 1.3×10⁴) | Any support escape or `W̄₁ > t`: implementation error | cone lemma **conjecture** (Lean round 1; **proved** when it lands) + **verified** (exact-chain + bit-exact) |
| C2 | The composite bound is never violated: `W₁^circle ≤ min(t, E_diss(t))` | Exact chain: no violation at any sampled (arm, t), all six arms (f64 + the dyadic goldens); the run's envelope agreement is the P row's `Ê` checks | Any exact-chain violation (the bound refuted by calculation before any run); a run violation is an implementation error | bound **conjecture** (Lean round 2) + **verified** (exact-chain check) |
| C3 | The crossover. (i) The sweep: the binding envelope switches between `wind` and `c2` — exact: `√(σ_step·a) = 1` lies between 0.9427 and 1.0017; measured: `Ê(512) − 512 = −26.44` (wind) and `+3.67` (c2) against `sd(Ê) ≈ 6.3×10⁻³` (z ≈ 4200, 580) — the classifications are exact-de-facto. (ii) The time crossover: `t̂×` = the interpolated crossing of `Ê(t) − t` on the pinned grid: calm `2.821 ± 0.004`, w5 `17.167 ± 0.036`, w4 `23.935 ± 0.058`, wind `43.58 ± 0.124` (bands ±3.29 sd, sd ∈ [0.0012, 0.038] steps; 4 sub-tests, size 0.001 each); `c2`, `max`: no crossing within `T`. (iii) The scaling law `t× = C/(1−√(σ_step·a))`, `C ∈ [2.42, 2.82]` — the exact centres' pattern across a 16× range of `δ`; tested by (ii) | Any `t̂×` outside its band; any crossing appearing in `c2`/`max` | **supported** (statistical) |
| C4 | Dissipation-limited relaxation (the calm): the cone applies (C1) but the causal envelope binds only in the ε-cliff transient `t ≤ t× = 2.82` (exact), never again (the causal slack `t − E_diss(t)` grows to 488, 20×, by `t = 512`); transport tracks the dissipative envelope | `η̂_d(t) = W̄₁(t)/E_diss(t)`: `0.48170 ± 3.29×1.16×10⁻⁴` (t=64), `0.51918 ± 1.10×10⁻⁴` (256), `0.53087 ± 1.07×10⁻⁴` (512) — centres are `E[W̄₁]/E_diss` (the ε-empirical bias `+0.030…+0.045` included; 3 sub-tests, size 0.001 each) | Any band escape | **supported** (statistical) |
| C5 | The sweep's tightness law at `t = 512`: `η̂ = W̄₁/min(t, E_diss)` per arm against the two branches | w5 `η_d = 0.52434 ± 2.32×10⁻⁵`, w4 `0.51072 ± 2.20×10⁻⁵`, wind `0.49443 ± 2.07×10⁻⁵` (branch `(63/64)√(tanh(ρ/2)/ρ)`), c2 `η_c = 0.47687 ± 1.92×10⁻⁵`, max `η_c = 0.97670 ± 6.4×10⁻⁶` (branch `(63/64)μ`; the max band uses the Cornish–Fisher quantile — its R-level skew is −0.10, the packet's west tail) (5 sub-tests, size 0.001 each) | Any band escape | **supported** (statistical) |
| U1 | The cone-restricted-activity variant (#9 open problem 1) is vacuous: for any speed-≤v dynamics every trajectory stays within distance `v·s` of its start (the trajectory-cone lemma), so `a_cone(s) = a(s)` identically and `W₁ ≤ ∫√(σ·a_cone)` **is** the plain dissipative bound — the `min(vt, ·)` cannot be improved by restriction | Lean: the trajectory-cone lemma (round 1). Measured: the cone of C1 holds bit-exact, so the in-cone activity share is 1 at every step — and the bound is near-tight exactly where the variant was hoped to help (the calm's `η_d = 0.53`, C4): there is nothing to restrict | The lemma fails in Lean (it will not); a measured cone escape (implementation error) | **conjecture → proved** (Lean round 1) + **verified** (the cone). Negative result, reported prominently: open problem 1 is closed for this family and for every finite-speed system under the stated reading; a non-vacuous unification must restrict something other than activity's location |
| F1 | The front: `σ_flux = +∞` whenever some edge is one-sided (an empty site behind a moving front) — the front lemma. The registered start's ∞-set is **empty by construction** (full support: every edge carries both flux directions from step 0). The ε-continuity: `σ(0) = α + β·ln(1/ε)` — the `+∞` front in ε-regularization: wind `{6.30, 7.23, 7.99}`, max `{14.54, 16.40, 17.92}` at `ε = {1/16, 1/64, 1/256}` (exact chain). The `max` arm (period-2, stay = 0) holds its flux EP on the ε-floor at every step (`σ(s) ≈ 16.4`; its coarse-window estimator launders the oscillation, centres ≈ 5.5–6.4 — both exact, both registered; its dissipative envelope is a page diagnostic only) | Measured: no `+∞` σ̂ window in any arm — bit-exact | Any `+∞` window: implementation error | front lemma **conjecture** (Lean round 1) + **verified** (the empty ∞-set, bit-exact) |
| X1 | Damage: `damaged ≡ {step-1 draw ∈ [3, 125)}` (122/256 — the draws `u < 3` hop E in both arms; the n = 16 draft's "damaged = the east-drawers `u < 125/256`" was wrong and is corrected here): per damaged walker `\|Δx\|_circle = 2` (west) at every later step, undamaged bit-identical, `x^XOR = x^wind − 2·I[damaged]`, `#damaged = n_E(1) − n_E^XOR(1)` per seed — all bit-exact; damage neither grows nor heals (the independent model's butterfly velocity is degenerate; 001's interacting gas spread one flipped slot to 2.4%) | `#damaged_total ∈ 7,995,392 ± 3.29×2046` (Binomial(R·m, 122/256); size 0.001) | Any identity mismatch (implementation error); the count outside its band | **verified** (bit-exact) + difference lemma **conjecture** (Lean round 1) + the count **supported** (statistical) |
| T1 | The hop-draw statistics: the cumulative tally `Σ(n_E − n_W)` over all (seed, step) at `T = 512` — the `σ_step` leg of the EP (the transient excess `σ(s) − σ_step`, the `1/(2s)` shape law, is the P row's business) | Exact binomial bands (iid draws, position-independent): calm `0 ± 215,613`; w5 `3,959,422,976 ± 163,507`; w4 `4,026,531,840 ± 161,429`; wind `4,093,640,704 ± 159,288`; c2 `4,160,749,568 ± 157,082`; max `8,522,825,728 ± 38,041`; windXOR `4,077,649,920 ± 159,288` (7 sub-tests, size 0.001 each); ≥ 111 of 112 block means inside `±3.89σ_block` (1 composite, size 6×10⁻⁵) | Any band escape | **supported** (statistical) |
| P | Pipeline (statistical, not physics): the pooled estimators against the exact chain | σ̂ fine windows `s ∈ {0, 1, 2}`: calm `{5.4508, 1.2774, 0.4083} ± 3.29×{1.4, 0.77, 0.39}×10⁻³`; wind `{7.2282, 4.2153, 2.9657} ± {1.7, 1.4, 1.0}×10⁻³`; max `{16.400, 16.374, 16.355} ± {0.37, 0.39, 0.39}×10⁻³` (9); `â(0) = 0.5 ± 3.29×1.22×10⁻⁴` (1); `Ê(512)`: `{23.697, 442.90, 462.29, 485.56, 515.67, 1251.02} ± 3.29×{3.0, 6.2, 6.2, 6.3, 6.3, 3.4}×10⁻³` (6); the calm's last coarse window `σ̄ = 9.8×10⁻⁴ ± 3.29×1.9×10⁻⁶` — the `1/(2s)` law at the floor's edge (1). 17 sub-tests, size 0.001 each | Any escape: a pooled-count pipeline error | **pipeline** (statistical) |

### Sizing method (pre-registered, no kernel run)

Every centre and size above is exact calculation or exact-law Monte Carlo
under the 1024-state chain, before any run. `W̄₁`'s law by direct MC of the
constructor and the kernel (20 000 reps per (arm, t), alias-sampled exact
kernel): `E[Ŵ₁] − W₁ = +0.009…+0.045` — the ε-empirical's transport noise,
10–18× `sd(W̄₁)`, included in every centre; `sd(W̄₁) = sd(Ŵ₁)/√256 ∈
[0.4, 3.1]×10⁻³`; per-seed skews |≤ 0.51| except `max` (−1.6: the packet's
west tail) — its band uses the Cornish–Fisher quantile, every other
R-level skew is ≤ 0.05 and the normal 3.29σ applies. The `σ̂/Ê/t̂×` laws by a
reduced-pool trajectory MC (4096 walkers × 512 steps × 200 reps, the
delta-linearized `σ̂` at the frozen true log-ratios, arc-sum contributions;
sds scale as `(R·m)^{−1/2}`, cross-checked against the closed form for `â`:
1.14 vs 1.22 ×10⁻⁴): `sd(σ̂) ∈ [1.9×10⁻⁶, 1.7×10⁻³]` across windows,
`sd(Ê(512)) ∈ [3.0, 6.3]×10⁻³`, `sd(t̂×) ∈ [0.0012, 0.038]` steps. The
windowed estimator's count-nonlinear bias ≤ `2n/(R·m·w)` = 1.2×10⁻⁴ at `w = 1`
— below 4% of every band. The `t̂×` centres are the same pinned interpolation
applied to the windowed-exact `E_w` (the estimator's own grid); the drift
smearing inside the `[32, 64)` window shifts the wind's centre from the
`E_diss` crossing 44.74 to 43.58 — registered, not corrected away. The
centres' own MC uncertainty ≤ 0.15 band-sd. The scratch scripts stay out of
Git.

### Assumptions, artefacts, α

- **Family-wise error:** 38 registered statistical sub-tests — 37 at
  per-test α = 0.001 (the normal ±3.29σ, or the Cornish–Fisher quantile
  where the R-level skew exceeds 0.1) plus T1's block composite at
  6×10⁻⁵: Bonferroni FWER ≤ 3.8%. The bit-exact and exact-chain checks
  (M1, C1, C2, the binding-envelope classifications of C3(i), F1's empty
  ∞-set, X1's identities, `â`) carry no α: they cannot fail under a correct
  implementation and are labelled verified/proved, not supported. Nulls
  first: M1 and T1 certify the harness, the P row the pooled estimators,
  before any structured claim is read. 16 blocks; paired seeds; every band
  is an interval on a pooled or 256-seed mean — no single-seed sub-test
  survives, and the page says so.
- **One denominator, one centre pipeline** (the review's P1-1): η uses the
  exact `E_diss`; `t̂×` uses the windowed `Ê` with its own exact centres;
  `W̄₁`'s centres are `E[W̄₁]`, not `W₁`. Every number in the table comes
  from the same exact chain and the same MC, so the centres are mutually
  consistent by construction.
- **Measurability boundaries:** (i) the calm's `σ̄(s) ~ 1/(2s)` stays above
  the plug-in noise floor `2n/(R·m·w)` through `T` (9.8×10⁻⁴ vs
  3.8×10⁻⁶ at the last coarse window — SNR 257); (ii) the `max` arm's
  flux EP is ε-scale at every step (F1) — its `σ̂` centres are exact for the
  registered ε but its dissipative envelope is a page diagnostic; (iii)
  `t̂×`'s bands are hair-thin (0.001–0.04 steps): they are simultaneously
  the sharpest pipeline checks — a failure means a pipeline error with
  probability 1 − α.
- **Lattice artefact or physics?** C1: a finite causal speed is physics;
  the circle metric is the lattice. C3: the envelope crossover
  `√(σ_step·a) = 1` and the `δ^{-1}` scaling of `t×` are continuum physics
  of the chain family; `C ∈ [2.42, 2.82]` is the registered start's cliff
  lead — a model number (it grows as `ln(1/ε)` as ε → 0, lengthening the
  δ-start's causal era without bound: the complementarity again). C4: the
  `1/√π` tightness is the continuum Cauchy–Schwarz slack, lattice-free;
  the calm's `t ≤ 2.82` causal transient is the ε-cliff artefact. C5: the
  two tightness branches and the crossover drive `ρ* ≈ 4.18` (where
  `σa = 1` at `a = 1/2`) are lattice-free; the `63/64` block factor is the
  start; the sweep's ends (`ρ = 0`, `ρ = ln 255`) are model numbers. U1:
  lattice-free — any finite-speed system. F1: the `+∞` front is
  finite-propagation physics; the ε-regularization, the period-2 chain and
  the 8-bit draw are lattice/implementation facts. X1: the no-spread of
  damage is independence, not the lattice. The n = 16 draft's wind-laps-
  calm dip is a torus artefact whose time is the lap `t = N/μ ∝ N`: it
  survives `N → ∞` only in the scaling window `t ∝ N` and vanishes at
  fixed `t`; this design (`N ≫ vT`) excludes the lap era by construction,
  and the claim is not re-run.
- **Float trust boundary:** positions, counts, tallies, goldens and all
  bit-exact checks are integer-level; `W₁`, `σ̂`, `â`, `E_diss` and the
  exact-chain predictions are f64 from exact integers (chain error
  < 10⁻¹² ≪ the tightest registered band 6×10⁻⁶); dyadic rational goldens
  at `t ∈ {1, 2, 3}`.

### Lean lane (round 1, cheap)

The trajectory-cone lemma (`dist(x_s, x₀) ≤ s`, induction on steps) →
`a_cone = a` for any speed-≤v dynamics (U1's vacuity, in the generality
that makes the negative result stick); the per-step displacement lemma and
`W₁^circle ≤ t` (C1; search Mathlib's `Wasserstein` first); the front lemma
(`σ_flux = +∞` while an edge is one-sided; needs `fluxEP` for the walker
chain, `Σ_e (F−R)·ln(F/R)` in `ℝ≥0 ∪ {∞}`); the XOR-difference lemma
(`|Δ| ≤ 2` per differing draw, constant thereafter); the per-edge traffic
inequality; support symmetry generalized to `w d = 0 ↔ w (opp d) = 0`
(003's weights have `q_N = q_S = 0`, so 002's all-positive
`walkerK_support` does not apply). Round 2: `W₁^circle` = the min-cut
cumulative formula (cycle min-cost flow); the net-flux transport lemma;
the composite bound `W₁ ≤ min(vt, ∫√(σa))` for the walker — mirrored in
`Challenge.lean`.

## Result

Not run. Pre-registered 2026-10-07 on `prereg/003`, replacing the rejected
`n = 16` draft (317f822) after cross-family review; the outcome will be
filled in a separate section after the sweep, without editing any
prediction above.

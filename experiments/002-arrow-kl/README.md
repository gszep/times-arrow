# 002-arrow-kl

**Is the arrow of time measurable as `D_KL(P_F ‖ P_R)`?** (issue #7; Q4, Q5)
`TimesArrow/Markov` proves entropy production is
`D_KL(P_F ‖ P_R) ≥ 0`, vanishing for every horizon iff the chain is in
detailed balance, and identifies it with the mean path log-ratio — the
observable a simulation can accumulate (round 1). On main already:
`EP = T·σ_step` at stationarity with support symmetry (faec5f1), and the
detailed and integral fluctuation theorems (281f5db). This experiment
measures all of them on the minimal driven system that fits the library
exactly, and answers the title question through three finite-sample
estimators — mean log-ratio, histogram plug-in, exponential average — each
with an exact, pre-registered measurability boundary. Q4: the rule family is
closed under reversal (mirror the weights); the *state* — the weights —
fixes the orientation, and the undriven state orients nothing (`σ ≡ 0`
pathwise). Q5: a coarse observer loses part of the arrow — the corner now
answers with an exact decomposition: a reflection-symmetric region loses
*exactly all* of it (a torus artefact, flagged below), and the minimal
asymmetric region keeps a share that is certified strictly positive but
undetectably small at the corner's sample size. The dynamics kernel is
shared with 003 (issue #9): the same walker step, the same integer
hop-count observable family (`σ` from per-edge forward/backward hop
counts) — one kernel serves both experiments. Literature:
`docs/background.md`, "Thermodynamic arrow" (Kawai–Parrondo–Van den Broeck
2007; Crooks 1999; Jarzynski 1997).

## Setup (pre-registered)

- `M = 16` independent walkers on the periodic `n × n` torus, `n = 8`
  (`N = 64` sites); light-cone speed 1 cell per step (stated on the page).
  Synchronous update: each step, every walker draws a direction
  `d ∈ {E, W, N, S, 0}` and hops one axial cell or stays.
- Weights are dyadic in 256ths: `q_E = 48/256 = 3/16`, `q_W = 16/256`,
  `q_N = q_S = 24/256`, `q_0 = 144/256 = 9/16`. Drive `a = ln(q_E/q_W) = ln 3`;
  the y-drive is 0. The direction is the word's top 8 bits against the
  thresholds `48, 64, 88, 112, 256` — an exact integer comparison,
  bit-exact on every backend.
- Randomness (Conventions): Philox4x32-10, key `(seed, 0)`, counter
  `(i, t, 0, 0)` — the counter's site slot carries the walker index — one
  word per (walker, step); **hops use `t ∈ {1..T}`, the initial draw uses
  `t = 0`, so no counter is ever drawn twice.** Initial position: counter
  `(i, 0, 0, 0)`, one word, `x = w mod 8`, `y = (w ≫ 3) mod 8`: each walker
  starts uniform, so the start is exactly stationary.
- State space `(Site n)^M` — finite. `κ` moves every walker independently;
  uniform is stationary for every weight vector (each walker's kernel is
  translation-invariant, hence doubly stochastic — round-3 conjecture;
  hedged in the table). Every move has its reverse available (`q_dir > 0` for all
  four directions), so `κ i j = 0 ↔ κ j i = 0` unconditionally — the support
  condition `toReal_entropyProduction` needs, which the library already
  states in this support-symmetry form (faec5f1); **002 requires no library
  change**. With uniform `π` the boundary terms of the path log-ratio
  cancel **pathwise**, so `σ(ω) = (n_E − n_W)·ln 3`: one integer pair per
  path.
- `σ_step = M[(q_E − q_W)a + (q_N − q_S)b] = 2 ln 3 ≈ 2.1972` nats/step.
  Increments are iid: `⟨σ⟩(T) = 2T ln 3`, `Var(σ) = (15/4)T(ln 3)²`, and
  the exact `P(σ)` is a 3-point convolution, computable exactly (pinned at
  `T ∈ {1, 2}` in the contract, denominators `256^{16T}`; f64 DP beyond).
- Arms, paired by the same seed list: **driven**; **reversed** (`q_E ↔ q_W`,
  which realizes `reversedPathPMF` under uniform `π`); **null**
  (`q_E = q_W = 32/256` — same activity, differs in exactly one respect,
  the drive) — each at `T ∈ {1, 4, 64}`; **ramp** `ε(t) = t/16`
  (`q_E = (32+t)/256`, `q_W = (32−t)/256`, `q_0` constant) and its **reverse
  protocol** (`ε(15−t)`, weights *not* swapped — the schedule reversal is
  the protocol reversal; swapping is the dynamical reversal, and the two
  coincide only when the schedule is constant), at `T = 16`.
  `R = 65536` seeds per arm (16 blocks × 4096), seeds `1…65536`.
- **Corner** (K5): `n = 4`, `M = 4`, `T_c = 32`, `R_c = 1024` (16 blocks ×
  64), same RNG pattern, constructor `x = w mod 4`, `y = (w ≫ 2) mod 4`
  (counter `(i, 0, 0, 0)`). Fine space = compositions of `M` into `N`
  parts: `C(19,15) = 3876` states; per-path coarse log-ratios by the exact
  forward algorithm (HMM) over that space, with the occupancy-chain kernel
  (multinomial hop flows) pinned by goldens — Lean rationals for the
  goldens, f64 on GPU. Two observed regions:
  - the **left half** `{x ∈ {0,1}}` — reflection-symmetric, hence *exactly
    blind*: `σ_cg ≡ 0` on every populated coarse path. The conjugacy
    `(x,y) ↦ (1−x, y+c)` maps the driven chain to the reversed chain and
    preserves the half, so the two coarse path laws coincide (verified: the
    count marginals agree cell for cell in exact arithmetic to 5 times).
  - the **L** `A = {(0,0),(1,0),(0,1)}` — the *minimal asymmetric region*:
    all 16 one-site and all 120 two-site regions on the 4×4 torus are fixed
    by at least one of the 32 driven→reversed conjugacies
    `(x,y) ↦ (b−x, c±y)` (verified by exact enumeration; completeness: a
    conjugacy must map E-hops to W-hops, forcing `x ↦ b−x`, and preserve the
    N/S-edge structure, forcing `y ↦ c±y`), hence blind. `A` is fixed by
    none, and its 4-time count marginal already differs between the arms:
    `KL = 1.28 × 10⁻⁵` nats, exact rationals.
- All tier 0 (000 measured 61 × 10⁹ cell updates/s; the main sweep is under
  10⁹ walker-steps, the corner HMM ~10⁹ f64 ops). Provenance: every sweep
  writes JSON (commit, parameters, seeds, adapter). Every parameter in the
  page URL; probe on `window`; tallies read back batched once per frame;
  `device.lost` checked. The page shows the hypothesis, live histograms
  against the exact DP curve, estimates against predictions, a collapsible
  assumptions panel, and what would refute each claim.

## Observables and estimators (pre-registered)

- **Notation:** `P_F`, `P_R` are the forward and reversed path laws;
  `R = 65536` per arm (`R_c = 1024` at the corner) is the *seed count* —
  estimator subscripts like `⟨·⟩_R` average over seeds and never refer to
  the reversed law.
- **σ per path**: integer tallies `(n_E, n_W)`; `σ = (n_E − n_W)·ln 3` in
  f64 (tallies bit-exact; the product ≤ 1 ulp — stated trust boundary).
- **D̂_mean** = sample mean of `σ`: unbiased for `D_KL(P_F ‖ P_R)`, with
  exact CLT bands (`Var` known).
- **Exact histogram**: `P(σ)` by the DP; χ² goodness-of-fit on bins with
  expected count ≥ 10.
- **D̂_plugin** = `Σ_k p̂_F(k) ln(p̂_F(k)/p̂_R(k))` from the driven and
  reversed arms. Licensed by the sufficiency identity
  `D_KL(σ#P_F ‖ σ#P_R) = D_KL(P_F ‖ P_R)` (the dFT makes the reversed
  arm's σ-law the exact mirror; the sufficiency identity is a round-3
  conjecture). Plug-in bias `(K̂−1)/(2R)`: at `T = 64`, `K̂ ≈ 117`
  populated bins ⇒ 8.9 × 10⁻⁴ nats, ~75× below the CLT noise — the
  histogram route fails through bin population, not bias.
- **IFT estimator** `⟨e^{−σ}⟩_R`: unbiased, variance exactly
  `(E[e^{σ}] − 1)/R` (the identity `E[e^{−2σ}] = E[e^{σ}]`, two lines from
  the tilt lemma — round-3 conjecture); `E[e^{σ}] = (4/3)^{16T}` here, so
  it is measurable only for `T < T* = ln R/(16 ln(4/3)) = 2.41` at
  `R = 65536`.
- **σ_cg** (corner): `σ_cg(ξ) = −ln E_F[e^{−σ} | ξ]` exactly (since
  `P_R^cg(ξ) = P_F^cg(ξ)·E[e^{−σ}|ξ]`; both the identity and the DPI reading
  are round-3 conjectures), evaluated by two forward passes. Two exact facts
  frame any region count, checked at registration in rational arithmetic:
  the **2-time marginal is drive-blind for every region** — the per-walker
  `(in, out)` table is symmetric because the enter and leave fluxes are
  equal at stationarity, and the swapped arm's marginal is its transpose —
  and for both corner regions the 3-time marginal is blind too — pinned as a
  required contract golden (`KL = 0` exactly, rational arithmetic). The count
  observer's arrow therefore lives entirely in ≥ 4-time correlations.
- **σ_∂** (corner): the signed boundary-crossing tally
  `σ_∂(ω) = ln 3·(#E-hops crossing ∂A − #W-hops crossing ∂A)` is a
  **fine-path functional** — the count observer sees net occupancy change
  only, never hop directions, so it cannot form `σ_∂` (nor any crossing
  anchor). Its exact corner mean: `E[σ_∂] = 4 ln 3`, the boundary share of
  the arrow. The shares decompose exactly (per-walker-step rates, all
  over 256): within-A `1/128` + boundary `1/32` + outside `11/128` =
  total drift `1/8`, i.e. in ln 3 units `1 + 4 + 11 = 16 = E[σ]/ln 3`.

## Hypothesis (pre-registered)

| # | Claim | Prediction | Falsified if | Label it earns |
|---|---|---|---|---|
| M1 | The model fits the library: finite state space; uniform stationary for every weight vector (per-walker doubly stochastic); support symmetry unconditional; pathwise `σ` = hop tally; exactly stationary constructor | Golden vectors reproduce bit for bit (step, constructor, tally, DP tables at `T ∈ {1,2}`); differential tests against the Lean binary pass | Any golden vector or differential test fails: an implementation error; nothing is promoted until fixed | structure **conjecture** (round-3 model lemmas) + **verified** (kernels, constructor, DP goldens) |
| K1 | The second law is linear: `⟨σ⟩ = 2T ln 3` and `Var(σ) = (15/4)T(ln 3)²` (iid increments) — the instantiation of `toReal_entropyProduction_eq_natCast_mul_stepEntropyProduction` (library theorem proved on main, faec5f1; support symmetry is unconditional here, but the model instantiation is conditional on the round-3 per-walker stationarity lemma; no library change required) | `R = 65536`, 3.1σ bands: `T=1`: `2.1972 ± 0.026`, std `2.127 ± 0.018`; `T=4`: `8.789 ± 0.052`, std `4.255 ± 0.037`; `T=64`: `140.622 ± 0.206`, std `17.020 ± 0.146` (std bands from the exact sampling variance of ŝ, `Var(ŝ) = σ²(κ+2)/(4R)` with per-increment excess kurtosis `κ_X = 62/75 = 0.8267` (`E[(X−μ)⁴] = 861/4096 ln⁴ 3`, `Var(X) = 15/64 ln² 3`), so `κ = κ_X/(16T)`). χ² vs the exact DP histogram ≤ 36 (`T=1`, 15 bins), ≤ 57 (`T=4`, 29 bins), ≤ 169 (`T=64`, 117 bins) — p ≈ 10⁻³ each; ≥ 15/16 block means (4096 runs each) inside the block-level 3.1σ band `±3.1σ/√(R/16)`: `T=1` ±0.103, `T=4` ±0.206, `T=64` ±0.824 | Any mean or std leaves its band; or χ² exceeds its threshold; or ≥ 2 blocks outside their band | **supported** (statistical); library theorem **proved** on main (faec5f1); model instantiation conditional on the round-3 per-walker stationarity lemma (**conjecture**) |
| K2 | The arrow is the state, not the law: the null (`q_E = q_W`, `q_N = q_S`) is reversible — `IsReversible ⇒ pathPMF(rev ω) = pathPMF(ω)` (round 1, on main), so `σ ≡ 0` **pathwise**; the driven chain is irreversible with `σ_step > 0` (strictly: `(x−y) ln(x/y) > 0 ↔ x ≠ y`, round-3 conjecture) | Every null path has `σ = 0` exactly; the driven mean is `2T ln 3 > 0` (K1) | Any null path with `σ ≠ 0` (bit-exact: implementation error); or the driven mean ≤ 0 | null reversibility **proved** (library lemmas, on main); model instantiation and the strict-positivity two-liner **conjecture** (round 3); null runs **verified** (bit-exact) |
| K3 | The detailed FT `P_F(σ=s)/P_F(σ=−s) = e^s` holds exactly for every `T` (the reversal involution maps `{σ=s}` onto `{σ=−s}`, and `P_F(rev ω) = e^{−σ(ω)}P_F(ω)`); the direct bin test needs the mirror bin populated: both counts ≥ 10. Necessary: `e^{|σ|} ≤ R·P_F(σ)/10 ≤ R/10` — not sufficient (at `T=1`, `k=−6` satisfies it but its expected count is 2.3); the binding constraint is the minor side's population, from the exact DP | `T=1`: mirror bins `k ∈ [−5,5]` (ratios `3^{±5} = 243`; minor side of `k=−5`: expected 16.4): per-bin `|ln(n(k)/n(−k)) − k ln 3| ≤ 3√(1/n(k)+1/n(−k))` in ≥ 10/11 bins, slope `ln 3 ± 5%`; `T=4`: `k ∈ [−5,5]` (minor side of `k=−5`: expected 20.8; `k=−6` excluded — expected 8.2 < 10), ≥ 10/11 bins, same slope. `T=64`: every populated bin's mirror lies ≥ 12.8σ out — populating one needs `R ∼ e^{140}` — unreachable directly; certified there by: the exact DP satisfies the mirror identity (golden) ∧ the measured histogram matches the DP (K1) ⇒ the measured histogram satisfies the dFT; plus the reversed arm realizes `reversedPathPMF`: `n_R(−j) = n_F(j)` within 3σ Poisson for `j ∈ [70,186]`, ≥ 90% of 117 bins | Any stated bin test fails at its threshold; or the `T=64` cross-arm mirror fails in ≥ 10% of bins | **supported** (statistical); dFT **proved** (on main, 281f5db) |
| K4 | The integral FT `⟨e^{−σ}⟩ = 1` for every `T` (proved, on main); the estimator's variance is exactly `(E[e^{σ}]−1)/R` (round-3 conjecture, via `E[e^{−2σ}] = E[e^{σ}]`); the measurability boundary is `T* = 2.41` (variance 1) — beyond it the exponential average is dominated by rare draws and unreliable (the known rare-event failure, here exact); in the deep regime it collapses outright | `T=1`: `|⟨e^{−σ}⟩_R − 1| ≤ 4·std̂`, `std̂ = √((mean e^σ − 1)/R)` from the same runs (predicted `std̂ ≈ 0.039`, band ≈ ±0.16); `T=64`: **collapse** — estimate < 10⁻³ (predicted ≲ 10⁻³⁰: the deepest of 65536 draws sits at `σ ≈ 140.6 − 4.2σ_std ≈ 69`, so even it contributes `e^{−69}/65536 ≈ 10⁻³⁴`); the page exposes `T*(R)` and shows the unreliable regime (`T* < T ≲ 30`) live, unregistered | `T=1` outside its band; or the `T=64` estimate ≥ 10⁻³ (≈ 1 refutes the registered collapse) | **supported** (statistical); IFT **proved** (on main, 281f5db); variance identity **conjecture** (round 3) |
| K5 | Coarse-graining loses the arrow (Q5), exactly quantified at the corner: a reflection-symmetric region count is *exactly blind* — `σ_cg ≡ 0` pathwise, a torus artefact — and the minimal asymmetric region keeps a share that is strictly positive but undetectably small: `0 < E[σ_cg] < E[σ]`. Positivity, the load-bearing registered bound: `E[σ_cg] = KL(ν_F‖ν_R) ≥ KL(4-time marginal) = 1.28 × 10⁻⁵ nats` (exact rational DP; required contract goldens: 3-time marginal `KL = 0` exactly for both corner regions, 4-time `1.28 × 10⁻⁵`, 5-time `3.00 × 10⁻⁵`). Strictness: `σ` is not ξ-measurable — witness: `E,E` from `(0,0)` vs `N,E` from `(0,0)` give the same coarse path and `σ = 2 ln 3` vs `ln 3`, both with positive probability | Corner: `⟨σ⟩_c = 17.578 ± 0.583` (= 16 ln 3); fine boundary tally `⟨σ_∂⟩ = 4.394 ± 0.270` (= 4 ln 3, the boundary share — a harness check, not a coarse statistic; std from the exact position-chain lag covariance, `Var(σ_∂) = 6.4349 (ln 3)²` — increments are position-mediated, not iid; the iid shortcut gives 0.299); half-count: `σ_cg = 0` on every populated coarse path; L-count: the registered bound `E[σ_cg] ≥ 1.28 × 10⁻⁵` nats is untestable at this sample size — power: the corner's per-path noise scale is `σ_std = √30 ln 3`, `SE ≈ 0.19` at `R_c = 1024` (`σ_cg`'s exact std is a full-path property; the run reports the 16-block SE), so detecting the exploratory ~10⁻⁴-nat magnitude needs `R_c ≳ 10⁹` paired paths; the run's check is a *pipeline null* alongside the half-count: `|⟨σ_cg⟩| ≤ 3.73 SE` (`t₁₅`, 16-block SE, df 15); magnitude exploratory: the marginal-KL growth (1.28 × 10⁻⁵ at 4 times, 3.00 × 10⁻⁵ at 5) puts `E[σ_cg]` at ~10⁻⁴–10⁻³ nats, 3–4 orders below the 4 ln 3 boundary share; null corner: `σ ≡ 0` and `σ_cg ≡ 0` pathwise | Any half-count populated coarse path with `|σ_cg| > 10⁻¹²` (implementation error); or `|⟨σ_cg⟩| > 3.73 SE` at the L-corner (a pipeline flag — implementation error in the coarse pipeline; a magnitude surprise is not a DPI refutation); or `⟨σ⟩_c` or `⟨σ_∂⟩` leaves its band; or the HMM golden vectors fail | half-count blindness, the any-region 2-time and the corner 3-time blindness **conjecture** (Lean round-3 targets; the conjugacy and flux-relabeling arguments are given above) + **verified** (exact DP: marginals agree cell for cell; the 3-time `KL = 0` is pinned as a required contract golden); L-positivity **verified** (exact DP: 4-time KL > 0); L-check a **pipeline null** (statistical); DPI **conjecture** (round 3); magnitude **exploratory**; null corner **verified** |
| K6 | The estimator story: `D̂_mean` is unbiased; the plug-in estimates the same quantity (sufficiency identity, round-3 conjecture) with bias `(K̂−1)/(2R) ≈ 8.9 × 10⁻⁴` nats at (`T=64`, `R=65536`), ~75× below the CLT noise | `D̂_plugin − D̂_mean ∈ [−3.73σ̂_diff, (K̂−1)/(2R) + 3.73σ̂_diff]` at `T=64` (`σ̂_diff` = empirical block std of the difference, predicted ≲ 0.09; band at `t₁₅ = 3.73` — a 16-block estimated SE has df 15, so the t quantile replaces the normal 3.10 at the same per-test α = 0.002); both reported against the exact 140.622 | The difference leaves the band (a systematically negative plug-in, or a blow-up) | sufficiency identity **conjecture** (round 3); **supported** (statistical) |
| C1 | Crooks/Jarzynski for a time-dependent protocol: with `ε(t) = t/16`, uniform stays stationary for every `t` (each `κ_t` doubly stochastic), so the inhomogeneous EP `⟨σ⟩ = Σ_t σ_step(ε(t))` has no transient term; Crooks `P_F(σ=s)/P_R(σ=−s) = e^s` with `P_R` the reverse-protocol law (own move-sums on both arms); Jarzynski is the IFT with ΔF = 0 (a torus drive stores no free energy) — but the ramp's Jarzynski estimator is out of measurable range: `ln E[e^{σ}] = 16 Σ_{t=0}^{15} ln(q_E(t)²/q_W(t) + q_W(t)²/q_E(t) + 3/4) = 20.91` (exact rationals inside the logs), so `E[e^{σ}] = 1.21 × 10⁹`, the estimator's std is `√((E[e^{σ}]−1)/R) ≈ 136`, and the effective horizon `T_eff = 20.91/(16 ln(4/3)) = 4.54 > T* = 2.41` — the K4 failure mode at a protocol-dependent tilt; the ramp's Jarzynski equality is certified only through the Crooks ratio, never through `⟨e^{−σ}⟩` | `⟨σ⟩_ramp = Σ_{t=0}^{15} 2(t/16) ln((32+t)/(32−t)) = 10.193 ± 0.055`, std `4.549 ± 0.039`; Crooks bin test `n_F(s)/n_R(−s) = e^s` over populated 0.5-nat bins (both counts ≥ 10, ~18 bins over `|s| ≤ 4.5`): slope `1 ± 0.1`, ≥ 90% of bins in 3σ bands; the histograms cross at `s* ∈ [−1,1]` (the ΔF = 0 signature) | The mean leaves its band; or the slope/bin/crossing checks fail | **supported/refuted** (statistical); Lean **conjecture** until the time-inhomogeneous path law exists (round 3) |

### Assumptions, artefacts, measurability

- **Independence is the design choice, not an oversight**: it makes every
  distributional prediction exact (DP histogram, `Var`, the `(4/3)^{16T}`
  tilt), which is what gives the falsifiers numbers instead of fits.
  Interactions (exclusion, zero-range) break the exact histogram, add no
  registered claim here, and are deferred. The thermodynamic content — a
  NESS with a circulating current, `EP = affinity × current` — is the
  ring-colloid case in its exactly solvable discretisation.
- **Lattice artefact or physics? Per claim:** K1/K2 (second law, DB-iff)
  and K3/K4 (dFT, IFT) are physics of finite chains — lattice-free. `T*`
  is a **sample-size artefact** (`T* = ln R/(16 ln(4/3))` moves with the
  seed budget, not with the system; so is the ramp's `T_eff = 4.54`). K5's
  half-count blindness is a **torus artefact of the observable, not of the
  lattice spacing**: an orientation-reversing reflection exists on every
  `n`, so any reflection-symmetric region is blind at every lattice size
  and in the continuum limit of this model family; the 2-time marginal
  blindness of *any* region count is physics of stationarity (enter flux =
  leave flux), likewise lattice-free; the L-count's surviving share is the
  honest instantiation. C1: the schedule-reversal/weight-swap distinction
  is the real inhomogeneous content; ΔF = 0 is the torus saying a
  nonconservative force stores no free energy. The 8-bit draw and the
  synchronous update are implementation facts. The values (`σ_step`, the
  1/128–1/32–11/128 shares) are model numbers.
- **Measurability boundaries (the answer to the title):** the mean
  log-ratio works at all `T` (error `σ_std/√R`, polynomial); the histogram
  route needs `R ≳ 10·e^{|s|}` per bin (exponential in the tested `|s|`);
  the exponential average needs `R ≳ E[e^{σ}] = e^{T·σ_step}` (exponential
  in `T`). The `T=64` mirror and the IFT beyond `T*` are exponentially
  unreachable — and both boundaries are themselves exact, pre-registered
  predictions (K3, K4). K5 adds a fourth: the count observer's own arrow
  is certified positive (`E[σ_cg] ≥ 1.28 × 10⁻⁵` nats) with exploratory
  magnitude ~10⁻⁴ nats against `SE = √30 ln 3/√R_c ≈ 0.19` at `R_c = 1024`
  — resolving it would need `R_c ≳ 10⁹` paired paths.
- **Family-wise error:** 25 registered statistical checks. Global policy:
  Bonferroni, `α_global = 0.05` ⇒ per-test `α = 0.002` two-sided: bands
  dividing by an exactly known σ are stated at the normal 3.10σ; the two
  bands dividing by a 16-block estimated SE (K5's L-null, K6's difference
  band) use the t quantile `t₁₅ = 3.73` at df = 15 — the same per-test α.
  Composite checks each sit
  below the per-test budget: three χ² at p ≈ 10⁻³; ≥k-of-n bin tests at
  per-bin 3σ (e.g. `P(≥2 of 11 fail) ≈ 4 × 10⁻⁴`); K4's 4σ band at
  6 × 10⁻⁵. FWER ≈ 5%.
- **Statistical honesty:** 16 blocks per arm; paired seeds across arms; the
  page states when a single run can go against the trend; nulls first —
  K2's bit-exact `σ ≡ 0` certifies the harness before any structured claim
  is read, and K5's half-count `σ_cg ≡ 0` and L-count `|⟨σ_cg⟩| ≤ 3.73 SE`
  null certify the coarse pipeline the same way.
- **Float trust boundary:** tallies, DP tables and golden vectors bit-exact
  (integer model); `ln 3` products, the ramp sum and the HMM in f64 —
  goldens at tolerance 10⁻⁹; the null corner's `σ_cg` and the driven
  half-count's `σ_cg` within 10⁻¹² of 0 (exactly 0 in the rational
  goldens).

### Lean lane for 002 (round-3 worklist)

On main (rounds 1–2): `EP ≥ 0`; `EP = 0 ∀T ⟺` detailed balance; `EP` =
mean path log-ratio; `EP = T·σ_step` under support symmetry (faec5f1); `σ`
flips under reversal; the exponential tilt; the dFT and the IFT (281f5db).
The kernel needs no library change: `q_dir > 0` everywhere makes the
support symmetry unconditional.

Round-3 conjectures (each mirrored in `Challenge.lean` for Comparator):
per-walker doubly-stochastic stationarity; unconditional support symmetry
for this kernel; the reversed chain realizes `reversedPathPMF` (uniform
`π`); the variance identity `E[e^{−2σ}] = E[e^{σ}]`; the sufficiency
identity `D_KL(σ#P_F ‖ σ#P_R) = D_KL(P_F ‖ P_R)`; the DPI with
`σ_cg = −ln E[e^{−σ}|ξ]`; the 2-time marginal blindness of any region
count (stationary flux relabeling); the half-count conjugacy lemma
(`σ_cg ≡ 0`); the time-inhomogeneous path law (C1); the strict-positivity
two-liner `(x−y) ln(x/y) > 0 ↔ x ≠ y`; the exact DP as the contract's
golden vectors, including the pinned 3-time corner blindness
(`KL = 0` exactly).

## Result

The full registered ensemble — 11 arms (null, driven, reversed at
`T ∈ {1, 4, 64}`; ramp, ramprev at `T = 16`), `R = 65536` paired seeds per
arm (seeds 1…65536, 16 blocks × 4096), plus the K5 corner (`n = 4`, `m = 4`,
`T_c = 32`, `R_c = 1024`) — ran headless on Artemis at commit `8acad8c`
(NVIDIA RTX 5000 Ada, Lovelace, hardware adapter, vendor-guarded;
`results/artemis.json`: `dirty: false`, `goldens: true`, seeds and adapter
recorded; scored by the committed scorer into `results/artemis.score.json`,
which the page renders through the same `score`/`renderVerdict`). One
registered check is **refuted** — a calibration error of the registration
itself, not of the physics — every other statistical check passed and every
bit-exact check verified.

### Refuted

**K3 at `T = 1` — the registered mirror-slope criterion.** Every per-bin
mirror band passes (11/11 at both `T = 1` and `T = 4`, registered ≥ 10/11),
the exact-DP mirror golden holds, and the `T = 64` cross-arm mirror agrees in
117/117 bins. But the registered slope check fails at `T = 1`: the
through-origin fit of `ln(n(k)/n(−k))` over the 11 bins is **1.164**, outside
`ln 3 ± 5% = [1.044, 1.154]` — the registered falsifier ("any stated bin
test fails at its threshold") fires. The cause is the criterion's own
calibration, not the theorem (the dFT is proved, 281f5db): the minor-side
count `n(−5) = 9` against an expected 16.4 (a −1.8σ Poisson draw) inflates
the unweighted slope by ≈ 0.12, and a post-hoc Monte Carlo under the exact
law (**exploratory**: 20 000 simulated arms at `R = 65536`) puts the slope's
sampling s.d. at 0.025 — the ±5% band is a **±2.2σ** interval with per-arm
size **3.2%**, ~16× the α = 0.002 discipline every other registered band
follows (3.1σ normal, `t₁₅ = 3.73`). The measured slope sits 2.6σ from ln 3:
an ordinary draw of a mis-registered test. Per rule 5 the verdict stands as
measured — **refuted (statistical)** — and the calibration error is this
run's negative result. The dFT itself, its `T = 4` slope (1.081), its
per-bin evidence (22/22) and its `T = 64` certified route are unaffected.

### Verdict table (the committed scorer's output)

| # | Claim | Registered criterion | Measured | Label |
|---|---|---|---|---|
| K3 | detailed FT | per-bin `\|ln(n(k)/n(−k)) − k ln 3\| ≤ 3√(1/n(k)+1/n(−k))` in ≥ 10/11 bins and slope `ln 3 ± 5%` at T ∈ {1,4}; T = 64: DP-mirror golden ∧ cross-arm `n_R(−j) = n_F(j)` within 3σ in ≥ 90% of 117 bins | T=1: 11/11 bins pass, slope 1.164 ∉ [1.044, 1.154] — **fails**; T=4: 11/11, slope 1.081; T=64: DP mirror exact, cross-arm 117/117 | T=1 **refuted (statistical)** — the slope band was mis-registered (true size 3.2%, §Refuted); T=4, T=64 **supported**; dFT **proved** (281f5db) |
| M1 | model fits the library | goldens bit for bit; differential tests pass | contract gate in the sweep: all goldens reproduced bit for bit (`goldens: true`); `check:gpu` 275/275 on this Mac at 8acad8c (194/194 golden-only on Artemis, no Lean there) | structure **conjecture** (round-3 model lemmas) + **verified** (kernels, constructor, DP goldens) |
| K1 | second law linear | mean/std in 3.1σ bands; χ² ≤ 36/57/169; ≥ 15/16 block means in band | means 2.182, 8.774, 140.585 vs 2.197, 8.789, 140.622 (bands ±0.026, ±0.052, ±0.206); stds 2.120, 4.260, 16.994 vs 2.127, 4.255, 17.020; χ² 21.7, 22.7, 111.2; 16/16 blocks at every T (48/48 total) | **supported** (statistical); library theorem **proved** (faec5f1); model instantiation conditional on the round-3 per-walker stationarity lemma (**conjecture**) |
| K2 | arrow = state | every null path σ = 0 bit-exact; driven mean > 0 | null `max|σ| = 0` at T ∈ {1,4,64} (3 × 65536 paths); driven means 2.18, 8.77, 140.6 > 0 | null runs **verified** (bit-exact); null reversibility **proved** (on main); strict-positivity two-liner **conjecture** (round 3) |
| K4 | integral FT | T=1: `\|⟨e^−σ⟩ − 1\| ≤ 4σ̂`; T=64: collapse < 10⁻³ | T=1: ⟨e^−σ⟩ = 0.942, band ±0.153 (σ̂ = 0.0383, registered 0.039); T=64: 1.6 × 10⁻³⁶ (registered guess ≲ 10⁻³⁰) | **supported** (statistical); IFT **proved** (281f5db); variance identity **conjecture** (round 3) |
| K5 | coarse arrow | corner bands; half σ_cg ≤ 10⁻¹²; L pipeline null `\|⟨σ_cg⟩\| ≤ 3.73 SE`; null corner σ, σ_cg ≡ 0 | ⟨σ⟩_c 17.657 vs 17.578 ± 0.583; ⟨σ_∂⟩ 4.526 vs 4.394 ± 0.270; half-count max \|σ_cg\| = 1.4 × 10⁻¹⁴ (0 in the rational goldens); L ⟨σ_cg⟩ = −1.17 × 10⁻³, band 4.00 × 10⁻³ (t₁₅ × block SE 1.07 × 10⁻³); null corner exact | bit-level **verified**; corner bands **supported** (statistical); half-blindness **conjecture** (Lean round-3) + **verified** (exact DP, 3-time KL = 0 golden); L-positivity **verified** (exact DP ≥ 1.28 × 10⁻⁵); DPI **conjecture**; magnitude **exploratory** |
| K6 | estimator story | `D̂_plugin − D̂_mean ∈ [−3.73σ̂_diff, (K̂−1)/(2R) + 3.73σ̂_diff]` | difference −7.2 × 10⁻³ ∈ [−0.0954, 0.0963]; σ̂_diff = 0.102 (predicted ≲ 0.09); K̂ = 120 populated bins (registered ≈ 117), bias 9.1 × 10⁻⁴; both estimators vs exact 140.622: 140.585, 140.578 | **supported** (statistical); sufficiency identity **conjecture** (round 3) |
| C1 | Crooks/Jarzynski | ramp mean/std bands; Crooks slope 1 ± 0.1, ≥ 90% of bins, crossing s* ∈ [−1,1]; Jarzynski excluded (T_eff > T*) | ⟨σ⟩ 10.178 vs 10.193 ± 0.055, std 4.576 vs 4.549; Crooks 20 populated 0.5-nat bins, slope 0.9855, 20/20 in 3σ; crossing s* = 0; ln E[e^σ] = 20.91, T_eff = 4.54 > T* = 2.41 | **supported** (statistical); inhomogeneous path law **conjecture** (round 3) |

### Bonferroni context

25 registered checks at per-test α = 0.002 (global α = 0.05). Every check
that followed the discipline passed decisively: the three χ² (21.7, 22.7,
111.2 against 36, 57, 169 at p ≈ 10⁻³), all per-bin mirrors (22/22 within
T ∈ {1,4}), the Crooks bins (20/20), K1's block means (48/48 across three
arms), K4's 4σ̂ band at T=1 (−1.5σ̂). The one failure, K3's T=1 slope, is
the one check whose registered band (±2.2σ, size 3.2% per arm) did not
follow the discipline the registration's own accounting assigned it
(α = 0.002); the family-wise guarantee was void for that check from the
start, and the run caught it. Post-hoc calibration of a failed criterion is
exploratory and labelled so above.

### The χ² bins (code-review ruling)

The registered text "expected count ≥ 10" cannot reproduce all three frozen
bin counts; the review ruled the bins as the dof-preserving contiguous sets
matching the frozen thresholds χ² at dof 14/28/116 (issue #7):
`T = 1` [−5, 9] (15 bins, limit 36), `T = 4` [−6, 22] (29 bins, 57),
`T = 64` [70, 186] (117 bins, 169 — K3's explicit cross-arm range). The
committed scorer implements exactly these sets; a Monte Carlo put the T = 64
test's size at 0.07% against the nominal 0.1%.

### Lattice artefact or physics?

- K1, K2, K4 (and the theorem behind K3): physics of finite Markov chains —
  lattice-free. K2's `σ ≡ 0` nulls and the corner's bit-exact nulls are
  properties of the weights, not the grid.
- `T*` (measured 2.409 at R = 65536) and the ramp's `T_eff` (4.54): sample-
  size artefacts — they move with the seed budget, not with the system. The
  measured `T = 64` IFT collapse (1.6 × 10⁻³⁶) is the same rare-event
  mechanism, deeper than the registered order-of-magnitude guess.
- K5: the half-count blindness is a **torus artefact of the observable** (an
  orientation-reversing reflection exists at every `n`, so any
  reflection-symmetric region is blind in the continuum limit of this
  family); the 2-time marginal blindness of any region count is physics of
  stationarity; the L-count's surviving share is the honest instantiation;
  ⟨σ_∂⟩ = 4 ln 3 is the affinity × boundary-current split — physics, with
  the region shape the only lattice input.
- C1: the schedule-reversal/weight-swap distinction is the real
  inhomogeneous content; the measured crossing at `s* = 0` is ΔF = 0 — the
  torus drive stores no free energy.
- The 8-bit draw and the synchronous update are implementation facts
  (bit-exact on every backend); the registered numbers are model numbers.

### Conditional on round 3 (labels that wait on Lean)

Unproved round-3 lemmas carry these measured readings: per-walker
doubly-stochastic stationarity (K1's model instantiation, C1's stationarity);
unconditional support symmetry for this kernel and the pathwise σ identity
(M1's structure); the strict-positivity two-liner (K2's driven side); the
reversed arm realizing `reversedPathPMF` (K6's dFT-tilt license — the
T = 64 cross-arm mirror, 117/117, is its direct measurement); the variance
identity `E[e^{−2σ}] = E[e^σ]` (K4's σ̂); the sufficiency identity (K6's
"same quantity"); the σ_cg identity and DPI (K5's reading); the half-count
conjugacy and 2-time blindness (K5 — the exact-DP verification and the
3-time KL = 0 golden stand regardless); the time-inhomogeneous path law
(C1). Everything **verified** above (goldens, bit-exact nulls, exact-DP
facts) is unconditional; everything **supported** is statistical evidence
conditional on the corresponding lemma.

The registered `E[σ_cg] ≥ 1.28 × 10⁻⁵` bound remains untestable at any
feasible `R_c`: the realized per-path σ_cg scatter (block SE 1.07 × 10⁻³ at
`R_c = 1024`, i.e. ≈ 0.034 per path — smaller than the registration's
conservative √30 ln 3 scale) still puts resolving it at `R_c ≈ 10⁸` paired
paths (**exploratory** revision of the registered ~10⁹).

### Data

`results/artemis.json` and the smoke files in this repo are the compact
scorer inputs — every number the committed scorer and the page read,
minified. The full raw outputs (the per-path half/L occupancy sequences
behind every σ_cg) are attached to release
[results-002](https://github.com/gszep/times-arrow/releases/tag/results-002);
each compact file's `release` block records their SHA-256 and the command
that regenerates them bit for bit (the runs are deterministic).

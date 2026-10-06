# 002-arrow-kl

**Is the arrow of time measurable as `D_KL(P_F ‖ P_R)`?** (issue #7; Q4, Q5)
`TimesArrow/Markov` (round 1) proves entropy production is
`D_KL(P_F ‖ P_R) ≥ 0`, vanishing for every horizon iff the chain is in
detailed balance, and identifies it with the mean path log-ratio — the
observable a simulation can accumulate. Round 2 is adding `EP = T·σ_step`
and the detailed fluctuation theorem. This experiment measures both on the
minimal driven system that fits the library exactly, and answers the title
question through three finite-sample estimators — mean log-ratio, histogram
plug-in, exponential average — each with an exact, pre-registered
measurability boundary. Q4: the rule family is closed under reversal (mirror
the weights); the *state* — the weights — fixes the orientation, and the
undriven state orients nothing (`σ ≡ 0` pathwise). Q5: a coarse observer
loses part of the arrow; by how much is measured at an exactly solvable
corner. The dynamics kernel is shared with 003 (issue #9): the same walker
step, the same integer hop-count observable family (`σ` from per-edge
forward/backward hop counts) — one kernel serves both experiments. Literature:
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
  word per (walker, step). Initial position: counter `(i, 0, 0, 0)`, one
  word, `x = w mod 8`, `y = (w ≫ 3) mod 8`: each walker starts uniform, so
  the start is exactly stationary.
- State space `(Site n)^M` — finite. `κ` moves every walker independently;
  uniform is stationary for every weight vector (each walker's kernel is
  translation-invariant, hence doubly stochastic — Lean claim). Every move
  has its reverse available (`q_dir > 0` for all four directions), so
  `κ i j = 0 ↔ κ j i = 0` unconditionally — the support condition
  `toReal_entropyProduction` needs. With uniform `π` the boundary terms of
  the path log-ratio cancel **pathwise**, so `σ(ω) = (n_E − n_W)·ln 3`:
  one integer pair per path.
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
- **Corner** (K5): `n = 4`, `M = 4`, observe only the left-half count
  `N_L(t)`; `T_c = 32`, `R_c = 1024`. Fine space = compositions of `M` into
  `N` parts: `C(19,15) = 3876` states; per-path coarse log-ratios by the
  exact forward algorithm (HMM) over that space, with the occupancy-chain
  kernel (multinomial hop flows) pinned by goldens — Lean rationals for the
  goldens, f64 on GPU.
- All tier 0 (000 measured 61 × 10⁹ cell updates/s; the main sweep is under
  10⁹ walker-steps, the corner HMM ~3 × 10¹⁰ f64 ops). Provenance: every
  sweep writes JSON (commit, parameters, seeds, adapter). Every parameter
  in the page URL; probe on `window`; tallies read back batched once per
  frame; `device.lost` checked. The page shows the hypothesis, live
  histograms against the exact DP curve, estimates against predictions, a
  collapsible assumptions panel, and what would refute each claim.

## Observables and estimators (pre-registered)

- **σ per path**: integer tallies `(n_E, n_W)`; `σ = (n_E − n_W)·ln 3` in
  f64 (tallies bit-exact; the product ≤ 1 ulp — stated trust boundary).
- **D̂_mean** = sample mean of `σ`: unbiased for `D_KL(P_F ‖ P_R)`, with
  exact CLT bands (`Var` known).
- **Exact histogram**: `P(σ)` by the DP; χ² goodness-of-fit on bins with
  expected count ≥ 10.
- **D̂_plugin** = `Σ_k p̂_F(k) ln(p̂_F(k)/p̂_R(k))` from the driven and
  reversed arms. Licensed by the sufficiency identity
  `D_KL(σ#P_F ‖ σ#P_R) = D_KL(P_F ‖ P_R)` (the dFT makes the reversed
  arm's σ-law the exact mirror; round-3 claim). Plug-in bias
  `(K̂−1)/(2R)`: at `T = 64`, `K̂ ≈ 117` populated bins ⇒ 8.9 × 10⁻⁴ nats,
  ~75× below the CLT noise — the histogram route fails through bin
  population, not bias.
- **IFT estimator** `⟨e^{−σ}⟩_R`: unbiased, variance exactly
  `(E[e^{σ}] − 1)/R` (the identity `E[e^{−2σ}] = E[e^{σ}]`, two lines from
  the dFT); `E[e^{σ}] = (4/3)^{16T}` here, so it is measurable only for
  `T < T* = ln R/(16 ln(4/3)) = 2.41` at `R = 65536`.
- **σ_cg** (corner): `σ_cg(ξ) = −ln E_F[e^{−σ} | ξ]` exactly (since
  `P_R^cg(ξ) = P_F^cg(ξ)·E[e^{−σ}|ξ]`), evaluated by two forward passes.
  The visible-crossing tally `σ_vis(ξ) = ln 3·(N_L(0) − N_L(T_c))` is a
  function of the coarse path with **exact** mean `E[σ_vis] = 8 ln 3` —
  the crossings are all the counts can see.

## Hypothesis (pre-registered)

| # | Claim | Prediction | Falsified if | Label it earns |
|---|---|---|---|---|
| M1 | The model fits the library: finite state space; uniform stationary for every weight vector (per-walker doubly stochastic); support symmetry unconditional; pathwise `σ` = hop tally; exactly stationary constructor | Golden vectors reproduce bit for bit (step, constructor, tally, DP tables at `T ∈ {1,2}`); differential tests against the Lean binary pass | Any golden vector or differential test fails: an implementation error; nothing is promoted until fixed | **proved** (structure; round 3) + **verified** (kernels, constructor, DP) |
| K1 | The second law is linear: `⟨σ⟩ = 2T ln 3` and `Var(σ) = (15/4)T(ln 3)²` (iid increments) — the instantiation of round-2's `EP = T·σ_step`, which must drop its strict-positivity hypothesis for the support symmetry this model has (the one library change 002 requires) | `R = 65536`, 3σ bands: `T=1`: `2.1972 ± 0.025`, std `2.127 ± 0.018`; `T=4`: `8.789 ± 0.050`, std `4.255 ± 0.035`; `T=64`: `140.622 ± 0.199`, std `17.020 ± 0.141`. χ² vs the exact DP histogram ≤ 36 (`T=1`, 15 bins), ≤ 57 (`T=4`, 29 bins), ≤ 169 (`T=64`, 117 bins) — p ≈ 10⁻³ each; ≥ 15/16 blocks inside the mean band | Any mean or std leaves its band; or χ² exceeds its threshold | **supported** (statistical); mean identity **proved** (round 2, after the relaxation) |
| K2 | The arrow is the state, not the law: the null (`q_E = q_W`, `q_N = q_S`) is reversible — round-1 `isReversible_iff_entropyProduction_eq_zero` — with `σ ≡ 0` **pathwise**; the driven chain is irreversible with `σ_step > 0` (strictly: `(x−y) ln(x/y) > 0` iff `x ≠ y`, round 3) | Every null path has `σ = 0` exactly; the driven mean is `2T ln 3 > 0` (K1) | Any null path with `σ ≠ 0` (bit-exact: implementation error); or the driven mean ≤ 0 | **proved** (round 1 + round-3 two-liner); null runs **verified** (bit-exact) |
| K3 | The detailed FT `P_F(σ=s)/P_F(σ=−s) = e^s` holds exactly for every `T` (the reversal involution maps `{σ=s}` onto `{σ=−s}`, and `P_F(rev ω) = e^{−σ(ω)}P_F(ω)`); the direct bin test needs the mirror bin populated: both counts ≥ 10 ⟺ `e^{|σ|} ≤ R/10` | `T=1`: mirror bins `k ∈ [−5,5]` (ratios `3^{±5} ≈ 240×`): per-bin `|ln(n(k)/n(−k)) − k ln 3| ≤ 3√(1/n(k)+1/n(−k))` in ≥ 10/11 bins, slope `ln 3 ± 5%`; `T=4`: `k ∈ [−6,6]`, ≥ 12/13 bins, same slope. `T=64`: every populated bin's mirror lies ≥ 12.8σ out — populating one needs `R ∼ e^{140}`) — unreachable directly; certified there by: the exact DP satisfies the mirror identity (golden) ∧ the measured histogram matches the DP (K1) ⇒ the measured histogram satisfies the dFT; plus the reversed arm realizes `reversedPathPMF`: `n_R(−j) = n_F(j)` within 3σ Poisson for `j ∈ [70,186]`, ≥ 90% of 117 bins | Any stated bin test fails at its threshold; or the `T=64` cross-arm mirror fails in ≥ 10% of bins | **supported** (statistical); dFT **proved** (round 2) |
| K4 | The integral FT `⟨e^{−σ}⟩ = 1` for every `T` (the involution sum, round 3); the estimator's variance is exactly `(E[e^{σ}]−1)/R` (round 3); the measurability boundary is `T* = 2.41` (variance 1) — beyond it the exponential average is dominated by rare draws and unreliable (the known rare-event failure, here exact); in the deep regime it collapses outright | `T=1`: `|⟨e^{−σ}⟩_R − 1| ≤ 4·std̂`, `std̂ = √((mean e^σ − 1)/R)` from the same runs (predicted `std̂ ≈ 0.039`, band ≈ ±0.16); `T=64`: **collapse** — estimate < 10⁻³ (predicted ≲ 10⁻³⁰: the deepest of 65536 draws sits at `σ ≈ 140.6 − 4.4σ_std ≈ 66`, so even it contributes `e^{−66}/65536 ≈ 10⁻³⁴`); the page exposes `T*(R)` and shows the unreliable regime (`T* < T ≲ 30`) live, unregistered | `T=1` outside its band; or the `T=64` estimate ≥ 10⁻³ (≈ 1 refutes the registered collapse) | **supported** (statistical); IFT + variance identity **proved** (round 3) |
| K5 | Coarse-graining loses the arrow (Q5): `E[σ_cg] ≤ E[σ]` (DPI via `σ_cg = −ln E[e^{−σ}|ξ]` and conditional Jensen, round 3), strict when driven — within-half hops carry ±ln 3 that the count process cannot see | Corner: `⟨σ⟩_c = 17.578 ± 0.564` (= 16 ln 3); anchor: visible crossings carry exactly `E[σ_vis] = 8.789` nats (half the arrow); deficit `⟨σ⟩_c − E[σ_cg] > 0`: seed-mean deficit > 3 standard errors of the 16-block structure and ≥ 15/16 blocks positive; **magnitude exploratory** (does `σ_cg` sit near the crossing anchor or near the full EP?); null corner: `σ ≡ 0` and `σ_cg ≡ 0` pathwise | Deficit ≤ 0 at 3 SE; or ≥ 2/16 blocks nonpositive; or the HMM golden vectors fail | DPI + identity **proved** (round 3); deficit sign **supported** (statistical); magnitude **exploratory**; null corner **verified** |
| K6 | The estimator story: `D̂_mean` is unbiased; the plug-in estimates the same quantity (sufficiency identity, round 3) with bias `(K̂−1)/(2R) ≈ 8.9 × 10⁻⁴` nats at (`T=64`, `R=65536`), ~75× below the CLT noise | `D̂_plugin − D̂_mean ∈ [−3σ̂_diff, (K̂−1)/(2R) + 3σ̂_diff]` at `T=64` (`σ̂_diff` = empirical block std of the difference, predicted ≲ 0.09); both reported against the exact 140.622 | The difference leaves the band (a systematically negative plug-in, or a blow-up) | sufficiency identity **proved** (round 3); **supported** (statistical) |
| C1 | Crooks/Jarzynski for a time-dependent protocol: with `ε(t) = t/16`, uniform stays stationary for every `t` (each `κ_t` doubly stochastic), so the inhomogeneous EP `⟨σ⟩ = Σ_t σ_step(ε(t))` has no transient term; Crooks `P_F(σ=s)/P_R(σ=−s) = e^s` with `P_R` the reverse-protocol law (own move-sums on both arms); Jarzynski is the IFT (ΔF = 0 on a torus — the drive stores no free energy), and its measurability is already covered by K4's boundary (`⟨σ⟩_ramp = 10.19` sits at `T*`) | `⟨σ⟩_ramp = Σ_{t=0}^{15} 2(t/16) ln((32+t)/(32−t)) = 10.193 ± 0.053`, std `4.549 ± 0.038`; Crooks bin test `n_F(s)/n_R(−s) = e^s` over populated 0.5-nat bins (both counts ≥ 10, ~18 bins over `|s| ≤ 4.5`): slope `1 ± 0.1`, ≥ 90% of bins in 3σ bands; the histograms cross at `s* ∈ [−1,1]` (the ΔF = 0 signature) | The mean leaves its band; or the slope/bin/crossing checks fail | **supported/refuted** (statistical); Lean **conjecture** until the time-inhomogeneous path law exists (round 3) |

### Assumptions, artefacts, measurability

- **Independence is the design choice, not an oversight**: it makes every
  distributional prediction exact (DP histogram, `Var`, the `(4/3)^{16T}`
  tilt), which is what gives the falsifiers numbers instead of fits.
  Interactions (exclusion, zero-range) break the exact histogram, add no
  registered claim here, and are deferred. The thermodynamic content — a
  NESS with a circulating current, `EP = affinity × current` — is the
  ring-colloid case in its exactly solvable discretisation.
- **Lattice artefact or physics?** The second law, the iff and the
  fluctuation theorems are physics of finite chains (lattice-free). The
  values (`σ_step`, the `1/B` anchor) are model numbers. Uniform
  stationarity for every drive is the torus saying that a nonconservative
  force stores no free energy: ΔF = 0, Jarzynski degenerates to the IFT,
  and the honest protocol content is the Crooks ratio and its crossing
  point. The 8-bit draw and the synchronous update are implementation
  facts; the schedule-reversal/weight-swap distinction is the real
  inhomogeneous content (C1).
- **Measurability boundaries (the answer to the title):** the mean
  log-ratio works at all `T` (error `σ_std/√R`, polynomial); the histogram
  route needs `R ≳ 10·e^{|s|}` per bin (exponential in the tested `|s|`);
  the exponential average needs `R ≳ E[e^{σ}] = e^{T·σ_step}` (exponential
  in `T`). The `T=64` mirror and the IFT beyond `T*` are exponentially
  unreachable — and both boundaries are themselves exact, pre-registered
  predictions (K3, K4).
- **Statistical honesty:** 16 blocks per arm; paired seeds across arms; the
  page states when a single run can go against the trend; nulls first —
  K2's bit-exact `σ ≡ 0` certifies the harness before any structured
  claim is read.
- **Float trust boundary:** tallies, DP tables and golden vectors bit-exact
  (integer model); `ln 3` products, the ramp sum and the HMM in f64 —
  goldens at tolerance 10⁻⁹; the null corner's `σ_cg ≡ 0` bitwise.

### Lean lane for 002 (round-3 worklist)

Proved already (round 1): `EP ≥ 0`; `EP = 0 ∀T ⟺` detailed balance;
`EP` = mean path log-ratio. Round 2 (in progress): `EP = T·σ_step` — with
the strict-positivity hypothesis relaxed to support symmetry (this model's
shape), and the detailed FT. To add for 002: per-walker doubly-stochastic
stationarity; unconditional support symmetry; the reversed chain realizes
`reversedPathPMF` (uniform `π`); the IFT; the variance identity
`E[e^{−2σ}] = E[e^{σ}]`; the sufficiency identity; the DPI with
`σ_cg = −ln E[e^{−σ}|ξ]`; the time-inhomogeneous path law (C1); the
strict-positivity two-liner; the exact DP as the contract's golden vectors.
Each claim mirrored in `Challenge.lean` for Comparator.

## Result

Not run. The predictions above are frozen at this commit (rule 4); this
section will hold the labelled outcomes with the results-JSON provenance.

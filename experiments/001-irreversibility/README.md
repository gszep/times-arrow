# 001-irreversibility

**How does irreversibility emerge from reversible, causal microdynamics?**
The HPP gas of `TimesArrow/LatticeGas.lean` (four velocity bits per site,
head-on pairs rotate 90°, step = stream ∘ collide, periodic `n × n`, Philox
seeds) is a bijection with a strict light cone. Any arrow its states show must
come from the initial condition and the partition, not the law. Literature:
`docs/background.md`, "Reversible lattice gases and coarse-graining (001)".
No published law predicts the packed-block relaxation of HPP (the literature
lane found none), so the entropy claims below are band-entry claims with a
justified deadline, not functional forms; the approach curve itself is
exploratory.

## Setup (pre-registered)

- `n = 1024` (power of two); seeds 1…16 (Philox key `(seed, 0)`); 16 paired
  runs per comparison; every parameter also lives in the page URL.
- `N = n²/8 = 131072` particles: per-slot density `p = 1/32`, per-site mean
  occupancy `1/8`.
- **Packed** initial state: the centred block of side `L = n/4 = 256` (sites
  `[n/2 − L/2, n/2 + L/2)²`), holding a uniform random `N`-subset of its
  `4L²` velocity slots (fill exactly 1/2; the interior starts locally
  equilibrated, so the entropy deficit is purely spatial concentration).
- **Null** initial state: a uniform random `N`-subset of all `4n²` slots —
  same particle number, same dynamics, same seed list. It differs from the
  packed start in two respects: the spatial profile (the variable under test)
  and the profile of the conserved per-row x-/per-column y-momenta; the
  second is derived in Assumptions to move the band by O(1) nat, ~100× below
  its half-width.
- **Observable:** `S_b(t) = Σ_blocks ln C(4b², N_block)` in nats, over the
  `b × b` partition aligned at `(0,0)`; `C` is the binomial coefficient,
  `N_block` the occupied velocity slots in the block, empty blocks contribute
  0. Primary `b = 16` (expected `N̄ = 32` per block, null hypergeometric
  σ ≈ 5.6); computed in f64 (`lgamma`) from exact integer block counts.
  Sampled at `t = 0`, then `t = 2^j ≤ 1024`, then every 128 steps, to
  `t_max = 32768`.
- **Null band:** `μ_b(t) ± 3σ_b(t)`, the mean and s.d. of the 16 null seeds
  at the same `t`. With 16 seeds, σ̂ has ~18% relative uncertainty; the
  margins below cover it. **No analytic `S_max` is assumed anywhere** — the
  band contains whatever invariants HPP turns out to have.
- **Echo:** `T_e = 16384` forward steps, then the exact inverse proved in
  Lean. Damage: XOR the east slot of site `(n/2, n/2)` at `t = T_e`.
  `H(r)` = XOR slot count between damaged and pristine trajectories at
  reverse depth `r`. The echo's `S_b` curve is sampled at reverse depths
  `r = T_e − t` for every forward sample time `t ≤ T_e`, so the reverse and
  forward curves align sample for sample; the S1 observables (`H`, damage
  support) are sampled at depths `r = 2^j ≤ 1024`, then every 128 steps to
  `r = T_e`. Contract vectors required before any run (the Lean lane exports
  them): golden input/output pairs for the forward `step`; for the exact
  inverse `collide ∘ stream⁻¹` (carrying the half-step convention); for
  `k`-step round trips (state → `k` steps → `k` inverse steps,
  `k ∈ {1, 2, 3}`, bit-for-bit identity); and for the flip-only reversal
  (`k` steps, flip, `k` flip-conjugated steps — the deterministic wrong
  answer, pinning the negative control). Both initial-state constructors
  (uniform `N`-subsets) are Philox-drawn and pinned in Lean and the contract
  before any sweep runs.

## Hypothesis (pre-registered)

| # | Claim | Prediction | Falsified if | Label it earns |
|---|---|---|---|---|
| L1 | `step` is a bijection with an explicit inverse, giving the exact echo protocol (the bare velocity flip conjugates the step to `stream⁻¹∘collide`, which is off by the collide/stream order; the exact inverse proved in Lean carries the half-step convention) | After `T_e` forward steps and the exact inverse, the initial state returns **bit for bit**: Hamming distance 0 over all `4n²` slots, and the reverse-phase `S_b` curve, sampled at `r = T_e − t`, equals the forward curve sample for sample | Any nonzero Hamming distance or any curve mismatch: an implementation error; nothing is promoted until it is fixed | **proved** (Lean); the pinned run earns **verified** only after the WGSL kernels reproduce the inverse, round-trip and flip-only golden vectors bit for bit |
| L2 | Particle number is conserved | `Σ_site mass(t)` is constant at every sample | Any drift: implementation error | **proved**; monitored |
| L3 | The state of any site at time `t` depends only on initial sites within torus distance `|dx|+|dy| ≤ t`; lattice light-cone speed 1 cell per step (stated on the page) | Damage support stays inside that diamond (S1a) | Any violation: implementation error | **proved**; **verified** in S1a |
| E1 | Entropy rises from the packed block into the null's band: `E[S_16(0)] ≈ 1.81 × 10⁵` nats (256 covered blocks, `E[ln C(1024, N_B)] ≈ 705.6` at `N_B` of mean 512), the band level is ≈ 5.7 × 10⁵ nats (unconstrained estimate, not a falsifier), and `S_16(t)` enters `μ̂ ± 3σ̂` by `t = 16384`; after its entry time `t*` it makes no downward excursion longer than 32 samples — a downward excursion being a maximal run of consecutive sampled times `t ≥ t*` with `S_16(t) < μ̂ − 3σ̂` (32 samples = 4096 steps on the ≥ 1024 part of the grid) — and is in band at `t_max` | Entry `t* ≤ 16384` in ≥ 15 of 16 seeds; the rise is large and monotone on average | `S_16(0)` differs from 1.81 × 10⁵ nats by > 1% (wrong initial state); or ≥ 2 of 16 runs fail the entry, excursion or final-band check. One failing run keeps the label with the failure reported — a single run can go against the trend | **supported** (statistical) |
| E2 | The rise is partition-robust. Per seed `i` (paired across partitions by the same packed run): `rise_i(b) = S_b^{(i)}(t_max) − S_b^{(i)}(0)`, predicted nondecreasing in `b ∈ {4, 8, 16, 32, 64}` in at least 15 of 16 seeds (the tightest adjacent gap, `rise(64) − rise(32) ≈ 2.5 × 10³` nats, is ~10²× the per-seed noise), with seed-mean ratio `⟨rise_i(64)/rise_i(4)⟩` ≈ 1.33 (hypergeometric-exact rise estimates 3.0, 3.7, 3.9, 4.0, 4.0 × 10⁵ nats; leading order `4n²[H(1/32) − (ln 2)/16] ≈ 4.0 × 10⁵` nats for every `b` — extensive entropy is partition-independent; finite-block Stirling corrections set the deviations — context, not falsifiers) | Per-seed ratios cluster near 1.33 (predicted s.d. ≈ 5 × 10⁻⁴ from equilibrium fluctuations, exact null `σ_S(4) ≈ 130` nats); monotonicity holds in ≥ 15 of 16 seeds; the page reports the 16 ratios, their bootstrap CI, and the paired counts against each edge | The seed-mean ratio leaves `[1.2, 1.5]`; or the per-seed s.d. exceeds 0.05 (100× the prediction — gross partition dependence); or monotonicity inverts in ≥ 2 of 16 runs | **supported** (statistical) |
| R1 | The exact echo recovers the state (L1 applied to the pinned run); **negative control:** the naive flip-only reversal, which lacks the half-step convention, does not recover | Exact inverse: Hamming 0 and `S_b` slides back to the packed value. Naive flip: final Hamming ≥ 1 (expected of order `2p(1−p)·4n² ≈ 2.5 × 10⁵` slots — full decorrelation). Chopard & Droz §2.5 assert the plain flip retraces; the half-step convention is the difference, and the Lean statement decides | Exact echo fails: implementation error (blocks promotion). The control recovering bit for bit: a negative-control result to report (does not touch L1) | exact echo **verified** once the inverse, round-trip and flip-only golden vectors reproduce bit for bit; control **supported/refuted** against the literature assertion |
| S1 | Echo sensitivity: one flipped bit destroys the macroscopic reversal. (a) damage support ⊆ torus diamond of radius `r` at every sampled reverse depth `r ≤ n/2 = 512` — on the torus the diamond self-overlaps beyond `n/2` (at the earlier `r = 700` it already covered ≈ 80% of the sites, making the check vacuous); (b) damage spreads: `H(512) ≥ 1000` XOR slots; (c) the trajectories decorrelate: `H(T_e)/4n² ∈ [0.05, 0.07]` — at full depth this compares the scrambled damaged state against the packed initial state, and the expected XOR fraction `(15/16)p + (1/16)(1/2) = 31/512 ≈ 0.0605` coincides with the independent-draw value `2p(1−p) = 0.0605`; (d) the arrow survives: `S_16` of the damaged reverse stays in band for all sampled `r ≥ 1024`, ending with undo fraction `U = (S_b(T_e) − S_b(final))/(S_b(T_e) − S_b(0)) ≤ 0.05` (pristine echo: `U = 1`) | All four hold on the paired runs; the fitted branching rate β̂ over `H ∈ [4, 10⁴]` is reported against the estimate `p(1−p)² ln 3 ≈ 0.032`/step | (a) violated: implementation error. (b), (c) or (d) failing in ≥ 2 of 16 runs. (b) failing at all would be a major negative result: damage heals in HPP and the Loschmidt reversal survives one bit | (a) **verified**; (b)–(d) **supported** (statistical); β̂ **exploratory** |

### Timing of the entropy rise (why 16384)

Collision probability per particle per step ≈ `p(1−p)² ≈ 0.0293` (an opposite
mover arrives and the cross slots stay empty), so free paths are geometric
with mean `λ = 1/(p(1−p)²) ≈ 34` steps — a constant per-step hazard, hence
memoryless: `E[ℓ²] = (2−q)/q² ≈ 2λ²`, not `λ²`. A collision switches the
particle to the perpendicular axis with a fair sign (the y-flip symmetry of
the ensemble), so the tagged flight is a renewal walk and `⟨r²⟩ = 4Dt` with
`D = E[ℓ²]/(4λ) ≈ λ/2 ≈ 17` cells²/step — equivalently Green–Kubo,
`D = ½∫₀^∞ P(survive t) dt = ½∫e^{−t/λ} dt = λ/2`. (A fixed free path of `λ`
would give `λ/4 ≈ 8.5`; the hazard is memoryless and the geometric variance
of `ℓ` doubles it. Back-of-envelope, not the Green–Kubo coefficient of
Hardy–de Pazzis–Pomeau 1976.) The slowest torus density mode relaxes in
`τ = n²/(4π²D) ≈ 1.6 × 10³` steps, and the ballistic diamond front reaches
every site by `t = 768` steps, the largest torus-diamond distance from the
block. The entropy deficit is quadratic in the mode amplitude — it starts at
`ΔS(0) = μ_16 − E[S_16(0)] ≈ 3.9 × 10⁵` nats — so while the mode-1 tail
dominates it decays as `e^(−2t/τ)`: crossing the 3σ band edge ≈ `1.3 × 10²`
nats (Assumptions) takes `t* = (τ/2)·ln(ΔS(0)/3σ) ≈ 6.3 × 10³` steps. That
is an upper estimate — deficit shed into faster modes enters earlier; only
the mode-1 residue has to cross. `T_pred = 16384 ≈ 10τ` keeps ≈ 2.6× margin
over it; `t_max = 2 T_pred`.

### Assumptions, invariants, artefacts

- **Checkerboard parity** (literature, Wolf-Gladrow §3.1.1): `(x+y+t) mod 2`
  labels each particle for life; the two populations never collide with each
  other and their numbers are separately conserved. Both ensembles are
  slot-symmetric, so each population carries per-slot density `p`, and
  block-total statistics match the unconstrained ones to `O(b²/n²)`; the
  registered observable is insensitive to the invariant. The parity is a
  lattice artefact (it would not survive a continuum limit); the rise is not.
- **Row/column momentum (conserved exactly; Lean proof pending):** collide
  preserves `n_E − n_W` and `n_N − n_S` at every site (the only moved
  states, `0101 ↔ 1010`, have both zero), E/W movers stay in their row and
  N/S movers cross rows carrying `n_E − n_W = 0`; so per-row x-momentum and
  per-column y-momentum are invariants (the mirror argument gives the
  columns). The packed start and the null thus also differ in their momentum
  profiles — block rows `σ ≈ 11.3`, other rows exactly 0, against the null's
  `σ ≈ 7.9` everywhere — and, being conserved, the difference cannot relax
  away. Its effect on the band is derived, not asserted: per site the block
  content `n_E + n_W` and the momentum content `n_E − n_W` are uncorrelated
  (`Cov = 0` identically), so the Gaussian order vanishes and only the
  second-order momentum tilt remains; it shifts block means by
  `|ΔN_B| ≤ 0.38 ≪ σ_block = 5.6` with `Σ_B ΔN_B = 0`, so `E[S_16]` moves
  only through the curvature of `ln C`, by ≈ −1.5 nats (`σ̂_16` by a
  comparable amount) — O(1) nats against the `3σ ≈ 1.3 × 10²`-nat band
  half-width, which is why no momentum-matched null is registered. The sweep
  records per-row and per-column momentum series as an exploratory
  diagnostic.
- **Band width (microscopic):** in `Σ_B ln C(4b², N_B)` the linear term
  cancels because `Σ_B N_B = N` is fixed, so `S_b − μ_b` is quadratic in the
  block-count deviations: `S_16 − μ_16 ≈ −(1/2)|c₂|·Σ_B δ_B²` with
  `c₂ = d²/dN² ln C(1024, 32) ≈ −0.032` — a `χ²_{B−1}`-scale fluctuation of
  `σ_S ≈ 45` nats (exact bivariate hypergeometric: 44.9), band half-width
  `3σ ≈ 1.3 × 10²` nats. The band itself stays the empirical `μ̂ ± 3σ̂` of
  the 16 null seeds; with 16 seeds `σ̂` carries ~18% relative uncertainty,
  which the margins cover.
- **Lattice artefact or physics?** L1, L2: exact combinatorial facts of the
  model (physics: reversibility and conservation; nothing lattice-specific).
  L3: the diamond shape is a lattice artefact; a finite causal speed is the
  physics. E1: the rise is generic statistical mechanics and should survive
  a continuum limit in form; `D`, τ and the entry time are lattice-specific
  numbers. E2: partition dependence is the physics of coarse-graining (Q5);
  the Stirling correction is a finite-size effect. R1, S1: the instability is
  the lattice analogue of Lyapunov divergence in hard-sphere gases (physics);
  β is a model-specific number.
- **Nulls per metric** (each differs from the test in as few respects as
  possible, and every extra respect is derived negligible). E1, E2: the
  uniform `N`-subset null — same dynamics, same seeds; two respects differ,
  the spatial profile (tested) and the momentum profile (O(1) nat, above).
  R1: the naive flip-only reversal (inverse protocol). S1: the pristine
  same-seed echo (the flipped bit). L2, L3: exact checks against Lean; a
  deviation is an implementation error, not statistics.
- **Float trust boundary:** exact checks (echo, Hamming, cone, conservation)
  are bit-level; `S_b` is f64 computed from exact integers, per the contract.
- **Statistical honesty:** 16 paired runs; every criterion reports the count
  of paired wins/failures, and the page says when a single run can go against
  the trend. Equilibrium-level numbers quoted above are unconstrained
  combinatorial estimates (nats, `log = ln`), not falsifiers.

## Result

The full registered ensemble — 16 packed + 16 null paired seeds, `n = 1024`,
`tMax = 32768`, `tE = 16384` — ran headless on Artemis at commit `6af4454`
(NVIDIA RTX 5000 Ada, Lovelace, hardware adapter; `results/artemis.json`,
`dirty: false`, scored by the committed scorer into
`results/artemis.score.json`). Two registered predictions are **refuted**;
the exact claims are verified; E2 and the R1 control are supported.

### Refuted

**E1 — the packed block never enters the null band.** The initial state is
as registered (seed-mean `S_16(0)` = 1.806 × 10⁵ nats, −0.20% off), but the
entry check fails in 16 of 16 seeds (registered: ≥ 2 refutes): no seed ever
enters μ̂ ± 3σ̂, and none is in band at `t_max`. The gas does not relax to
the uniform-Bernoulli level (μ̂₁₆ = 5.704 × 10⁵ nats, flat at every sampled
t and at every phase). It settles instead into an undamped statistical limit
cycle of period 512 steps = `n/2`, phase-locked across all 16 seeds
(seed-to-seed spread ≤ 0.2%, within-phase wander s.d. 540–920 nats), with
16-seed-mean `S_16` levels 3.342, 4.565, 5.202, 4.564 × 10⁵ nats at
`t mod 512` = 0, 128, 256, 384. Even at the cycle maximum it stays
5.0 × 10⁴ nats (≈ 390 half-widths, 3σ̂ ≈ 130) below the band. The seed-mean
rise is large (1.81 × 10⁵ → 3.34 × 10⁵ nats) but not monotone on average:
126 decreases over 259 samples — the cycle.

**S1(c), (d) — one flipped bit does not destroy the reversal.** The bundle
(b)–(d) is refuted: (c) and (d) fail in 16 of 16 runs. (b) passes
(H(512) = 3.05–3.64 × 10⁴ ≥ 1000 in 16/16). But the damage does not
decorrelate the state: `H(r)` saturates at ≈ 1.02 × 10⁵ XOR slots
(`H(T_e)/4n²` = 0.0244–0.0247, outside [0.05, 0.07] in 16/16), growing in
steps at `r` = 512, 640, 1024 — the ballistic self-intersection depths of
the torus — with near-constant plateaus between them, not exponentially.
The damaged reverse follows the pristine one: it is out of band at all 124
sampled depths `r ≥ 1024` and ends at undo fraction U = 0.226–0.231
(registered ≤ 0.05; the pristine U = 1 exactly): the echo recovers three
quarters of the entropy drop despite the flipped bit. β̂ = 0.016/step
(exploratory; reference 0.032) over `H ∈ [4, 10⁴]`, but the growth
decelerates, so the exponential fit is a poor model of it.

### Verdict table (the committed scorer's output)

| # | Claim | Registered criterion | Measured | Label |
|---|---|---|---|---|
| E1 | entropy entry | `S_16(0)` within 1%; entry ≤ 16384, excursion ≤ 32 samples, in band at `t_max`; ≥ 2 of 16 failing refutes | `S_16(0)` = 1.806 × 10⁵ (−0.20%); entry never 0/16, in band at `t_max` 0/16 | **refuted** |
| S1 | echo sensitivity | (a) support ⊆ diamond; (b) H(512) ≥ 1000; (c) H(T_e)/4n² ∈ [0.05, 0.07]; (d) in band from r = 1024 and U ≤ 0.05; (b)–(d) failing in ≥ 2 of 16 refutes | (a) worst slack 0; (b) 16/16; (c) 0.0244–0.0247 in 0/16; (d) out of band 124/124 depths, U = 0.226–0.231 | (a) **verified**; (b)–(d) **refuted**; β̂ 0.016/step **exploratory** |
| L1 | exact echo | Hamming 0 over 4n² slots; reverse `S_b` = forward sample for sample | 0 in 16/16; 0 mismatches over 2112 aligned depths | **verified** (proved in Lean) |
| L2 | particle number | constant at every sample | 0 of 32 runs drift (the damaged twin carries N ± 1) | **verified** (proved) |
| L3 | light cone | damage support inside the torus diamond for r ≤ n/2 | worst slack 0 at every sampled r ≤ 512 | **verified** (proved) |
| E2 | partition robustness | ratio ∈ [1.2, 1.5]; s.d. ≤ 0.05; monotone in b; inversion in ≥ 2 refutes | mean 1.2484, s.d. 1.03 × 10⁻³, monotone 16/16, every edge 16/16 | **supported** (statistical) |
| R1 | reversal and control | exact echo Hamming 0; the flip-only control must not recover | exact 0 in 16/16; control Hamming 2.071–2.077 × 10⁵ (≥ 1) | exact **verified**; control **supported** |

### Statistics

- Every comparison is paired (same seeds, same grid, same code path; only
  the variable under test changes). All decisive counts are 16/16 or 0/16,
  each with two-sided sign-test p = 2 · 2⁻¹⁶ = 3.1 × 10⁻⁵. The registered
  one-run allowance was never needed: every pass and every failure is
  unanimous.
- Null band: μ̂₁₆ = 5.7044 × 10⁵ nats, flat at every sampled `t` (no phase
  dependence); 3σ̂ = 87–146 nats over the tail samples. Within one null
  seed over time, the s.d. is 45.6 nats — the registered exact
  hypergeometric 44.9, as predicted.
- E2: per-seed ratios 1.2464–1.2499 (all 16 on the page); mean 1.2484,
  s.d. 1.03 × 10⁻³, bootstrap 95% CI [1.2479, 1.2489] (10⁴ resamples) —
  inside the registered [1.2, 1.5]. Mean rise by `b`:
  +1.33, +1.48, +1.54, +1.58, +1.66 × 10⁵ nats (the registered estimates
  3.0–4.0 × 10⁵ assumed the rise reaches the null level; the stunted rise
  kept its partition shape).
- Monitored invariants: per-row x- and per-column y-momentum never deviated
  (momDev = 0 over all 32 runs, 8320 samples), consistent with the proved
  `momentum_conserved`; the profiles are recorded in the results JSON.

### Lattice artefact or physics?

- L1–L3, R1 exact echo: physics of the model (reversibility, conservation,
  causality); the diamond shape is the lattice bit. The flip-only control's
  ≈ 2.1 × 10⁵ differing slots is an order-level match to the registered
  `2p(1−p) · 4n²` estimate.
- E1 refuted: the cycle's period is a lattice number (the ballistic wrap of
  the 1024-torus as seen by a 16-divisible block partition, at half-period
  512); the failure of the molecular-chaos assumption behind the registered
  D and t* is a property of HPP at this density. The registered checkerboard
  parity (two non-communicating sublattice gases, Wolf-Gladrow §3.1.1) is
  consistent with the observed coherence but does not by itself force the
  cycle. Conjecture, for judgment: the block emits four coherent ballistic
  beams; head-on partners can meet only inside scheduled time windows set
  by the torus geometry, so collisions stay coherent instead of Poisson-like
  and the beams never disperse.
- E2 supported: partition robustness of the rise is the physics of
  coarse-graining; 1.2484 sits inside the registered window but below the
  1.33 point prediction, which assumed the rise reaches the Bernoulli level.
- S1(c), (d) refuted: the "one bit scrambles the reversal" picture assumed
  exponential damage branching in a collision-rich gas. The measured gas is
  collision-poor and scheduled: the damage saturates at 2.4% of slots and
  the reversal survives to U = 0.23. Whether this robustness would survive
  a continuum limit — or is a finite-density lattice effect of sparse,
  geometrically scheduled collisions — is open.

### Surprises (unregistered, exploratory)

- The period-512 limit cycle: undamped over the last ~28,000 steps (≈ 550
  nominal collision times λ = 34), phase-locked across 16 independent
  initial subsets, same period and phase at every `b ∈ {4 … 64}`. The null
  ensemble shows no cycle at any phase.
- The damage staircase: `H(r)` plateaus between the ballistic
  self-intersection depths `r` = 512, 640, 1024, then sits at
  ≈ 1.02 × 10⁵ slots for the remaining ~14,000 reverse steps.
- The damaged reverse tracks the pristine reverse curve through the whole
  reverse phase (the page's echo plot); it peels away only near full depth,
  ending 23% — not ≤ 5% — of the way down the entropy drop.
- The null ensemble's within-seed temporal s.d. (45.6 nats) matches the
  registered σ_S = 44.9 to 1.5%.

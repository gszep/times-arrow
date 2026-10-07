# 003-lightcone-speedlimit

**When is transport dissipation-limited, and how tight are the two envelopes?**
(issue #9; Q3). For this synchronous nearest-neighbour chain, speed is
`v = 1` cell/step and the candidate composition is

> `W₁(p₀,p_t) ≤ min(t, E_diss(t))`,
> `E_diss(t) = Σ_{s<t} √(a σ(s))`.

This inequality follows from the cone and the traffic inequality; it is a
mathematical consistency check, not a refutable empirical physics claim.
Its Lean formalization is **conjecture** until proved. The empirical
**conjectures** here are finite-horizon tightness and a held-out crossover
prediction. Their centres are closed-form branches or a training-only fit,
not the exact answer for the arm being tested. No claim of a fundamental
priority of dissipation over causality, or of Lorentz invariance, follows.
The literature-absence statement “no published bound combines these” is a
**conjecture**, not established novelty (`docs/background.md`).

## Setup (pre-registered)

- Periodic `n = 1024` square, `m = 65536` walkers/seed, `R = 256` seeds,
  `T = 512`. Seeds 1…256, 16 blocks of 16; all arms paired by seed and
  walker. `q_N = q_S = 0`: y is identically zero. The active chain is 1D,
  embedded in 2+1 dimensions. Here `T = n/2`, not `n ≫ T`: the localized
  packet cannot complete a lap or go beyond the antipode before the last
  observation. Its largest mean displacement is 508 cells. Periodic
  coordinate wrap is allowed; it is not a cone escape. These parameters
  permit near-causal tightness without the small-torus lap confound.
- Deterministic start: `j ≡ 0 (mod 64)` starts at `x₀ = (j/64) mod n`;
  all other walkers at 0; all y at 0. Thus
  `p₀ = A δ₀ + ε u`, `A = 63/64`, `ε = 1/64`: 64513 walkers in column
  zero, one in each other column. The uniform component is stationary in
  the probability law, not in each finite empirical sample.
- Weights are integers in 256ths. `ρ = ln(e/w)`, `a = (e+w)/256`,
  `μ = (e−w)/256`, `σ_step = μρ`, `δ = 1−√(a μρ)`.

  | arm | (e, w, stay) | μ | √(a μρ) | role |
  |---|---|---|---|---|
  | calm | (64,64,128) | 0 | 0 | null: drive off at fixed activity |
  | w5 | (123,5,128) | 0.4609375 | 0.85914665 | crossover training |
  | w4 | (124,4,128) | 0.4687500 | 0.89712917 | crossover training |
  | wind | (125,3,128) | 0.4765625 | 0.94271837 | dissipative branch |
  | c2 | (126,2,128) | 0.4843750 | 1.00170627 | causal branch |
  | max | (255,1,0) | 0.9921875 | 2.34477556 | causal-tightness anchor |
  | h8 | (120,8,128) | 0.4375000 | 0.76966615 | held-out prediction |

  Plus `windXOR`: E↔W at step 1 only. It is a paired damage control, not
  an eighth tightness test. `max` changes activity as well as drive; it
  is not an activity-controlled comparison with the half-lazy arms.
- One dynamics source: the hop thresholds and Philox `(walker,step)`
  stream in `src/walk.ts`, with draws at steps 1…512. Implementation
  prerequisite: generalize that shared module's **8-bit coordinate
  packing** to represent 1024 columns, and pass 002's goldens unchanged.
  Add `initProfile` and column occupancies, including pre-hop occupancies
  at every step. No separate 003 dynamics kernel. Window occupancy sums
  are batched into one readback; use per-seed integer buffers and f64 host
  pooling to avoid overflow. `â = hops/(R m w)` is random except in `max`,
  where `â ≡ 1`; only `E[â] = a` in other arms.

### Observables and estimator contract

`Ŵ_r(t)` is the **circle** W₁ from the deterministic start to seed r's
empirical column distribution. Form cumulative integer count differences
`c_x`; compute `Σ_x |c_x − median(c)|/m`. Optimize the median for every
sample, not just the population distribution. `W̄₁ = R⁻¹Σ_r Ŵ_r`.
The theoretical identity is `W₁(p₀,p_t) = A E[dist_circle(0,X_t)]`;
the empirical mean has an additional finite-count bias. The rational
calm goldens at t=1,2,3 are `63/128`, `189/256`, `945/1024`.

The raw empirical edge ratio is **not** a usable EP estimator here:
at s=0 a background reverse edge has only 3 expected counts in `wind`,
1 in `max`. Positive theoretical flux does not prevent sampled zeros;
an infinite raw log-count EP is not an implementation error.
Use the **model-assisted occupancy estimator**, with the registered q:

```
p̂_k(x) = Σ_{r,s in window k} count(r,s,x) / (R m w_k)
F̂_k(x) = q_E p̂_k(x),   R̂_k(x) = q_W p̂_k(x+1)
σ̂_k = Σ_x (F̂_k − R̂_k) ln(F̂_k/R̂_k)
Ê(t) = Σ_{k: end_k≤t} w_k √(a σ̂_k)
```

This estimates the flux EP conditional on the known transition law;
it does not independently estimate unknown rates. Actual edge counts and
`â` remain diagnostics. Windows are `[s,s+1)` for s=0…23, `[24,32)`,
then 32-step windows through 512. `t̂×` is the first positive-to-nonpositive
crossing of `Ê(t)−t`, linearly interpolated **on all window endpoints**;
the equality at t=0 is excluded. Missing crossing is `+∞` for scoring.
The s=0 occupancy estimator is deterministic, with no sampling variance.
For pooled occupancy a zero site has probability at most `exp(−256)`;
any such event is reported as a statistical failure, never silently clipped.

**One η denominator:** `η̂(t) = W̄₁(t)/D(t)`,
`D(t) = min(t,E_diss(t))`, with the *exact-chain per-step* `E_diss`.
`Ê` is used only for crossover and pipeline checks. Windowing changes
the wind crossing from 44.73715 to 43.57940; it is not a correction to η.
Display grid: `{0,1,2,3,4,8,16,24,32,64,128,256,384,512}`.

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

The lock is commit `56b6ad1`, before the h8 calculation. Numerical
evaluation gives `C_fit = 2.4401213499`, `t_h = 10.5938460336`,
`b_h = 0.5595465811`. The occupancy measurement contract above repairs
the raw-count estimator's singularity; the locked predictions and
tolerances are unchanged. No real-system simulation has run.

### Refutable physics claims

All three rows are **conjecture** until a validated WebGPU run, then
**supported/refuted (statistical)** at the stated finite horizon. Passing
does not establish a universal asymptotic or continuum law.

| # | Prediction, criterion and tolerance | Size under the registered exact law | Alternative distinguished |
|---|---|---|---|
| C3 | Held-out `t× ∝ δ⁻¹`: reject if `\|t̂×_h8 − 10.5938460336\| > 1.5890769050 + 0.25 = 1.8390769050` steps. Training uses w5,w4 only; no fitting on h8. | ≤1/4096 = 0.000244141, full-pool rank sizing below | `t× = 17.167(δ_w5/δ)²` predicts **6.41967765** steps at h8; outside the acceptance interval [8.75477,12.43293]. |
| C4 | Calm relaxation at t=512 tracks the dissipative scale: centre `1/√π = 0.5641895835`; reject if `\|η̂_d−1/√π\| > 0.040 + 0.001 = 0.041`. The cone still applies; its envelope binds only during the initial transient (population crossing 2.820997). | ≤0.001, plus ≤10⁻⁶ calibration-certificate risk | Saturation of the dissipative envelope (`η_d=1`) or the weak-drive ballistic constant `A/√2≈0.6961`; neither is compatible with this interval. |
| C5 | At t=512 test **the branches themselves**: `b_d(ρ)=A√(tanh(ρ/2)/ρ)` for w5,w4,wind,h8 with tolerance `0.006+0.0001=0.0061`; `b_c=Aμ` for c2,max with tolerance `0.0001+0.0001=0.0002`. Reject each arm on an absolute deviation beyond its tolerance (6 sub-tests). | ≤0.001 each, plus ≤10⁻⁶ calibration-certificate risk each | h8 distinguishes a constant branch fixed at w5 (**0.52812328**); w4/wind also fall outside that constant's tolerance. Causal arms distinguish continuing `b_d` without switching envelopes: **0.47599447** at c2, **0.41653649** at max. |

The tolerance is explicitly **model discrepancy + sampling allowance**.
The dissipative formula follows from `W₁≈A μt`,
`E_diss≈t√(a μρ)`, and `μ/a=tanh(ρ/2)`. Transient excess EP and finite ε
make a finite-t test of exact equality inappropriate. The fitted inverse-δ
law approximates the integrated transient lead by a constant; it is not
a theorem, and h8 can falsify it without refitting C. The formal bound
alone predicts neither tightness nor this approximate crossover law.

### Finite-size and finite-count sizing

The exact chain is `p_{s+1}(x)=q₀p_s(x)+q_Ep_s(x−1)+q_Wp_s(x+1)`.
Population values below come from this recurrence. Empirical η means
come from 20,000 independent exact-law endpoint samples **per arm**:
64512 draws from `K_512`, plus one independently shifted draw for each
of the 1024 uniform-start walkers; circle W₁ recomputed by the median.
No GPU, Philox, or unknown dynamics is simulated. Seed 731903 per arm.

| arm | branch centre | population η | MC E[η̂] | MC sd(η̂), R=256 | certified upper bound on branch discrepancy |
|---|---|---|---|---|---|
| calm | 0.56418958 | 0.52897749 | 0.53030765 | 9.964×10⁻⁵ | 0.034024 < 0.040 |
| w5 | 0.52812328 | 0.52422901 | 0.52427552 | 6.665×10⁻⁶ | 0.003856 < 0.006 |
| w4 | 0.51433595 | 0.51076279 | 0.51080688 | 6.301×10⁻⁶ | 0.003537 < 0.006 |
| wind | 0.49762074 | 0.49439922 | 0.49444052 | 5.950×10⁻⁶ | 0.003188 < 0.006 |
| c2 | 0.47680664 | 0.47680664 | 0.47684451 | 5.547×10⁻⁶ | 0.000045 < 0.0001 |
| max | 0.97668457 | 0.97668457 | 0.97668446 | 1.356×10⁻⁶ | 0.000007 < 0.0001 |
| h8 | 0.55954658 | 0.55477569 | 0.55482885 | 7.718×10⁻⁶ | 0.004727 < 0.006 |

In particular, c2's centre is **0.476806640625**, not a rounded empirical
expectation. The estimated empirical offset +0.00003787 is covered by
its model tolerance. The table's discrepancies are reported, not
subtracted from observations to make the branch pass.

**Analytical size, not estimated-sd normal tails.** Changing one independent
hop draw changes an endpoint by at most 2 cells and W̄₁ by at most
`2/(Rm)`. Bounded differences therefore gives
`Pr(|W̄₁−E W̄₁|>h) ≤ 2 exp(−Rm h²/(2T))`.
For α=0.001 the sufficient η half-width is
`sqrt(2T ln(2000)/(Rm))/D`: 0.00090688 for calm and at most 0.00005420
for a driven arm. The registered 0.001 / 0.0001 allowances exceed these,
and exceed `4.12·sd` (more than 1.25× a 3.29σ band) on every arm.
No normality, skew correction, or fitted variance is needed for size.

The same inequality for the 20,000-replicate MC mean gives a two-sided
10⁻⁶ certificate radius
`sqrt(2T ln(2×10⁶)/(20000m))/D`: 0.000141753 for calm, at most
0.000008471 otherwise. The final column adds this radius to the absolute
MC discrepancy, rounding upwards. Its seven certificate failure
probabilities are included in the FWER. The numerical recurrence and
sampling arithmetic are f64, not a formal interval-arithmetic proof.

### Direct full-pool validation and nonlinear sizing

Exact-law occupancy sampling preserves the deterministic constructor:
given column count C at each step, draw
`E~Bin(C,q_E)`, `W~Bin(C−E,q_W/(1−q_E))`, and transport the remaining
stay counts. This is the full joint count law, including temporal
correlations, without iterating individual trajectories. BTRS/inversion
binomial sampling in TypeScript was checked against its analytical
means/variances at background and packet counts (100,000 draws each).

For **wind**, direct nonlinear full-pool MC used `Rm=16,777,216`,
256 replicates, seed 731903, all 512 steps. An independent reduced-pool
calculation used 65,536 walkers, 1024 replicates, seed 731904, the same
deterministic profile, and the full derivative of the occupancy EP:
`∂[(F−R)ln(F/R)]/∂F = ln(F/R)+1−R/F`,
`∂/∂R = −ln(F/R)+1−F/R`. Its sd is divided by 16 for comparison.
The 4096-walker random-start/frozen-log construction is not used: it
changes the constructor and omits terms in the estimator's derivative.

| statistic | reduced sd, scaled to full pool | direct full-pool sd | ratio |
|---|---|---|---|
| t̂× | 0.047543 | 0.045716 | 0.962 |
| Ê(512) | 0.0026258 | 0.0025219 | 0.960 |
| σ̂ at s=1 | 0.0106916 | 0.0104068 | 0.973 |
| σ̂ at s=2 | 0.0055137 | 0.0063043 | 1.144 |
| σ̂ in [480,512) | 4.7451×10⁻⁷ | 5.0708×10⁻⁷ | 1.069 |

These observed ratios fit within 1.25; 256 replicates are not a tail
certificate. Direct biases relative to windowed population values are
`+0.00930` steps, `+0.000648` in Ê(512), and `+1.068×10⁻⁶` in the last
σ̂. Bias cannot be declared negligible by comparing to a generic band:
`2n/(Rm w)` is 0.0001220703 at w=1 and 0.0000038147 at w=32; it was
35% and 61% of the quoted max-fine and calm-last bands, respectively.
It is not an established upper bound for either nonlinear estimator.
No size calculation here uses it. Window correlation also prevents
silently treating all `Rm w` crossings as independent observations.

**Full-pool reference for C3 and P.** 4095 independent h8 occupancy
replicates at the full pool, steps 0…24, seed 731905, using the nonlinear
estimator above. The population crossing is 10.2694847413; it differs
from the locked prediction by −0.3243612923, inside the locked 15%.
It lies in the single-step window range, so there is no windowing bias.
The MC crossing mean is 10.2701799220, sd 0.01320450, range
[10.2226250100,10.3138241840]. Its maximum absolute error about the
population crossing is **0.0468597314 < 0.25** steps.

The reference sample sets a rank-protected noise allowance
`r = max(0.25, max_i |t̂×_i−t×_population|) = 0.25`.
For a new independent draw, the probability of exceeding the maximum of
4095 iid reference deviations is ≤1/4096 (ties conservative). Under
the model-tolerance null, the triangle inequality makes C3's rejection
event a subset of this noise event. This is a **marginal** finite-MC
size guarantee over reference plus experimental randomness, not a claim
of conditional 0.001 coverage for every possible frozen calibration.
The reference is fixed before observing the experiment, never redrawn
after a failure. Its allowance exceeds 4.12 times its full-pool sd.

### Harness, identities and pipeline checks

| # | Contract / criterion | Status and error budget |
|---|---|---|
| M1 | Existing 002 hop/Philox goldens; new profile, occupancy, window sums and rational circle-W₁ goldens; randomized differential checks vs Lean; y=0; total mass; max's hop activity=1. | Bit-exact gates, size 0; **verified** only after they pass. No result promoted before these and P. |
| C1 | Every walker's circle displacement from its own start ≤t; W̄₁≤t. | Induction/transport lemma **conjecture → proved** in Lean; run **verified** bit-exact. No z-score or sampling test. |
| C2 | Population `W₁≤min(t,E_diss)` on the display grid for the seven base arms. Edge flux transports p_s to p_{s+1}; `(F−R)ln(F/R)≥(F−R)²/(F+R)` and Cauchy–Schwarz imply `(Σ\|J\|)²≤aσ`; then sum over steps. | Written argument, Lean **conjecture → proved**. Numerical violation flags arithmetic/model formalization; it does not refute a theorem empirically. Empirical W̄₁ has sampling bias and is not substituted into this population theorem. |
| U1 | If `a_cone` means activity at locations inside each trajectory's own radius-vs cone, `a_cone=a`. | **Negative result for this reading only**: trajectory induction, **conjecture → proved**. This does not close #9 open problem 1 for conditional, boundary, common-origin or other definitions of cone-restricted activity. |
| F1 | A one-sided nonzero population edge has +∞ flux EP; the registered full-support law has none. Max has period-2 packet parity and ε-dependent per-step EP, so coarse windows smear it. | Front lemma **conjecture → proved**; finite sampled zero counts are statistical, not a counterexample. The max dissipative envelope is diagnostic. |
| X1 | Same-draw step-1 mirror damages exactly draws in [3,125): `x_XOR=x_wind−2 I_damage` modulo n forever; damage never grows/heals. Total damaged `7,995,392 ± 8,429`. | Identities **verified** after integer checks, lemma **conjecture → proved**. Count is one statistical check, Bernstein size ≤0.000415, budget 0.001. |
| T1 | Eight cumulative E−W totals at T=512 and one wind s=0 hop-activity count, bands below. Blocks are displayed, not separately tested. | Nine statistical checks, each Bernstein size ≤0.000415, budget 0.001. **supported/refuted (statistical)**. |
| P | h8 pooled σ̂ at s=1 and s=2, and Ê(24), a **single omnibus** test with the fixed population centres and rank-protected box below. | Pipeline **supported/refuted (statistical)**, size ≤1/4096. Failure blocks physics promotion but is not proof of a bug. |

T1 is a three-point increment sum, not generally binomial. With
`L=RmT`, its mean is Lμ, variance `V=L(a−μ²)`, and each centred
increment is bounded by `b=1+|μ|`. Use `h=ceil(4.12√V)` and
`Pr(|S−ES|>h)≤2exp[−h²/(2(V+b h/3))]`. For windXOR the mean is
`(L−2Rm)μ`; variance is unchanged. X1 and activity are binomial; the
same inequality with b=1 applies. All half-widths exceed 1.25×3.29σ.

| statistic | exact mean | half-width |
|---|---|---|
| calm tally | 0 | 270,009 |
| w5 tally | 3,959,422,976 | 204,757 |
| w4 tally | 4,026,531,840 | 202,155 |
| wind tally | 4,093,640,704 | 199,474 |
| c2 tally | 4,160,749,568 | 196,711 |
| max tally | 8,522,825,728 | 47,638 |
| h8 tally | 3,758,096,384 | 212,122 |
| windXOR tally | 4,077,649,920 | 199,474 |
| wind s=0 hop count | 8,388,608 | 8,438 |

P centres are `(3.4401988985, 2.2425826092, 21.0661460650)`, with
base half-widths `(0.045, 0.025, 0.015)`. Let `Z` be the maximum of
the three absolute deviations divided by these widths. These widths
are locked before a separate set of 4095 full-pool reference draws,
seed 731906; the seed-731905 pilot is not reused to calibrate a score
whose widths it informed. Reject if `Z > max(1,max Z_i)`. The
independent reference maximum is recorded below when calculated.
The rank proof gives size ≤1/4096 for this
**whole box**, without assuming independence of its components or
normality. Its widths exceed 4.12 times the measured full-pool sds
`(0.00994413, 0.00523508, 0.00269516)`. Nonlinear bias is included in
the reference law, not bounded by `2n/(Rm w)` or silently ignored.

### Enumeration, scope and review contract

- **19 statistical tests:** C3=1; C4=1; C5=6; X1=1; T1=9; P=1.
  C4+C5 allocate 7×0.001; X1+T1 allocate 10×0.001; C3+P allocate
  2/4096. Add seven 10⁻⁶ mean-bias certificate risks. Bonferroni gives
  **FWER ≤0.01749528125 < 1.75% < 5%**, without independence across
  arms/tests. A pooled-occupancy zero anywhere on the seven base arms
  adds at most `7·1024·513·exp(−256)<2.5×10⁻¹⁰⁵`.
- These are sizes under ideal independent hop draws of the registered
  exact law; bit-exact Philox validation does not prove iid randomness.
  MC/rank guarantees likewise assume independent calibration draws.
  No fitted-sd Gaussian tail is part of the error budget.
- The training crossings (w5=17.16748, w4=23.93471), wind/c2 envelope
  classifications, η at other times, block means and σ's transient
  profile are **diagnostics**, with no accept/reject rule or implied α.
  In particular `σ(s)≈σ_step+1/(2s)` is an untested **conjecture** in an
  intermediate spreading regime; full-support finite-torus relaxation
  and max's parity prevent asserting it for every arm/asymptotic limit.
- **Lattice scope:** finite speed here is imposed by synchronous hopping.
  The values, branch relation μ/a=tanh(ρ/2), ε-cliff and crossover fit
  belong to this lattice family. A continuum limit must scale space,
  time and rates explicitly; no Lorentz-invariant or lattice-free
  universality is claimed. U1's own-trajectory reading extends by its
  stated induction to other finite-speed systems. Damage's no-spread
  is independence, not a general statement about interacting systems.
- **Float trust boundary, to appear verbatim on the page:** “The GPU
  computes integer positions and counts only. W₁, σ̂, Ê, η and E_diss
  are evaluated in host f64; ordinary per-operation rounding is of order
  10⁻¹⁵ relative, not f32-level estimator noise. Accumulated arithmetic
  error is distinct from finite-count bias and sampling error.” Counts
  remain below 2⁵³ after host pooling. Exact-chain f64 recurrence and
  logs are checked against rational goldens at t=1,2,3 and numerical
  mass conservation; require aggregate agreement within 10⁻¹⁰, well
  below these bands. This is an explicit numerical trust boundary.
- Null first: M1/T1 and calm before interpreting driven physics; P is
  the pooled-estimator gate. Run all registered tests once; report every
  failure and single-run reversals of a trend. Do not retune/retry seeds.
  Page: hypothesis, live W₁ vs both envelopes, locked predictions and
  discrepancy budgets, all criteria, assumption/status panel and f64
  note. Every parameter in URL; window probe returns numerical checks.
  Headless sweeps use a hardware-adapter guard, shared tier-0 WGSL,
  batched readback and device-loss checks. Save commit, parameters,
  seeds, adapter, counts/observables and all verdicts to results JSON.

### Lean lane

Formalize the trajectory cone and U1's precisely scoped activity; the
W₁ coupling/triangle bound and circle median formula; extended-real
front EP; traffic and net-flux transport inequalities; the damage
identity; and support symmetry when q_N=q_S=0. Claim statements go in
`TimesArrow.Claims` and `Challenge.lean` together. Constants and rational
goldens are exported through `contract.json`; all new measurement passes
must match the Lean executable before the WebGPU result is reviewable.

## Result

**Not run.** This is an experimental-design deliverable on `prereg/003`.
The calculations and exact-law MC above size the criteria; they are not
evidence from the proposed system simulation. Calibration negatives:
raw log-count EP has frequent infinities; fixed population cuts do not
measure empirical circle W₁; the reduced frozen-log noise calculation
does not size the nonlinear estimator. Those approaches are **refuted
as sizing/measurement methods**. U1 is a separate negative theoretical
result only for the own-trajectory in-cone-location reading.
The frozen h8 prediction survives its exact-law sizing without refitting.
Future measured outcomes go here without changing the predictions.

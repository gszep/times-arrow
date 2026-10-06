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
  same particle number, same dynamics, same seed list; the one difference is
  the spatial profile.
- **Observable:** `S_b(t) = Σ_blocks ln C(4b², N_block)` in nats, over the
  `b × b` partition aligned at `(0,0)`; `C` is the binomial coefficient,
  `N_block` the occupied velocity slots in the block, empty blocks contribute
  0. Primary `b = 16` (expected `N̄ = 32` per block, null hypergeometric
  σ ≈ 5.6); computed in f64 (`lgamma`) from exact integer block counts.
  Sampled at `t = 2^j ≤ 1024`, then every 128 steps, to `t_max = 32768`.
- **Null band:** `μ_b(t) ± 3σ_b(t)`, the mean and s.d. of the 16 null seeds
  at the same `t`. With 16 seeds, σ̂ has ~18% relative uncertainty; the
  margins below cover it. **No analytic `S_max` is assumed anywhere** — the
  band contains whatever invariants HPP turns out to have.
- **Echo:** `T_e = 16384` forward steps, then the exact inverse proved in
  Lean. Damage: XOR the east slot of site `(n/2, n/2)` at `t = T_e`.
  `H(r)` = XOR slot count between damaged and pristine trajectories at
  reverse depth `r`. Both initial-state constructors (uniform `N`-subsets)
  are Philox-drawn and will be pinned in Lean and the contract before any
  sweep runs.

## Hypothesis (pre-registered)

| # | Claim | Prediction | Falsified if | Label it earns |
|---|---|---|---|---|
| L1 | `step` is a bijection with an explicit inverse, giving the exact echo protocol (the bare velocity flip conjugates the step to `stream⁻¹∘collide`, which is off by the collide/stream order; the exact inverse proved in Lean carries the half-step convention) | After `T_e` forward steps and the exact inverse, the initial state returns **bit for bit**: Hamming distance 0 over all `4n²` slots, and the reverse-phase `S_b` curve equals the forward curve sample for sample | Any nonzero Hamming distance or any curve mismatch: an implementation error; nothing is promoted until it is fixed | **proved** (Lean); the pinned run then earns **verified** |
| L2 | Particle number is conserved | `Σ_site mass(t)` is constant at every sample | Any drift: implementation error | **proved**; monitored |
| L3 | The state of any site at time `t` depends only on initial sites within torus distance `|dx|+|dy| ≤ t`; lattice light-cone speed 1 cell per step (stated on the page) | Damage support stays inside that diamond (S1a) | Any violation: implementation error | **proved**; **verified** in S1a |
| E1 | Entropy rises from the packed block into the null's band: `S_16(0) ≈ 1.81 × 10⁵` nats (256 blocks at `ln C(1024, 512)`), the band level is ≈ 5.7 × 10⁵ nats (unconstrained estimate, not a falsifier), and `S_16(t)` enters `μ ± 3σ` by `t = 16384`, with no downward excursion longer than 32 consecutive samples, and is in band at `t_max` | Entry `t* ≤ 16384` for every seed; the rise is large and monotone on average | `S_16(0)` differs from 1.81 × 10⁵ nats by > 1% (wrong initial state); or ≥ 2 of 16 runs fail entry, excursion or final-band check. One failing run keeps the label with the failure reported — a single run can go against the trend | **supported** (statistical) |
| E2 | The rise is partition-robust: `ΔS_rise(b) = μ_b(t_max) − S_b(0)` is nondecreasing in `b ∈ {4, 8, 16, 32, 64}`, with `rise(64)/rise(4) ∈ [1.1, 2.0]`; leading order `4n²[H(1/32) − (ln 2)/16] ≈ 4.0 × 10⁵` nats for every `b` (extensive entropy is partition-independent); finite-block Stirling corrections set the deviations (estimates: 2.6, 3.6, 3.9, 4.0, 4.0 × 10⁵ nats — context, not falsifiers) | Measured rises follow the direction and bound above | Monotonicity inverts by more than the bands' 3σ, or the ratio leaves `[1.1, 2.0]` | **supported** |
| R1 | The exact echo recovers the state (L1 applied to the pinned run); **negative control:** the naive flip-only reversal, which lacks the half-step convention, does not recover | Exact inverse: Hamming 0 and `S_b` slides back to the packed value. Naive flip: final Hamming ≥ 1 (expected of order `2p(1−p)·4n² ≈ 2.5 × 10⁵` slots — full decorrelation). Chopard & Droz §2.5 assert the plain flip retraces; the half-step convention is the difference, and the Lean statement decides | Exact echo fails: implementation error (blocks promotion). The control recovering bit for bit: a negative-control result to report (does not touch L1) | exact echo **verified**; control **supported/refuted** against the literature assertion |
| S1 | Echo sensitivity: one flipped bit destroys the macroscopic reversal. (a) damage support ⊆ torus diamond of radius `r` at every reverse depth `r ≤ 700` (where `2r² < n²`); (b) damage spreads, never heals: `H(512) ≥ 1000` XOR slots; (c) the trajectories decorrelate: `H(T_e)/4n² ∈ [0.05, 0.07]` (independent-draw value `2p(1−p) = 0.0605`); (d) the arrow survives: `S_16` of the damaged reverse stays in band for all sampled `r ≥ 1024`, ending with undo fraction `U = (S_b(T_e) − S_b(final))/(S_b(T_e) − S_b(0)) ≤ 0.05` (pristine echo: `U = 1`) | All four hold on the paired runs; the fitted branching rate β̂ over `H ∈ [4, 10⁴]` is reported against the estimate `p(1−p)² ln 3 ≈ 0.032`/step | (a) violated: implementation error. (b), (c) or (d) failing in ≥ 2 of 16 runs. (b) failing at all would be a major negative result: damage heals in HPP and the Loschmidt reversal survives one bit | (a) **verified**; (b)–(d) **supported** (statistical); β̂ **exploratory** |

### Timing of the entropy rise (why 16384)

Collision probability per particle per step ≈ `p(1−p)² ≈ 0.029` (an opposite
mover arrives and the cross slots stay empty), so the mean free path is
λ ≈ 34 steps. A collision turns a particle ±90° at random, a 2D random flight
at axial speed 1, so `D ≈ λ/4 ≈ 8.5` cells²/step (a back-of-envelope value,
not the Green–Kubo coefficient of Hardy–de Pazzis–Pomeau 1976). The slowest
torus mode relaxes in `τ = n²/(4π²D) ≈ 3.1 × 10³` steps, and the ballistic
diamond front reaches every site by `t = 768` steps, the largest torus-diamond
distance from the block. The entropy deficit is quadratic in the mode
amplitude (it starts ≈ 3.9 × 10⁵ nats, matching the mode-1 projection), so it
decays as `e^(−2t/τ)`: crossing a 3σ band edge of ~3 × 10² nats takes
≈ 1.1 × 10⁴ steps. `T_pred = 16384 ≈ 5τ` keeps ≈ 1.5× margin; `t_max = 2 T_pred`.

### Assumptions, invariants, artefacts

- **Checkerboard parity** (literature, Wolf-Gladrow §3.1.1): `(x+y+t) mod 2`
  labels each particle for life; the two populations never collide with each
  other and their numbers are separately conserved. Both ensembles are
  slot-symmetric, so each population carries per-slot density `p`, and
  block-total statistics match the unconstrained ones to `O(b²/n²)`; the
  registered observable is insensitive to the invariant. The parity is a
  lattice artefact (it would not survive a continuum limit); the rise is not.
- **Row/column momentum:** per-row x-momentum and per-column y-momentum may
  also be conserved (a Lean lane settles this; the current background says
  they are not). The registered criteria hold either way: both ensembles
  carry per-row momenta of the same order (σ ≈ 8–11), and the constraint
  moves block totals — hence `S_b` — only at second order (< 1 nat against
  a ≳ 3 × 10²-nat band edge). The sweep records per-row and per-column
  momentum series as an exploratory diagnostic either way.
- **Lattice artefact or physics?** L1, L2: exact combinatorial facts of the
  model (physics: reversibility and conservation; nothing lattice-specific).
  L3: the diamond shape is a lattice artefact; a finite causal speed is the
  physics. E1: the rise is generic statistical mechanics and should survive
  a continuum limit in form; `D`, τ and the entry time are lattice-specific
  numbers. E2: partition dependence is the physics of coarse-graining (Q5);
  the Stirling correction is a finite-size effect. R1, S1: the instability is
  the lattice analogue of Lyapunov divergence in hard-sphere gases (physics);
  β is a model-specific number.
- **Nulls per metric** (each differs from the test in exactly one respect).
  E1, E2: the uniform `N`-subset null (spatial profile). R1: the naive
  flip-only reversal (inverse protocol). S1: the pristine same-seed echo (the
  flipped bit). L2, L3: exact checks against Lean; a deviation is an
  implementation error, not statistics.
- **Float trust boundary:** exact checks (echo, Hamming, cone, conservation)
  are bit-level; `S_b` is f64 computed from exact integers, per the contract.
- **Statistical honesty:** 16 paired runs; every criterion reports the count
  of paired wins/failures, and the page says when a single run can go against
  the trend. Equilibrium-level numbers quoted above are unconstrained
  combinatorial estimates (nats, `log = ln`), not falsifiers.

## Result

Not run. The predictions above are frozen at this commit (rule 4); this
section will hold the labelled outcomes with the results-JSON provenance.

# Collisions and a partition clock (exploration)

One ephemeral WebGPU page, no confirmatory claims. Tap a point, compare the
gold collision-on curve with its faint same-seed free-streaming partner, and
rewind the actual dynamics. Hexagonal FHP on an even periodic offset-row grid;
speed is one nearest-neighbour cell per step. Integer states, Philox chirality,
collision then streaming; inverse streaming then inverse collision at the
original step/site. The paired buffers share their initial state bit for bit.
Initialization follows the Lean `fhp` contract: inclusive disc boundary,
centre `(n/2,n√3/4)`, high 24 Philox bits strictly less than
`floor(ρ × 2²⁴ / 6)`, computed with exact rational decimal arithmetic.

`S = −D((p,1−p) ‖ (a,1−a))`, where `p` is the particle fraction inside a
circle and `a` its exact lattice-site fraction. The plot is
`[S(t)−S(t−W)] / (W × circle area)`, in nats/particle/step/cell²; each site has
area √3/2. Euclidean distances use the periodic rectangular embedding. Dashed
segments show the magnitude of **negative** rates; zero and sign crossings
are omitted from the logarithmic plot. This partition observable is not an
established local thermodynamic entropy-production density.

The shaded exploratory band is `3λ ≤ r < R`, with the requested rough
estimate `λ = 6/ρ_in`, not a measured transport mean free path. A descriptive
"flat here" caption requires all sampled band rates positive, at least three
radii, absolute log-log slope ≤ 0.25, and max/min ≤ 2. These are exploratory
display thresholds, not a pre-registered statistical test. Flatness alone
cannot establish a clock or local equilibrium; the paired off curve matters.

All page parameters are in the URL: `n`, `seed`, `rho`, `outside`, `radius`,
`x`, `y`, `window`, `collisions=on|off`, `paused=0|1`, `end`. Defaults are
256², seed 1, densities 3/0.15, radius 64, centre observer, 16-step windows,
128-step playback. Density changes reset both runs; toggling only selects
which already-running member is highlighted. The probe exposes `reset`,
`run`, `rewind`, `state`, `audit`, and adapter provenance.

Run `node play/check.ts` for hardware WebGPU model checks; `node play/sweep.ts`
on Artemis for paired multi-seed exploration. Batch output records its commit,
parameters and GPU. Read nulls before the dense-disc results.

## Exploratory result

No reliable positive plateau at either density: over seeds 1–16 and eight
16-step windows through t=128, collisions on meets the display threshold in
0/128 windows at both ρ=1 and ρ=3; off meets it in 3/128 and 0/128 respectively.
The three off hits belong to three different seeds; windows within a seed
are correlated. Uniform nulls give 0/128 hits in every arm. At ρ=1, t=48–64,
mean per-seed log slopes are −0.953 (on) and −1.223 (off), with descriptive
95% t intervals [−0.996,−0.909] and [−1.260,−1.187]. At ρ=3, on has slope
−1.160 [−1.177,−1.144] at t=64–80; off has no all-positive band in that window.
These are finite-lattice, centre-observer, transient measurements, not a
continuum result or a test of local equilibrium.

The λ label is only a heuristic. **Derived under independent channel
occupancy** f=ρ/6, the fraction of particles deflected per step is
`[6f²(1−f)⁴ + 6f³(1−f)³]/ρ = f(1−f)³`: inverse rates are 10.37 and 16 steps
at ρ=1 and 3, not the label's 6 and 2. Thus W=16 and R=64 offer weak scale
separation for these restricted collision rules. Also collisions preserve
site mass exactly: this spatial two-cell entropy changes through streaming,
and omits velocity equilibration. Larger R and windows above the **measured**
collision time would be a next exploration, not a guarantee of a plateau.

Disc membership uses integral squared hex distance, including the exact
boundary. Seed 1 at both densities reproduces between NVIDIA/Artemis and
Intel/Mac: identical initial/final state SHA-256 and all 400 plotted rates
per run exactly equal. The raw includes state hashes for every run.

Raw output: GitHub release `results-play`, asset `play-fhp-lean.json`; source
commit `bdb0cf3`, clean Artemis checkout,
NVIDIA Lovelace hardware adapter. SHA-256:
`895e5f475f9b110c6d398af5458472c6c2e68a234ad3a1d0cdcc48af408304a6`.
Regenerate at that commit on Artemis with `node play/sweep.ts`.
`node play/check.ts` checks all 18 Lean FHP goldens. Set `FHP_LEAN` to a
built `timesarrow` executable to add fresh random-seed CLI differentials.
**Verified:** all 18 goldens on Intel and NVIDIA; eight fresh CLI cases on
Intel (four initialization, four evolution), all bit-exact with exact rewind.

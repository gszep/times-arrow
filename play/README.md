# Collisions and a partition clock (exploration)

One ephemeral WebGPU page, no confirmatory claims. Tap a point, compare the
gold collision-on curve with its faint same-seed free-streaming partner, and
rewind the actual dynamics. Hexagonal FHP on an even periodic offset-row grid;
speed is one nearest-neighbour cell per step. Integer states, Philox chirality,
collision then streaming; inverse streaming then inverse collision at the
original step/site. The paired buffers share their initial state bit for bit.

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

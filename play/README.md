# Where does the arrow of time survive? (exploration)

One mobile WebGPU page, no registered claims. Change the observer to tilt
space-time cuts: information falls on every complete cut. Change the partition
to move a transparent left wall: information can enter below light speed.
The right end also retreats at light speed, so neither end admits inflow when
the left wall retreats at least that fast. Reflecting walls and special empty
exteriors are exceptions to any claim that a slower wall must leak.

Independent Poisson particles on a 2048-site ring move one site per step,
reversing independently with probability `a`. Link intensities have background
1; initial deviations in both directions are two `4 cos²(π(x−xc)/24)` bumps,
half-width 12, centred at `c−20` and `c+40`. Incoming deviations mix with
weights `1−a,a`. Information per link is `(1+d)ln(1+d)−d`.
The GPU evolves 768 steps in f32; the heat map and curves use that readback,
with f64 information sums. The probe compares it with independent f64 evolution.
No individual trajectories are sampled; these are ensemble observables.

The heat map shows `|x−c|≤200`, `0≤t≤400`, on a logarithmic colour scale.
Observer cuts cross links at `t−u(x−c)=s`, for
`ceil(52|u|)+1≤s≤floor(767(1−|u|)−52|u|)`, plotted in observer proper time.
The wall region is `c+floor(vt)≤x≤c+900−t`, for `t=0…399`.
Support obeys `52+768<1024`: no wrapping or incomplete-cut comparisons.
The gas has a preferred rest frame and is not Lorentz invariant.

URL: `view=frame|wall`, `u` (default .5, clamped to ±.75), `v` (default .5,
clamped to 0…1.5), `a` (default `1/64`, fractions accepted; invalid values,
including values rounded to 0 or 1 in f32, fall back to the default).
Play moves a visible slice or wall marker and the corresponding curve dot.
“What is this?” opens the assumptions, proof boundary and literature.

Run `node play/check.ts` or `npm run check:gpu`. The hardware-only CDP check
checks the zero-preparation null first, f64 references to relative 1e-9,
f32 field error below 1e-5, curve
error below 1e-3, all seven observer rise counts, nine wall rise counts,
dissipation balance and the exactly zero right boundary. Both views fit
390×844 and 360×740 without scrolling. `window.probe()` exposes these numbers.

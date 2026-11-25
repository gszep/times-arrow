# times-arrow

A hypothesis-testing playground for one question:

> **Can the relativistic notion of time (proper time, light cones, reference
> frames) and the thermodynamic notion of time (entropy production, the arrow of
> time, system/environment partitions) be understood as two faces of one
> framework?**

The microscopic laws are time-reversal symmetric. Relativity supplies the
light cone (which directions are time-like) but not its orientation (which half
is the future). Non-equilibrium statistical mechanics supplies an orientation,
but a statistical, partition-dependent one:
`<σ> = D_KL(P_forward ‖ P_reverse) ≥ 0`.

## Working hypotheses

1. **Frames ↔ partitions.** Each partition carries a thermodynamic clock,
   the entropy flux through its surface. Do clock rates differ between
   partitions as proper times differ between frames? The Unruh effect is the
   known case where the two coincide: an accelerated frame defines a horizon,
   the horizon partitions space, and the resulting thermal state's modular
   flow is the frame's boost time (Bisognano–Wichmann). Current reading
   ([#14](https://github.com/gszep/times-arrow/issues/14)): a frame is a
   slicing and a partition is a wall. For a fixed deterministic lattice
   dynamics, a region's relative entropy is non-increasing for all states iff
   its state is a function of the earlier region's, which a wall retreating
   at the cone speed guarantees (**proved**,
   `TimesArrow/CausalEntropy.lean`; for the playground gas's intensity
   recursion, `TimesArrow/Telegraph.lean`). That it falls on every
   observer's slices of that gas is derived by hand, not formalised. The
   same law holds backwards for reversible dynamics, so it constrains an
   arrow without choosing one. Changes of partition form a one-way
   semigroup, not a group
   ([#8](https://github.com/gszep/times-arrow/issues/8), **conjecture**).
2. **Proper time as counted irreversibility.** A clock's precision is bounded
   by the entropy it produces per tick. Is proper time a count of irreversible
   events, consistently with Lorentz covariance?
3. **Interaction makes time flow.** Irreversibility is correlation built up
   across a partition, `Σ = I(S:E) + D(ρ_E' ‖ ρ_E^eq)`. Could an observer's
   time be defined as the sequence of irreversible records it forms?

Open questions: [`docs/questions.md`](docs/questions.md). Background and
literature: [`docs/background.md`](docs/background.md).

## Approach

- **2+1 dimensions**, so every simulation stays interactive on a phone GPU.
- **Results are interactive WebGPU pages** published at
  <https://gszep.github.io/times-arrow/>.
- **Lean 4 is the specification.** Each experiment's model and claims are
  written in Lean. Hand-written GPU code consumes constants and is tested
  against golden vectors from Lean's exported contract; that is not a proof
  of GPU equivalence. See [`AGENTS.md`](AGENTS.md).
- **Hypotheses are pre-registered** before any simulation is written.
- **Batch sweeps** may run on faster backends (CUDA, JAX). Their results
  are promoted to a WebGPU page for review.
- **Open-source contributions.** Formalisations of finite Markov chains
  with detailed balance and of fluctuation theorems (Crooks, Jarzynski,
  entropy production as a KL divergence) are written to upstream standards
  for Mathlib and [physlib](https://github.com/leanprover-community/physlib).

## Claim labels

| Label | Meaning |
|---|---|
| **proved** | Lean theorem, no `sorry`, axioms audited |
| **verified** | GPU kernel matches the Lean reference implementation on golden vectors |
| **supported** | Simulation agrees with a pre-registered prediction |
| **refuted** | Simulation contradicts a pre-registered prediction |
| **conjecture** | Stated, not tested |
| **literature** | Established result, cited, not reproduced here |

## Experiments

000–003 are concluded; 004–007 are desk explorations, each tracked as an
issue on the [project board](https://github.com/users/gszep/projects/2). The
current exploration is the causal second law
([#14](https://github.com/gszep/times-arrow/issues/14)), shown on the
[playground page](play/README.md).

| # | Question | Model | Status |
|---|---|---|---|
| 000 | Which plumbing? | RNG bit-exactness across Lean, WGSL, CUDA and JAX; lattice-step throughput; f64 eigensolvers; contract export; Lean-generated WGSL | [done](experiments/000-plumbing/README.md) — one WGSL path everywhere (no tier 1); JAX only for f64 dense linear algebra |
| 001 | How does irreversibility emerge from reversible, causal microdynamics? | 2D reversible lattice gas: integer arithmetic (bit-exact against Lean), a strict light cone of one cell per step, a Loschmidt echo, coarse-grainings as partitions | [concluded](experiments/001-irreversibility/README.md) — **E1 and S1(b)–(d) refuted**: the packed gas settles into an undamped period-512 limit cycle and never enters the null band, and one flipped bit does not destroy the reversal; L1–L3, E2 and R1 verified/supported |
| 002 | Is the arrow of time measurable as `D_KL(P_F ‖ P_R)`? | Driven Markov jump process on a 2D torus; live Crooks/Jarzynski checks | [concluded](experiments/002-arrow-kl/README.md) — **K3's T=1 slope criterion refuted (statistical)**, a mis-registered band of true size 3.2%; every other registered check passed and the kernels are bit-level verified; the dFT is proved |
| 003 | When is transport limited by dissipation and when by the light cone? (Q3) | Lazy biased walkers on a ring, one cell per step; `W₁ ≤ min(t, E_diss)` | [concluded](experiments/003-lightcone-speedlimit/README.md) — all 19 registered tests **supported (statistical)**, including the held-out crossover; the bound composes two known bounds and does not unify them |
| 004 | Is stochastic entropy production Lorentz invariant? (Q1) | 2D relativistic Langevin dynamics, viewed from boosted frames | exploration — [issue #6](https://github.com/gszep/times-arrow/issues/6) |
| 005 | Is proper time counted by irreversible ticks? (Q7) | Moving dissipative ring-clock | exploration — [issue #10](https://github.com/gszep/times-arrow/issues/10) |
| 006 | What is invariant under a change of partition? (Q5) | Reversible system with many system/environment splits | exploration — [issue #8](https://github.com/gszep/times-arrow/issues/8) |
| 007 | Is a frame change the same as a partition change? (Q6) | Half-plane entanglement Hamiltonian of a lattice free field | exploration — [issue #11](https://github.com/gszep/times-arrow/issues/11) |

## License

MIT

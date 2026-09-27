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

1. **Frames ↔ partitions.** A reference frame and a system/environment
   partition play the same role: a perspective. Relativity has the Lorentz
   group to move between frames. Is there a corresponding transformation theory
   between partitions? The Unruh effect is the known case where the two
   coincide: an accelerated frame defines a horizon, the horizon partitions
   space, and the resulting thermal state's modular flow is the frame's boost
   time (Bisognano–Wichmann).
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
  written in Lean. The GPU code is generated from, and tested against, a
  contract that Lean exports. See [`AGENTS.md`](AGENTS.md).
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

000 chooses the tech stack through cheap, measured trials. 001 is the
end-to-end test of the harness.

| # | Question | Model | Status |
|---|---|---|---|
| 000 | Which plumbing? | RNG bit-exactness across Lean, WGSL, CUDA and JAX; lattice-step throughput; f64 eigensolvers; contract export; Lean-generated WGSL | [done](experiments/000-plumbing/README.md) |
| 001 | How does irreversibility emerge from reversible, causal microdynamics? | 2D reversible lattice gas: integer arithmetic (bit-exact against Lean), a strict light cone of one cell per step, a Loschmidt echo, coarse-grainings as partitions | planned |
| 002 | Is the arrow of time measurable as `D_KL(P_F ‖ P_R)`? | Driven Markov jump process on a 2D torus; live Crooks/Jarzynski checks | planned |
| 003 | Can light cones emerge from locality alone? (Q3) | Lattice Klein–Gordon field and a nonlinear lattice | planned |
| 004 | Is stochastic entropy production Lorentz invariant? (Q1) | 2D relativistic Langevin dynamics, viewed from boosted frames | planned |
| 005 | Is proper time counted by irreversible ticks? (Q7) | Moving dissipative ring-clock | planned |
| 006 | What is invariant under a change of partition? (Q5) | Reversible system with many system/environment splits | planned |
| 007 | Is a frame change the same as a partition change? (Q6) | Half-plane entanglement Hamiltonian of a lattice free field | planned |

## License

MIT

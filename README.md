# times-arrow

A hypothesis-testing playground for one question:

> **Can the relativistic notion of time (proper time, light cones, reference
> frames) and the thermodynamic notion of time (entropy production, the arrow of
> time, system/environment partitions) be understood as two faces of one
> framework?**

The microscopic laws are time-reversal symmetric. Relativity supplies a causal
structure (which directions are time-like) but not an orientation (which half of
the light cone is the future). Non-equilibrium statistical mechanics supplies an
orientation, as a statistical and partition-dependent property:
`<σ> = D_KL(P_forward ‖ P_reverse) ≥ 0`. This project looks for the bridge,
through GPU simulation, formal proof in Lean 4, and a close reading of the
existing literature.

## Working hypotheses

1. **Frames ↔ partitions.** A relativistic reference frame and a thermodynamic
   system/environment partition play the same structural role: each is a
   perspective. Relativity has a transformation theory between frames (the
   Lorentz group). We look for its thermodynamic counterpart, a transformation
   theory between partitions, and for the quantities it leaves invariant. The
   Unruh effect is the known case where the two coincide: an accelerated frame
   defines a horizon, the horizon is a partition, the partition yields a
   thermal state, and that state's modular flow is the frame's own boost time
   (Bisognano–Wichmann).
2. **Proper time as counted irreversibility.** A clock is a dissipative process,
   and its precision is bounded by the entropy produced per tick. Proper time is
   what clocks measure. Is proper time therefore a count of irreversible events,
   and is that consistent with Lorentz covariance?
3. **Interaction makes time flow.** Irreversibility is correlation built up
   across a partition (`Σ = I(S:E) + D(ρ_E' ‖ ρ_E^eq)`). Records, memory and
   experience require it. Could an observer's time be defined operationally as
   the sequence of irreversible records it forms?

The full list of open questions is in [`docs/questions.md`](docs/questions.md).
The background and literature map is in
[`docs/background.md`](docs/background.md).

## Approach

- **2+1 dimensions.** Two spatial dimensions and one time dimension keep every
  simulation interactive on a phone GPU while still having non-trivial geometry
  (rotations, boosts in two directions, areas, horizons as lines).
- **WebGPU simulations are the output.** Every result is an interactive page
  that runs in the browser (desktop or mobile) and is published on GitHub
  Pages. The human collaborator validates physics by playing with it.
- **Lean 4 is the specification.** Each experiment's model, assumptions and
  claims live in Lean. Lean exports a *contract* (parameters, assumptions, claim
  status, golden test vectors). The GPU code is generated from the contract and
  differentially tested against it, so the simulation cannot silently drift
  from what was proved. See the harness section in [`AGENTS.md`](AGENTS.md).
- **Pre-registered hypotheses.** Each experiment states its prediction and
  falsification criterion before the code is written.

## Epistemic status labels

Every claim surfaced by this project carries exactly one label:

| Label | Meaning |
|---|---|
| **proved** | Lean theorem, no `sorry`, axioms audited |
| **verified** | GPU simulation matches the Lean reference implementation on golden vectors |
| **supported** | Simulation agrees with a pre-registered prediction, not proved |
| **refuted** | Simulation contradicts a pre-registered prediction |
| **conjecture** | Stated, not yet tested |
| **literature** | Established result, cited, not reproduced here |

## Layout

```
docs/          background, open questions, lab notebook
experiments/   one folder per experiment: HYPOTHESIS.md, RESULT.md
lean/          Lake project `TimesArrow`: models, claims, contract export
contract/      generated contracts (JSON), committed
web/           Vite + TypeScript + WebGPU app, one page per experiment
scripts/       codegen, differential tests, audits
```

## Running

The harness is being bootstrapped. The commands below are the target interface.

```sh
make lean        # build Lean, audit axioms, export contracts
make gen         # regenerate TS/WGSL constants from contracts
make test        # differential tests: WebGPU kernels vs Lean golden vectors
make dev         # dev server on the LAN (open on phone)
make deploy      # build and publish to GitHub Pages
```

Published site: <https://gszep.github.io/times-arrow/>

## License

MIT

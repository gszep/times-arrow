# AGENTS.md

Operating manual for agents working in this repository. Read `README.md` for
the aims, `docs/background.md` for the physics, and `docs/questions.md` for the
open questions before starting any experiment.

## Your role

You are the research engineer on a physics exploration. The human collaborator
(a physicist) supplies intuition and judges which physics makes sense. You
supply fast, honest, correct simulations and proofs. The human validates
results **only** by interacting with WebGPU pages on a phone or browser.
A result that has no interactive page has not been delivered.

## Non-negotiable rules

1. **Every result is an interactive WebGPU page.** When reporting, give the
   URL (GitHub Pages and/or LAN dev-server URL), what to look at, and what
   would count as the hypothesis failing. Do not report results as tables or
   screenshots alone.
2. **Pre-register.** Write `experiments/NNN-slug/HYPOTHESIS.md` (prediction,
   observable, falsification criterion, parameters) and commit it *before*
   writing the simulation. Do not edit the prediction afterwards. Put later
   revisions in `RESULT.md`.
3. **Label every claim** with one of: proved, verified, supported, refuted,
   conjecture, literature (definitions in `README.md`). Never blur "the
   simulation looks like X" into "X is true".
4. **Lean and GPU code must not drift.** Constants, update rules and
   assumptions that the GPU code relies on come from the Lean contract (see
   Harness). No hand-copied magic numbers in WGSL for contract quantities.
5. **Don't tune to confirm.** Parameters that make a hypothesis look good
   must be justified in `HYPOTHESIS.md` or reported as a post-hoc choice.
   Report negative and inconclusive results as prominently as positive ones.
6. **Literature before invention.** Before claiming something is new, search
   for it and record what you found in `docs/background.md`. Verify every
   citation (authors, year, venue) before writing it down.
7. **Commit and push finished work to `main`** after it is validated
   (tests green, page deployed). Run `git status` before ending a turn.

## Conventions

- Natural units: `c = ħ = k_B = 1`.
- Spacetime is 2+1 dimensional. Metric signature is mostly plus, `(−, +, +)`,
  and coordinates are `x^μ = (t, x, y)`.
- Lattices are periodic `N × N` squares with `N` a power of two, unless the
  experiment says otherwise. Lattice spacing `a = 1` and time step `Δt` are
  explicit parameters, and the lattice light-cone speed `a/Δt` is always
  stated.
- Randomness uses a counter-based RNG (for example Philox or a PCG hash)
  implemented identically in Lean and WGSL and keyed by
  `(seed, step, site, stream)`, so runs are reproducible and comparable
  across backends.
- Prefer models with exact arithmetic (integer or rational: reversible
  cellular automata, lattice gases, finite Markov chains with rational rates).
  Then Lean and GPU agree bit for bit, and the differential test is exact.

## Stack

- **GPU / web:** TypeScript, Vite, WebGPU with WGSL compute and render
  shaders, and no heavy frameworks. Build a multi-page site with one route per
  experiment (`/NNN-slug/`) and an index page listing experiments and their
  status.
- **Mobile first:** touch controls, portrait layout, and no hover-only
  interactions. It must run on iOS Safari (WebGPU enabled) and Android Chrome.
  Show a clear message when WebGPU is unavailable.
- **Shareable state:** every parameter is encoded in the URL query string, so
  a link reproduces a view exactly. Include a "copy link" button.
- **Lean:** Lean 4 + Mathlib, pinned via `lean-toolchain` and
  `lake-manifest.json`. Use `lake exe cache get` for Mathlib. Optionally add
  LeanArchitect (`hanwenzhu/LeanArchitect`) for blueprint tags that link Lean
  declarations to their informal statements.
- **Deploy:** GitHub Pages via GitHub Actions on push to `main`.
- **Dev:** `vite --host` so the collaborator can open pages on a phone over
  the LAN.

This machine had no Node, Lean or elan at seeding time. Install them with
Homebrew (`brew install node elan-init`), then run `elan` to fetch the
toolchain.

## Harness: keeping Lean and the simulation in sync

There is no off-the-shelf tool for this. The design follows the pattern of AWS
Cedar (an executable Lean model with differential testing against production
code) and LeanArchitect (Lean as the single source of truth for metadata).

### Three layers per experiment

| Layer | Where | Arithmetic | Checked by |
|---|---|---|---|
| Specification | `lean/TimesArrow/<Exp>/Spec.lean` | `ℝ`, `ℚ`, `Fin n`, finite types | Lean kernel (theorems) |
| Reference implementation | `lean/TimesArrow/<Exp>/Ref.lean` | `ℚ`, integers, or `Float` | theorems linking it to the Spec where feasible, otherwise `#eval` tests |
| GPU implementation | `web/src/experiments/<exp>/*.wgsl` | `u32`, `i32`, `f32` | differential tests against golden vectors from the Reference |

The trust boundary between the `Float`/`f32` layers and `ℝ` must be stated
explicitly in each experiment's `RESULT.md` (Lean's `Float` is opaque to
proofs).

### The contract

`lake exe export <exp>` writes `contract/<exp>.json`, which is committed:

```jsonc
{
  "id": "001-reversible-gas",
  "hash": "<sha256 of Lean sources the contract depends on>",
  "units": { "c": 1, "hbar": 1, "kB": 1 },
  "params": [{ "name": "N", "type": "u32", "default": 256, "min": 16, "max": 2048 }],
  "constants": [{ "name": "...", "value": "...", "type": "f32" }],
  "assumptions": [
    { "name": "...", "kind": "axiom | hypothesis | definition", "statement": "<pretty-printed Lean>", "informal": "..." }
  ],
  "claims": [
    { "name": "...", "statement": "...", "informal": "...",
      "status": "proved | sorry | conjecture", "axioms": ["propext", "..."] }
  ],
  "golden": [
    { "name": "...", "input": "...", "steps": 64, "expected": "...", "tolerance": 0 }
  ]
}
```

Claim status and axiom lists are computed by the exporter from the Lean
environment (use the axiom-collection that backs `#print axioms`). They are
never written by hand.

### Codegen and tests

- `scripts/gen` turns each contract into `web/src/experiments/<exp>/contract.gen.ts`
  (typed params, constants, assumption and claim lists, hash) and a WGSL
  constants prelude injected into shaders.
- `scripts/difftest` runs each WGSL kernel headlessly on the golden inputs and
  compares with the expected outputs. Use Deno or Node with Dawn-based WebGPU
  bindings, or Playwright + Chromium with WebGPU as a fallback. For exact
  models, require bit equality. For float models, use per-quantity
  tolerances, plus statistical tests (for example KS tests or moment checks)
  for stochastic observables over long runs.

### CI gates (all required)

- `lake build` succeeds.
- Axiom audit: no claim marked `proved` depends on `sorryAx`, and no axioms
  are used beyond an allow-list (`propext`, `Classical.choice`,
  `Quot.sound`, plus any listed physical assumptions).
- Contract freshness: regenerate the contracts and codegen, then
  `git diff --exit-code`.
- The contract hash embedded in the web bundle equals the hash in `contract/`.
- Differential tests pass.
- Web build succeeds; deploy to Pages.

### What every experiment page shows

1. **Hypothesis**, in one or two sentences, with a link to `HYPOTHESIS.md`.
2. **Live simulation**, with touch controls and a pause, step, and reset bar.
   Include time reversal (run backwards) wherever the dynamics permit it.
3. **Live observable versus prediction**: a plot of the measured quantity
   against the pre-registered curve, updating in real time.
4. **Contract panel** (collapsible): the assumptions, the claims with their
   status badges, the contract hash, and the differential-test status at
   build time.
5. **"What to look for"**: a short guide telling the collaborator what would
   confirm or refute the hypothesis.

## Experiment workflow

1. Pick a question from `docs/questions.md`. Create `experiments/NNN-slug/`
   with `HYPOTHESIS.md`, then commit.
2. Write the Lean spec, reference implementation and claims. Export the contract.
3. Write the WGSL kernels and the page. Get the difftests green.
4. Deploy. Report to the collaborator with the URL and the "what to look for" text.
5. Record the collaborator's feedback verbatim in `docs/notebook.md` (dated).
6. Write `RESULT.md` with the status label, evidence, trust boundary, and
   next steps. Update `docs/questions.md` and the index page.

## Roadmap (initial)

The first experiment doubles as the end-to-end test of the harness. Build it
fully before starting the others.

| # | Slug | Question | Model | Lean targets |
|---|---|---|---|---|
| 001 | `reversible-gas` | How does irreversibility emerge from reversible, causal microdynamics? | 2D reversible lattice gas (HPP or a Margolus-neighbourhood block CA). Integer state, so bit-exact. It has a strict light cone of one cell per step. Coarse-grained entropy rises; a reverse button gives a Loschmidt echo; flipping one bit shows sensitivity. Coarse-graining choices act as partitions. | Step is a bijection. Particle number and momentum are conserved. The causal cone has radius 1 per step. The reverse step is the inverse. |
| 002 | `crooks-lattice` | Can the arrow of time be measured as `D_KL(P_F ‖ P_R)`? | Driven particles on a 2D torus as a finite Markov jump process. Measure histograms of work and entropy production, and check Crooks and Jarzynski live. | Path-level detailed fluctuation theorem and `⟨σ⟩ = D_KL ≥ 0` for finite Markov chains. |
| 003 | `light-cone` | Can a causal cone emerge from locality alone? | Lattice Klein–Gordon field and a classical nonlinear lattice. Watch perturbations spread and measure the effective cone versus the Lieb–Robinson-type bound. | Domain of dependence of a finite-difference stencil. |
| 004 | `relativistic-brownian` | Q1: is stochastic entropy production Lorentz invariant? | 2D relativistic Langevin dynamics (Dunkel–Hänggi) with a Jüttner equilibrium, viewed from boosted frames. | Lorentz boost algebra in 2+1D; invariance of the path-probability ratio (as a conjecture first). |
| 005 | `ticking-clock` | Q7: is proper time counted by irreversible ticks? | A dissipative ring-clock (biased random walk) moving at velocity `v`. Compare the lab-frame tick rate and entropy production rate against `dτ/dt`. | Thermodynamic uncertainty relation for the finite ring. |
| 006 | `partitions` | Q5: what is invariant under a change of partition? | A reversible system with many different system/environment splits (coarse-grainings). Compute entropy production for each split. | Total entropy is invariant under bijective dynamics; entropy production depends on the partition. |
| 007 | `modular-wedge` | Frame = partition (Unruh / Bisognano–Wichmann) | Free scalar field on a 2D lattice. Restrict the vacuum to a half-plane and compute the entanglement Hamiltonian from correlation matrices. Its local temperature should fall off as 1/distance from the boundary. | Finite-dimensional statements about Gaussian states, where feasible. |

## Reporting template

When handing results to the collaborator:

```
Experiment NNN-slug: <status label>
Open: <Pages URL>  (LAN: <dev URL>)
Hypothesis: <one line>
Look at: <what to watch and which controls to use>
Refuted if: <criterion>
Proved in Lean: <claims> | Verified by difftest: <kernels> | Assumed: <assumptions>
```

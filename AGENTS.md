# AGENTS.md

Read `README.md` (aims, experiments), `docs/background.md` (physics and
literature) and `docs/questions.md` (open questions) before working.

## Role

You build simulations and proofs. The collaborator, a physicist, judges the
physics. The collaborator validates results only through interactive WebGPU
pages on a phone or in a browser. A result without a page has not been
delivered.

## Rules

1. **Commit and push to `main`** after every validated change. Update docs in
   the same commit as the code they describe. Run `git status` before ending a
   turn. If a commit or push is blocked, say so immediately.
2. **Stay small.** Every line is a liability. Delete obsolete paths instead of
   keeping shims, flags or compatibility layers. Add no speculative surface:
   no options, parameters or abstractions without a current caller. Duplicate
   code once before you abstract it. Code and docs describe the current state
   only; Git holds the history. No changelogs, diaries, commented-out code,
   `old_`/`v2` variants or "previously…" prose.
3. **Compression rounds.** After each big swing (a new experiment, harness
   change or large refactor), and before starting the next, do one audit
   pass:
   - Delete dead code, unused exports and stale files.
   - Merge duplicates into the existing shared path. Do not add a parallel one.
   - Shrink docs to the current contract. Delete any doc that is superseded.
   - Re-run all checks. Commit as `refactor:` or `docs:`, and report the change
     in line count (`git ls-files | xargs wc -l`).
4. **Pre-register.** Write the hypothesis section of the experiment's
   `README.md` (prediction, observable, falsification criterion) and commit it
   before writing the simulation. Never edit the prediction afterwards. The
   outcome goes in a separate result section.
5. **Label every claim** as proved, verified, supported, refuted, conjecture
   or literature (see `README.md`). Report negative results as prominently as
   positive ones. Don't tune parameters to confirm a hypothesis.
6. **Literature before invention.** Search before calling anything new, and
   verify citations before writing them into `docs/background.md`. Check them
   against the Crossref or arXiv APIs over plain HTTP, which has no search
   quota.

## Experiment discipline

Lessons from `space-filling-curves`, whose history includes confounded
results that had to be retracted:

- **One source per kernel.** Each kernel has exactly one implementation per
  tier (see Backends). Every backend must pass the same Lean contract tests.
  A result found in a batch backend is **promoted** to review only when the
  WebGPU page reproduces one pinned configuration from the sweep (same seed
  and parameters, same observable within the stated tolerance).
- **Paired comparisons.** An A/B toggle re-runs the same initial condition
  with the same seed. Only the variable under test changes. Unpinned
  comparisons, or comparisons across code paths (CPU versus GPU, different
  sessions), are confounds.
- **Clean nulls.** Report every metric on a null model first (for example
  an equilibrium, an undriven or a shuffled system), then read meaning into
  the structured case. Choose the null that differs from the test in exactly
  one respect.
- **Statistical claims are labelled as statistical.** Show the number of
  paired wins and the confidence intervals. Say on the page when a single
  run can go against the trend.
- **Provenance.** Every sweep writes JSON recording the commit, parameters,
  seeds and GPU adapter. Results from code that has since changed are stale.
  Re-run them or delete them.
- **Retract loudly.** When a result turns out to be an artefact, mark it
  refuted in the experiment's README with the cause, delete the
  contaminated data and re-queue the runs.
- **Lattice artefact or physics?** State whether a finding should survive
  the continuum limit, or holds only because space is discrete (the lattice
  breaks Lorentz invariance). Name the assumptions before generalising:
  2+1 dimensions, square lattice, periodic boundaries, the choice of
  coarse-graining.
- **GPU hygiene.** Wait for pending GPU work to finish before swapping
  buffers or resetting. Batch all readbacks into one mapped buffer per frame.

## Conventions

- Units `c = ħ = k_B = 1`. Spacetime is 2+1 dimensional with signature
  `(−, +, +)` and coordinates `x^μ = (t, x, y)`.
- Lattices are periodic `N × N` squares with `N` a power of two. The lattice
  light-cone speed is stated on every page.
- Prefer exact arithmetic (integers, rationals, reversible cellular automata,
  finite Markov chains). Then the Lean and GPU versions agree bit for bit.
- Randomness uses one counter-based RNG keyed by `(seed, step, site)`,
  implemented identically in Lean and WGSL.

## Stack

The repo is still docs only: no `package.json`, lakefile, CI workflow or
checks exist yet. The first experiment creates them. When it does, record the
exact build, check and dev commands here.

- TypeScript by default for all code, including scripts, codegen and tests.
  Use another language only where the platform requires it (Lean, WGSL).
- Drive a visible Chrome over the Chrome DevTools Protocol (CDP) at
  `http://localhost:9222`. If `curl -s localhost:9222/json/version` answers,
  reuse that browser. Otherwise launch one:
  ```sh
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --remote-debugging-port=9222 --user-data-dir=$HOME/.config/chrome-cdp-times-arrow \
    --no-first-run --no-default-browser-check about:blank &
  ```
  The dedicated profile is required: since Chrome 136 the debug port is
  ignored on the default profile. This visible browser is for interactive
  checks. WebGPU needs a secure context (`localhost` or https), not
  `about:blank`.
- **Sweeps run headless**, in their own browser instance with a throwaway
  `--user-data-dir` and a free debug port (not 9222), which is killed at the
  end. Launch it with `--headless=new`. On Linux, also pass
  `--enable-unsafe-webgpu --ignore-gpu-blocklist --enable-features=Vulkan
  --use-angle=vulkan --disable-vulkan-surface`.
  - Headless mode can silently fall back to a software GPU. Every sweep
    first requests the WebGPU adapter and aborts unless
    `isFallbackAdapter` is false and the vendor is the expected one. Record
    the adapter in the results JSON.
  - Verified on 2026-09-27: headless gives a hardware adapter on this Mac
    (Intel gen-9) and on Artemis (NVIDIA Lovelace, Chrome stable and
    Canary). Use raw CDP over Node's built-in `WebSocket`, or
  `puppeteer-core` `connect({ browserURL })`. Open your own targets
  (`PUT /json/new?<url>`) and close them afterwards (`/json/close/<id>`).
  Match targets by their exact page URL. The CDP browser does not pick up
  hot reloads, so navigate again after rebuilding.
- **More compute: `ssh artemis`.** Artemis is a Linux machine with an
  NVIDIA RTX 5000 Ada GPU (16 GB), 32 cores and 188 GB of RAM. Use it for
  sweeps or lattices too large for this Mac.
  - WebGPU there gets the NVIDIA adapter (Lovelace, hardware, 2 GB
    storage-buffer bindings).
  - Run sweeps on Artemis itself: `git pull` in
    `~/Documents/repos/times-arrow` (clone it the first time), then run the
    headless sweep there with
    `PATH=$HOME/.nvm/versions/node/v24.18.0/bin:$PATH`.
  - Artemis also runs a shared visible Chrome Canary on port 9222, used by
    other projects. Don't restart it or run sweeps in it. For an interactive
    check from this Mac, tunnel the port with
    `ssh -N -L 9223:localhost:9222 artemis`, and open and close only your
    own targets.
  - Commit the results JSON (with its provenance) back to `main`.
  - Artemis has CUDA (`nvcc`) and no Lean install.
- **Validate with numbers, not screenshots.** Each page exposes a probe on
  `window` that reads GPU buffers back and returns invariants and
  observables (NaN checks, conserved quantities, the measured versus
  predicted values). Assert on them with `Runtime.evaluate`
  (`awaitPromise: true`). The golden-vector checks run the same way, in real
  WebGPU. Screenshots are for the collaborator, not for deciding correctness.
- TypeScript, Vite and WebGPU (WGSL), with no UI framework. One route per
  experiment plus an index page. Deploy to GitHub Pages on push to `main`.
  Run `vite --host` for phone access over the LAN.
- Pages are mobile-first. Every parameter lives in the URL. Show a clear
  message when WebGPU is unavailable.
- Lean 4 + Mathlib + physlib (`leanprover-community/physlib`, which provides
  the Lorentz group, special relativity and the statistical ensembles).
  Pin `leanprover/lean4:v4.34.1`, physlib's toolchain, together with
  `lake-manifest.json`. Search Mathlib and physlib before defining anything.
- elan is not on the shell tool's `PATH`. Call `~/.elan/bin/lake` and
  `~/.elan/bin/lean` by full path, or prepend `~/.elan/bin` to `PATH`. Its
  default is `stable`, so every Lean project must pin its own
  `lean-toolchain`.
- Node 24 and npm are installed through nvm but are not on the shell tool's
  `PATH`. Prepend `~/.nvm/versions/node/v24.18.0/bin` to `PATH`. Do not
  install another Node.

## Backends

WebGPU is how results are reviewed. Batch work may use a faster backend,
but only one tier above what has been shown to be necessary.

| Tier | Use | Backend |
|---|---|---|
| 0 | All review pages and batch sweeps by default | WGSL from TypeScript: the browser for review, headless Chrome or native Dawn (`webgpu` npm) on Artemis for sweeps |
| 1 | Measured need: a per-thread kernel is too slow in WGSL | CUDA C++ kernels through CuPy `RawKernel` on Artemis. CUDA is the closest shape to WGSL, so porting in either direction is mechanical |
| 2 | f64, dense linear algebra, statistics over large ensembles | JAX with x64 enabled on Artemis. For large f64 `eigh`, compare against CPU LAPACK: an Ada laptop GPU runs f64 at 1/64 of f32 speed |

- Python is allowed only for tiers 1 and 2. Arrays pass between CuPy and
  JAX through DLPack.
- Don't use: Taichi (unmaintained since 2025), Mojo, rust-cuda, Futhark's
  WebGPU backend (unmerged), Triton.
- Keep an eye on, but don't adopt yet: Slang (one source compiling to WGSL
  and CUDA), CubeCL, and Hesper (WGSL generated from Lean).
- The RNG is pinned in the Lean spec: Philox4x32-10 with the Random123
  key/counter layout and one fixed conversion from integers to uniforms.
  WGSL emulates the 32×32→64 multiply with 16-bit halves. Integer models
  and RNG streams are bit-exact on every backend. Float models are compared
  against a tolerance, because FMA contraction and operation reordering
  differ between backends.

## Plumbing trials (experiment 000)

Choose the stack with cheap, measured trials, not by assumption. Run them
before experiment 001. Record the decision table in
`experiments/000-plumbing/README.md`, keep only the code that wins, and
delete the rest. These are engineering results, not physics: a table is
enough and no review page is needed.

1. **RNG:** Philox4x32-10 implemented in Lean, WGSL, CuPy (cuRAND or
   hand-written) and JAX. Check that all four are bit-exact on the golden
   vectors.
2. **Lattice step throughput:** one 2D reversible lattice-gas update, run in
   WGSL in the browser (Mac and Artemis), in WGSL through native Dawn on
   Artemis, and through a CuPy `RawKernel`. Measure cell updates per second
   and check bit-exactness against Lean. This decides whether tier 1 is ever
   needed.
3. **f64 eigendecomposition** for `N` from 10³ to 10⁴: JAX on the GPU versus
   CPU LAPACK on Artemis.
4. **Contract export:** a `lake exe` that exports claims using
   `Lean.collectAxioms`, with Comparator certifying the proved claims in CI.
5. **Lean-generated kernels:** write trial 2's update rule in Hesper, and
   judge whether Lean-emitted WGSL could replace hand-written WGSL.

## Upstream contributions

As far as we have found, Mathlib and physlib have no finite Markov chains
with detailed balance and no fluctuation theorems. Mathlib does have KL
divergence and `Kernel.Invariant`. The Lean we write for these topics is a
candidate for contribution upstream:
- entropy production as a KL divergence that is never negative;
- detailed and path-level fluctuation theorems (Crooks, Jarzynski);
- the reversible cellular automata results.

- Write this code to upstream standards from the start. Follow the naming
  and docstring conventions of Mathlib and physlib, use no `sorry`, and
  keep it in its own directory with no dependencies on project-specific
  code.
- physlib's `AI-POLICY.md` and `AGENTS.md` bind any contribution:
  - the collaborator vouches for every statement and verifies every
    bibliographic reference personally;
  - all communication with reviewers is by the human.

  Agents prepare the branch and the PR description. Agents never open the
  PR or reply to reviewers.

## Lean ↔ simulation sync

No off-the-shelf tool exists. Build the smallest harness that enforces these
invariants, following the Cedar pattern: an executable Lean model with
differential testing. On top of the fixed golden vectors, run randomised
differential tests, with fresh random inputs checked against the Lean
reference on each run. The contract records each backend's assurance level:
compiles, matches Lean exactly, or proved.

- **Lean is the single source of truth.** Each experiment has a Lean
  specification (theorems) and a runnable reference implementation.
- **Lean exports a contract.** It is a JSON file with the parameters,
  constants, assumptions, claim statuses and golden input/output vectors.
  Claim status and the axioms each claim uses are computed from the Lean
  environment, never written by hand.
- **The GPU code consumes the contract.** Constants are generated from it,
  with no hand-copied values. Kernels must reproduce the golden vectors:
  exactly for integer models, within stated tolerances for float models.
  Lean's `Float` cannot be reasoned about in proofs. State that trust boundary
  on the page.
- **Checks fail the build if:**
  - a claim marked proved uses `sorry` or an axiom outside the allow-list;
  - the contract or generated code is stale (`git diff --exit-code`);
  - a golden vector fails.
- **Each page shows:** the hypothesis; the live simulation (with time
  reversal where the dynamics allow it); the measured observable plotted
  against the prediction; a collapsible panel listing the assumptions and
  claim statuses; and a note on what would refute the hypothesis.

## Layout

```
docs/                     background.md, questions.md
experiments/NNN-slug/     README.md (hypothesis, result), Lean, WGSL, page
```

Keep shared code (the WebGPU helpers, the contract codegen, the Lean export)
in a single place each. Decide on the remaining layout when the first
experiment needs it, then document it here.

## Reporting

```
NNN-slug: <label>
Open: <URL>
Hypothesis: <one line>
Look at: <what to watch, which controls>
Refuted if: <criterion>
Lean: proved <…> | verified <…> | assumed <…>
```

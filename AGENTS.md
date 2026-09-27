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
   verify citations before writing them into `docs/background.md`.

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
  ignored on the default profile. Never use headless Chrome, which may fall
  back to a software GPU. On this machine WebGPU gives a hardware Intel gen-9
  adapter. It needs a secure context (`localhost` or https), not
  `about:blank`. Use raw CDP over Node's built-in `WebSocket`, or
  `puppeteer-core` `connect({ browserURL })`. Open your own targets
  (`PUT /json/new?<url>`) and close them afterwards (`/json/close/<id>`).
  Match targets by their exact page URL. The CDP browser does not pick up
  hot reloads, so navigate again after rebuilding.
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
- Lean 4 + Mathlib, pinned by `lean-toolchain` and `lake-manifest.json`.
- elan is not on the shell tool's `PATH`. Call `~/.elan/bin/lake` and
  `~/.elan/bin/lean` by full path, or prepend `~/.elan/bin` to `PATH`. Its
  default is `stable`, so every Lean project must pin its own
  `lean-toolchain`.
- Node 24 and npm are installed through nvm but are not on the shell tool's
  `PATH`. Prepend `~/.nvm/versions/node/v24.18.0/bin` to `PATH`. Do not
  install another Node.

## Lean ↔ simulation sync

No off-the-shelf tool exists. Build the smallest harness that enforces these
invariants, following the Cedar pattern (an executable Lean model with
differential testing):

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

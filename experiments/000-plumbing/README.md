# 000-plumbing

Engineering trials that choose the stack before experiment 001. The results
are measurements, not physics claims, so there is no review page beyond a
probe page for the numbers.

## Hypothesis (pre-registered)

Shared setup: Philox4x32-10 with the Random123 key/counter layout, and one
HPP lattice-gas step (collide, then stream) on a periodic `N × N` lattice
with one `u32` per site. Lean is the reference for both.

| # | Trial | Prediction | Observable | Decision rule |
|---|---|---|---|---|
| 1 | Philox in Lean, WGSL, CuPy, JAX | All four are bit-exact | Random123 known-answer vectors and a Lean-exported stream | A backend that is not bit-exact cannot draw random numbers |
| 2 | HPP step throughput | The step is memory-bound, so WGSL (headless Chrome or Dawn on Artemis) is within 2× of a CuPy `RawKernel` | Cell updates per second at `N = 4096`, plus bit-exactness against Lean | Tier 1 is needed for lattice kernels only if CuPy is at least 2× faster than the best WGSL path. Between Chrome and Dawn, keep one: Dawn only if it is at least 20% faster |
| 3 | f64 `eigh`, `N = 10³ … 10⁴` | The Ada laptop GPU runs f64 at 1/64 rate, so CPU LAPACK on 32 cores is at least as fast at `N = 10⁴` | Wall time and relative residual `‖AV − VΛ‖/‖A‖` | Use the faster backend at `N = 10⁴`, if its residual is below `1e-12` |
| 4 | Contract export with `collectAxioms`, Comparator in CI | Both work | `lake exe` writes the contract, and CI re-checks the proved claims | If Comparator cannot run in CI, record why and keep the `collectAxioms` audit alone |
| 5 | Hesper for Lean-generated WGSL | Too immature to adopt | Builds on our toolchain, emits valid WGSL for the HPP step that is bit-exact against Lean, and the kernel is a Lean term we can prove things about | Adopt only if all three hold. Otherwise keep hand-written WGSL |

## Result

All labels here are engineering results. Throughput is the median of three
runs of 500 HPP steps from seed 1 (`sweep.ts`; `results/*.json` hold the
provenance). Hosts: this Mac (`calcifer`, Intel UHD 630 "gen-9") and Artemis
(NVIDIA RTX 5000 Ada laptop GPU, 16 GB).

| # | Trial | Result | Label | Decision |
|---|---|---|---|---|
| 1 | Philox in Lean, WGSL, CuPy, JAX | Bit-exact on every backend: 3/3 Random123 known-answer vectors and 30/30 stream words plus `u01` floats. WGSL also matches 8 fresh random `(seed, step, site)` triples from the Lean executable on every `check:gpu` run | proved (known-answer vectors, `philox_kat`, by `decide +kernel`); verified (WGSL, CuPy, JAX) | Philox4x32-10 as pinned. The WGSL 16-bit-halves `mulhilo` is exact |
| 2 | HPP step throughput | At `N = 4096`, CuPy is 0.99× the best WGSL path; every path is DRAM-bound at about 61 × 10⁹ cell updates/s. Dawn is within 3% of Chrome on both hosts. Checksums agree across all five host/backend pairs at every size up to 8192² | supported (prediction held) | **No tier 1** for lattice kernels. Headless Chrome is the one sweep path; the Dawn path is deleted |
| 3 | f64 `eigh` | At `N = 10⁴`, JAX on the GPU takes 9.5 s and CPU LAPACK (OpenBLAS, 32 threads) takes 90.8 s, so the GPU is 9.6× faster. The GPU is 4.6–9.6× faster at every `N`. Relative residuals are at most 7.6 × 10⁻¹⁵ on the GPU and 3.2 × 10⁻¹⁵ on the CPU. Eigenvalues agree to 3.3 × 10⁻¹³ | **refuted** | **Tier 2 is JAX on the GPU** for f64 `eigh` at `N ≥ 10³`. `jax_trial.py` stays: it holds the tier-2 Philox |
| 4 | Contract and Comparator | `lake exe timesarrow contract` computes each claim's status from `collectAxioms`: a `sorry` probe came out as `conjecture`. CI regenerates the contract, and the Linux output is byte-identical to the macOS output. In CI, Comparator (tag v4.34.0, with lean4export built on v4.34.1) certifies all four proved claims against `Challenge.lean`. The Lean job takes 4 min | supported | **Adopt both.** Claim statements live in `Challenge.lean` |
| 5 | Hesper | Its HPP WGSL is valid and bit-exact against a JavaScript reference (0 mismatches in 256², 100 steps, not checked against Lean). But `Exp.eval` is `partial` and returns 0 for u32 bitwise operations, so the kernel cannot be proved equal to the Lean `step`. Upstream it also builds Dawn from source, and it targets Lean v4.28.0 | supported (prediction held) | **Watch.** Revisit if a total evaluator covering u32 operations lands upstream |

### Throughput (10⁹ cell updates/s)

| Host, backend | 1024² | 2048² | 4096² | 8192² |
|---|---|---|---|---|
| Artemis, Chrome (WGSL) | 79 | 153 | 61 | 62 |
| Artemis, Dawn (WGSL) | 89 | 167 | 61 | 61 |
| Artemis, CuPy `RawKernel` | 160 | 174 | 60 | 60 |
| Mac, Chrome (WGSL) | 1.6 | 1.6 | 1.8 | 1.8 |
| Mac, Dawn (WGSL) | 1.7 | 1.7 | 1.8 | 1.8 |

- At 2048² the two lattice buffers (32 MB) fit in the Ada's L2 cache, which is why that column is faster.
- At 1024² CuPy is 2× faster than WGSL, because per-step launch overhead dominates (about 13 µs per step in Chrome, 6 µs in CuPy). This matters only for small lattices run for many steps.
- The CuPy kernel was the same pull-form kernel as the WGSL one, with the same one-`u32`-per-site layout. It is deleted; its results stay in `results/artemis-cupy.json`.

### f64 `eigh` on Artemis (seconds)

| `N` | CPU LAPACK | JAX GPU | GPU speed-up | GPU residual |
|---|---|---|---|---|
| 1000 | 0.16 | 0.035 | 4.6× | 3.6 × 10⁻¹⁵ |
| 2000 | 0.71 | 0.12 | 5.8× | 4.6 × 10⁻¹⁵ |
| 4000 | 3.9 | 0.79 | 5.0× | 4.5 × 10⁻¹⁵ |
| 7000 | 26 | 3.4 | 7.5× | 6.6 × 10⁻¹⁵ |
| 10000 | 91 | 9.5 | 9.6× | 7.6 × 10⁻¹⁵ |

The prediction assumed the 1/64 f64 rate would dominate. It did not. Why
has not been measured.

**Retracted run.** The first run timed CPU LAPACK in the same process after
JAX had started its XLA runtime, and OpenBLAS ran 3–25× slower (4.2 s at
`N = 10³`, against 0.16 s standalone). That run had shown a 14× GPU
speed-up. Its data was deleted. The CPU is now timed before JAX is imported,
and the table above comes from the re-run at `9045c0a`.

### Findings along the way

These are all verified, by reproduction.

- **Silent wrong results on a watchdog reset.** One 500-step submission at 8192² ran about 18 s on the Mac's iGPU. The device was lost, and the readbacks returned zeros or a partial state. WebGPU error scopes did not report it. Fix: about 2²⁷ cell updates per submission, and a `device.lost` check after every bench.
- **Headless Chrome on Linux** returns `null` from the first `requestAdapter` call and the NVIDIA adapter on the second.
- **`layout: "auto"`** drops bindings that an entry point doesn't use, so the `init` dispatch ran against an incompatible bind group and wrote nothing.
- **Provenance flag.** Untracked `results/` files marked the Artemis runs as dirty. At commit `352ae0a` Artemis had no tracked changes. `dirty` now counts tracked changes only.
- **physlib** has no cache that a downstream project can fetch. Its modules build from source on top of Mathlib's cache (the Lorentz group took 41 s).
- **Comparator caveats.**
  - There is no tag for v4.34.1; v4.34.0 plus lean4export on v4.34.1 works.
  - landrun runs with `--best-effort`, so on a kernel without Landlock the sandbox is silently off. CI does not yet check that the sandbox is actually engaged.
- **Lean exporter.** The pretty-printer segfaults in a compiled executable with environment extensions loaded. The contract quotes each statement's source text instead.

### Stack for 001

- **Lean** 4.34.1 with Mathlib (cached) and physlib (built from source for the modules we import), in the `TimesArrow` library. Claims go in `Claims.lean`, their statements in `Challenge.lean`, and `lake exe timesarrow contract` exports the contract.
- **One simulation backend: WGSL.** It runs in the browser for review and in headless Chrome for sweeps, on Artemis for large lattices. Kernel constants come from `contract.json`. `npm run check:gpu` runs the golden vectors and the randomised differential tests against Lean.
- **No tier 1.**
- **Tier 2, JAX with x64 on Artemis,** for f64 dense linear algebra. At
  `N ≥ 10³` it beats CPU LAPACK by 5–10×. Time CPU baselines in a separate
  process, or before JAX starts.
- **Hesper:** watch.

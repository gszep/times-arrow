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

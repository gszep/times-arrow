# Exact enumerations for the causal second law (issue #14)

Exploration only; no claims. Full-distribution enumeration on small 1D rings
of two-state sites, testing the conjecture's items 1–4: relative entropy
between two evolving states on a region whose walls move slower than, at, or
faster than the light cone.

## Model

`a1`: reversible Margolus CA — 2-site blocks on alternating even/odd
partitions, block rule π(a,b) = (b, a⊕b) (00→00, 01→11, 10→01, 11→10),
light cone one site per step. Every 2-bit block permutation is affine over
𝔽₂ (AGL(2,2) is the full group), so "not a pure shift or swap" is the
strongest nonlinearity available at this block size; the rule mixes both
sites and the noise below breaks global affinity. `a2`: a1 followed by
independent bit flips of probability ε per site. Initial states: random
product measures (Philox stream, site bias k/16), a localized-defect product,
and the uniform measure (stationary for both a1 and a2). `c-nonlinear.ts`
repeats the one-site measurement on rings of four-state sites (two bits each)
with genuinely nonlinear rules: Feistel rounds (a,b) ↦ (b, a⊕g(b)) and
generic permutations of the 16 block states.

## Exactness

`a1` keeps every probability dyadic, so all marginals are exact in f64 and
the only error is log rounding (~1e-15). `a2` accumulates ≤ ~1e-15 relative
rounding (ε dyadic). A "violation" means a rise above 1e-10, three orders
above observed residuals; the largest causal-family residual seen is
2.2e-15. `lib-check.ts` unit-tests the marginal fold against a brute-force
sum over all configurations, including site sets that keep site n−1 while
folding out n−2 (the case that exposed a double-counting bug in the fold).

## Commands

```sh
node play/exact/lib-check.ts   # marginal unit tests
node play/exact/a-ca.ts        # experiment A: wall-pattern table, items 1–4
node play/exact/b-onesite.ts   # experiment B: one-site vs full information
node play/exact/c-nonlinear.ts [reversed]  # one-site part under nonlinear/generic 4-state block rules
```

Results, tables and labelled statements: the issue #14 comment.

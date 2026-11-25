# qca play scripts (exploratory, issue #14)

Tier-2 numerics for the free-fermion Dirac quantum walk on a ring
(second-quantised, W = S C, coin exp(-i theta sigma_x), cos omega =
cos theta cos k). Exploration only; no claims. The owner integrates.

- `qca.py` — walk, band basis, Gaussian states, entropies, relative
  entropies; f64 routes (valid while the reference spectrum is
  f64-resolvable) and certified Arb routes (python-flint balls,
  dps 100) with reflection-sector eigendecompositions.
- `validate.py` — V1-V10: brute-force many-body checks of every
  convention (walk, update rule, formulas, Peschel h, certified route).
  Run: `uv run validate.py`.
- `e1_arrow.py` — E1 moving walls; certified vacuum-reference D(t) via
  `uv run e1_arrow.py`; results in `results/e1_arrow.json`.
- `e2_identity.py` — E2 D = Delta<K> - Delta S residuals.
- `e4_classical.py` — E4 classical Ising contrast.

Key numerics fact: the restricted vacuum spectrum piles up
exponentially near 0 and 1 (lambda_min ~ 1e-34 at 60 sites, theta 0.4),
far below f64 resolution, while excited states place non-negligible
weight there; plain f64 relative entropies are then wrong at O(0.1)
(e.g. D = 0.66 f64 vs 0.49 certified at t = 0), so the vacuum-reference
runs use Arb ball arithmetic with the reference rebuilt exactly from
the band projectors (V10 checks the whole pipeline against exact
many-body physics).

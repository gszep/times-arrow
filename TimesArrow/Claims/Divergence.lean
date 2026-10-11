import TimesArrow.Divergence
import TimesArrow.Walker

/-!
# Claims: the discrete divergence theorem on the project's lattices

The lattice of the walker and billiard grids is `Site n = ZMod n × ZMod n`
with nearest-neighbour bonds. These claims pin the divergence theorem to
that lattice in the two forms issue #13's clock rates need: a region's
clock rate is its boundary flux, and an entropy-production weight splits
into interior bonds plus a boundary term that is the same read from
either side.
-/

namespace TimesArrow.Divergence

open TimesArrow.Walker

/-- **A region's clock rate is its boundary flux** — the discrete
divergence theorem on the walker/billiard grid: for any east and north
bond fluxes `e`, `u` on the `n × n` torus (`3 ≤ n`, so the four axial
neighbours of a site are distinct) and any region `V` of sites, the sum
over `V` of each site's east-out minus east-in plus north-out minus
north-in equals the flux from `V` into its complement across the cut.
Bonds internal to `V` are counted at both ends and cancel; the four-term
site divergence is what the GPU kernels accumulate, and the boundary sum
is what the shrinking-region limit of issue #13 reads: a partition's
clock rate is a boundary flux. -/
theorem lattice_clock_rate (n : ℕ) [NeZero n] (h3 : 3 ≤ n)
    (e u : Site n → ℝ) (V : Finset (Site n)) :
    ∑ p ∈ V, (e p - e (p - (1, 0)) + u p - u (p - (0, 1)))
      = outflux (nnFlux n e u) V := by
  calc ∑ p ∈ V, (e p - e (p - (1, 0)) + u p - u (p - (0, 1)))
      = ∑ p ∈ V, div (nnFlux n e u) p :=
        Finset.sum_congr rfl fun p _ => (div_nnFlux n e u p).symm
    _ = outflux (nnFlux n e u) V := sum_div_eq_outflux (nnFlux_antisymm n e u h3) V

/-- **A region's entropy production is interior bonds plus a boundary
term** — the σ-weighted divergence identity on the walker grid: with
bond-field currents `e`, `u` and bond-field affinities `ε`, `ν` (the
driven walker's are the constants `ε = ln 3`, `ν = 0`), the entropy
production gathered by a region's sites counts every interior bond twice,
once per end, and each cut bond once; the boundary term is the same
whether it is summed from inside or from outside the region. -/
theorem lattice_sigma_decomposition (n : ℕ) [NeZero n] (h3 : 3 ≤ n)
    (e u ε ν : Site n → ℝ) (V : Finset (Site n)) :
    ∑ p ∈ V, ∑ q, nnFlux n e u p q * nnFlux n ε ν p q
      = (∑ p ∈ V, ∑ q ∈ V, nnFlux n e u p q * nnFlux n ε ν p q)
        + outflux (nnProd n e u ε ν) V
      ∧ outflux (nnProd n e u ε ν) Vᶜ = outflux (nnProd n e u ε ν) V := by
  refine ⟨sum_div_eq_sum_pair_add_outflux (nnProd n e u ε ν) V, ?_⟩
  exact (Antisymm.mul (nnFlux_antisymm n e u h3) (nnFlux_antisymm n ε ν h3)).outflux_compl_eq_self V

end TimesArrow.Divergence

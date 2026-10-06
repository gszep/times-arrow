import TimesArrow.Markov.Fluctuation

/-!
# Claims: the Markov library

Round-3 conjectures of 002 that live at the library level, stated as claims.
-/

namespace TimesArrow.Markov

open ENNReal

/-- **The mirror tilt identity** (002, K4): the mean of `e ^ (-2σ)` under
the forward path law equals the mean of `e ^ σ`. With the integral
fluctuation theorem it gives the exact variance of the exponential-average
estimator, `(E [e ^ σ] - 1) / R`. -/
theorem mirror_tilt_identity {α : Type*} [Fintype α]
    (p : PMF α) (κ : α → PMF α) (T : ℕ)
    (hac : ∀ ω, pathPMF p κ T (reversePath ω) = 0 → pathPMF p κ T ω = 0) :
    ∑ ω, (pathPMF p κ T ω).toReal
        * Real.exp (-2 * pathEntropyProduction p κ T ω)
      = ∑ ω, (pathPMF p κ T ω).toReal
        * Real.exp (pathEntropyProduction p κ T ω) :=
  sum_mul_exp_two_neg_pathEntropyProduction p κ T hac

end TimesArrow.Markov

import TimesArrow.Markov.EntropyProduction

/-!
# Fluctuation theorems for the trajectory entropy production

For a finite Markov chain, the entropy production of a single trajectory is
the log-ratio of its probability to that of its time reversal
(`TimesArrow.Markov.pathEntropyProduction`). Whenever every trajectory with
positive probability has a reversal with positive probability, this random
variable obeys the two fluctuation theorems of stochastic thermodynamics:

* the **detailed fluctuation theorem**,
  `TimesArrow.Markov.sum_filter_pathEntropyProduction`: the probability that
  the trajectory entropy production takes the value `s` is `e ^ s` times
  the probability that it takes the value `-s`, for every real `s`;
* the **integral fluctuation theorem**,
  `TimesArrow.Markov.sum_mul_exp_neg_pathEntropyProduction`: the trajectory
  entropy production satisfies `∑ ω, P ω * e ^ (-σ ω) = 1`.

Both are combinatorial consequences of time reversal being an involution on
trajectory space; no stationarity is assumed. Stationarity is what lets `σ`
be read as a thermodynamic entropy production: a stationary chain whose
kernel has no one-way transitions (`κ i j = 0 ↔ κ j i = 0`) satisfies the
hypothesis by `TimesArrow.Markov.pathPMF_reversePath_ne_zero`.

## Main results

* `TimesArrow.Markov.pathEntropyProduction_reversePath`: the trajectory
  entropy production flips sign under time reversal.
* `TimesArrow.Markov.toReal_mul_exp_neg_pathEntropyProduction`: the
  probability of a trajectory's reversal is its probability times
  `e ^ (-σ)`, the exponential tilt.
* `TimesArrow.Markov.sum_filter_pathEntropyProduction`: **the detailed
  fluctuation theorem.**
* `TimesArrow.Markov.sum_mul_exp_neg_pathEntropyProduction`: **the integral
  fluctuation theorem.**

## References

* [Seifert, *Stochastic thermodynamics, fluctuation theorems and molecular
  machines*][seifert_2012]: the detailed and integral fluctuation theorems
  for Markov jump processes.
* [Kawai, Parrondo & Van den Broeck, *Dissipation: The Phase-Space
  Perspective*][kawai_parrondo_vandenbroeck_2007]: dissipation as the
  divergence between forward and reversed path measures.
-/

namespace TimesArrow.Markov

open MeasureTheory ENNReal

variable {α : Type*} [Fintype α] [DecidableEq α] (p : PMF α) (κ : α → PMF α)

omit [Fintype α] [DecidableEq α] in
/-- A nonzero `PMF` weight has a nonzero real part. -/
theorem toReal_ne_zero_of_ne_zero {q : PMF α} {x : α} (h : q x ≠ 0) :
    (q x).toReal ≠ 0 :=
  ENNReal.toReal_ne_zero.mpr ⟨h, PMF.apply_ne_top q x⟩

omit [Fintype α] [DecidableEq α] in
/-- **The trajectory entropy production flips sign under time reversal.** -/
theorem pathEntropyProduction_reversePath (T : ℕ)
    (hac : ∀ ω, pathPMF p κ T (reversePath ω) = 0 → pathPMF p κ T ω = 0)
    (ω : Fin (T + 1) → α) :
    pathEntropyProduction p κ T (reversePath ω)
      = -pathEntropyProduction p κ T ω := by
  unfold pathEntropyProduction
  by_cases hω : pathPMF p κ T ω = 0
  · have h0 : pathPMF p κ T (reversePath ω) = 0 :=
      hac (reversePath ω) (by rw [reversePath_involutive ω]; exact hω)
    rw [reversePath_involutive ω, hω, h0]
    simp
  · have h2 : pathPMF p κ T (reversePath ω) ≠ 0 := fun h0 => hω (hac ω h0)
    rw [reversePath_involutive ω,
      Real.log_div (toReal_ne_zero_of_ne_zero h2) (toReal_ne_zero_of_ne_zero hω),
      Real.log_div (toReal_ne_zero_of_ne_zero hω) (toReal_ne_zero_of_ne_zero h2)]
    ring

omit [Fintype α] [DecidableEq α] in
/-- **The exponential tilt.** The probability of the time reversal of a
trajectory is the trajectory's own probability times `e ^ (-σ)`, where `σ`
is the trajectory's entropy production. -/
theorem toReal_mul_exp_neg_pathEntropyProduction (T : ℕ)
    (hac : ∀ ω, pathPMF p κ T (reversePath ω) = 0 → pathPMF p κ T ω = 0)
    (ω : Fin (T + 1) → α) :
    (pathPMF p κ T ω).toReal * Real.exp (-(pathEntropyProduction p κ T ω))
      = (pathPMF p κ T (reversePath ω)).toReal := by
  by_cases hω : pathPMF p κ T ω = 0
  · have h0 : pathPMF p κ T (reversePath ω) = 0 :=
      hac (reversePath ω) (by rw [reversePath_involutive ω]; exact hω)
    rw [hω, h0]
    simp
  · have h2 : pathPMF p κ T (reversePath ω) ≠ 0 := fun h0 => hω (hac ω h0)
    have hpos1 : 0 < (pathPMF p κ T ω).toReal :=
      ENNReal.toReal_pos hω (PMF.apply_ne_top _ _)
    have hpos2 : 0 < (pathPMF p κ T (reversePath ω)).toReal :=
      ENNReal.toReal_pos h2 (PMF.apply_ne_top _ _)
    have h3 : Real.exp (-(Real.log ((pathPMF p κ T ω).toReal
          / (pathPMF p κ T (reversePath ω)).toReal)))
        = (pathPMF p κ T (reversePath ω)).toReal / (pathPMF p κ T ω).toReal := by
      have hn : -(Real.log ((pathPMF p κ T ω).toReal
            / (pathPMF p κ T (reversePath ω)).toReal))
          = Real.log ((pathPMF p κ T (reversePath ω)).toReal
            / (pathPMF p κ T ω).toReal) := by
        rw [Real.log_div (toReal_ne_zero_of_ne_zero hω)
            (toReal_ne_zero_of_ne_zero h2),
          Real.log_div (toReal_ne_zero_of_ne_zero h2)
            (toReal_ne_zero_of_ne_zero hω)]
        ring
      rw [hn, Real.exp_log (div_pos hpos2 hpos1)]
    unfold pathEntropyProduction
    rw [h3]
    field_simp

omit [DecidableEq α] in
/-- **The integral fluctuation theorem.** The trajectory entropy
production `σ` of a chain satisfies `∑ ω, P ω * e ^ (-σ ω) = 1`: the
exponential tilt normalises the reversed path law. -/
theorem sum_mul_exp_neg_pathEntropyProduction (T : ℕ)
    (hac : ∀ ω, pathPMF p κ T (reversePath ω) = 0 → pathPMF p κ T ω = 0) :
    ∑ ω, (pathPMF p κ T ω).toReal
        * Real.exp (-(pathEntropyProduction p κ T ω)) = 1 := by
  have hre : ∑ ω : Fin (T + 1) → α, (pathPMF p κ T (reversePath ω)).toReal
      = ∑ η : Fin (T + 1) → α, (pathPMF p κ T η).toReal :=
    Fintype.sum_equiv
      (⟨reversePath, reversePath, reversePath_involutive,
        reversePath_involutive⟩ : (Fin (T + 1) → α) ≃ (Fin (T + 1) → α))
      _ _ (fun ω => rfl)
  rw [Finset.sum_congr rfl fun ω _ =>
    toReal_mul_exp_neg_pathEntropyProduction p κ T hac ω, hre]
  exact sum_toReal_eq_one _

/-- **The detailed fluctuation theorem.** The probability that the
trajectory entropy production equals `s` is `e ^ s` times the probability
that it equals `-s`, for every real `s`. -/
theorem sum_filter_pathEntropyProduction (T : ℕ)
    (hac : ∀ ω, pathPMF p κ T (reversePath ω) = 0 → pathPMF p κ T ω = 0)
    (s : ℝ) :
    ∑ ω ∈ Finset.univ.filter (fun ω => pathEntropyProduction p κ T ω = s),
        (pathPMF p κ T ω).toReal
      = Real.exp s
        * ∑ ω ∈ Finset.univ.filter (fun ω => pathEntropyProduction p κ T ω = -s),
          (pathPMF p κ T ω).toReal := by
  have hflip := pathEntropyProduction_reversePath p κ T hac
  have himg : (Finset.univ.filter (fun ω => pathEntropyProduction p κ T ω = s)).image
        (reversePath (n := T + 1))
    = Finset.univ.filter (fun ω => pathEntropyProduction p κ T ω = -s) := by
    ext η
    simp only [Finset.mem_image, Finset.mem_filter, Finset.mem_univ, true_and]
    constructor
    · rintro ⟨ω, hω, hrev⟩
      have h1 := hflip ω
      rw [hrev, hω] at h1
      exact h1
    · intro hη
      refine ⟨reversePath η, ?_, reversePath_involutive η⟩
      rw [hflip η, hη, neg_neg]
  have hinj : Set.InjOn (reversePath (n := T + 1))
      (↑(Finset.univ.filter (fun ω => pathEntropyProduction p κ T ω = s)) :
        Set (Fin (T + 1) → α)) :=
    fun _ _ _ _ h => Function.Involutive.injective reversePath_involutive h
  calc ∑ ω ∈ Finset.univ.filter (fun ω => pathEntropyProduction p κ T ω = s),
        (pathPMF p κ T ω).toReal
      = ∑ ω ∈ Finset.univ.filter (fun ω => pathEntropyProduction p κ T ω = s),
          (pathPMF p κ T (reversePath (reversePath ω))).toReal := by
        refine Finset.sum_congr rfl fun ω _ => ?_
        rw [reversePath_involutive ω]
    _ = ∑ η ∈ (Finset.univ.filter
          (fun ω => pathEntropyProduction p κ T ω = s)).image
          (reversePath (n := T + 1)),
          (pathPMF p κ T (reversePath η)).toReal :=
        (Finset.sum_image
          (f := fun η => (pathPMF p κ T (reversePath η)).toReal)
          (g := reversePath (n := T + 1)) hinj).symm
    _ = ∑ η ∈ Finset.univ.filter (fun ω => pathEntropyProduction p κ T ω = -s),
          (pathPMF p κ T (reversePath η)).toReal := by rw [himg]
    _ = Real.exp s * ∑ η ∈ Finset.univ.filter
          (fun ω => pathEntropyProduction p κ T ω = -s),
          (pathPMF p κ T η).toReal := by
        rw [Finset.mul_sum]
        refine Finset.sum_congr rfl fun η hη => ?_
        have hσ : pathEntropyProduction p κ T η = -s :=
          (Finset.mem_filter.mp hη).2
        rw [← toReal_mul_exp_neg_pathEntropyProduction p κ T hac η, hσ, neg_neg,
          mul_comm]

end TimesArrow.Markov

import TimesArrow.Markov.Chain
import TimesArrow.Markov.KlDiv

/-!
# Entropy production as the divergence between forward and reversed paths

For a finite Markov chain `κ` started from a distribution `p`, the *entropy
production* of a trajectory of `T` steps is the Kullback–Leibler divergence
from the law of the time-reversed trajectories to the law of the forward
trajectories. It measures, in nats per trajectory, how much more typical the
observed trajectories are than their time reversals; in this form the second
law is Gibbs' inequality, and the divergence vanishes exactly when the chain
is reversible (in detailed balance).

* `TimesArrow.Markov.entropyProduction p κ T`: the divergence
  `D_KL(pathPMF p κ T ‖ reversedPathPMF p κ T)`.

## Main results

* `TimesArrow.Markov.entropyProduction_nonneg`: **the second law**, entropy
  production is nonnegative.
* `TimesArrow.Markov.toReal_entropyProduction`: the divergence as the mean
  path log-ratio, the observable that a simulation accumulates.
* `TimesArrow.Markov.isReversible_iff_entropyProduction_eq_zero`: the
  entropy production of a chain vanishes for every horizon if and only if
  the chain satisfies detailed balance.

## References

* [Kawai, Parrondo & Van den Broeck, *Dissipation: The Phase-Space
  Perspective*][kawai_parrondo_vandenbroeck_2007]: dissipation as the
  divergence between forward and reversed path measures.
* [Seifert, *Stochastic thermodynamics, fluctuation theorems and molecular
  machines*][seifert_2012]: entropy production of Markov jump processes as
  a Kullback–Leibler divergence of path measures.
-/

namespace TimesArrow.Markov

open MeasureTheory ENNReal

variable {α : Type*} [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α]

/-- **Entropy production** of `T` steps of the chain `κ` started from the
distribution `p`: the Kullback–Leibler divergence from the law of the
time-reversed trajectories to the law of the forward trajectories. -/
noncomputable def entropyProduction (p : PMF α) (κ : α → PMF α) (T : ℕ) : ℝ≥0∞ :=
  InformationTheory.klDiv (pathPMF p κ T).toMeasure (reversedPathPMF p κ T).toMeasure

omit [Fintype α] [MeasurableSingletonClass α] in
/-- **The second law.** The entropy production of any number of steps of any
chain started from any distribution is nonnegative. -/
theorem entropyProduction_nonneg (p : PMF α) (κ : α → PMF α) (T : ℕ) :
    0 ≤ (entropyProduction p κ T).toReal :=
  toReal_klDiv_nonneg (by simp)

/-- The entropy production is the mean, over forward trajectories, of the
log-ratio between a trajectory's probability and that of its time reversal,
provided every forward-typical trajectory has a typical reversal. This is
the observable a simulation accumulates. -/
theorem toReal_entropyProduction (p : PMF α) (κ : α → PMF α) (T : ℕ)
    (hac : ∀ ω, pathPMF p κ T (reversePath ω) = 0 → pathPMF p κ T ω = 0) :
    (entropyProduction p κ T).toReal
      = ∑ ω, (pathPMF p κ T ω).toReal
          * Real.log ((pathPMF p κ T ω).toReal
            / (pathPMF p κ T (reversePath ω)).toReal) := by
  have hac' : ∀ ω, reversedPathPMF p κ T ω = 0 → pathPMF p κ T ω = 0 := fun ω h =>
    hac ω (by rwa [reversedPathPMF_apply] at h)
  rw [entropyProduction, toReal_klDiv_toMeasure _ _ hac']
  exact Finset.sum_congr rfl fun ω _ => by rw [reversedPathPMF_apply]

omit [Fintype α] in
/-- **Detailed balance is the absence of dissipation.** The entropy
production of the chain `κ` with respect to `π` is zero for every horizon
`T` if and only if `κ` satisfies detailed balance with respect to `π`.
No stationarity assumption is needed: detailed balance itself forces
stationarity (`TimesArrow.Markov.IsReversible.isStationary`). -/
theorem isReversible_iff_entropyProduction_eq_zero (κ : α → PMF α) (π : PMF α) :
    IsReversible κ π ↔ ∀ T, entropyProduction π κ T = 0 := by
  constructor
  · intro hκ T
    have hpmf : reversedPathPMF π κ T = pathPMF π κ T := by
      refine PMF.ext fun ω => ?_
      rw [reversedPathPMF_apply, pathPMF_reversePath κ π hκ T ω]
    rw [entropyProduction, hpmf, InformationTheory.klDiv_self]
  · intro hT
    have h1 := hT 1
    have hmeas : (pathPMF π κ 1).toMeasure = (reversedPathPMF π κ 1).toMeasure :=
      InformationTheory.klDiv_eq_zero_iff.mp h1
    have hpmf : pathPMF π κ 1 = reversedPathPMF π κ 1 := PMF.toMeasure_injective hmeas
    intro i j
    have hpw := PMF.ext_iff.mp hpmf (Fin.snoc (fun _ => i) j)
    rw [reversedPathPMF_apply] at hpw
    have hrev : reversePath (Fin.snoc (fun _ => i) j : Fin 2 → α)
        = (Fin.snoc (fun _ => j) i : Fin 2 → α) := by
      funext t
      have h01 : (t : ℕ) = 0 ∨ (t : ℕ) = 1 := by omega
      rcases h01 with h | h
      · have ht : t = 0 := Fin.val_injective h
        subst ht
        simp only [reversePath]
        rw [Fin.rev_zero, Fin.snoc_last, Fin.snoc_apply_zero]
      · have ht : t = 1 := Fin.val_injective h
        subst ht
        have hlast : (1 : Fin 2) = Fin.last 1 := rfl
        rw [hlast]
        simp only [reversePath]
        rw [Fin.rev_last, Fin.snoc_apply_zero, Fin.snoc_last]
    rw [hrev, pathPMF_snoc π κ 0 (fun _ => i) j, pathPMF_snoc π κ 0 (fun _ => j) i,
      pathPMF_apply π κ 0 (fun _ => i), pathPMF_apply π κ 0 (fun _ => j),
      Fin.prod_univ_zero, Fin.prod_univ_zero, mul_one, mul_one] at hpw
    exact hpw

end TimesArrow.Markov

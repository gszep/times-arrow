import Mathlib.Probability.ProbabilityMassFunction.Integrals
import Mathlib.InformationTheory.KullbackLeibler.Basic
import Mathlib.MeasureTheory.Measure.Dirac.Basic

/-!
# The Kullback–Leibler divergence of probability mass functions

`InformationTheory.klDiv` is defined for arbitrary measures through the
log-likelihood ratio of Radon–Nikodym derivatives. On a finite space every
probability measure is induced by a `PMF`, and the divergence between `p` and
`q` reduces to the finite sum `∑ x, p x * log (p x / q x)` that information
theory takes as the definition of the divergence (Gibbs' inequality).

This file provides that bridge. It depends on nothing project-specific and is
written as a candidate for Mathlib.

## Main results

* `TimesArrow.Markov.ae_toMeasure_iff`: a property holds `p.toMeasure`-almost
  everywhere iff it holds on the support of `p`.
* `TimesArrow.Markov.absolutelyContinuous_toMeasure_iff`: absolute continuity
  of `PMF`-induced measures, pointwise.
* `TimesArrow.Markov.toReal_klDiv_toMeasure`: the divergence between two
  `PMF`s on a `Fintype`, as the finite real log-sum.

## References

* [Kawai, Parrondo & Van den Broeck, *Dissipation: The Phase-Space
  Perspective*][kawai_parrondo_vandenbroeck_2007]: the divergence between
  forward and reversed path measures as dissipation.
-/

namespace TimesArrow.Markov

open MeasureTheory NNReal ENNReal

variable {α : Type*} [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α]
variable (p q : PMF α)

/-- A property holds `p.toMeasure`-almost everywhere if and only if it holds
at every point of the support of `p`. -/
theorem ae_toMeasure_iff (P : α → Prop) :
    (∀ᵐ x ∂p.toMeasure, P x) ↔ ∀ x ∈ p.support, P x := by
  rw [Filter.eventually_iff, mem_ae_iff,
    p.toMeasure_apply_eq_zero_iff MeasurableSet.of_discrete]
  rw [Set.disjoint_left]
  simp

/-- The measure of a `PMF` is absolutely continuous with respect to that of
another `PMF` if and only if the support of the first is contained in the
support of the second. -/
theorem absolutelyContinuous_toMeasure_iff :
    p.toMeasure ≪ q.toMeasure ↔ ∀ x, q x = 0 → p x = 0 := by
  constructor
  · intro h x hx
    have hq0 : q.toMeasure {x} = 0 := by
      rw [q.toMeasure_apply_singleton x MeasurableSet.of_discrete]
      exact hx
    have h0 := h hq0
    rwa [p.toMeasure_apply_singleton x MeasurableSet.of_discrete] at h0
  · intro h
    refine Measure.AbsolutelyContinuous.mk fun s _hs hq0 => ?_
    rw [q.toMeasure_apply_eq_zero_iff MeasurableSet.of_discrete] at hq0
    rw [p.toMeasure_apply_eq_zero_iff MeasurableSet.of_discrete]
    refine Set.disjoint_left.mpr fun x hx hxs => ?_
    have hqx : q x = 0 := by
      by_contra hq
      exact (Set.disjoint_right.mp hq0 hxs) ((PMF.mem_support_iff q x).mpr hq)
    exact ((PMF.mem_support_iff p x).mp hx) (h x hqx)

/-- A `PMF`-induced measure is the measure of `q` with the density `p / q`,
when `p` is absolutely continuous with respect to `q`. -/
theorem toMeasure_eq_withDensity (hpq : ∀ x, q x = 0 → p x = 0) :
    p.toMeasure = q.toMeasure.withDensity (fun x => p x / q x) := by
  refine Measure.ext_of_singleton fun x => ?_
  rw [p.toMeasure_apply_singleton x MeasurableSet.of_discrete,
    MeasureTheory.withDensity_apply _ MeasurableSet.of_discrete, lintegral_singleton,
    q.toMeasure_apply_singleton x MeasurableSet.of_discrete]
  by_cases hxq : q x ≠ 0
  · rw [ENNReal.div_mul_cancel hxq (PMF.apply_ne_top q x)]
  · have hpx : p x = 0 := hpq x (not_not.mp hxq)
    simp [hpx]

/-- The log-likelihood ratio of two `PMF`-induced measures at a point of the
support of `q`. -/
theorem llr_toMeasure (hpq : ∀ x, q x = 0 → p x = 0) (x : α) (hxq : q x ≠ 0) :
    MeasureTheory.llr p.toMeasure q.toMeasure x
      = Real.log ((p x).toReal / (q x).toReal) := by
  have hrn : p.toMeasure.rnDeriv q.toMeasure =ᵐ[q.toMeasure] fun x => p x / q x := by
    rw [toMeasure_eq_withDensity p q hpq]
    exact Measure.rnDeriv_withDensity q.toMeasure Measurable.of_discrete
  have hllr : ∀ᵐ y ∂q.toMeasure,
      MeasureTheory.llr p.toMeasure q.toMeasure y = Real.log ((p y / q y).toReal) :=
    hrn.mono fun y hy => by simp [llr_def, hy]
  have h := (ae_toMeasure_iff q _).mp hllr x ((PMF.mem_support_iff q x).mpr hxq)
  rw [h, ENNReal.toReal_div]

/-- **Gibbs' inequality for probability mass functions**: the
Kullback–Leibler divergence between two `PMF`s on a finite type, as a real
number, is the finite log-sum. Points outside the support of `p` contribute
nothing. -/
theorem toReal_klDiv_toMeasure (hpq : ∀ x, q x = 0 → p x = 0) :
    (InformationTheory.klDiv p.toMeasure q.toMeasure).toReal
      = ∑ x, (p x).toReal * Real.log ((p x).toReal / (q x).toReal) := by
  have hac : p.toMeasure ≪ q.toMeasure :=
    (absolutelyContinuous_toMeasure_iff p q).mpr hpq
  have huniv : p.toMeasure Set.univ = q.toMeasure Set.univ := by simp
  rw [InformationTheory.toReal_klDiv_of_measure_eq hac huniv,
    _root_.PMF.integral_eq_sum]
  refine Finset.sum_congr rfl fun x _ => ?_
  by_cases hxq : q x = 0
  · have hpx : p x = 0 := hpq x hxq
    simp [hpx]
  · rw [smul_eq_mul, llr_toMeasure p q hpq x hxq]

/-- **Gibbs' inequality, real form**: the Kullback–Leibler divergence between
two finite measures of equal total mass is nonnegative as a real number. A
divergence of `∞` has real part `0`. -/
theorem toReal_klDiv_nonneg {β : Type*} [MeasurableSpace β] {μ ν : Measure β}
    [IsFiniteMeasure μ] [IsFiniteMeasure ν] (h_eq : μ Set.univ = ν Set.univ) :
    0 ≤ (InformationTheory.klDiv μ ν).toReal := by
  by_cases hac : μ ≪ ν
  · rw [InformationTheory.toReal_klDiv_of_measure_eq hac h_eq]
    by_cases h_int : Integrable (MeasureTheory.llr μ ν) μ
    · have h2 := InformationTheory.integral_llr_add_sub_measure_univ_nonneg hac h_int
      have h3 : ν.real Set.univ = μ.real Set.univ := by
        simp only [measureReal_def, h_eq]
      rw [h3, add_sub_cancel_right] at h2
      exact h2
    · rw [integral_undef h_int]
  · rw [InformationTheory.klDiv_of_not_ac hac, ENNReal.toReal_top]

end TimesArrow.Markov

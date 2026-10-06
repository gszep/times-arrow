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

/-! ### Stationary chains

For a stationary chain with a strictly positive kernel, the entropy
production of `T` steps grows linearly: it is `T` times the per-step
entropy production `∑ i j, π i * κ i j * log (π i * κ i j / π j * κ j i)`,
the expectation of the log flux-ratio under the stationary flux. -/

variable (κ : α → PMF α) (π : PMF α)

omit [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- Every `PMF` gives positive mass to some point. -/
theorem exists_apply_ne_zero (p : PMF α) : ∃ a, p a ≠ 0 := by
  by_contra hcon
  push Not at hcon
  have h0 : ∑' a, p a = 0 := by
    rw [tsum_congr fun a => hcon a]
    exact tsum_zero
  exact zero_ne_one (h0.symm.trans (PMF.tsum_coe p))

omit [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- A stationary distribution of a strictly positive chain has full
support. -/
theorem apply_ne_zero_of_isStationary (hstat : IsStationary κ π)
    (hposκ : ∀ i j, κ i j ≠ 0) (i : α) : π i ≠ 0 := by
  obtain ⟨j, hj⟩ := exists_apply_ne_zero π
  have h1 : π i = ∑' j', π j' * κ j' i := by
    have h := PMF.bind_apply π κ i
    rwa [hstat] at h
  have h2 : π j * κ j i ≤ ∑' j', π j' * κ j' i :=
    ENNReal.le_tsum (f := fun j' => π j' * κ j' i) j
  rw [← h1] at h2
  intro h0
  rw [h0] at h2
  rcases mul_eq_zero.mp (le_zero_iff.mp h2) with h | h
  · exact hj h
  · exact hposκ j i h

omit [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- Every trajectory of a strictly positive chain started from a
distribution with full support has positive probability. -/
theorem pathPMF_ne_zero (hp : ∀ i, p i ≠ 0) (hposκ : ∀ i j, κ i j ≠ 0)
    (T : ℕ) (ω : Fin (T + 1) → α) : pathPMF p κ T ω ≠ 0 := by
  rw [pathPMF_apply p κ T ω]
  exact mul_ne_zero (hp (ω 0)) (Finset.prod_ne_zero_iff.mpr fun t _ => hposκ _ _)

omit [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- The final state of a trajectory of a stationary chain has law `π`. -/
theorem toReal_sum_pathPMF_last (hstat : IsStationary κ π) (T : ℕ) (g : α → ℝ) :
    ∑ ω, (pathPMF π κ T ω).toReal * g (ω (Fin.last T))
      = ∑ i, (π i).toReal * g i := by
  induction T generalizing g with
  | zero =>
      have hE : ∀ ω : Fin 1 → α, (pathPMF π κ 0 ω).toReal * g (ω (Fin.last 0))
          = (π (ω 0)).toReal * g (ω 0) := fun ω => by
        rw [pathPMF_apply π κ 0 ω, Fin.prod_univ_zero, mul_one]
        rfl
      have hbase : ∑ ω : Fin 1 → α, (π (ω 0)).toReal * g (ω 0)
          = ∑ a : α, (π a).toReal * g a :=
        Equiv.sum_comp (⟨fun ω => ω 0, fun a => fun _ => a, fun ω => funext fun t => by
          have ht : t = 0 := by omega
          subst ht
          rfl, fun _ => rfl⟩ : (Fin 1 → α) ≃ α) (fun a => (π a).toReal * g a)
      rw [Finset.sum_congr rfl (fun ω _ => hE ω), hbase]
  | succ T ih =>
      have hreindex : ∑ v : Fin (T + 2) → α, (pathPMF π κ (T + 1) v).toReal
            * g (v (Fin.last (T + 1)))
          = ∑ q : (Fin (T + 1) → α) × α, (pathPMF π κ (T + 1)
              (Fin.snoc q.1 q.2 : Fin (T + 2) → α)).toReal
            * g ((Fin.snoc q.1 q.2 : Fin (T + 2) → α) (Fin.last (T + 1))) :=
        Fintype.sum_equiv (⟨fun v => (Fin.init v, v (Fin.last (T + 1))),
          fun q => Fin.snoc q.1 q.2, fun v => Fin.snoc_init_self v,
          fun q => by simp [Fin.snoc_last, Fin.init_snoc]⟩ :
            (Fin (T + 2) → α) ≃ ((Fin (T + 1) → α) × α)) _ _
          (fun v => show (pathPMF π κ (T + 1) v).toReal * g (v (Fin.last (T + 1)))
              = (pathPMF π κ (T + 1)
                  (Fin.snoc (Fin.init v) (v (Fin.last (T + 1))))).toReal
                * g ((Fin.snoc (Fin.init v) (v (Fin.last (T + 1)))
                  : Fin (T + 2) → α) (Fin.last (T + 1))) from by
            rw [Fin.snoc_init_self v])
      rw [hreindex, Fintype.sum_prod_type]
      have hpeel : ∀ (u : Fin (T + 1) → α) (x : α),
          (pathPMF π κ (T + 1) (Fin.snoc u x)).toReal
            * g ((Fin.snoc u x : Fin (T + 2) → α) (Fin.last (T + 1)))
            = (pathPMF π κ T u).toReal * ((κ (u (Fin.last T)) x).toReal * g x) := by
        intro u x
        rw [pathPMF_snoc π κ T u x, toReal_mul, Fin.snoc_last]
        ring
      simp only [hpeel, ← Finset.mul_sum]
      rw [ih (fun i => ∑ x : α, (κ i x).toReal * g x)]
      have hA : ∀ i : α, (π i).toReal * (∑ x : α, (κ i x).toReal * g x)
          = ∑ x : α, ((π i * κ i x).toReal * g x) := by
        intro i
        rw [Finset.mul_sum]
        refine Finset.sum_congr rfl fun x _ => ?_
        rw [show (π i).toReal * ((κ i x).toReal * g x)
            = ((π i).toReal * (κ i x).toReal) * g x from by ring, ← toReal_mul]
      have hfuse : ∀ x : α, ∑ i : α, ((π i * κ i x).toReal * g x)
          = (π x).toReal * g x := by
        intro x
        rw [← Finset.sum_mul]
        have hne : ∀ i : α, π i * κ i x ≠ ∞ := fun i =>
          ENNReal.mul_ne_top (PMF.apply_ne_top π i) (PMF.apply_ne_top (κ i) x)
        have hsum : ∑ i, (π i * κ i x).toReal = (π x).toReal := by
          have hb : (π.bind κ) x = ∑ a, π a * κ a x := by
            rw [PMF.bind_apply π κ x, tsum_fintype _]
          rw [← toReal_sum (fun i _ => hne i), ← hb, hstat]
        rw [hsum]
      rw [Finset.sum_congr rfl (fun i _ => hA i), Finset.sum_comm,
        Finset.sum_congr rfl (fun x _ => hfuse x)]


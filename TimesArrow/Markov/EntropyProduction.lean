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
* `TimesArrow.Markov.pathEntropyProduction p κ T ω`: the entropy production
  of a single trajectory, the log-ratio of its probability to that of its
  time reversal; the observable a simulation accumulates step by step.

## Main results

* `TimesArrow.Markov.entropyProduction_nonneg`: **the second law**, entropy
  production is nonnegative.
* `TimesArrow.Markov.toReal_entropyProduction`: the divergence as the mean
  of the trajectory entropy production.
* `TimesArrow.Markov.isReversible_iff_entropyProduction_eq_zero`: the
  entropy production of a chain vanishes for every horizon if and only if
  the chain satisfies detailed balance.
* `TimesArrow.Markov.toReal_entropyProduction_eq_natCast_mul_stepEntropyProduction`:
  **extensivity**: for a stationary chain with no one-way transitions, the
  entropy production of `T` steps is `T` times the per-step entropy
  production `stepEntropyProduction`, the mean log flux-ratio under the
  stationary flux.

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

/-- **The entropy production of a single trajectory**: the log-ratio of the
trajectory's probability to that of its time reversal. A simulation of the
chain accumulates exactly this quantity along each trajectory; its mean is
the entropy production (`TimesArrow.Markov.toReal_entropyProduction`) and
its distribution obeys the fluctuation theorems of
`TimesArrow.Markov.Fluctuation`. -/
noncomputable def pathEntropyProduction (p : PMF α) (κ : α → PMF α) (T : ℕ)
    (ω : Fin (T + 1) → α) : ℝ :=
  Real.log ((pathPMF p κ T ω).toReal / (pathPMF p κ T (reversePath ω)).toReal)

omit [Fintype α] [MeasurableSingletonClass α] in
/-- **The second law.** The entropy production of any number of steps of any
chain started from any distribution is nonnegative. -/
theorem entropyProduction_nonneg (p : PMF α) (κ : α → PMF α) (T : ℕ) :
    0 ≤ (entropyProduction p κ T).toReal :=
  toReal_klDiv_nonneg (by simp)

/-- The entropy production is the mean, over forward trajectories, of the
trajectory entropy production, provided every forward-typical trajectory
has a typical reversal. This is the observable a simulation accumulates. -/
theorem toReal_entropyProduction (p : PMF α) (κ : α → PMF α) (T : ℕ)
    (hac : ∀ ω, pathPMF p κ T (reversePath ω) = 0 → pathPMF p κ T ω = 0) :
    (entropyProduction p κ T).toReal
      = ∑ ω, (pathPMF p κ T ω).toReal * pathEntropyProduction p κ T ω := by
  have hac' : ∀ ω, reversedPathPMF p κ T ω = 0 → pathPMF p κ T ω = 0 := fun ω h =>
    hac ω (by rwa [reversedPathPMF_apply] at h)
  rw [entropyProduction, toReal_klDiv_toMeasure _ _ hac']
  refine Finset.sum_congr rfl fun ω _ => ?_
  rw [reversedPathPMF_apply]
  rfl

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

For a stationary chain whose kernel has no one-way transitions
(`κ i j = 0 ↔ κ j i = 0`), the entropy production of `T` steps is extensive:
it equals `T` times the per-step entropy production `stepEntropyProduction`,
the expectation of the log flux-ratio under the stationary flux
`π i * κ i j`. The support hypothesis is what makes every typical
trajectory have a typical reversal, so the path log-ratios are ratios of
positive numbers. It cannot simply be dropped: a chain running a one-way
cycle in parallel with a dissipative reversible part has entropy
production `∞` (whose real part is `0`) but a strictly positive per-step
rate, so the identity fails. -/

variable (κ : α → PMF α) (π : PMF α)

omit [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- **The final state of a trajectory has law `π`.** -/
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

omit [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- The real weights of a `PMF` on a finite type sum to one. -/
theorem sum_toReal_eq_one (p : PMF α) : ∑ a, (p a).toReal = 1 := by
  have h1 : (∑' a, p a).toReal = 1 := by
    rw [p.tsum_coe, ENNReal.toReal_one]
  rw [tsum_fintype p] at h1
  rwa [toReal_sum (fun a _ => PMF.apply_ne_top p a)] at h1

omit [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- **Mass flows forward.** In a stationary chain, a transition from a
positive-mass state lands in a positive-mass state. -/
theorem apply_ne_zero_of_transition (hstat : IsStationary κ π) {i j : α}
    (hi : π i ≠ 0) (hκ : κ i j ≠ 0) : π j ≠ 0 := by
  have h1 : π j = ∑' k, π k * κ k j := by
    have h := PMF.bind_apply π κ j
    rwa [hstat] at h
  have h2 : π i * κ i j ≤ ∑' k, π k * κ k j :=
    ENNReal.le_tsum (f := fun k => π k * κ k j) i
  rw [← h1] at h2
  intro h0
  rw [h0] at h2
  rcases mul_eq_zero.mp (le_zero_iff.mp h2) with h | h
  · exact hi h
  · exact hκ h

omit [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- **Typical trajectories visit positive-mass states.** In a stationary
chain, a trajectory with positive probability only passes through
positive-mass states. -/
theorem apply_ne_zero_of_pathPMF (hstat : IsStationary κ π) (T : ℕ)
    (ω : Fin (T + 1) → α) (hω : pathPMF π κ T ω ≠ 0) (s : Fin (T + 1)) :
    π (ω s) ≠ 0 := by
  induction T with
  | zero =>
      have h0 : π (ω 0) ≠ 0 := by
        have h := pathPMF_apply π κ 0 ω
        rw [Fin.prod_univ_zero, mul_one] at h
        rw [h] at hω
        exact hω
      have hs : s = 0 := Fin.ext (by omega)
      rw [hs]
      exact h0
  | succ T ih =>
      have hw : pathPMF π κ T (Fin.init ω)
          * κ (Fin.init ω (Fin.last T)) (ω (Fin.last (T + 1))) ≠ 0 := by
        have h := pathPMF_snoc π κ T (Fin.init ω) (ω (Fin.last (T + 1)))
        rw [Fin.snoc_init_self ω] at h
        rwa [← h]
      obtain ⟨hinit, hκ⟩ := mul_ne_zero_iff.mp hw
      have hlast : π (ω (Fin.last (T + 1))) ≠ 0 :=
        apply_ne_zero_of_transition κ π hstat
          (ih (Fin.init ω) hinit (Fin.last T)) hκ
      rcases s.eq_castSucc_or_eq_last with ⟨r, hr⟩ | hs
      · rw [hr]
        exact ih (Fin.init ω) hinit r
      · rw [hs]
        exact hlast

omit [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- **Typical trajectories have typical reversals** in a stationary chain
whose kernel has no one-way transitions. This is the hypothesis under which
the entropy production is the mean of a trajectory log-ratio of positive
numbers and the fluctuation theorems of
`TimesArrow.Markov.Fluctuation` apply. -/
theorem pathPMF_reversePath_ne_zero (hstat : IsStationary κ π)
    (hsym : ∀ i j, κ i j = 0 ↔ κ j i = 0) (T : ℕ) (ω : Fin (T + 1) → α)
    (hω : pathPMF π κ T ω ≠ 0) : pathPMF π κ T (reversePath ω) ≠ 0 := by
  have hκF : ∀ t : Fin T, κ (ω t.castSucc) (ω t.succ) ≠ 0 := by
    have h := pathPMF_apply π κ T ω
    rw [h] at hω
    obtain ⟨hπ0, hp⟩ := mul_ne_zero_iff.mp hω
    exact fun t => (Finset.prod_ne_zero_iff.mp hp) t (Finset.mem_univ t)
  rw [pathPMF_reversePath_apply π κ T ω]
  refine mul_ne_zero ?_ (Finset.prod_ne_zero_iff.mpr fun t _ => ?_)
  · exact apply_ne_zero_of_pathPMF κ π hstat T ω hω (Fin.last T)
  · exact fun h => hκF t ((hsym (ω t.succ) (ω t.castSucc)).mp h)

omit [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- **The real weight of a trajectory**: the initial weight times the real
transition weights along the path. -/
theorem toReal_pathPMF_apply (p : PMF α) (κ : α → PMF α) (T : ℕ)
    (ω : Fin (T + 1) → α) :
    (pathPMF p κ T ω).toReal
      = (p (ω 0)).toReal * ∏ t : Fin T, (κ (ω t.castSucc) (ω t.succ)).toReal := by
  rw [pathPMF_apply p κ T ω, toReal_mul, ENNReal.toReal_prod]

omit [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- **The real weight of a reversed trajectory**: the final weight times the
real weights of the reversed transitions. -/
theorem toReal_pathPMF_reversePath_apply (p : PMF α) (κ : α → PMF α) (T : ℕ)
    (ω : Fin (T + 1) → α) :
    (pathPMF p κ T (reversePath ω)).toReal
      = (p (ω (Fin.last T))).toReal
        * ∏ t : Fin T, (κ (ω t.succ) (ω t.castSucc)).toReal := by
  rw [pathPMF_reversePath_apply p κ T ω, toReal_mul, ENNReal.toReal_prod]

/-- The prefix and suffix sums of a line differ by its endpoints. -/
theorem sum_castSucc_sub_sum_succ {n : ℕ} (g : Fin (n + 1) → ℝ) :
    ∑ t : Fin n, g t.castSucc - ∑ t : Fin n, g t.succ
      = g 0 - g (Fin.last n) := by
  have h1 := Fin.sum_univ_succ g
  have h2 := Fin.sum_univ_castSucc g
  linarith

omit [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- **The stationary transition average.** Averaging a function of
consecutive states over the trajectories of a stationary chain, with
trajectory probabilities as weights, gives `T` times its average under the
one-step stationary flux. -/
theorem toReal_sum_pathPMF_transition (hstat : IsStationary κ π) (T : ℕ)
    (f : α → α → ℝ) :
    ∑ ω, (pathPMF π κ T ω).toReal * ∑ t : Fin T, f (ω t.castSucc) (ω t.succ)
      = (T : ℝ) * ∑ i, (π i).toReal * ∑ j, (κ i j).toReal * f i j := by
  induction T generalizing f with
  | zero => simp
  | succ T ih =>
      have hreindex : ∑ v : Fin (T + 2) → α, (pathPMF π κ (T + 1) v).toReal
            * ∑ t : Fin (T + 1), f (v t.castSucc) (v t.succ)
          = ∑ q : (Fin (T + 1) → α) × α, (pathPMF π κ (T + 1)
              (Fin.snoc q.1 q.2 : Fin (T + 2) → α)).toReal
            * ∑ t : Fin (T + 1), f ((Fin.snoc q.1 q.2 : Fin (T + 2) → α) t.castSucc)
              ((Fin.snoc q.1 q.2 : Fin (T + 2) → α) t.succ) :=
        Fintype.sum_equiv (⟨fun v => (Fin.init v, v (Fin.last (T + 1))),
          fun q => Fin.snoc q.1 q.2, fun v => Fin.snoc_init_self v,
          fun q => by simp [Fin.snoc_last, Fin.init_snoc]⟩ :
            (Fin (T + 2) → α) ≃ ((Fin (T + 1) → α) × α)) _ _
          (fun v => show (pathPMF π κ (T + 1) v).toReal
              * ∑ t : Fin (T + 1), f (v t.castSucc) (v t.succ)
              = (pathPMF π κ (T + 1)
                  (Fin.snoc (Fin.init v) (v (Fin.last (T + 1))) : Fin (T + 2) → α)).toReal
                * ∑ t : Fin (T + 1),
                  f ((Fin.snoc (Fin.init v) (v (Fin.last (T + 1)))
                    : Fin (T + 2) → α) t.castSucc)
                  ((Fin.snoc (Fin.init v) (v (Fin.last (T + 1)))
                    : Fin (T + 2) → α) t.succ) from by
            rw [Fin.snoc_init_self v])
      rw [hreindex, Fintype.sum_prod_type]
      have hpeel : ∀ (u : Fin (T + 1) → α) (x : α),
          (pathPMF π κ (T + 1) (Fin.snoc u x : Fin (T + 2) → α)).toReal
            * ∑ t : Fin (T + 1), f ((Fin.snoc u x : Fin (T + 2) → α) t.castSucc)
              ((Fin.snoc u x : Fin (T + 2) → α) t.succ)
          = (pathPMF π κ T u).toReal * ((κ (u (Fin.last T)) x).toReal
              * (∑ t : Fin T, f (u t.castSucc) (u t.succ)
                + f (u (Fin.last T)) x)) := by
        intro u x
        rw [pathPMF_snoc π κ T u x, toReal_mul, Fin.sum_univ_castSucc]
        have h1 : ∀ t : Fin T, ((Fin.snoc u x : Fin (T + 2) → α) t.castSucc.castSucc)
            = u t.castSucc := by
          intro t
          simp
        have h2 : ∀ t : Fin T, ((Fin.snoc u x : Fin (T + 2) → α) t.castSucc.succ)
            = u t.succ := by
          intro t
          simp only [Fin.succ_castSucc, Fin.snoc_castSucc]
        have h3 : ((Fin.snoc u x : Fin (T + 2) → α) (Fin.last T).castSucc)
            = u (Fin.last T) := by simp
        have h4 : ((Fin.snoc u x : Fin (T + 2) → α) (Fin.last T).succ) = x := by
          simp [Fin.succ_last]
        rw [Finset.sum_congr rfl (fun t (_ : t ∈ Finset.univ) => by rw [h1 t, h2 t]), h3, h4]
        ring
      rw [Finset.sum_congr rfl (fun u _ => Finset.sum_congr rfl (fun x _ => hpeel u x))]
      have hsumx : ∀ u : Fin (T + 1) → α,
          ∑ x : α, (κ (u (Fin.last T)) x).toReal
              * (∑ t : Fin T, f (u t.castSucc) (u t.succ) + f (u (Fin.last T)) x)
            = (∑ t : Fin T, f (u t.castSucc) (u t.succ))
              + ∑ x : α, (κ (u (Fin.last T)) x).toReal * f (u (Fin.last T)) x := by
        intro u
        rw [Finset.sum_congr rfl (fun x _ => mul_add _ _ _), Finset.sum_add_distrib,
          ← Finset.sum_mul, sum_toReal_eq_one, one_mul]
      have hsum : ∀ u : Fin (T + 1) → α,
          ∑ x : α, (pathPMF π κ T u).toReal
              * ((κ (u (Fin.last T)) x).toReal
                * (∑ t : Fin T, f (u t.castSucc) (u t.succ)
                  + f (u (Fin.last T)) x))
          = (pathPMF π κ T u).toReal
              * ((∑ t : Fin T, f (u t.castSucc) (u t.succ))
                + ∑ x : α, (κ (u (Fin.last T)) x).toReal * f (u (Fin.last T)) x) := by
        intro u
        rw [← Finset.mul_sum, hsumx u]
      rw [Finset.sum_congr rfl (fun u _ => hsum u)]
      have hsplit : ∀ u : Fin (T + 1) → α,
          (pathPMF π κ T u).toReal
              * ((∑ t : Fin T, f (u t.castSucc) (u t.succ))
                + ∑ x : α, (κ (u (Fin.last T)) x).toReal * f (u (Fin.last T)) x)
          = (pathPMF π κ T u).toReal * ∑ t : Fin T, f (u t.castSucc) (u t.succ)
            + (pathPMF π κ T u).toReal
              * ∑ x : α, (κ (u (Fin.last T)) x).toReal * f (u (Fin.last T)) x :=
        fun u => mul_add _ _ _
      rw [Finset.sum_congr rfl (fun u _ => hsplit u), Finset.sum_add_distrib, ih f,
        toReal_sum_pathPMF_last κ π hstat T
          (fun i => ∑ x : α, (κ i x).toReal * f i x)]
      push_cast
      ring

omit [Fintype α] [MeasurableSpace α] [MeasurableSingletonClass α] in
/-- **A trajectory's entropy production is a sum of flux log-ratios.**
For every trajectory with positive probability, the log-ratio of its
probability to that of its time reversal is the sum, along its
transitions, of the log-ratios of the stationary fluxes: the boundary
weights `π` telescope. -/
theorem pathEntropyProduction_eq_sum (hstat : IsStationary κ π)
    (hsym : ∀ i j, κ i j = 0 ↔ κ j i = 0) (T : ℕ) (ω : Fin (T + 1) → α)
    (hω : pathPMF π κ T ω ≠ 0) :
    pathEntropyProduction π κ T ω
      = ∑ t : Fin T, Real.log ((π (ω t.castSucc) * κ (ω t.castSucc) (ω t.succ)).toReal
          / (π (ω t.succ) * κ (ω t.succ) (ω t.castSucc)).toReal) := by
  have hne : ∀ x : ℝ≥0∞, x ≠ 0 → x ≠ ∞ → x.toReal ≠ 0 :=
    fun x h0 htop => ENNReal.toReal_ne_zero.mpr ⟨h0, htop⟩
  have hpPMF : ∀ q : PMF α, ∀ x : α, q x ≠ 0 → (q x).toReal ≠ 0 :=
    fun q x h => hne _ h (PMF.apply_ne_top q x)
  have hπ : ∀ s : Fin (T + 1), (π (ω s)).toReal ≠ 0 :=
    fun s => hpPMF _ _ (apply_ne_zero_of_pathPMF κ π hstat T ω hω s)
  have hκF' : ∀ t : Fin T, κ (ω t.castSucc) (ω t.succ) ≠ 0 := by
    have h := pathPMF_apply π κ T ω
    have hω' : π (ω 0) * ∏ t : Fin T, κ (ω t.castSucc) (ω t.succ) ≠ 0 := by
      rw [← h]
      exact hω
    obtain ⟨hπ0, hp⟩ := mul_ne_zero_iff.mp hω'
    exact fun t => (Finset.prod_ne_zero_iff.mp hp) t (Finset.mem_univ t)
  have hκB' : ∀ t : Fin T, κ (ω t.succ) (ω t.castSucc) ≠ 0 := fun t h =>
    hκF' t ((hsym (ω t.succ) (ω t.castSucc)).mp h)
  have hκF : ∀ t : Fin T, (κ (ω t.castSucc) (ω t.succ)).toReal ≠ 0 :=
    fun t => hpPMF _ _ (hκF' t)
  have hκB : ∀ t : Fin T, (κ (ω t.succ) (ω t.castSucc)).toReal ≠ 0 :=
    fun t => hpPMF _ _ (hκB' t)
  have hrev := pathPMF_reversePath_ne_zero κ π hstat hsym T ω hω
  have hprodF : (∏ t : Fin T, (κ (ω t.castSucc) (ω t.succ)).toReal) ≠ 0 :=
    Finset.prod_ne_zero_iff.mpr fun t _ => hκF t
  have hprodB : (∏ t : Fin T, (κ (ω t.succ) (ω t.castSucc)).toReal) ≠ 0 :=
    Finset.prod_ne_zero_iff.mpr fun t _ => hκB t
  show Real.log ((pathPMF π κ T ω).toReal / (pathPMF π κ T (reversePath ω)).toReal) = _
  rw [Real.log_div (hne _ hω (PMF.apply_ne_top _ _)) (hne _ hrev (PMF.apply_ne_top _ _)),
    toReal_pathPMF_apply, toReal_pathPMF_reversePath_apply,
    Real.log_mul (hπ 0) hprodF, Real.log_mul (hπ _) hprodB,
    Real.log_prod (fun t _ => hκF t), Real.log_prod (fun t _ => hκB t)]
  have hterm : ∀ t : Fin T,
      Real.log ((π (ω t.castSucc) * κ (ω t.castSucc) (ω t.succ)).toReal
          / (π (ω t.succ) * κ (ω t.succ) (ω t.castSucc)).toReal)
        = (Real.log ((π (ω t.castSucc)).toReal)
            + Real.log ((κ (ω t.castSucc) (ω t.succ)).toReal))
          - (Real.log ((π (ω t.succ)).toReal)
            + Real.log ((κ (ω t.succ) (ω t.castSucc)).toReal)) := by
    intro t
    have hf : (π (ω t.castSucc) * κ (ω t.castSucc) (ω t.succ)).toReal ≠ 0 :=
      hne _ (mul_ne_zero (apply_ne_zero_of_pathPMF κ π hstat T ω hω _)
        (hκF' t)) (ENNReal.mul_ne_top (PMF.apply_ne_top _ _)
        (PMF.apply_ne_top _ _))
    have hb : (π (ω t.succ) * κ (ω t.succ) (ω t.castSucc)).toReal ≠ 0 :=
      hne _ (mul_ne_zero (apply_ne_zero_of_pathPMF κ π hstat T ω hω _)
        (hκB' t)) (ENNReal.mul_ne_top (PMF.apply_ne_top _ _)
        (PMF.apply_ne_top _ _))
    rw [Real.log_div hf hb, ENNReal.toReal_mul, ENNReal.toReal_mul,
      Real.log_mul (hπ _) (hκF t), Real.log_mul (hπ _) (hκB t)]
  rw [Finset.sum_congr rfl (fun t _ => hterm t), Finset.sum_sub_distrib,
    Finset.sum_add_distrib, Finset.sum_add_distrib]
  have htele : (∑ t : Fin T, Real.log ((π (ω t.castSucc)).toReal))
      - ∑ t : Fin T, Real.log ((π (ω t.succ)).toReal)
    = Real.log ((π (ω 0)).toReal) - Real.log ((π (ω (Fin.last T))).toReal) :=
    sum_castSucc_sub_sum_succ (fun s => Real.log ((π (ω s)).toReal))
  linarith

/-- **The per-step entropy production** of a stationary chain `κ` with
respect to `π`: the mean, under the stationary flux `π i * κ i j`, of the
log flux-ratio, in nats per step. -/
noncomputable def stepEntropyProduction (π : PMF α) (κ : α → PMF α) : ℝ :=
  ∑ i, ∑ j, (π i * κ i j).toReal
    * Real.log ((π i * κ i j).toReal / (π j * κ j i).toReal)

/-- **Extensivity of entropy production.** For a stationary chain whose
kernel has no one-way transitions (`κ i j = 0 ↔ κ j i = 0`), the entropy
production of `T` steps is `T` times the per-step entropy production. -/
theorem toReal_entropyProduction_eq_natCast_mul_stepEntropyProduction
    (hstat : IsStationary κ π) (hsym : ∀ i j, κ i j = 0 ↔ κ j i = 0) (T : ℕ) :
    (entropyProduction π κ T).toReal = (T : ℝ) * stepEntropyProduction π κ := by
  have hac : ∀ ω, pathPMF π κ T (reversePath ω) = 0 → pathPMF π κ T ω = 0 :=
    fun ω h => by_contra fun hω => (pathPMF_reversePath_ne_zero κ π hstat hsym T ω hω) h
  have hpt : ∀ ω : Fin (T + 1) → α,
      (pathPMF π κ T ω).toReal * pathEntropyProduction π κ T ω
        = (pathPMF π κ T ω).toReal
          * ∑ t : Fin T, Real.log ((π (ω t.castSucc) * κ (ω t.castSucc) (ω t.succ)).toReal
            / (π (ω t.succ) * κ (ω t.succ) (ω t.castSucc)).toReal) := by
    intro ω
    by_cases hω : pathPMF π κ T ω = 0
    · have hz : (pathPMF π κ T ω).toReal = 0 :=
        (ENNReal.toReal_eq_zero_iff _).mpr (Or.inl hω)
      rw [hz, zero_mul, zero_mul]
    · rw [pathEntropyProduction_eq_sum κ π hstat hsym T ω hω]
  have hflux : ∀ i : α,
      (π i).toReal * ∑ j, (κ i j).toReal * Real.log ((π i * κ i j).toReal
          / (π j * κ j i).toReal)
        = ∑ j, (π i * κ i j).toReal * Real.log ((π i * κ i j).toReal
          / (π j * κ j i).toReal) := by
    intro i
    rw [Finset.mul_sum]
    refine Finset.sum_congr rfl fun j _ => ?_
    have hm : (π i * κ i j).toReal = (π i).toReal * ((κ i) j).toReal := toReal_mul
    rw [hm]
    ring
  calc (entropyProduction π κ T).toReal
      = ∑ ω, (pathPMF π κ T ω).toReal * pathEntropyProduction π κ T ω :=
        toReal_entropyProduction π κ T hac
    _ = ∑ ω, (pathPMF π κ T ω).toReal
          * ∑ t : Fin T, Real.log ((π (ω t.castSucc) * κ (ω t.castSucc) (ω t.succ)).toReal
            / (π (ω t.succ) * κ (ω t.succ) (ω t.castSucc)).toReal) :=
        Finset.sum_congr rfl fun ω _ => hpt ω
    _ = (T : ℝ) * ∑ i, (π i).toReal * ∑ j, (κ i j).toReal * Real.log
          ((π i * κ i j).toReal / (π j * κ j i).toReal) :=
        toReal_sum_pathPMF_transition κ π hstat T
          (fun i j => Real.log ((π i * κ i j).toReal / (π j * κ j i).toReal))
    _ = (T : ℝ) * stepEntropyProduction π κ := by
        congr 1
        simp only [stepEntropyProduction]
        exact Finset.sum_congr rfl fun i _ => hflux i

/-- **The per-step second law.** The per-step entropy production of a
stationary chain with no one-way transitions is nonnegative: it is the
entropy production of one step. -/
theorem stepEntropyProduction_nonneg (hstat : IsStationary κ π)
    (hsym : ∀ i j, κ i j = 0 ↔ κ j i = 0) :
    0 ≤ stepEntropyProduction π κ := by
  have h := toReal_entropyProduction_eq_natCast_mul_stepEntropyProduction κ π hstat hsym 1
  have h2 := entropyProduction_nonneg π κ 1
  rw [h] at h2
  simpa using h2

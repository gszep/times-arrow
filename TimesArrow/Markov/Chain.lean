import Mathlib.Probability.ProbabilityMassFunction.Monad
import Mathlib.Data.Fin.Tuple.Basic
import Mathlib.Algebra.BigOperators.Fin

/-!
# Finite Markov chains: reversibility, stationarity and path measures

A finite Markov chain on a type `α` is a transition kernel `κ : α → PMF α`:
`κ i` is the distribution of the next state given the present state `i`. This
file defines the fundamental probability objects of such a chain on a finite
state space and proves the basic structural facts about them.

* `TimesArrow.Markov.IsStationary κ π`: `π` is a stationary distribution of
  `κ`, i.e. `π.bind κ = π` (the `PMF` form of `ProbabilityTheory.Kernel.Invariant`).
* `TimesArrow.Markov.IsReversible κ π`: `κ` satisfies detailed balance with
  respect to `π`, i.e. `π i * κ i j = π j * κ j i` pointwise (the `PMF` form
  of `ProbabilityTheory.Kernel.IsReversible`, which is stated for flows
  between measurable sets).
* `TimesArrow.Markov.pathPMF p κ T`: the law of a trajectory of `T` steps of
  the chain started from the distribution `p`, a `PMF` on `Fin (T + 1) → α`.
* `TimesArrow.Markov.reversePath`: the time reversal of a trajectory.
* `TimesArrow.Markov.reversedPathPMF p κ T`: the law of the time-reversed
  trajectories, the image of `pathPMF p κ T` under `reversePath`.

## Main results

* `TimesArrow.Markov.IsReversible.isStationary`: detailed balance implies
  stationarity.
* `TimesArrow.Markov.pathPMF_apply`: the explicit product formula for the
  probability of a trajectory, `p (ω 0) * ∏ t, κ (ω t) (ω (t + 1))`.
* `TimesArrow.Markov.pathPMF_reversePath`: under detailed balance every
  trajectory is exactly as probable as its time reversal.

## References

* [Levin, Peres & Wilmer, *Markov Chains and Mixing Times* (AMS, 2nd
  ed.)][levin_peres_wilmer_2017], Chapter 1: finite chains, stationary
  distributions and reversibility.
* [Kawai, Parrondo & Van den Broeck, *Dissipation: The Phase-Space
  Perspective*][kawai_parrondo_vandenbroeck_2007]: path probabilities of a
  chain and their time reversal, as dissipation.
-/

namespace TimesArrow.Markov

open MeasureTheory ENNReal

variable {α : Type*} (κ : α → PMF α) (π : PMF α)

/-- `π` is a stationary distribution of the chain `κ`: one step of the chain
leaves `π` unchanged. -/
def IsStationary : Prop :=
  π.bind κ = π

/-- The chain `κ` satisfies detailed balance (is reversible) with respect to
`π`: the probability flux from `i` to `j` equals the flux from `j` to `i`. -/
def IsReversible : Prop :=
  ∀ i j, π i * κ i j = π j * κ j i

/-- **Detailed balance implies stationarity.** A reversible chain leaves its
reversing distribution invariant. -/
theorem IsReversible.isStationary (hκ : IsReversible κ π) : IsStationary κ π := by
  refine PMF.ext fun i => ?_
  rw [PMF.bind_apply, tsum_congr fun j => hκ j i, ENNReal.tsum_mul_left, PMF.tsum_coe, mul_one]

/-- The time reversal of a trajectory: the states read backwards. -/
def reversePath {n : ℕ} (ω : Fin n → α) : Fin n → α :=
  fun t => ω t.rev

theorem reversePath_apply {n : ℕ} (ω : Fin n → α) (t : Fin n) :
    reversePath ω t = ω t.rev :=
  rfl

theorem reversePath_involutive {n : ℕ} :
    Function.Involutive (reversePath : (Fin n → α) → Fin n → α) := by
  intro ω
  ext t
  simp [reversePath]

/-- The law of trajectories of `T` steps of the chain `κ` started from the
distribution `p`. A trajectory is a function `ω : Fin (T + 1) → α`; the law is
built by growing a trajectory one step at a time at its end. -/
noncomputable def pathPMF (p : PMF α) (κ : α → PMF α) : ∀ T : ℕ, PMF (Fin (T + 1) → α)
  | 0 => p.bind fun x => PMF.pure fun _ => x
  | T + 1 =>
    (pathPMF p κ T).bind fun ω =>
      (κ (ω (Fin.last T))).bind fun x => PMF.pure (Fin.snoc ω x)

/-- Peeling the last step off a trajectory: the probability of a trajectory
extended by one step is the probability of its prefix times the transition
probability of that step. -/
theorem pathPMF_snoc (p : PMF α) (κ : α → PMF α) (T : ℕ) (ω : Fin (T + 1) → α) (x : α) :
    pathPMF p κ (T + 1) (Fin.snoc ω x) = pathPMF p κ T ω * κ (ω (Fin.last T)) x := by
  simp only [pathPMF, PMF.bind_apply]
  rw [tsum_eq_single ω]
  · rw [tsum_eq_single x]
    · simp only [PMF.pure_apply_self, mul_one]
    · intro b hb
      have hne : Fin.snoc ω x ≠ Fin.snoc ω b := fun h => hb (by
        have h2 := congrArg (fun v : Fin (T + 2) → α => v (Fin.last (T + 1))) h
        simp only [Fin.snoc_last] at h2
        exact h2.symm)
      simp [hne]
  · intro b hb
    have hb' : ∀ x', @Fin.snoc (T + 1) (fun _ => α) ω x
        ≠ @Fin.snoc (T + 1) (fun _ => α) b x' := fun x' h => hb (by
      funext (i : Fin (T + 1))
      have h2 := congrFun h (Fin.castSucc i)
      simp only [Fin.snoc_castSucc] at h2
      exact h2.symm)
    rw [ENNReal.tsum_eq_zero.mpr (fun x' => by simp [hb' x']), mul_zero]

/-- **The probability of a trajectory.** The law of `T`-step trajectories is
the explicit Markov product: the probability of the initial state times the
transition probabilities along the path. -/
theorem pathPMF_apply (p : PMF α) (κ : α → PMF α) (T : ℕ) (ω : Fin (T + 1) → α) :
    pathPMF p κ T ω = p (ω 0) * ∏ t : Fin T, κ (ω t.castSucc) (ω t.succ) := by
  induction T with
  | zero =>
      have hω : ω = fun _ => ω 0 := funext fun t => by
        have ht : t = 0 := by omega
        subst ht
        rfl
      simp only [pathPMF, PMF.bind_apply, PMF.pure_apply, Fin.prod_univ_zero, mul_one]
      rw [tsum_eq_single (ω 0)]
      · rw [ite_eq_left hω, mul_one]
      · intro b hb
        rw [ite_eq_right (fun h => hb (congrFun h 0).symm), mul_zero]
  | succ T ih =>
      have heq : pathPMF p κ (T + 1) ω
          = pathPMF p κ T (Fin.init ω) * κ (Fin.init ω (Fin.last T)) (ω (Fin.last (T + 1))) := by
        conv => lhs; rw [← Fin.snoc_init_self ω]
        exact pathPMF_snoc p κ T (Fin.init ω) (ω (Fin.last (T + 1)))
      rw [heq, ih (Fin.init ω), Fin.prod_univ_castSucc]
      simp only [Fin.init, Fin.succ_castSucc, Fin.succ_last]
      rw [mul_assoc]
      try rfl

/-- The weight of a trajectory read backwards, in product form. -/
theorem pathPMF_reversePath_apply (p : PMF α) (κ : α → PMF α) (T : ℕ) (ω : Fin (T + 1) → α) :
    pathPMF p κ T (reversePath ω)
      = p (ω (Fin.last T)) * ∏ t : Fin T, κ (ω t.succ) (ω t.castSucc) := by
  rw [pathPMF_apply p κ T (reversePath ω)]
  have h0 : reversePath ω 0 = ω (Fin.last T) := by
    simp [reversePath, Fin.rev_zero]
  rw [h0, ← Equiv.prod_comp (Fin.revPerm (n := T))
    (fun s => κ (ω s.succ) (ω s.castSucc))]
  congr 1
  refine Finset.prod_congr rfl fun t _ => ?_
  have h1 : t.castSucc.rev = (t.rev.succ : Fin (T + 1)) := by
    apply Fin.ext
    simp only [Fin.val_rev, Fin.val_succ, Fin.val_castSucc]
    omega
  have h2 : t.succ.rev = (t.rev.castSucc : Fin (T + 1)) := by
    apply Fin.ext
    simp only [Fin.val_rev, Fin.val_succ, Fin.val_castSucc]
    omega
  simp only [reversePath, Fin.revPerm_apply]
  rw [h1, h2]

/-- Under detailed balance the two path weights agree: the product of the
fluxes `π i * κ i j` along a trajectory equals the product of the reversed
fluxes, because the factors telescope. -/
theorem balanced_prod (hκ : IsReversible κ π) (T : ℕ) (ω : Fin (T + 1) → α) :
    π (ω (Fin.last T)) * ∏ t : Fin T, κ (ω t.succ) (ω t.castSucc)
      = π (ω 0) * ∏ t : Fin T, κ (ω t.castSucc) (ω t.succ) := by
  induction T with
  | zero => simp
  | succ T ih =>
      have hIH : π (ω (Fin.last T).castSucc)
          * ∏ t : Fin T, κ (ω t.succ.castSucc) (ω t.castSucc.castSucc)
          = π (ω 0)
            * ∏ t : Fin T, κ (ω t.castSucc.castSucc) (ω t.succ.castSucc) := ih (Fin.init ω)
      rw [Fin.prod_univ_castSucc, Fin.prod_univ_castSucc]
      simp only [Fin.succ_castSucc]
      rw [Fin.succ_last]
      calc π (ω (Fin.last (T + 1)))
            * ((∏ t : Fin T, κ (ω t.succ.castSucc) (ω t.castSucc.castSucc))
              * κ (ω (Fin.last (T + 1))) (ω (Fin.last T).castSucc))
          = (π (ω (Fin.last (T + 1)))
              * κ (ω (Fin.last (T + 1))) (ω (Fin.last T).castSucc))
            * ∏ t : Fin T, κ (ω t.succ.castSucc) (ω t.castSucc.castSucc) := by ring
        _ = (π (ω (Fin.last T).castSucc)
              * κ (ω (Fin.last T).castSucc) (ω (Fin.last (T + 1))))
            * ∏ t : Fin T, κ (ω t.succ.castSucc) (ω t.castSucc.castSucc) := by
            rw [hκ (ω (Fin.last (T + 1))) (ω (Fin.last T).castSucc)]
        _ = κ (ω (Fin.last T).castSucc) (ω (Fin.last (T + 1)))
            * (π (ω (Fin.last T).castSucc)
              * ∏ t : Fin T, κ (ω t.succ.castSucc) (ω t.castSucc.castSucc)) := by ring
        _ = κ (ω (Fin.last T).castSucc) (ω (Fin.last (T + 1)))
            * (π (ω 0)
              * ∏ t : Fin T, κ (ω t.castSucc.castSucc) (ω t.succ.castSucc)) := by rw [hIH]
        _ = π (ω 0)
            * ((∏ t : Fin T, κ (ω t.castSucc.castSucc) (ω t.succ.castSucc))
              * κ (ω (Fin.last T).castSucc) (ω (Fin.last (T + 1)))) := by ring

/-- **Reversibility means the path law is invariant under time reversal.**
Under detailed balance every trajectory is exactly as probable as its time
reversal. -/
theorem pathPMF_reversePath (hκ : IsReversible κ π) (T : ℕ) (ω : Fin (T + 1) → α) :
    pathPMF π κ T (reversePath ω) = pathPMF π κ T ω := by
  rw [pathPMF_reversePath_apply π κ T ω, pathPMF_apply π κ T ω]
  exact balanced_prod κ π hκ T ω

/-- The law of the time-reversed trajectories: the image of the forward path
law under `reversePath`. -/
noncomputable def reversedPathPMF (p : PMF α) (κ : α → PMF α) (T : ℕ) :
    PMF (Fin (T + 1) → α) :=
  (pathPMF p κ T).bind fun ω => PMF.pure (reversePath ω)

theorem reversedPathPMF_apply (p : PMF α) (κ : α → PMF α) (T : ℕ) (ω : Fin (T + 1) → α) :
    reversedPathPMF p κ T ω = pathPMF p κ T (reversePath ω) := by
  simp only [reversedPathPMF, PMF.bind_apply]
  rw [tsum_eq_single (reversePath ω)]
  · simp only [reversePath_involutive ω, PMF.pure_apply_self, mul_one]
  · intro b hb
    rw [PMF.pure_apply_of_ne (reversePath b) ω (fun hsn => hb (by
        have h2 : reversePath ω = b := by
          rw [congrArg reversePath hsn, reversePath_involutive b]
        exact h2.symm)), mul_zero]

/-- **The transposed kernel runs the chain backwards.** If `κ'` is the
transpose of `κ` (`κ' i j = κ j i`) and the start distribution `p` is
constant (uniform over its support), the probability of a trajectory under
`κ'` is the probability of its time reversal under `κ`. -/
theorem pathPMF_reversePath_eq_transpose (κ κ' : α → PMF α)
    (h : ∀ i j, κ' i j = κ j i) (p : PMF α) (hp : ∀ x y, p x = p y)
    (T : ℕ) (ξ : Fin (T + 1) → α) :
    pathPMF p κ T (reversePath ξ) = pathPMF p κ' T ξ := by
  rw [pathPMF_reversePath_apply p κ T ξ, pathPMF_apply p κ' T ξ,
    hp (ξ (Fin.last T)) (ξ 0)]
  have hprod : ∏ t : Fin T, (κ (ξ t.succ)) (ξ t.castSucc)
      = ∏ t : Fin T, (κ' (ξ t.castSucc)) (ξ t.succ) :=
    Finset.prod_congr rfl fun t _ => (h (ξ t.castSucc) (ξ t.succ)).symm
  rw [hprod]

/-- **The reversed path law is the path law of the transposed kernel**,
for a constant start distribution: running the transposed chain forward
samples exactly the time-reversed trajectories of the original chain. -/
theorem reversedPathPMF_eq_pathPMF_transpose (κ κ' : α → PMF α)
    (h : ∀ i j, κ' i j = κ j i) (p : PMF α) (hp : ∀ x y, p x = p y) (T : ℕ) :
    reversedPathPMF p κ T = pathPMF p κ' T := by
  refine PMF.ext fun ξ => ?_
  rw [reversedPathPMF_apply, pathPMF_reversePath_eq_transpose κ κ' h p hp T ξ]

end TimesArrow.Markov

import TimesArrow.CausalEntropy
import TimesArrow.LatticeGas
import TimesArrow.Claims

/-!
# Causal second law claims

The HPP and FHP instances of the causal second law: relative entropy
restricted to a region cannot increase when the later region lies inside
the domain of dependence of the earlier one (`TimesArrow.CausalEntropy`
proves the general law), a fixed region breaks it, and — because the
dynamics is reversible — the law holds in both time directions, so by
itself it gives no arrow of time.
-/

open MeasureTheory InformationTheory
open scoped ENNReal

namespace TimesArrow.LatticeGas

/-- The `t`-step HPP dynamics is causal for `(S, R)` whenever `S`
contains every `t`-step diamond of a site of `R`: configurations that
agree on `S` still agree on `R` after `t` steps. The lattice light-cone
speed is one cell per step, so this containment is sufficient for `R` at
time `t` to lie inside the domain of dependence of `S` at time `0`. It is
not necessary: after one step a site reads its four neighbours but not
itself. -/
theorem causal (n : ℕ) [NeZero n] (t : ℕ) (S R : Set (Site n))
    (h : (⋃ p ∈ R, diamond n p t) ⊆ S) :
    Causal ((stepState n)^[t]) S R := by
  intro s₁ s₂ hS x xR
  exact lightcone_agreement n t x s₁ s₂
    fun q hq => hS q (h (Set.mem_iUnion₂.2 ⟨x, xR, hq⟩))

/-- **The causal second law for HPP.** After `t` steps of HPP, the
relative entropy of two measures restricted to `R` is at most their
relative entropy restricted to `S`, whenever `S` contains every `t`-step
diamond of a site of `R`. Inside the domain of dependence, restriction
cannot create distinguishability. -/
theorem causal_second_law (n : ℕ) [NeZero n] (t : ℕ) (S R : Set (Site n))
    (h : (⋃ p ∈ R, diamond n p t) ⊆ S)
    (μ ν : Measure (State n)) [IsFiniteMeasure μ] [IsFiniteMeasure ν] :
    klDiv ((μ.map ((stepState n)^[t])).map (restrict R))
        ((ν.map ((stepState n)^[t])).map (restrict R))
      ≤ klDiv (μ.map (restrict S)) (ν.map (restrict S)) :=
  klDiv_le_of_causal (causal n t S R h)

/-- **The causal second law holds in both time directions.** HPP's step is
invertible, with the inverse of the `t`-step map given by conjugating
with `revState` (reverse the velocities, then collide). The reversed
dynamics satisfies the same light cones, so the causal second law holds
for it too: the inequality gives no arrow of time by itself. -/
theorem causal_second_law_reverse (n : ℕ) [NeZero n] (t : ℕ) (S R : Set (Site n))
    (h : (⋃ p ∈ R, diamond n p t) ⊆ S)
    (μ ν : Measure (State n)) [IsFiniteMeasure μ] [IsFiniteMeasure ν] :
    (∀ s, revStepState n t ((stepState n)^[t] s) = s) ∧
    (∀ s, (stepState n)^[t] (revStepState n t s) = s) ∧
    klDiv ((μ.map (revStepState n t)).map (restrict R))
        ((ν.map (revStepState n t)).map (restrict R))
      ≤ klDiv (μ.map (restrict S)) (ν.map (restrict S)) := by
  have hstep : ∀ u : State n,
      stepState n (revState n (stepState n u)) = revState n u := by
    intro u
    have h := stepState_rev n (revState n u)
    rwa [revState_involutive n] at h
  have hinv : ∀ (t : ℕ) (u : State n),
      revStepState n t ((stepState n)^[t] u) = u ∧
      (stepState n)^[t] (revStepState n t u) = u := by
    intro t
    induction t with
    | zero => intro u; simp [revStepState, revState_involutive n u]
    | succ t ih =>
      intro u
      have e1 : (stepState n)^[t + 1] u = stepState n ((stepState n)^[t] u) :=
        Function.iterate_succ_apply' _ _ _
      have e2 : ∀ z, (stepState n)^[t + 1] z = (stepState n)^[t] (stepState n z) :=
        fun _ => Function.iterate_succ_apply _ _ _
      constructor
      · show revState n ((stepState n)^[t + 1] (revState n ((stepState n)^[t + 1] u))) = u
        rw [e2, e1, hstep]
        exact (ih u).1
      · show (stepState n)^[t + 1] (revState n ((stepState n)^[t + 1] (revState n u))) = u
        rw [e2, Function.iterate_succ_apply', hstep]
        exact (ih u).2
  have hcrev : Causal (revStepState n t) S R := by
    intro s₁ s₂ hS x xR
    have hrev : ∀ q ∈ S, revState n s₁ q = revState n s₂ q :=
      fun q hq => by simpa only [revState] using congrArg rev16 (hS q hq)
    have hlc := lightcone_agreement n t x (revState n s₁) (revState n s₂)
      fun q hq => hrev q (h (Set.mem_iUnion₂.2 ⟨x, xR, hq⟩))
    simpa only [revStepState, revState] using congrArg rev16 hlc
  exact ⟨fun u => (hinv t u).1, fun u => (hinv t u).2,
    klDiv_le_of_causal hcrev⟩

/-- **A decided violation: a fixed region lets information in.** On the
4×4 HPP lattice, compare the single east-going particle at the origin
with the empty lattice, through the fixed one-site region `{(1, 0)}`.
The restricted states coincide before the step — divergence `0` — but one
step later the particle has entered the region and the restricted images
differ — divergence `∞`. Causality fails for `S = R` a fixed region,
exactly as the converse `TimesArrow.causal_of_klDiv_le` predicts. -/
theorem wall_violation :
    klDiv ((Measure.dirac (east4 : State 4)).map (restrict ({(1, 0)} : Set (Site 4))))
        ((Measure.dirac (0 : State 4)).map (restrict ({(1, 0)} : Set (Site 4)))) = 0 ∧
    klDiv (((Measure.dirac (east4 : State 4)).map (stepState 4)).map
          (restrict ({(1, 0)} : Set (Site 4))))
        (((Measure.dirac (0 : State 4)).map (stepState 4)).map
          (restrict ({(1, 0)} : Set (Site 4)))) = ∞ := by
  have hres : Measurable (restrict (Cell := Fin 16) ({(1, 0)} : Set (Site 4))) :=
    by exact Measurable.of_discrete
  have hstep : Measurable (stepState 4) := by exact Measurable.of_discrete
  have hagree : restrict ({(1, 0)} : Set (Site 4)) (east4 : State 4)
      = restrict ({(1, 0)} : Set (Site 4)) (0 : State 4) := by
    funext x
    have hx : x.val = (1, 0) := Set.mem_singleton_iff.mp x.property
    simp only [restrict, hx, east4, Pi.zero_apply]
    decide
  have hne : restrict ({(1, 0)} : Set (Site 4)) (stepState 4 (east4 : State 4))
      ≠ restrict ({(1, 0)} : Set (Site 4)) (stepState 4 (0 : State 4)) := by
    intro heq
    have hx := congrFun heq ⟨(1, 0), by simp⟩
    simp only [restrict] at hx
    have e1 : stepState 4 (east4 : State 4) (1, 0) = 1 := by decide +kernel
    have e2 : stepState 4 (0 : State 4) (1, 0) = 0 := by decide +kernel
    rw [e1, e2] at hx
    exact absurd hx (by decide)
  constructor
  · rw [Measure.map_dirac' hres east4, Measure.map_dirac' hres (0 : State 4),
      hagree, klDiv_self]
  · rw [Measure.map_dirac' hstep (east4 : State 4),
      Measure.map_dirac' hstep (0 : State 4),
      Measure.map_dirac' hres (stepState 4 (east4 : State 4)),
      Measure.map_dirac' hres (stepState 4 (0 : State 4)),
      klDiv_dirac_dirac_of_ne hne]

end TimesArrow.LatticeGas

namespace TimesArrow.FHP

/-- **The causal second law for FHP.** The `t`-step FHP evolution with a
fixed collision field is causal for `(S, R)` whenever `S` contains every
`t`-step hexagonal light cone of a site of `R`, and the causal second law
follows: the divergence seen in `R` after `t` steps is at most the
divergence present in `S`. -/
theorem causal_second_law (n : ℕ) [NeZero n] (b : ℕ → Site n → Bool) (t : ℕ)
    (S R : Set (Site n)) (h : (⋃ p ∈ R, {q | hexBall n t p q}) ⊆ S)
    (μ ν : Measure (State n)) [IsFiniteMeasure μ] [IsFiniteMeasure ν] :
    klDiv ((μ.map (evolve n b t)).map (restrict R))
        ((ν.map (evolve n b t)).map (restrict R))
      ≤ klDiv (μ.map (restrict S)) (ν.map (restrict S)) := by
  refine klDiv_le_of_causal ?_
  intro s₁ s₂ hS x xR
  exact lightcone n b t x s₁ s₂
    fun q hq => hS q (h (Set.mem_iUnion₂.2 ⟨x, xR, hq⟩))

end TimesArrow.FHP

import TimesArrow.Philox
import TimesArrow.LatticeGas
import TimesArrow.Reversible

/-!
# Claims

Every theorem with a docstring in `TimesArrow.Claims` (or a module under
`TimesArrow.Claims.*`) is a claim, exported to the contract with the axioms
it uses. Each statement is also written, with `sorry`, in `Challenge.lean`,
and Comparator checks in CI that these proofs prove exactly those
statements. Library lemmas elsewhere may carry docstrings; they are not
claims.
-/

namespace TimesArrow.Philox

/-- Philox matches the Random123 known-answer vectors. -/
theorem philox_kat : ∀ v ∈ kat, philox v.1 v.2.1 v.2.2.1 = v.2.2.2 := by
  decide +kernel

end TimesArrow.Philox

namespace TimesArrow.LatticeGas

/-- Collisions are their own inverse. -/
theorem collide_collide (s : UInt32) : collide (collide s) = s := by
  unfold collide
  by_cases h5 : s = 0b0101 <;> by_cases h10 : s = 0b1010 <;> simp [h5, h10]

/-- Collisions commute with velocity reversal. -/
theorem collide_flip :
    ∀ s : Fin 16, collide (flip s.val.toUInt32) = flip (collide s.val.toUInt32) := by
  decide +kernel

/-- Collisions conserve the particle number. -/
theorem collide_mass :
    ∀ s : Fin 16, mass (collide s.val.toUInt32) = mass s.val.toUInt32 := by
  decide +kernel

/-- HPP conserves the total number of particles. -/
theorem mass_conserved (n : ℕ) [NeZero n] (s : State n) :
    ∑ p, mass16 (stepState n s p) = ∑ p, mass16 (s p) := by
  have h : ∑ p, mass16 (stepState n s p) = ∑ p, mass16 (collideState n s p) :=
    streamState_mass n (collideState n s)
  rw [h]
  exact Finset.sum_congr rfl fun p _ => collide16_mass16 (s p)

/-- One HPP step is a bijection. Its inverse is the step conjugated by
`revState`: reverse every velocity and collide (an involution), step, and do
both again. Plain velocity reversal does not invert the step — with
step = stream ∘ collide, flip ∘ step ∘ flip = stream⁻¹ ∘ collide, which
differs from step⁻¹ = collide ∘ stream⁻¹ because collisions and streaming
do not commute. -/
theorem step_inverse (n : ℕ) [NeZero n] :
    Function.Bijective (stepState n) ∧ ∀ s : State n,
      stepState n (revState n (stepState n (revState n s))) = s ∧
        revState n (stepState n (revState n (stepState n s))) = s := by
  have h := Function.involutive_conj_inverse (stepState n) (revState n)
    (revState_involutive n) (stepState_rev n)
  exact ⟨h.1, fun s => ⟨stepState_rev n s, h.2 s⟩⟩

/-- The Loschmidt echo: evolve `t` steps, reverse every velocity and collide,
evolve `t` steps, and do it again: every state returns to itself. -/
theorem loschmidt_echo (n : ℕ) [NeZero n] (t : ℕ) (s : State n) :
    revState n ((stepState n)^[t] (revState n ((stepState n)^[t] s))) = s :=
  Function.involutive_conj_echo (stepState n) (revState n) (revState_involutive n)
    (stepState_rev n) t s

end TimesArrow.LatticeGas

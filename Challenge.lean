import TimesArrow.Philox
import TimesArrow.LatticeGas

/-!
The claim statements that Comparator certifies, each proved by `sorry` here
and for real in `TimesArrow/Claims.lean`. Review these statements, not the
proofs.
-/

namespace TimesArrow.Philox

theorem philox_kat : ∀ v ∈ kat, philox v.1 v.2.1 v.2.2.1 = v.2.2.2 := by
  sorry

end TimesArrow.Philox

namespace TimesArrow.LatticeGas

theorem collide_collide (s : UInt32) : collide (collide s) = s := by
  sorry

theorem collide_flip :
    ∀ s : Fin 16, collide (flip s.val.toUInt32) = flip (collide s.val.toUInt32) := by
  sorry

theorem collide_mass :
    ∀ s : Fin 16, mass (collide s.val.toUInt32) = mass s.val.toUInt32 := by
  sorry

theorem mass_conserved (n : ℕ) [NeZero n] (s : State n) :
    ∑ p, mass16 (stepState n s p) = ∑ p, mass16 (s p) := by
  sorry

theorem lightcone (n : ℕ) [NeZero n] (t : ℕ) (p : Site n) (s₁ s₂ : State n)
    (h : ∀ q ∈ diamond n p t, s₁ q = s₂ q) :
    (stepState n)^[t] s₁ p = (stepState n)^[t] s₂ p := by
  sorry

theorem lightcone_point (n : ℕ) [NeZero n] (t : ℕ) (r p : Site n) (s₁ s₂ : State n)
    (h : ∀ q, q ≠ r → s₁ q = s₂ q) (hp : p ∉ diamond n r t) :
    (stepState n)^[t] s₁ p = (stepState n)^[t] s₂ p := by
  sorry

theorem momentum_conserved (n : ℕ) [NeZero n] (s : State n) :
    (∀ y : ZMod n, ∑ x, px16 (stepState n s (x, y)) = ∑ x, px16 (s (x, y))) ∧
    (∀ x : ZMod n, ∑ y, py16 (stepState n s (x, y)) = ∑ y, py16 (s (x, y))) ∧
    (∑ p, px16 (stepState n s p) = ∑ p, px16 (s p)) ∧
    (∑ p, py16 (stepState n s p) = ∑ p, py16 (s p)) := by
  sorry

theorem column_momentum_refuted :
    ∑ y, px16 (stepState 4 east4 (0, y)) ≠ ∑ y, px16 (east4 (0, y)) := by
  sorry

theorem step_inverse (n : ℕ) [NeZero n] :
    Function.Bijective (stepState n) ∧ ∀ s : State n,
      stepState n (revState n (stepState n (revState n s))) = s ∧
        revState n (stepState n (revState n (stepState n s))) = s := by
  sorry

theorem loschmidt_echo (n : ℕ) [NeZero n] (t : ℕ) (s : State n) :
    revState n ((stepState n)^[t] (revState n ((stepState n)^[t] s))) = s := by
  sorry

end TimesArrow.LatticeGas

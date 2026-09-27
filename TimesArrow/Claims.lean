import TimesArrow.Philox
import TimesArrow.LatticeGas

/-!
# Claims

Every theorem with a docstring in a `TimesArrow` module is a claim, exported
to the contract with the axioms it uses. Each statement is also written, with
`sorry`, in `Challenge.lean`, and Comparator checks in CI that these proofs
prove exactly those statements.
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

end TimesArrow.LatticeGas

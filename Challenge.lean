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

end TimesArrow.LatticeGas

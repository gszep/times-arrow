import TimesArrow.Philox
import TimesArrow.LatticeGas
import TimesArrow.Selection
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

/-- Selection sampling selects exactly the particles asked for: the
exact-`count` subset state of a lattice region holds exactly
`min count (4 · side²)` particles — every slot when the count exceeds the
region. -/
theorem subset_mass (seed : UInt32) (n x0 y0 side count : ℕ) [NeZero n]
    (hx : x0 + side ≤ n) (hy : y0 + side ≤ n) :
    ∑ p, mass16 (subsetState seed n x0 y0 side count p) = min count (4 * side * side) :=
  subsetState_mass seed n x0 y0 side count hx hy

/-- The packed start of 001: exactly `n²/8` particles — half the velocity
slots of the centred block of side `n/4` — and no particle outside the
block (the block geometry is exact once `8 ∣ n`, in particular for every
power-of-two lattice of the registered sizes). -/
theorem packed_start (seed : UInt32) (n : ℕ) [NeZero n] (h8 : 8 ∣ n) :
    ∑ p, mass16 (packedState seed n p) = n * n / 8 ∧
    ∀ p : Site n,
      ¬ inRegion n (n / 2 - (n / 4) / 2) (n / 2 - (n / 4) / 2) (n / 4) p →
        packedState seed n p = 0 := by
  obtain ⟨m, rfl⟩ : ∃ m, n = 8 * m := h8
  have hx : 8 * m / 2 - (8 * m / 4) / 2 + 8 * m / 4 ≤ 8 * m := by omega
  have hy : 8 * m / 2 - (8 * m / 4) / 2 + 8 * m / 4 ≤ 8 * m := by omega
  refine ⟨?_, fun p hp =>
    subsetState_outside seed (8 * m) (8 * m / 2 - (8 * m / 4) / 2)
      (8 * m / 2 - (8 * m / 4) / 2) (8 * m / 4) (8 * m * (8 * m) / 8) p
      (by simpa using hp)⟩
  have h := subsetState_mass seed (8 * m) (8 * m / 2 - (8 * m / 4) / 2)
    (8 * m / 2 - (8 * m / 4) / 2) (8 * m / 4) (8 * m * (8 * m) / 8) hx hy
  simp only [packedState, subsetState] at h ⊢
  have e1 : 8 * m * (8 * m) / 8 = 8 * m * m := by
    have re : 8 * m * (8 * m) = 8 * (8 * m * m) := by ring
    rw [re, Nat.mul_div_cancel_left (8 * m * m) (by omega : 0 < 8)]
  have e2 : 4 * (8 * m / 4) * (8 * m / 4) = 16 * m * m := by
    have hdiv : 8 * m / 4 = 2 * m := by omega
    rw [hdiv]; ring
  have e3 : 8 * m * m ≤ 16 * m * m :=
    Nat.mul_le_mul_right m (by omega : 8 * m ≤ 16 * m)
  rw [h, e1, e2]
  omega

/-- The null start of 001 is exact-`n²/8`: the uniform subset over all
`4n²` velocity slots holds exactly `n²/8` particles. -/
theorem null_start (seed : UInt32) (n : ℕ) [NeZero n] :
    ∑ p, mass16 (nullState seed n p) = n * n / 8 := by
  have h := subsetState_mass seed n 0 0 n (n * n / 8) (by omega) (by omega)
  simp only [nullState]
  have hle : n * n / 8 ≤ 4 * n * n := by
    have hle1 : n * n / 8 ≤ n * n := Nat.div_le_self _ _
    have hle2 : 4 * n * n = 4 * (n * n) := by ring
    omega
  rw [h]
  omega

/-- Light cone: after `t` steps the value at any site `p` depends only on
the initial values within lattice L1 distance `t` of `p` — the diamond
|dx| + |dy| ≤ t with periodic distance, so it wraps around the lattice. -/
theorem lightcone (n : ℕ) [NeZero n] (t : ℕ) (p : Site n) (s₁ s₂ : State n)
    (h : ∀ q ∈ diamond n p t, s₁ q = s₂ q) :
    (stepState n)^[t] s₁ p = (stepState n)^[t] s₂ p :=
  lightcone_agreement n t p s₁ s₂ h

/-- A change at a single site `r` can only be seen, `t` steps later, at
sites within `r`'s diamond of radius `t`. -/
theorem lightcone_point (n : ℕ) [NeZero n] (t : ℕ) (r p : Site n) (s₁ s₂ : State n)
    (h : ∀ q, q ≠ r → s₁ q = s₂ q) (hp : p ∉ diamond n r t) :
    (stepState n)^[t] s₁ p = (stepState n)^[t] s₂ p :=
  lightcone_outside n t r p s₁ s₂ h hp

/-- HPP conserves momentum in the direction it can be carried: the
x-momentum of each row (#east − #west summed along the row) and the
y-momentum of each column are invariant, and so are both components of the
total momentum. -/
theorem momentum_conserved (n : ℕ) [NeZero n] (s : State n) :
    (∀ y : ZMod n, ∑ x, px16 (stepState n s (x, y)) = ∑ x, px16 (s (x, y))) ∧
    (∀ x : ZMod n, ∑ y, py16 (stepState n s (x, y)) = ∑ y, py16 (s (x, y))) ∧
    (∑ p, px16 (stepState n s p) = ∑ p, px16 (s p)) ∧
    (∑ p, py16 (stepState n s p) = ∑ p, py16 (s p)) :=
  ⟨stepState_row_px n s, stepState_col_py n s, stepState_total_px n s, stepState_total_py n s⟩

/-- Refuted: x-momentum is not conserved per column. A single east-going
particle on the 4×4 lattice carries its x-momentum from column 0 into
column 1 in one step. Per-row y-momentum fails the same way. -/
theorem column_momentum_refuted :
    ∑ y, px16 (stepState 4 east4 (0, y)) ≠ ∑ y, px16 (east4 (0, y)) := by
  decide +kernel

/-- Checkerboard (even n only): every particle carries the label
(x + y + t) mod 2 forever — streaming moves it to the other sublattice each
step and collisions happen within a sublattice — so the mass sitting on each
labelled checkerboard is conserved. The wrap across the periodic seam keeps
the labelling consistent only when n is even; odd n has no such invariant. -/
theorem checkerboard (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (t : ℕ) (c : ZMod 2) (s : State n) :
    labelMass n h2 t c ((stepState n)^[t] s) = labelMass n h2 0 c s :=
  labelMass_iter n h2 t c s

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

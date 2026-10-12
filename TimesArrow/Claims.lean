import TimesArrow.Philox
import TimesArrow.LatticeGas
import TimesArrow.Selection
import TimesArrow.Reversible
import TimesArrow.FHP

/-!
# Claims

Every theorem with a docstring in `TimesArrow.Claims` (or a module under
`TimesArrow.Claims.*`) is a claim, exported to the contract with the axioms
it uses. Each statement is also written, with `sorry`, in `Challenge.lean`,
and Comparator checks in CI that these proofs prove exactly those
statements. Library lemmas elsewhere may carry docstrings; they are not
claims.
-/

namespace TimesArrow.FHP

/-- Each fixed chirality is a permutation of all 64 cells. Its inverse uses
the opposite chirality, including on the symmetric triples. -/
theorem collision_bijective (b : Bool) : Function.Bijective (collide b) := by
  have left : Function.LeftInverse (collide (!b)) (collide b) := collide_inverse b
  have right : Function.RightInverse (collide (!b)) (collide b) := by
    intro s
    simpa only [Bool.not_not] using collide_inverse (!b) s
  exact ⟨left.injective, right.surjective⟩

/-- Both collision chiralities conserve particle number and both integer
momentum components in the `(E, NE)` basis, at every cell. -/
theorem collision_conserves : ∀ (b : Bool) (s : Cell),
    mass (collide b s) = mass s ∧ momentum (collide b s) = momentum s := by
  decide +kernel

/-- On every positive even periodic lattice, the exact two-sided inverse
unstreams first, then collides with opposite chirality at the original site.
The field `b` must be replayed from the same seed and original time. -/
theorem step_inverse (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (b : Site n → Bool)
    (s : State n) :
    inverseState n b (stepState n b s) = s ∧
      stepState n b (inverseState n b s) = s := by
  constructor
  · unfold inverseState stepState
    rw [unstream_stream n h2]
    funext p
    exact collide_inverse (b p) (s p)
  · have hc : collision n b (collision n (fun p => !(b p)) (unstream n s)) =
        unstream n s := by
      funext p
      simpa only [Bool.not_not, collision] using collide_inverse (!(b p)) (unstream n s p)
    unfold stepState inverseState
    rw [hc, stream_unstream n h2]

/-- A fixed seed/time collision field gives a bijection of the whole lattice.
Randomized collision does not lose information when that field is retained. -/
theorem step_bijective (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (b : Site n → Bool) :
    Function.Bijective (stepState n b) := by
  have left : Function.LeftInverse (inverseState n b) (stepState n b) :=
    fun s => (step_inverse n h2 b s).1
  have right : Function.RightInverse (inverseState n b) (stepState n b) :=
    fun s => (step_inverse n h2 b s).2
  exact ⟨left.injective, right.surjective⟩

/-- Each full FHP step conserves total particle number and total momentum
on every positive even periodic lattice, for any chirality field. -/
theorem step_conserves (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (b : Site n → Bool)
    (s : State n) :
    (∑ p, mass (stepState n b s p)) = ∑ p, mass (s p) ∧
    (∑ p, momentum (stepState n b s p)) = ∑ p, momentum (s p) := by
  constructor
  · change (∑ p, ∑ k, (bits k (stream n (collision n b s) p)).toNat) = _
    rw [stream_sum n h2 (collision n b s) (fun _ v => v.toNat)]
    exact Finset.sum_congr rfl fun p _ => (collision_conserves (b p) (s p)).1
  · change (∑ p, ∑ k, (bits k (stream n (collision n b s) p)).toNat • velocity k) = _
    rw [stream_sum n h2 (collision n b s) (fun k v => v.toNat • velocity k)]
    exact Finset.sum_congr rfl fun p _ => (collision_conserves (b p) (s p)).2

/-- Strict hexagonal light cone: with the same time-dependent collision
field, agreement within `t` hex edges implies agreement at time `t`.
The propagation speed is at most one hex edge per step, including seams. -/
theorem lightcone (n : ℕ) [NeZero n] (b : ℕ → Site n → Bool) (t : ℕ)
    (p : Site n) (s₁ s₂ : State n)
    (h : ∀ q, hexBall n t p q → s₁ q = s₂ q) :
    evolve n b t s₁ p = evolve n b t s₂ p := by
  induction t generalizing p with
  | zero => exact h p rfl
  | succ t ih =>
    simp only [evolve, stepState, stream, collision]
    apply congrArg assemble
    funext k
    have hh := ih (neighbour n p (opposite k)) (fun q hq => h q (Or.inr ⟨opposite k, hq⟩))
    rw [hh]

/-- Refutation of the HPP checkerboard population invariant for this gas:
one NW particle on a 4×4 torus changes its `(x+y+t) mod 2` label. -/
theorem checkerboard_counterexample :
    labelMass 4 0 0 singleNW = 1 ∧
    labelMass 4 1 0 (stepState 4 (fun _ => false) singleNW) = 0 := by
  decide +kernel

/-- Refutation of HPP-like row momentum conservation: a NW particle carries
nonzero horizontal momentum from row 0 to row 1 in one hexagonal step. -/
theorem row_momentum_counterexample :
    rowMomentum 4 0 singleNW = (-1, 1) ∧
    rowMomentum 4 0 (stepState 4 (fun _ => false) singleNW) = (0, 0) := by
  decide +kernel

/-- The 4×4 hexagonal neighbour graph contains a triangle, so no binary
site colouring can flip on every hop. This excludes every HPP-style
alternating two-sublattice label, not just the coordinate checkerboard. -/
theorem no_alternating_coloring (color : Site 4 → Bool) :
    ¬ (∀ p k, color (neighbour 4 p k) = !(color p)) := by
  intro h
  have h0 := h (0, 0) 0
  have h1 := h (1, 0) 2
  have h2 := h (0, 1) 4
  have e0 : neighbour 4 (0, 0) 0 = (1, 0) := by decide +kernel
  have e1 : neighbour 4 (1, 0) 2 = (0, 1) := by decide +kernel
  have e2 : neighbour 4 (0, 1) 4 = (0, 0) := by decide +kernel
  rw [e0] at h0
  rw [e1, h0, Bool.not_not] at h1
  rw [e2, h1] at h2
  cases hc : color (0, 0) <;> simp [hc] at h2

end TimesArrow.FHP

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

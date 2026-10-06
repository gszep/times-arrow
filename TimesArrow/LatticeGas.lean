import TimesArrow.Philox
import Mathlib.Data.ZMod.Basic

/-!
# HPP lattice gas

The reversible lattice gas of Hardy, Pomeau and de Pazzis (1973) on a
periodic `n × n` square lattice. A site holds four occupation bits, one per
velocity: bit 0 moves `+x` (east), bit 1 `+y` (north), bit 2 `−x` (west),
bit 3 `−y` (south). One step collides at every site, then streams every
particle one cell, so the light-cone speed is one cell per step.

Two representations of a state:
* the model, `State n`: a function from sites `ZMod n × ZMod n` to the
  four-bit occupation values `Fin 16`. Every theorem is about the model.
* the executable, `Array UInt32` with site `(x, y)` at index `y * n + x`:
  `step` materialises one model step and `run` iterates it. The golden
  vectors in the contract and the WGSL kernels follow the same layout.
-/

namespace TimesArrow.LatticeGas

/-! ## Executable site algebra -/

/-- Head-on pairs with no other particles rotate by 90°. -/
def collide (s : UInt32) : UInt32 :=
  if s = 0b0101 then 0b1010 else if s = 0b1010 then 0b0101 else s

/-- Reverse every velocity: east ↔ west, north ↔ south. -/
def flip (s : UInt32) : UInt32 := ((s <<< 2) ||| (s >>> 2)) &&& 0xF

/-- The number of particles at a site. -/
def mass (s : UInt32) : UInt32 :=
  let bit (k : UInt32) : UInt32 := s >>> k &&& 1
  bit 0 + bit 1 + bit 2 + bit 3

/-- Occupation bit `k` of a site value: 0 east, 1 north, 2 west, 3 south. -/
def bits (k : Fin 4) (s : Fin 16) : Bool := s.val.testBit (k : ℕ)

/-- The site value with the given occupation bits. -/
def assemble (b : Fin 4 → Bool) : Fin 16 :=
  ⟨(b 0).toNat + 2 * (b 1).toNat + 4 * (b 2).toNat + 8 * (b 3).toNat, by
    have h0 : (b 0).toNat ≤ 1 := by cases b 0 <;> simp
    have h1 : (b 1).toNat ≤ 1 := by cases b 1 <;> simp
    have h2 : (b 2).toNat ≤ 1 := by cases b 2 <;> simp
    have h3 : (b 3).toNat ≤ 1 := by cases b 3 <;> simp
    omega⟩

/-- The number of particles at a four-bit site value. -/
def mass16 (s : Fin 16) : ℕ := ∑ k : Fin 4, (bits k s).toNat

/-- x-momentum of a site value: #east − #west. -/
def px16 (s : Fin 16) : ℤ := (bits 0 s).toNat - (bits 2 s).toNat

/-- y-momentum of a site value: #north − #south. -/
def py16 (s : Fin 16) : ℤ := (bits 1 s).toNat - (bits 3 s).toNat

/-- The collision rule on four-bit site values. -/
def collide16 (s : Fin 16) : Fin 16 :=
  ⟨(collide s.val.toUInt32).toNat % 16, Nat.mod_lt _ (by omega)⟩

/-- Velocity reversal on four-bit site values. -/
def flip16 (s : Fin 16) : Fin 16 :=
  ⟨(flip s.val.toUInt32).toNat % 16, Nat.mod_lt _ (by omega)⟩

/-- Reverse velocities, then collide: the time-reversal conjugator. -/
def rev16 (s : Fin 16) : Fin 16 := collide16 (flip16 s)

/-! ## The model -/

/-- Sites of the periodic `n × n` lattice. -/
abbrev Site (n : ℕ) := ZMod n × ZMod n

/-- A lattice state: four occupation bits per site. -/
abbrev State (n : ℕ) := Site n → Fin 16

/-- The velocity of direction `k` as an integer offset:
east, north, west, south for `k` = 0, 1, 2, 3. -/
def velInt (k : Fin 4) : ℤ × ℤ :=
  match k.val with
  | 0 => (1, 0) | 1 => (0, 1) | 2 => (-1, 0) | _ => (0, -1)

/-- The unit velocity of direction `k` at a site. -/
def vel (n : ℕ) [NeZero n] (k : Fin 4) : Site n :=
  (((velInt k).1 : ZMod n), ((velInt k).2 : ZMod n))

/-- Velocity reversal everywhere. -/
def flipState (n : ℕ) (s : State n) : State n := fun p => flip16 (s p)

/-- The collision rule everywhere. -/
def collideState (n : ℕ) (s : State n) : State n := fun p => collide16 (s p)

/-- Streaming in pull form: bit `k` at `p` comes from `p − vel k`. -/
def streamState (n : ℕ) [NeZero n] (s : State n) : State n :=
  fun p => assemble (fun k => bits k (s (p - vel n k)))

/-- One step: collide, then stream. -/
def stepState (n : ℕ) [NeZero n] (s : State n) : State n :=
  streamState n (collideState n s)

/-- Reverse velocities and collide everywhere: the time-reversal conjugator. -/
def revState (n : ℕ) (s : State n) : State n := fun p => rev16 (s p)

/-- The forward light cone of `p`: sites within lattice L1 distance `t`,
with periodic distance, so the diamond |dx| + |dy| ≤ t wraps around the
lattice. -/
def diamond (n : ℕ) (p : Site n) (t : ℕ) : Set (Site n) :=
  {q | ∃ u v : ℤ, u.natAbs + v.natAbs ≤ t ∧
    (u : ZMod n) = q.1 - p.1 ∧ (v : ZMod n) = q.2 - p.2}

/-- The one-particle test state for the momentum refutations: a single
east-going particle at the origin of the 4×4 lattice. -/
def east4 : State 4 := fun p => if p = (0, 0) then 1 else 0

/-! ## The executable -/

/-- Read a state from an array of site values, keeping the low four bits. -/
def fromArray (n : ℕ) (a : Array UInt32) : State n :=
  fun p => ⟨(a.getD (p.2.val * n + p.1.val) 0).toNat % 16, Nat.mod_lt _ (by omega)⟩

/-- Materialise a state as an array, site `(x, y)` at index `y * n + x`. -/
def toArray (n : ℕ) (s : State n) : Array UInt32 :=
  Array.ofFn (n := n * n) fun i => (s ((i.val % n : ZMod n), (i.val / n : ZMod n))).val.toUInt32

/-- One step on the materialised representation: the model step. -/
def step (n : ℕ) (a : Array UInt32) : Array UInt32 :=
  match n with
  | 0 => #[]
  | n + 1 => toArray (n + 1) (stepState (n + 1) (fromArray (n + 1) a))

/-- The initial state for a seed: four independent fair bits per site. -/
def init (seed : UInt32) (n : Nat) : Array UInt32 :=
  Array.ofFn (n := n * n) fun i => (Philox.rand seed 0 i.val.toUInt32).x0 &&& 0xF

/-- `t` steps from `init seed n`. -/
def run (seed : UInt32) (n t : Nat) : Array UInt32 :=
  t.repeat (step n) (init seed n)

/-! ## Site algebra -/

/-- `assemble` rebuilds exactly the given bits. -/
theorem bits_assemble (b : Fin 4 → Bool) (k : Fin 4) : bits k (assemble b) = b k := by
  decide +kernel +revert

/-- Bits determine the site value. -/
theorem assemble_bits (s : Fin 16) : assemble (fun k => bits k s) = s := by
  decide +kernel +revert

/-- Two site values with the same occupation bits are equal. -/
theorem bits_ext (s t : Fin 16) (h : ∀ k, bits k s = bits k t) : s = t := by
  rw [← assemble_bits s, ← assemble_bits t]; exact congrArg assemble (funext h)

/-- Adding 2 twice, mod 4, is the identity. -/
theorem fin4_rot (k : Fin 4) : k + 2 + 2 = k := by decide +kernel +revert

/-- Velocity reversal swaps bit `k` with the opposite direction. -/
theorem flip16_bits (s : Fin 16) (k : Fin 4) : bits k (flip16 s) = bits (k + 2) s := by
  decide +kernel +revert

/-- Velocity reversal is an involution on site values. -/
theorem flip16_flip16 (s : Fin 16) : flip16 (flip16 s) = s := by
  refine bits_ext _ _ fun k => ?_
  rw [flip16_bits, flip16_bits, fin4_rot]

/-- Collisions are their own inverse on site values. -/
theorem collide16_collide16 (s : Fin 16) : collide16 (collide16 s) = s := by
  decide +kernel +revert

/-- Collisions commute with velocity reversal. -/
theorem collide16_flip16 (s : Fin 16) : collide16 (flip16 s) = flip16 (collide16 s) := by
  decide +kernel +revert

/-- Collisions conserve the particle number. -/
theorem collide16_mass16 (s : Fin 16) : mass16 (collide16 s) = mass16 s := by
  decide +kernel +revert

/-- Collisions conserve both momentum components. -/
theorem collide16_px16 (s : Fin 16) : px16 (collide16 s) = px16 s := by decide +kernel +revert

theorem collide16_py16 (s : Fin 16) : py16 (collide16 s) = py16 s := by decide +kernel +revert

/-- The reversal conjugator is an involution on site values. -/
theorem rev16_rev16 (s : Fin 16) : rev16 (rev16 s) = s := by decide +kernel +revert

/-- Colliding the reversal conjugator away leaves velocity reversal. -/
theorem collide16_rev16 (s : Fin 16) : collide16 (rev16 s) = flip16 s := by decide +kernel +revert

/-- Every velocity is a unit step along one axis. -/
theorem velInt_natAbs (k : Fin 4) : (velInt k).1.natAbs + (velInt k).2.natAbs = 1 := by
  decide +kernel +revert

/-- Direction `k + 2` is the direction opposite to `k`. -/
theorem velInt_neg (k : Fin 4) : velInt (k + 2) = -velInt k := by decide +kernel +revert

/-- Direction `k + 2` is the direction opposite to `k`. -/
theorem vel_neg (n : ℕ) [NeZero n] (k : Fin 4) : vel n (k + 2) = -vel n k := by
  have h1 : ((-velInt k).1 : ℤ) = -((velInt k).1 : ℤ) := rfl
  have h2 : ((-velInt k).2 : ℤ) = -((velInt k).2 : ℤ) := rfl
  simp only [vel, velInt_neg, h1, h2, Int.cast_neg]
  rfl

/-! ## The model step -/

/-- Streaming reads bit `k` of the source site `p − vel k`. -/
theorem streamState_bits (n : ℕ) [NeZero n] (s : State n) (p : Site n) (k : Fin 4) :
    bits k (streamState n s p) = bits k (s (p - vel n k)) :=
  bits_assemble _ k

/-- Conjugating streaming by reversal inverts it:
`stream⁻¹ = flipState ∘ streamState ∘ flipState`. -/
theorem streamRev_bits (n : ℕ) [NeZero n] (s : State n) (p : Site n) (k : Fin 4) :
    bits k (flipState n (streamState n (flipState n s)) p) = bits k (s (p + vel n k)) := by
  simp only [flipState, streamState_bits, flip16_bits]
  rw [fin4_rot, vel_neg, sub_neg_eq_add]

/-- Stepping a reversed state is streaming a flipped state. -/
theorem stepState_revState (n : ℕ) [NeZero n] (s : State n) :
    stepState n (revState n s) = streamState n (flipState n s) := by
  funext p
  simp only [stepState, collideState, revState, streamState, flipState, collide16_rev16]

/-- The step conjugated by the reversal is the identity:
`step⁻¹ = revState ∘ stepState ∘ revState`. -/
theorem stepState_rev (n : ℕ) [NeZero n] (s : State n) :
    stepState n (revState n (stepState n (revState n s))) = s := by
  have h1 := stepState_revState n s
  have h2 := stepState_revState n (stepState n (revState n s))
  rw [h2, h1]
  funext p
  refine bits_ext _ _ fun k => ?_
  rw [streamState_bits, streamRev_bits n s (p - vel n k) k, sub_add_cancel]

/-- The reversal conjugator is an involution on states. -/
theorem revState_involutive (n : ℕ) : Function.Involutive (revState n) := fun s => by
  funext p; simp only [revState, rev16_rev16]

/-! ## Sums over the lattice -/

/-- Summing over the lattice is invariant under translation of the sites. -/
theorem sum_sub_vel (n : ℕ) [NeZero n] (k : Fin 4) {β : Type*} [AddCommMonoid β]
    (f : Site n → β) : ∑ p, f (p - vel n k) = ∑ p, f p := by
  refine Finset.sum_bijective (fun p => p - vel n k) ⟨fun p₁ p₂ h => ?_, fun q => ?_⟩
    (fun p => ⟨fun _ => Finset.mem_univ _, fun _ => Finset.mem_univ _⟩) (fun p _ => rfl)
  · simpa using congrArg (fun q => q + vel n k) h
  · exact ⟨q + vel n k, by simp⟩

/-- Summing along a row or column is invariant under translation. -/
theorem sum_sub_val (n : ℕ) [NeZero n] (v : ZMod n) {β : Type*} [AddCommMonoid β]
    (f : ZMod n → β) : ∑ x, f (x - v) = ∑ x, f x := by
  refine Finset.sum_bijective (fun x => x - v) ⟨fun x₁ x₂ h => ?_, fun q => ?_⟩
    (fun x => ⟨fun _ => Finset.mem_univ _, fun _ => Finset.mem_univ _⟩) (fun x _ => rfl)
  · simpa using congrArg (fun z => z + v) h
  · exact ⟨q + v, by simp⟩

/-- Streaming preserves the total particle number. -/
theorem streamState_mass (n : ℕ) [NeZero n] (s : State n) :
    ∑ p, mass16 (streamState n s p) = ∑ p, mass16 (s p) := by
  have expand : ∀ p, mass16 (streamState n s p) = ∑ k : Fin 4, (bits k (s (p - vel n k))).toNat :=
    fun p => by simp [mass16, streamState, bits_assemble]
  simp only [expand]
  calc ∑ p, ∑ k : Fin 4, (bits k (s (p - vel n k))).toNat
      = ∑ k : Fin 4, ∑ p, (bits k (s (p - vel n k))).toNat := Finset.sum_comm
    _ = ∑ k : Fin 4, ∑ p, (bits k (s p)).toNat :=
        Finset.sum_congr rfl fun k _ => sum_sub_vel n k fun q => (bits k (s q)).toNat
    _ = ∑ p, ∑ k : Fin 4, (bits k (s p)).toNat := Finset.sum_comm.symm

/-! ## The light cone -/

/-- The source site of bit `k` lies in the unit diamond of its target. -/
theorem sub_vel_mem_diamond (n : ℕ) [NeZero n] (p : Site n) (k : Fin 4) :
    p - vel n k ∈ diamond n p 1 := by
  refine ⟨-(velInt k).1, -(velInt k).2, ?_, ?_, ?_⟩
  · rw [Int.natAbs_neg, Int.natAbs_neg]; exact (velInt_natAbs k).le
  · rw [Int.cast_neg]
    show -((velInt k).1 : ZMod n) = (p.1 - (velInt k).1 : ZMod n) - p.1
    rw [sub_sub_cancel_left]
  · rw [Int.cast_neg]
    show -((velInt k).2 : ZMod n) = (p.2 - (velInt k).2 : ZMod n) - p.2
    rw [sub_sub_cancel_left]

/-- Diamonds nest: a unit diamond around a point of the radius-`t` diamond
sits inside the radius-`t+1` diamond. -/
theorem diamond_subset (n : ℕ) {p q r : Site n} {t : ℕ}
    (hq : q ∈ diamond n p t) (hr : r ∈ diamond n q 1) :
    r ∈ diamond n p (t + 1) := by
  obtain ⟨u, v, huv, hx, hy⟩ := hq
  obtain ⟨u', v', huv', hx', hy'⟩ := hr
  refine ⟨u + u', v + v', ?_, ?_, ?_⟩
  · have h1 := Int.natAbs_add_le u u'
    have h2 := Int.natAbs_add_le v v'
    omega
  · rw [Int.cast_add, hx', hx]; exact sub_add_sub_cancel' _ _ _
  · rw [Int.cast_add, hy', hy]; exact sub_add_sub_cancel' _ _ _

/-- The diamond is symmetric in its two sites. -/
theorem diamond_symm (n : ℕ) {p q : Site n} {t : ℕ} (h : q ∈ diamond n p t) :
    p ∈ diamond n q t := by
  obtain ⟨u, v, huv, hx, hy⟩ := h
  refine ⟨-u, -v, ?_, ?_, ?_⟩
  · rw [Int.natAbs_neg, Int.natAbs_neg]; exact huv
  · rw [Int.cast_neg, hx, neg_sub]
  · rw [Int.cast_neg, hy, neg_sub]

/-- The bit written by one step at `q` is read from `q − vel k`, after
collision. -/
theorem stepState_bits (n : ℕ) [NeZero n] (s : State n) (q : Site n) (k : Fin 4) :
    bits k (stepState n s q) = bits k (collide16 (s (q - vel n k))) :=
  streamState_bits n (collideState n s) q k

/-- One step is local: if two states agree on the unit diamond of `q`, they
step to the same value at `q`. -/
theorem stepState_eq_of_diamond (n : ℕ) [NeZero n] {s₁ s₂ : State n} {q : Site n}
    (h : ∀ r ∈ diamond n q 1, s₁ r = s₂ r) : stepState n s₁ q = stepState n s₂ q := by
  refine bits_ext _ _ fun k => ?_
  rw [stepState_bits, stepState_bits, h _ (sub_vel_mem_diamond n q k)]

/-- Light cone: after `t` steps the value at `p` depends only on the initial
values within lattice L1 distance `t` of `p`. -/
theorem lightcone_agreement (n : ℕ) [NeZero n] (t : ℕ) (p : Site n) (s₁ s₂ : State n)
    (h : ∀ q ∈ diamond n p t, s₁ q = s₂ q) :
    (stepState n)^[t] s₁ p = (stepState n)^[t] s₂ p := by
  induction t generalizing s₁ s₂ with
  | zero => exact h p ⟨0, 0, by omega, by simp, by simp⟩
  | succ t ih =>
    simp only [Function.iterate_succ_apply]
    exact ih _ _ fun q hq =>
      stepState_eq_of_diamond n fun r hr => h r (diamond_subset n hq hr)

/-- A change confined to sites outside `r`'s diamond of radius `t` cannot be
seen at `p` (in or out of the diamond) after `t` steps. -/
theorem lightcone_outside (n : ℕ) [NeZero n] (t : ℕ) (r p : Site n) (s₁ s₂ : State n)
    (h : ∀ q, q ≠ r → s₁ q = s₂ q) (hp : p ∉ diamond n r t) :
    (stepState n)^[t] s₁ p = (stepState n)^[t] s₂ p := by
  refine lightcone_agreement n t p s₁ s₂ fun q hq => ?_
  by_cases hqr : q = r
  · subst hqr
    exact absurd (diamond_symm n hq) hp
  · exact h q hqr

/-! ## Momentum -/

/-- East and west velocities have no y component. -/
theorem vel_snd_02 (n : ℕ) [NeZero n] : (vel n 0).2 = 0 ∧ (vel n 2).2 = 0 :=
  ⟨by simp [vel, velInt], by simp [vel, velInt]⟩

/-- North and south velocities have no x component. -/
theorem vel_fst_13 (n : ℕ) [NeZero n] : (vel n 1).1 = 0 ∧ (vel n 3).1 = 0 :=
  ⟨by simp [vel, velInt], by simp [vel, velInt]⟩

/-- The source of the east bit is the west neighbour, in the same row. -/
theorem sub_vel_0 (n : ℕ) [NeZero n] (x y : ZMod n) :
    (x, y) - vel n 0 = (x - (vel n 0).1, y) := by
  refine Prod.ext rfl ?_
  show y - (vel n 0).2 = y
  rw [(vel_snd_02 n).1, sub_zero]

/-- The source of the west bit is the east neighbour, in the same row. -/
theorem sub_vel_2 (n : ℕ) [NeZero n] (x y : ZMod n) :
    (x, y) - vel n 2 = (x - (vel n 2).1, y) := by
  refine Prod.ext rfl ?_
  show y - (vel n 2).2 = y
  rw [(vel_snd_02 n).2, sub_zero]

/-- The source of the north bit is the south neighbour, in the same column. -/
theorem sub_vel_1 (n : ℕ) [NeZero n] (x y : ZMod n) :
    (x, y) - vel n 1 = (x, y - (vel n 1).2) := by
  refine Prod.ext ?_ rfl
  show x - (vel n 1).1 = x
  rw [(vel_fst_13 n).1, sub_zero]

/-- The source of the south bit is the north neighbour, in the same column. -/
theorem sub_vel_3 (n : ℕ) [NeZero n] (x y : ZMod n) :
    (x, y) - vel n 3 = (x, y - (vel n 3).2) := by
  refine Prod.ext ?_ rfl
  show x - (vel n 3).1 = x
  rw [(vel_fst_13 n).2, sub_zero]

/-- The x-momentum of an assembled value is its east bit minus its west bit. -/
theorem px16_assemble (b : Fin 4 → Bool) :
    px16 (assemble b) = (b 0).toNat - (b 2).toNat := by simp [px16, bits_assemble]

/-- The y-momentum of an assembled value is its north bit minus its south bit. -/
theorem py16_assemble (b : Fin 4 → Bool) :
    py16 (assemble b) = (b 1).toNat - (b 3).toNat := by simp [py16, bits_assemble]

/-- Streaming carries each row's x-momentum unchanged along the row. -/
theorem streamState_row_px (n : ℕ) [NeZero n] (s : State n) (y : ZMod n) :
    ∑ x, px16 (streamState n s (x, y)) = ∑ x, px16 (s (x, y)) := by
  have expand : ∀ x : ZMod n, px16 (streamState n s (x, y))
      = (bits 0 (s (x - (vel n 0).1, y))).toNat - (bits 2 (s (x - (vel n 2).1, y))).toNat := by
    intro x
    have e0 : (x, y) - vel n 0 = (x - (vel n 0).1, y) := sub_vel_0 n x y
    have e2 : (x, y) - vel n 2 = (x - (vel n 2).1, y) := sub_vel_2 n x y
    simp only [streamState, px16_assemble, e0, e2]
  simp only [expand]
  rw [Finset.sum_sub_distrib,
    sum_sub_val n (vel n 0).1 fun q => ((bits 0 (s (q, y))).toNat : ℤ),
    sum_sub_val n (vel n 2).1 fun q => ((bits 2 (s (q, y))).toNat : ℤ), ← Finset.sum_sub_distrib]
  exact Finset.sum_congr rfl fun x _ => rfl
theorem streamState_col_py (n : ℕ) [NeZero n] (s : State n) (x : ZMod n) :
    ∑ y, py16 (streamState n s (x, y)) = ∑ y, py16 (s (x, y)) := by
  have expand : ∀ y : ZMod n, py16 (streamState n s (x, y))
      = (bits 1 (s (x, y - (vel n 1).2))).toNat - (bits 3 (s (x, y - (vel n 3).2))).toNat := by
    intro y
    have e1 : (x, y) - vel n 1 = (x, y - (vel n 1).2) := sub_vel_1 n x y
    have e3 : (x, y) - vel n 3 = (x, y - (vel n 3).2) := sub_vel_3 n x y
    simp only [streamState, py16_assemble, e1, e3]
  simp only [expand]
  rw [Finset.sum_sub_distrib,
    sum_sub_val n (vel n 1).2 fun q => ((bits 1 (s (x, q))).toNat : ℤ),
    sum_sub_val n (vel n 3).2 fun q => ((bits 3 (s (x, q))).toNat : ℤ), ← Finset.sum_sub_distrib]
  exact Finset.sum_congr rfl fun y _ => rfl

/-- One step conserves each row's x-momentum. -/
theorem stepState_row_px (n : ℕ) [NeZero n] (s : State n) (y : ZMod n) :
    ∑ x, px16 (stepState n s (x, y)) = ∑ x, px16 (s (x, y)) := by
  have h : ∑ x, px16 (stepState n s (x, y)) = ∑ x, px16 (collideState n s (x, y)) :=
    streamState_row_px n (collideState n s) y
  rw [h]
  exact Finset.sum_congr rfl fun x _ => collide16_px16 (s (x, y))

/-- One step conserves each column's y-momentum. -/
theorem stepState_col_py (n : ℕ) [NeZero n] (s : State n) (x : ZMod n) :
    ∑ y, py16 (stepState n s (x, y)) = ∑ y, py16 (s (x, y)) := by
  have h : ∑ y, py16 (stepState n s (x, y)) = ∑ y, py16 (collideState n s (x, y)) :=
    streamState_col_py n (collideState n s) x
  rw [h]
  exact Finset.sum_congr rfl fun y _ => collide16_py16 (s (x, y))

/-- One step conserves the total x-momentum. -/
theorem stepState_total_px (n : ℕ) [NeZero n] (s : State n) :
    ∑ p, px16 (stepState n s p) = ∑ p, px16 (s p) := by
  rw [Fintype.sum_prod_type (fun p => px16 (stepState n s p)),
      Fintype.sum_prod_type (fun p => px16 (s p)),
      Finset.sum_comm (f := fun a b => px16 (stepState n s (a, b))),
      Finset.sum_comm (f := fun a b => px16 (s (a, b)))]
  exact Finset.sum_congr rfl fun y _ => stepState_row_px n s y

/-- One step conserves the total y-momentum. -/
theorem stepState_total_py (n : ℕ) [NeZero n] (s : State n) :
    ∑ p, py16 (stepState n s p) = ∑ p, py16 (s p) := by
  rw [Fintype.sum_prod_type (fun p => py16 (stepState n s p)),
    Fintype.sum_prod_type (fun p => py16 (s p))]
  refine Finset.sum_congr rfl fun x _ => stepState_col_py n s x

end TimesArrow.LatticeGas

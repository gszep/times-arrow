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

end TimesArrow.LatticeGas

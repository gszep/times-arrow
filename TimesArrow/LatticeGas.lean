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

end TimesArrow.LatticeGas

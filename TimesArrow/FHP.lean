import TimesArrow.Philox
import Mathlib.Data.ZMod.Basic
import Mathlib.Tactic.LinearCombination

/-!
# Six-velocity hexagonal gas

Offset rows, even periodic side length, directions E, NE, NW, W, SW, SE.
The executable uses the model collision and neighbour functions. The disc
centre is `(n/2, n√3/4)`, with its boundary included. Density is a rational
particle count per site; initialization compares the high 24 Philox bits
against `floor(density * 2^24 / 6)`. Collision time starts at zero.

Claims prove bijection, mass/momentum conservation and a one-hex-edge causal
cone for the discrete periodic model. The inverse needs the original collision
field: unstream, then apply opposite chirality (not an autonomous HPP echo).
Decided counterexamples exclude alternating two-sublattice labels and row
momentum conservation; they do not establish equilibration or a continuum limit.
-/

namespace TimesArrow.FHP

abbrev Cell := Fin 64
abbrev Dir := Fin 6
abbrev Site (n : ℕ) := ZMod n × ZMod n
abbrev State (n : ℕ) := Site n → Cell

/-- Opposite chirality inverts the three-cycle of head-on pairs. -/
def collide (b : Bool) (s : Cell) : Cell :=
  if s = 9 then (if b then 36 else 18)
  else if s = 18 then (if b then 9 else 36)
  else if s = 36 then (if b then 18 else 9)
  else if s = 21 then 42 else if s = 42 then 21 else s

def bits (k : Dir) (s : Cell) : Bool := s.val.testBit k.val

def assemble (b : Dir → Bool) : Cell :=
  ⟨((b 0).toNat + 2 * (b 1).toNat + 4 * (b 2).toNat +
    8 * (b 3).toNat + 16 * (b 4).toNat + 32 * (b 5).toNat) % 64,
    Nat.mod_lt _ (by decide)⟩

/-- Integer coordinates in the basis `(E, NE)`. -/
def velocity (k : Dir) : ℤ × ℤ :=
  match k.val with
  | 0 => (1, 0) | 1 => (0, 1) | 2 => (-1, 1)
  | 3 => (-1, 0) | 4 => (0, -1) | _ => (1, -1)

def mass (s : Cell) : ℕ := ∑ k : Dir, (bits k s).toNat
def momentum (s : Cell) : ℤ × ℤ := ∑ k : Dir, (bits k s).toNat • velocity k

def opposite (k : Dir) : Dir := ⟨(k.val + 3) % 6, Nat.mod_lt _ (by decide)⟩

/-- Neighbour in direction `k`; odd rows are displaced half a cell east. -/
def neighbour (n : ℕ) [NeZero n] (p : Site n) (k : Dir) : Site n :=
  let odd : ZMod n := (p.2.val % 2 : ℕ)
  match k.val with
  | 0 => (p.1 + 1, p.2)
  | 1 => (p.1 + odd, p.2 + 1)
  | 2 => (p.1 + odd - 1, p.2 + 1)
  | 3 => (p.1 - 1, p.2)
  | 4 => (p.1 + odd - 1, p.2 - 1)
  | _ => (p.1 + odd, p.2 - 1)

def collision (n : ℕ) (b : Site n → Bool) (s : State n) : State n :=
  fun p => collide (b p) (s p)

def stream (n : ℕ) [NeZero n] (s : State n) : State n :=
  fun p => assemble fun k => bits k (s (neighbour n p (opposite k)))

def unstream (n : ℕ) [NeZero n] (s : State n) : State n :=
  fun p => assemble fun k => bits k (s (neighbour n p k))

def stepState (n : ℕ) [NeZero n] (b : Site n → Bool) (s : State n) : State n :=
  stream n (collision n b s)

def inverseState (n : ℕ) [NeZero n] (b : Site n → Bool) (s : State n) : State n :=
  collision n (fun p => !(b p)) (unstream n s)

def chirality (seed : UInt32) (t i : ℕ) : Bool :=
  (Philox.rand seed t.toUInt32 i.toUInt32).x0 &&& 1 == 1

/-- Materialize the specification, with row-major indexing. -/
def step (seed : UInt32) (n t : ℕ) (a : Array ℕ) : Array ℕ :=
  if hn : n = 0 then #[] else
    letI : NeZero n := ⟨hn⟩
    let s : State n := fun p => ⟨a[p.2.val * n + p.1.val]!.mod 64,
      Nat.mod_lt _ (by decide)⟩
    let b := fun p : Site n => chirality seed t (p.2.val * n + p.1.val)
    (Array.range (n * n)).map fun i =>
      (stepState n b s ((i % n : ℕ), (i / n : ℕ))).val

/-- Exact disc membership, without floating point. -/
def inDisc (n radius x y : ℕ) : Bool :=
  let dx : ℤ := 2 * (x : ℤ) + (y % 2 : ℕ) - n
  let dy : ℤ := 2 * (y : ℤ) - n
  4 * dx * dx + 3 * dy * dy ≤ 16 * (radius : ℤ) * radius

/-- Rational densities `(numerator, denominator)`, in particles per site. -/
def initial (seed : UInt32) (n radius : ℕ) (inside outside : ℕ × ℕ) : Array ℕ :=
  (Array.range (n * n)).map fun i =>
    let rho := if inDisc n radius (i % n) (i / n) then inside else outside
    let threshold := rho.1 * 16777216 / (6 * rho.2)
    (assemble fun k =>
      let w := Philox.rand seed (k.val / 4).toUInt32 i.toUInt32
      let word : UInt32 := match k.val % 4 with
        | 0 => w.x0 | 1 => w.x1 | 2 => w.x2 | _ => w.x3
      (word >>> 8).toNat < threshold).val

def run (seed : UInt32) (n t radius : ℕ) (inside outside : ℕ × ℕ) : Array ℕ :=
  (List.range t).foldl (fun a time => step seed n time a)
    (initial seed n radius inside outside)

theorem bits_assemble : ∀ (b : Dir → Bool) (k : Dir), bits k (assemble b) = b k := by
  decide +kernel

theorem assemble_bits : ∀ s : Cell, assemble (fun k => bits k s) = s := by
  decide +kernel

theorem collide_inverse : ∀ (b : Bool) (s : Cell), collide (!b) (collide b s) = s := by
  decide +kernel

theorem opposite_opposite : ∀ k : Dir, opposite (opposite k) = k := by
  decide +kernel

theorem parity_add_one (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (y : ZMod n) :
    (((y + 1).val % 2 : ℕ) : ZMod n) = 1 - (y.val % 2 : ℕ) := by
  have hn : 1 < n := by have := NeZero.ne n; omega
  rw [ZMod.val_add, ZMod.val_one'' (by omega), Nat.mod_mod_of_dvd _ h2]
  have h : (y.val + 1) % 2 + y.val % 2 = 1 := by omega
  have hc := congrArg (fun m : ℕ => (m : ZMod n)) h
  push_cast at hc
  linear_combination hc

theorem parity_sub_one (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (y : ZMod n) :
    (((y - 1).val % 2 : ℕ) : ZMod n) = 1 - (y.val % 2 : ℕ) := by
  have h := parity_add_one n h2 (y - 1)
  simp only [sub_add_cancel] at h
  linear_combination h

theorem neighbour_inverse (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (p : Site n) (k : Dir) :
    neighbour n (neighbour n p k) (opposite k) = p := by
  fin_cases k <;>
    simp [neighbour, opposite, parity_add_one n h2, parity_sub_one n h2]

theorem unstream_stream (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (s : State n) :
    unstream n (stream n s) = s := by
  funext p
  simp only [unstream, stream, bits_assemble, neighbour_inverse n h2, assemble_bits]

theorem stream_unstream (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (s : State n) :
    stream n (unstream n s) = s := by
  funext p
  have hi (k : Dir) : neighbour n (neighbour n p (opposite k)) k = p := by
    simpa only [opposite_opposite] using neighbour_inverse n h2 p (opposite k)
  simp only [unstream, stream, bits_assemble, hi, assemble_bits]

theorem neighbour_bijective (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (k : Dir) :
    Function.Bijective (fun p => neighbour n p k) := by
  have left : Function.LeftInverse (fun p => neighbour n p (opposite k))
      (fun p => neighbour n p k) := fun p => neighbour_inverse n h2 p k
  have right : Function.RightInverse (fun p => neighbour n p (opposite k))
      (fun p => neighbour n p k) := by
    intro p
    simpa only [opposite_opposite] using neighbour_inverse n h2 p (opposite k)
  exact ⟨Function.LeftInverse.injective left, Function.RightInverse.surjective right⟩

theorem stream_sum (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (s : State n)
    {A : Type*} [AddCommMonoid A] (f : Dir → Bool → A) :
    ∑ p, ∑ k, f k (bits k (stream n s p)) = ∑ p, ∑ k, f k (bits k (s p)) := by
  simp only [stream, bits_assemble]
  rw [Finset.sum_comm, Finset.sum_comm (f := fun p k => f k (bits k (s p)))]
  apply Finset.sum_congr rfl
  intro k _
  exact Finset.sum_bijective (fun p => neighbour n p (opposite k))
    (neighbour_bijective n h2 (opposite k))
    (fun _ => ⟨fun _ => Finset.mem_univ _, fun _ => Finset.mem_univ _⟩) (fun _ _ => rfl)

/-- Sites within at most `t` edges of the hexagonal neighbour graph.
This definition includes periodic paths across the lattice seams. -/
def hexBall (n : ℕ) [NeZero n] : ℕ → Site n → Site n → Prop
  | 0, p, q => p = q
  | t + 1, p, q => hexBall n t p q ∨ ∃ k, hexBall n t (neighbour n p k) q

/-- Time-dependent collision field, used in its forward order. -/
def evolve (n : ℕ) [NeZero n] (b : ℕ → Site n → Bool) : ℕ → State n → State n
  | 0, s => s
  | t + 1, s => stepState n (b t) (evolve n b t s)

/-- One NW mover: enough to test row transport and checkerboard mixing. -/
def singleNW : State 4 := fun p => if p = (0, 0) then 4 else 0

def labelMass (n : ℕ) [NeZero n] (t c : ℕ) (s : State n) : ℕ :=
  ∑ p, if (p.1.val + p.2.val + t) % 2 = c then mass (s p) else 0

def rowMomentum (n : ℕ) [NeZero n] (y : ZMod n) (s : State n) : ℤ × ℤ :=
  ∑ x : ZMod n, momentum (s (x, y))

end TimesArrow.FHP

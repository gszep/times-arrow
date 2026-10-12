import TimesArrow.Philox
import Mathlib.Data.ZMod.Basic
import TimesArrow.Reversible

/-!
# Six-velocity hexagonal gas

Offset rows, even periodic side length, directions E, NE, NW, W, SW, SE.
The executable uses the model collision and neighbour functions. The disc
centre is `(n/2, n√3/4)`, with its boundary included. Density is a rational
particle count per site; initialization compares the high 24 Philox bits
against `floor(density * 2^24 / 6)`. Collision time starts at zero.
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

end TimesArrow.FHP

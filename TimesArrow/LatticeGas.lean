import TimesArrow.Philox

/-!
# HPP lattice gas

The reversible lattice gas of Hardy, Pomeau and de Pazzis (1973) on a
periodic `n × n` square lattice. A site holds four occupation bits, one per
velocity: bit 0 moves `+x` (east), bit 1 `+y` (north), bit 2 `−x` (west),
bit 3 `−y` (south). One step collides at every site, then streams every
particle one cell, so the light-cone speed is one cell per step.

Site `(x, y)` has index `y * n + x`.
-/

namespace TimesArrow.LatticeGas

/-- Head-on pairs with no other particles rotate by 90°. -/
def collide (s : UInt32) : UInt32 :=
  if s = 0b0101 then 0b1010 else if s = 0b1010 then 0b0101 else s

/-- Reverse every velocity: east ↔ west, north ↔ south. -/
def flip (s : UInt32) : UInt32 := ((s <<< 2) ||| (s >>> 2)) &&& 0xF

/-- The number of particles at a site. -/
def mass (s : UInt32) : UInt32 :=
  let bit (k : UInt32) : UInt32 := s >>> k &&& 1
  bit 0 + bit 1 + bit 2 + bit 3

/-- One step: collide, then stream. Written in pull form, as the kernels are. -/
def step (n : Nat) (a : Array UInt32) : Array UInt32 :=
  Array.ofFn (n := n * n) fun i =>
    let x := i.val % n
    let y := i.val / n
    let c (x y : Nat) := collide a[y * n + x]!
    (c ((x + n - 1) % n) y &&& 1) ||| (c x ((y + n - 1) % n) &&& 2) |||
      (c ((x + 1) % n) y &&& 4) ||| (c x ((y + 1) % n) &&& 8)

/-- The initial state for a seed: four independent fair bits per site. -/
def init (seed : UInt32) (n : Nat) : Array UInt32 :=
  Array.ofFn (n := n * n) fun i => (Philox.rand seed 0 i.val.toUInt32).x0 &&& 0xF

/-- `t` steps from `init seed n`. -/
def run (seed : UInt32) (n t : Nat) : Array UInt32 :=
  t.repeat (step n) (init seed n)

end TimesArrow.LatticeGas

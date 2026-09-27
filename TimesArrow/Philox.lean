/-!
# Philox4x32-10

The counter-based random number generator of Salmon, Moraes, Dror and Shaw,
"Parallel random numbers: as easy as 1, 2, 3" (SC 2011), with the constants
and key/counter layout of the Random123 library. Every backend (WGSL, CUDA,
JAX) reproduces `philox` bit for bit.
-/

namespace TimesArrow.Philox

/-- Multiplier applied to counter word 0. -/
def M0 : UInt32 := 0xD2511F53
/-- Multiplier applied to counter word 2. -/
def M1 : UInt32 := 0xCD9E8D57
/-- Weyl increment of key word 0 between rounds. -/
def W0 : UInt32 := 0x9E3779B9
/-- Weyl increment of key word 1 between rounds. -/
def W1 : UInt32 := 0xBB67AE85
/-- Number of rounds. -/
def rounds : Nat := 10

/-- Four 32-bit words: a counter or an output block. -/
structure Block where
  x0 : UInt32
  x1 : UInt32
  x2 : UInt32
  x3 : UInt32
  deriving DecidableEq, Repr

/-- High and low halves of the 64-bit product `a * b`. -/
def mulhilo (a b : UInt32) : UInt32 × UInt32 :=
  let p := a.toUInt64 * b.toUInt64
  ((p >>> 32).toUInt32, p.toUInt32)

/-- One Philox round with key `(k0, k1)`. -/
def round (k0 k1 : UInt32) (c : Block) : Block :=
  let (hi0, lo0) := mulhilo M0 c.x0
  let (hi1, lo1) := mulhilo M1 c.x2
  ⟨hi1 ^^^ c.x1 ^^^ k0, lo1, hi0 ^^^ c.x3 ^^^ k1, lo0⟩

/-- `r` rounds, bumping the key by `(W0, W1)` after each. -/
def iterate : Nat → UInt32 → UInt32 → Block → Block
  | 0, _, _, c => c
  | r + 1, k0, k1, c => iterate r (k0 + W0) (k1 + W1) (round k0 k1 c)

/-- Philox4x32-10 applied to counter `c` with key `(k0, k1)`. -/
def philox (c : Block) (k0 k1 : UInt32) : Block := iterate rounds k0 k1 c

/-- The project's stream: the draw at lattice `site` and time `step` for a
given `seed` is Philox with counter `(site, step, 0, 0)` and key `(seed, 0)`. -/
def rand (seed step site : UInt32) : Block := philox ⟨site, step, 0, 0⟩ seed 0

/-- The integer behind the uniform in `[0, 1)` drawn from word `x`. As an
`f32` the uniform is exactly `u01 x * 2⁻²⁴` on every backend. -/
def u01 (x : UInt32) : UInt32 := x >>> 8

/-- The Random123 known-answer vectors for Philox4x32-10
(`tests/kat_vectors`): counter, key word 0, key word 1, output. -/
def kat : List (Block × UInt32 × UInt32 × Block) :=
  [(⟨0, 0, 0, 0⟩, 0, 0, ⟨0x6627e8d5, 0xe169c58d, 0xbc57ac4c, 0x9b00dbd8⟩),
   (⟨0xffffffff, 0xffffffff, 0xffffffff, 0xffffffff⟩, 0xffffffff, 0xffffffff,
     ⟨0x408f276d, 0x41c83b0e, 0xa20bc7c6, 0x6d5451fd⟩),
   (⟨0x243f6a88, 0x85a308d3, 0x13198a2e, 0x03707344⟩, 0xa4093822, 0x299f31d0,
     ⟨0xd16cfe09, 0x94fdcceb, 0x5001e420, 0x24126ea1⟩)]

end TimesArrow.Philox

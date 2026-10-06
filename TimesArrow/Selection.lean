import TimesArrow.Philox
import TimesArrow.LatticeGas
import Mathlib.Tactic.Ring

/-!
# Exact-N subset initial states

Both 001 initial states are uniform random exact-`count` subsets of a
region's velocity slots, drawn by selection sampling (Fan, Muller and
Rezucha, JASA 57, 387–402 (1962)): region slot
`j = 4 · (raster site) + velocity bit`, scanned in order, slot `j` is
selected iff `w ⬝ (slots − j) < (count − picked) ⬝ 2²⁴`, where `w` is the
24-bit Philox draw of the slot and `picked` counts the selections below
`j`. `src/hpp.ts` runs the same rule bit for bit. The registered pair of
`experiments/001-irreversibility` is `packedState` (the centred block of
side `n/4`, exactly `n²/8` particles) and `nullState` (exactly `n²/8`
particles over all `4n²` slots).
-/

namespace TimesArrow.LatticeGas

open TimesArrow.Philox

/-- The uniform integer drawn for slot `j`: the 24-bit `u01` of the slot's
Philox word, so `draw seed j < 2²⁴`. -/
def draw (seed : UInt32) (j : ℕ) : ℕ := (u01 (rand seed 0 j.toUInt32).x0).toNat

/-- Slot `j` is selected iff its draw times the slots from `j` on is
below the picks still due times `2²⁴`. -/
def keep (seed : UInt32) (slots count j picked : ℕ) : Bool :=
  decide (draw seed j * (slots - j) < (count - picked) * 2 ^ 24)

/-- The selection flags for the `r` slots from `j` up, in order, with
`picked` slots already selected below `j`. -/
def flagsFrom (seed : UInt32) (slots count : ℕ) : ℕ → ℕ → ℕ → List Bool
  | 0, _, _ => []
  | r + 1, j, picked =>
    let k := keep seed slots count j picked
    k :: flagsFrom seed slots count r (j + 1) (picked + k.toNat)

/-- The selection flags of all `slots` slots, flag `j` at index `j`. -/
def flags (seed : UInt32) (slots count : ℕ) : List Bool :=
  flagsFrom seed slots count slots 0 0

/-- The number of `true` flags. -/
def countTrue : List Bool → ℕ
  | [] => 0
  | b :: fl => b.toNat + countTrue fl

/-- Membership of the region `[x0, x0 + side) × [y0, y0 + side)`. -/
def inRegion (n x0 y0 side : ℕ) [NeZero n] (p : Site n) : Bool :=
  decide (x0 ≤ p.1.val ∧ p.1.val < x0 + side ∧ y0 ≤ p.2.val ∧ p.2.val < y0 + side)

/-- The region slot of velocity `k` at site `p`: `4 · (raster site) +
velocity bit`, the raster site row-major inside the region. -/
def slotOf (n x0 y0 side : ℕ) [NeZero n] (p : Site n) (k : Fin 4) : ℕ :=
  4 * ((p.2.val - y0) * side + (p.1.val - x0)) + k.val

/-- The state built from slot flags: a region site holds velocity `k` iff
its slot flag is `true`; outside the region the state is empty. -/
def stateFromFlags (fl : List Bool) (n x0 y0 side : ℕ) [NeZero n] : State n :=
  fun p =>
    if inRegion n x0 y0 side p then
      assemble (fun k => fl.getD (slotOf n x0 y0 side p k) false)
    else 0

/-- The exact-`count` subset state of the region
`[x0, x0 + side) × [y0, y0 + side)`: selection sampling over the region's
`4 · side²` velocity slots. -/
def subsetState (seed : UInt32) (n x0 y0 side count : ℕ) [NeZero n] : State n :=
  stateFromFlags (flags seed (4 * side * side) count) n x0 y0 side

/-- The packed initial state of 001: the centred block of side `n/4`
holding a uniform random exact-`n²/8` subset of its velocity slots. -/
def packedState (seed : UInt32) (n : ℕ) [NeZero n] : State n :=
  subsetState seed n (n / 2 - (n / 4) / 2) (n / 2 - (n / 4) / 2) (n / 4) (n * n / 8)

/-- The null initial state of 001: a uniform random exact-`n²/8` subset of
all `4n²` velocity slots. -/
def nullState (seed : UInt32) (n : ℕ) [NeZero n] : State n :=
  subsetState seed n 0 0 n (n * n / 8)

end TimesArrow.LatticeGas

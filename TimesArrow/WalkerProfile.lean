import TimesArrow.Walker

/-!
# The 003 profile model

The 003-lightcone-speedlimit ensemble: the same dyadic hop draws as 002
(Philox counter `(walker, step)`, direction from the word's top 8 bits),
but the deterministic profile start — walker `j ≡ 0 (mod 64)` starts at
column `(j/64) mod n`, every other walker at column 0, all rows `y = 0` —
with the registered three-weight arms (`q_N = q_S = 0`), the registered
window layout over occupancy times, and the exact rational chain the
population circle-W₁ goldens come from.

The GPU kernels in `src/walk.ts` accumulate the same counters
(`profileRun`); everything here is exact integer or rational arithmetic.
-/

namespace TimesArrow.Walker

/-! ## The registered arms -/

/-- A three-weight arm in 256ths: east, west, stay (`q_N = q_S = 0`, so
`y` stays identically zero). -/
def w3 (e w z : ℕ) : Dir → ℕ := fun d =>
  match d.val with
  | 0 => e | 1 => w | 2 => 0 | 3 => 0 | _ => z

/-- The registered 003 arms, weights in 256ths of one draw. -/
def calmW : Dir → ℕ := w3 64 64 128
def w5W : Dir → ℕ := w3 123 5 128
def w4W : Dir → ℕ := w3 124 4 128
def windW : Dir → ℕ := w3 125 3 128
def c2W : Dir → ℕ := w3 126 2 128
def maxW : Dir → ℕ := w3 255 1 0
def h8W : Dir → ℕ := w3 120 8 128

/-- The windXOR control: wind with E ↔ W at step 1 only. -/
def windXorW : ℕ → Dir → ℕ := fun s =>
  if s = 1 then w3 3 125 128 else w3 125 3 128

/-! ## The profile start and its bit-exact ensemble -/

/-- The registered 003 profile start (deterministic — no draw enters it):
walker `j ≡ 0 (mod 64)` starts at column `(j/64) mod n`, every other
walker at column 0; all rows are 0. -/
def profileStart (n : ℕ) (j : ℕ) : Site n :=
  if j % 64 = 0 then (((j / 64) % n : ZMod n), (0 : ZMod n)) else (0, 0)

/-- The whole bit-exact measurement of one profile seed in one pass over
the `M·T` draws: the final positions, the per-step east/west hop counts
(the draws do not depend on the start), and the column occupancy at every
time `0..T` (time `τ` is the pre-hop occupancy of hop `τ + 1`) — exactly
the counters the GPU kernels accumulate. -/
def profileRun (sh : ℕ) (ws : ℕ → Dir → ℕ) (seed : UInt32) (M T : ℕ) :
    Array (Site (2 ^ sh)) × Array (ℕ × ℕ) × Array (Array ℕ) := Id.run do
  let n := 2 ^ sh
  let mut cur : Array (Site n) := (Array.range M).map (profileStart n)
  let mut counts : Array (ℕ × ℕ) := #[]
  let mut cols : Array (Array ℕ) := #[]
  for t in Array.range (T + 1) do
    let mut row : Array ℕ := Array.replicate n 0
    for p in cur do
      row := row.set! p.1.val (row[p.1.val]! + 1)
    cols := cols.push row
    if t < T then
      let dirs := stepDirs ws seed M (t + 1)
      counts := counts.push (dirTally dirs)
      cur := (cur.zip dirs).map fun (p, d) => hop n p d
  return (cur, counts, cols)

/-- The registered window layout over occupancy times, truncated to a
horizon it covers exactly: `(j, j+1)` for `j = 0..23`, then `(24, 32)`,
then `(32j, 32(j+1))` — 40 windows at `T = 512`. `none` when `T` is not
a registered horizon. -/
def windowsOf (T : ℕ) : Option (Array (ℕ × ℕ)) :=
  let singles : Array (ℕ × ℕ) := (Array.range (min 24 T)).map fun j => (j, j + 1)
  let with24 := if T > 24 then singles.push (24, min 32 T) else singles
  let w := (Array.range (T / 32)).foldl (fun acc j =>
    if j > 0 then acc.push (32 * j, 32 * (j + 1)) else acc) with24
  if (w[w.size - 1]?).map (·.2) == some T then some w else none

/-- The column counts of one window `[b, e)`: the occupancy rows at times
`b..e−1` summed per column. -/
def winRow (cols : Array (Array ℕ)) (b e : ℕ) : Array ℕ :=
  let n := cols[b]!.size
  (Array.range (e - b)).foldl (fun row t =>
    row.zipWith (· + ·) cols[b + t]!) (Array.replicate n 0)

/-! ## The exact chain and the population circle W₁ -/

/-- The registered profile start as exact column probabilities over `m`
walkers: `slots = ⌈m/64⌉` walkers at columns `(j/64) mod n` (one per
column at the registered size), the remaining `m − slots` in column 0. -/
def profileP0 (n m : ℕ) : Array ℚ := Id.run do
  let slots := (m + 63) / 64
  let mut perCol := Array.replicate n 0
  for k in Array.range slots do
    perCol := perCol.set! (k % n) (perCol[k % n]! + 1)
  return (Array.range n).map fun x =>
    (((if x = 0 then m - slots else 0) + perCol[x]! : ℕ) : ℚ) / m

/-- One step of the exact chain on column probabilities (the periodic
recurrence `p_{s+1}(x) = q₀p(x) + q_E p(x−1) + q_W p(x+1)`). -/
def chainStep (q0 qE qW : ℚ) (p : Array ℚ) : Array ℚ :=
  let n := p.size
  (Array.range n).map fun x =>
    q0 * p[x]! + qE * p[(x + n - 1) % n]! + qW * p[(x + 1) % n]!

/-- The registered circle W₁ between column laws `p₀` and `p`: the
cumulative differences `c_x = Σ_{y ≤ x} (p − p₀)(y)`, the upper median of
the sorted `c`, then `Σ_x |c_x − med|` — the median optimized for every
sample, not only the population law. -/
def circleW1Q (p0 p : Array ℚ) : ℚ := Id.run do
  let n := p.size
  let mut cs : Array ℚ := #[]
  let mut acc : ℚ := 0
  for x in Array.range n do
    acc := acc + (p[x]! - p0[x]!)
    cs := cs.push acc
  let med := (cs.qsort (· < ·))[n / 2]!
  let mut s : ℚ := 0
  for x in Array.range n do
    s := s + |cs[x]! - med|
  return s

/-- The exact population circle W₁ of the arm's chain from the profile
start after `t` steps, in rational arithmetic: the chain recurrence with
the arm's 256th weights, then the registered median formula. The calm
goldens at `t = 1, 2, 3` are `63/128, 189/256, 945/1024`. -/
def profileW1Q (w : Dir → ℕ) (n m t : ℕ) : ℚ :=
  let p0 := profileP0 n m
  circleW1Q p0 ((Array.range t).foldl (fun p _ =>
    chainStep ((w 4 : ℚ) / 256) ((w 0 : ℚ) / 256) ((w 1 : ℚ) / 256) p) p0)

end TimesArrow.Walker

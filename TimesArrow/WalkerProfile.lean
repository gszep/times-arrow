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

open TimesArrow.Philox

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

/-! ## The light cone

The synchronous-hop lattice speed: one hop moves a walker's circle
distance from any origin by at most one, so after `t` steps every walker
is within `t` of its own start — C1, with the deterministic profile start
as the instance `start = profileStart n` (the uniform constructor of 002
is another). -/

/-- The circle distance on `ZMod n`: `min k (n − k)` of the forward
difference representative `k = (a − b).val`. -/
def zmodDist (n : ℕ) [NeZero n] (a b : ZMod n) : ℕ :=
  min (a - b).val (n - (a - b).val)

/-- Forward by a bounded amount `c ≤ 1` from a position at circle distance
`k` stays within distance `k + 1`: the pure ℕ core of the light cone. -/
theorem dist_step_core (n k c : ℕ) (hkn : k < n) (hc : c ≤ 1) :
    min ((k + c) % n) (n - (k + c) % n) ≤ min k (n - k) + 1 := by
  rcases Nat.lt_or_ge (k + c) n with h | h
  · rw [Nat.mod_eq_of_lt h]
    rcases le_total k (n - k) with hle | hle
    · rw [min_eq_left hle]
      have := min_le_left (k + c) (n - k - c)
      omega
    · rw [min_eq_right hle]
      have := min_le_right (k + c) (n - k - c)
      omega
  · have hke : k + c = n := by omega
    rw [hke, Nat.mod_self]
    omega

/-- Backward by one from a position at circle distance `k` stays within
distance `k + 1`: the wrap-around case of the light cone. -/
theorem dist_back_core (n k : ℕ) (hkn : k < n) :
    min ((k + (n - 1)) % n) (n - (k + (n - 1)) % n) ≤ min k (n - k) + 1 := by
  rcases Nat.lt_or_ge k 1 with h | h
  · have hk0 : k = 0 := by omega
    subst hk0
    have hmod : (0 + (n - 1)) % n = n - 1 := by
      rw [Nat.zero_add, Nat.mod_eq_of_lt (by omega)]
    rw [hmod]
    omega
  · have hmod : (k + (n - 1)) % n = k - 1 := by
      have hrew : k + (n - 1) = (k - 1) + n := by omega
      rw [hrew, Nat.add_mod_right, Nat.mod_eq_of_lt (by omega)]
    rw [hmod]
    rcases le_total k (n - k) with hle | hle
    · rw [min_eq_left hle]
      have := min_le_left (k - 1) (n - (k - 1))
      omega
    · rw [min_eq_right hle]
      have := min_le_right (k - 1) (n - (k - 1))
      omega

/-- An east hop moves the circle distance from any origin by at most one. -/
theorem zmodDist_add_one (n : ℕ) [NeZero n] (a o : ZMod n) :
    zmodDist n (a + ((1 : ℤ) : ZMod n)) o ≤ zmodDist n a o + 1 := by
  have hn : 0 < n := NeZero.pos n
  have hk : (a - o).val < n := ZMod.val_lt _
  have hcv : (((1 : ℤ) : ZMod n).val : ℤ) ≤ 1 := by
    have h : (((1 : ℤ) : ZMod n).val : ℤ) = (1 : ℤ) % (n : ℤ) :=
      ZMod.val_intCast ((1 : ℤ))
    rcases Nat.lt_or_ge n 2 with h2 | h2
    · rw [show ((n : ℤ)) = 1 from by omega, Int.emod_self] at h
      omega
    · rw [Int.emod_eq_of_lt (by norm_num : (0 : ℤ) ≤ 1) (by omega : (1 : ℤ) < (n : ℤ))] at h
      omega
  unfold zmodDist
  rw [show a + ((1 : ℤ) : ZMod n) - o = (a - o) + ((1 : ℤ) : ZMod n) from by abel, ZMod.val_add]
  exact dist_step_core n (a - o).val ((1 : ℤ) : ZMod n).val hk (by exact_mod_cast hcv)

/-- A west hop moves the circle distance from any origin by at most one. -/
theorem zmodDist_sub_one (n : ℕ) [NeZero n] (a o : ZMod n) :
    zmodDist n (a + ((-1 : ℤ) : ZMod n)) o ≤ zmodDist n a o + 1 := by
  have hn : 0 < n := NeZero.pos n
  have hk : (a - o).val < n := ZMod.val_lt _
  have hcv : (((-1 : ℤ) : ZMod n).val) = n - 1 := by
    have h : (((-1 : ℤ) : ZMod n).val : ℤ) = (-1 : ℤ) % (n : ℤ) :=
      ZMod.val_intCast ((-1 : ℤ))
    have h1 : ((n : ℤ) - 1) % (n : ℤ) = (n : ℤ) - 1 :=
      Int.emod_eq_of_lt (by omega) (by omega)
    have hmod : ((-1 : ℤ) % (n : ℤ)) = (n : ℤ) - 1 := by
      rw [show (-1 : ℤ) = ((n : ℤ) - 1) - (n : ℤ) from by omega, Int.sub_emod, h1,
        Int.emod_self, sub_zero, h1]
    rw [hmod] at h
    omega
  unfold zmodDist
  rw [show a + ((-1 : ℤ) : ZMod n) - o = (a - o) + ((-1 : ℤ) : ZMod n) from by abel,
    ZMod.val_add, hcv]
  exact dist_back_core n (a - o).val hk

/-- Any hop moves the circle distance from any origin by at most one: the
lattice speed is one cell per step, whatever the weights draw. -/
theorem hop_zmodDist_le (n : ℕ) [NeZero n] (p : Site n) (d : Dir) (o : ZMod n) :
    zmodDist n (hop n p d).1 o ≤ zmodDist n p.1 o + 1 := by
  fin_cases d
  · exact zmodDist_add_one n p.1 o
  · exact zmodDist_sub_one n p.1 o
  · show zmodDist n (p.1 + ((0 : ℤ) : ZMod n)) o ≤ zmodDist n p.1 o + 1
    rw [Int.cast_zero, add_zero]
    exact Nat.le_succ _
  · show zmodDist n (p.1 + ((0 : ℤ) : ZMod n)) o ≤ zmodDist n p.1 o + 1
    rw [Int.cast_zero, add_zero]
    exact Nat.le_succ _
  · show zmodDist n (p.1 + ((0 : ℤ) : ZMod n)) o ≤ zmodDist n p.1 o + 1
    rw [Int.cast_zero, add_zero]
    exact Nat.le_succ _

/-- **The walker light cone (003, C1).** From any start, a walker's circle
displacement from where it began is at most `t` after `t` steps: the
synchronous-hop lattice speed, for every weights schedule and every draw
stream. The deterministic profile start is the instance
`start = profileStart n`; the uniform constructor of 002 is another. -/
theorem trajFrom_lightcone (n : ℕ) [NeZero n] (start : ℕ → Site n)
    (ws : ℕ → Dir → ℕ) (seed : UInt32) (m t : ℕ) :
    zmodDist n (trajFrom n start ws seed t m).1 (start m).1 ≤ t := by
  induction t with
  | zero =>
    show zmodDist n (start m).1 (start m).1 ≤ 0
    simp [zmodDist]
  | succ t ih =>
    rw [show trajFrom n start ws seed (t + 1) m
        = hop n (trajFrom n start ws seed t m)
          (dirOf (ws (t + 1)) ((rand seed (t + 1).toUInt32 m.toUInt32).x0 >>> 24).toNat)
        from rfl]
    calc zmodDist n (hop n (trajFrom n start ws seed t m) _).1 (start m).1
        ≤ zmodDist n (trajFrom n start ws seed t m).1 (start m).1 + 1 :=
          hop_zmodDist_le n _ _ (start m).1
      _ ≤ t + 1 := by omega

end TimesArrow.Walker

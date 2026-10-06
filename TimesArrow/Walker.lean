import TimesArrow.Philox
import TimesArrow.Markov.Chain
import Mathlib.Data.ZMod.Basic
import Mathlib.Algebra.BigOperators.Fin
import Mathlib.Data.Fin.Tuple.Basic
import Mathlib.Probability.Distributions.Uniform

/-!
# The walker model of 002-arrow-kl

`M` independent walkers on the periodic `n × n` torus. At every step each
walker draws a direction from `{E, W, N, S, 0}` with weights dyadic in
256ths and hops one axial cell or stays. The registered arms are the
driven vector `(48, 16, 24, 24, 144)`, its E↔W swap (reversed), the null
`(32, 32, 24, 24, 144)`, and the ramp `q_E(t) = (31 + t)/256` over hops
`t = 1..16` with its schedule-reversed protocol.

Two representations, as in the lattice gas:

* the model, `walkerK` and `prodK`: one walker as `Site n → PMF (Site n)`,
  and the synchronous product on `Fin M → Site n`; the `TimesArrow.Markov`
  library applies to these directly;
* the executable, `traj`/`positions`/`tallies`: bit-exact Philox
  trajectories with counter `(walker, step, 0, 0)`, key `(seed, 0)`, the
  initial draw at step `0`, hops at steps `1..T`, the direction read from
  the word's top 8 bits against the arm's cumulative thresholds, and the
  constructor `x = w mod n`, `y = (w ≫ log₂ n) mod n`.
-/

namespace TimesArrow.Walker

open TimesArrow.Philox ENNReal MeasureTheory

/-! ## Directions and hops -/

/-- Sites of the periodic `n × n` torus. -/
abbrev Site (n : ℕ) := ZMod n × ZMod n

/-- Directions in the registered order: 0 east (+x), 1 west (−x),
2 north (+y), 3 south (−y), 4 stay. -/
abbrev Dir := Fin 5

/-- The registered direction weights, in 256ths, as functions `Dir → ℕ`. -/
def drivenW : Dir → ℕ := fun d =>
  match d.val with
  | 0 => 48 | 1 => 16 | 2 => 24 | 3 => 24 | _ => 144

/-- The reversed arm: the driven weights with east and west swapped. -/
def reversedW : Dir → ℕ := fun d =>
  match d.val with
  | 0 => 16 | 1 => 48 | 2 => 24 | 3 => 24 | _ => 144

/-- The null arm: same activity, no drive. -/
def nullW : Dir → ℕ := fun d =>
  match d.val with
  | 0 => 32 | 1 => 32 | 2 => 24 | 3 => 24 | _ => 144

/-- The ramp protocol: hop `t ∈ {1, …, 16}` uses `ε = (t − 1)/16`, so
`q_E = (31 + t)/256` and `q_W = (33 − t)/256`; `q_0` is constant. -/
def rampW (t : ℕ) : Dir → ℕ := fun d =>
  match d.val with
  | 0 => 31 + t | 1 => 33 - t | 2 => 24 | 3 => 24 | _ => 144

/-- The reverse protocol `ε(15 − t)`: hop `t` uses `q_E = (48 − t)/256` and
`q_W = (16 + t)/256`. The weights are not swapped; the schedule reversal is
the protocol reversal. -/
def rampRevW (t : ℕ) : Dir → ℕ := fun d =>
  match d.val with
  | 0 => 48 - t | 1 => 16 + t | 2 => 24 | 3 => 24 | _ => 144

/-- The integer hop offset of each direction. -/
def velInt (d : Dir) : ℤ × ℤ :=
  match d.val with
  | 0 => (1, 0) | 1 => (-1, 0) | 2 => (0, 1) | 3 => (0, -1) | _ => (0, 0)

/-- The hop offset of direction `d` as a site displacement. -/
def vel (n : ℕ) (d : Dir) : Site n :=
  (((velInt d).1 : ZMod n), ((velInt d).2 : ZMod n))

/-- One hop of direction `d` from site `p`. -/
def hop (n : ℕ) (p : Site n) (d : Dir) : Site n := p + vel n d

/-- The direction opposite to `d`: E ↔ W, N ↔ S, stay ↔ stay. -/
def opp : Dir → Dir := fun d =>
  match d.val with
  | 0 => 1 | 1 => 0 | 2 => 3 | 3 => 2 | _ => 4

theorem drivenW_sum : ∑ d, drivenW d = 256 := by decide +kernel

theorem reversedW_sum : ∑ d, reversedW d = 256 := by decide +kernel

theorem nullW_sum : ∑ d, nullW d = 256 := by decide +kernel

theorem drivenW_pos : ∀ d, 0 < drivenW d := by decide +kernel

theorem reversedW_pos : ∀ d, 0 < reversedW d := by decide +kernel

theorem nullW_pos : ∀ d, 0 < nullW d := by decide +kernel

/-- All registered arms have no y-drive. -/
theorem drivenW_NS : drivenW 2 = drivenW 3 := by decide +kernel

theorem reversedW_NS : reversedW 2 = reversedW 3 := by decide +kernel

theorem nullW_NS : nullW 2 = nullW 3 := by decide +kernel

theorem ramp_sum (t : ℕ) (h : t ≤ 16) : ∑ d, rampW t d = 256 := by
  rw [Fin.sum_univ_five]
  simp [rampW]
  omega

theorem ramp_pos (t : ℕ) (h : t ≤ 16) : ∀ d, 0 < rampW t d := by
  intro d
  fin_cases d
  all_goals simp only [rampW]
  all_goals omega

theorem rampRev_sum (t : ℕ) (h : 1 ≤ t) (h' : t ≤ 16) : ∑ d, rampRevW t d = 256 := by
  rw [Fin.sum_univ_five]
  simp [rampRevW]
  omega

theorem rampRev_pos (t : ℕ) (h : t ≤ 16) : ∀ d, 0 < rampRevW t d := by
  intro d
  fin_cases d
  all_goals simp only [rampRevW]
  all_goals omega

theorem ramp_NS (t : ℕ) : rampW t 2 = rampW t 3 := rfl

theorem rampRev_NS (t : ℕ) : rampRevW t 2 = rampRevW t 3 := rfl

/-- The reversed arm is the driven arm read through `opp`. -/
theorem reversedW_eq (d : Dir) : reversedW d = drivenW (opp d) := by
  decide +kernel +revert

theorem opp_opp (d : Dir) : opp (opp d) = d := by decide +kernel +revert

/-- `opp` is an involution, hence a bijection. -/
def oppEquiv : Dir ≃ Dir := ⟨opp, opp, opp_opp, opp_opp⟩

/-- Reversal swaps the direction offsets. -/
theorem velInt_opp (d : Dir) : velInt (opp d) = -velInt d := by
  decide +kernel +revert

/-- Reversal swaps the hop offsets. -/
theorem vel_opp (n : ℕ) (d : Dir) : vel n (opp d) = -vel n d := by
  have h := velInt_opp d
  simp only [vel, h]
  exact Prod.ext (Int.cast_neg _) (Int.cast_neg _)

/-- Hopping from `p` to `q` with `d` is hopping from `q` to `p` with `opp d`. -/
theorem hop_opp_iff (n : ℕ) (p q : Site n) (d : Dir) :
    hop n p d = q ↔ hop n q (opp d) = p := by
  simp only [hop]
  constructor
  · intro h
    rw [← h, add_assoc, vel_opp, add_neg_cancel, add_zero]
  · intro h
    rw [← h, add_assoc, vel_opp, neg_add_cancel, add_zero]

/-! ## The one-walker chain -/

/-- The total 256th-weight of the directions that lead from `i` to `j` in
one hop. -/
def hopMass (n : ℕ) [NeZero n] (w : Dir → ℕ) (i j : Site n) : ℕ :=
  ∑ d, if hop n i d = j then w d else 0

/-- `d` hops `i` to `j` exactly when `i` is `j` offset by the reverse of
`d`'s displacement. -/
theorem hop_eq_iff (n : ℕ) [NeZero n] {i j : Site n} (d : Dir) :
    hop n i d = j ↔ i = j - vel n d := by
  simp only [hop]
  constructor
  · intro h
    rw [← h, add_sub_cancel_right]
  · intro h
    rw [h, sub_add_cancel]

/-- Row sums: the hop masses out of `i` carry every direction exactly once. -/
theorem hopMass_sum (n : ℕ) [NeZero n] (w : Dir → ℕ) (i : Site n) :
    ∑ j, hopMass n w i j = ∑ d, w d := by
  simp only [hopMass]
  rw [Finset.sum_comm]
  refine Finset.sum_congr rfl fun d _ => ?_
  rw [Finset.sum_eq_single (hop n i d)]
  · simp
  · intro j _ hne
    exact if_neg (fun hd => hne hd.symm)
  · intro h
    exact absurd (Finset.mem_univ _) h

/-- Column sums: every direction is a bijection on sites, so the kernel is
doubly stochastic. -/
theorem hopMass_col_sum (n : ℕ) [NeZero n] (w : Dir → ℕ) (j : Site n) :
    ∑ i, hopMass n w i j = ∑ d, w d := by
  simp only [hopMass]
  rw [Finset.sum_comm]
  refine Finset.sum_congr rfl fun d _ => ?_
  rw [Finset.sum_eq_single (j - vel n d)]
  · exact if_pos (by rw [hop_eq_iff])
  · intro i _ hne
    exact if_neg (fun hd => hne ((hop_eq_iff n d).mp hd))
  · intro h
    exact absurd (Finset.mem_univ _) h

/-- The one-walker kernel with weights `w` in 256ths: the law of one step
of a single walker. -/
noncomputable def walkerK (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (i : Site n) : PMF (Site n) :=
  ⟨fun j => (hopMass n w i j : ℝ≥0∞) / 256, ENNReal.summable.hasSum_iff.2 (by
    simp only [ENNReal.div_eq_inv_mul]
    rw [ENNReal.tsum_mul_left, tsum_fintype, ← Nat.cast_sum, hopMass_sum, hw]
    exact ENNReal.inv_mul_cancel (a := 256) (by simp) (by simp))⟩

/-- The kernel's value is the hop mass over 256. -/
theorem walkerK_apply (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (i j : Site n) : walkerK n w hw i j = (hopMass n w i j : ℝ≥0∞) / 256 := rfl

/-- The kernel's column sums are one: the doubly-stochastic fact. -/
theorem walkerK_col_sum (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (j : Site n) : ∑ i, walkerK n w hw i j = 1 := by
  simp only [walkerK_apply, ENNReal.div_eq_inv_mul]
  rw [← Finset.mul_sum, ← Nat.cast_sum, hopMass_col_sum, hw]
  exact ENNReal.inv_mul_cancel (a := 256) (by simp) (by simp)

/-- The uniform distribution is stationary for every weight vector: each
hop direction is a bijection on sites. -/
theorem walkerK_stationary (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256) :
    TimesArrow.Markov.IsStationary (walkerK n w hw)
      (PMF.uniformOfFintype (Site n)) := by
  refine PMF.ext fun j => ?_
  rw [PMF.bind_apply, tsum_fintype]
  simp only [PMF.uniformOfFintype_apply]
  rw [← Finset.mul_sum, walkerK_col_sum n w hw j, mul_one]

/-- A hop mass is zero exactly when no direction connects the pair. -/
theorem hopMass_eq_zero_iff (n : ℕ) [NeZero n] (w : Dir → ℕ) (hwpos : ∀ d, 0 < w d)
    (i j : Site n) : hopMass n w i j = 0 ↔ ∀ d, hop n i d ≠ j := by
  rw [hopMass, Finset.sum_eq_zero_iff_of_nonneg (fun d _ => Nat.zero_le _)]
  constructor
  · intro h d hdb
    have hpos := hwpos d
    have hd := h d (Finset.mem_univ d)
    rw [if_pos hdb] at hd
    omega
  · intro h d _
    exact if_neg (h d)

/-- **Support symmetry.** With all direction weights positive every move
has its reverse available, so `κ i j = 0 ↔ κ j i = 0` unconditionally in
`i, j`. -/
theorem walkerK_support (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (hwpos : ∀ d, 0 < w d) (i j : Site n) :
    walkerK n w hw i j = 0 ↔ walkerK n w hw j i = 0 := by
  have hz : ∀ (a b : Site n), walkerK n w hw a b = 0 ↔ hopMass n w a b = 0 := by
    intro a b
    rw [walkerK_apply]
    constructor
    · intro h
      rcases (div_eq_zero_iff).mp h with h' | h'
      · exact Nat.cast_eq_zero.mp h'
      · exact absurd h' (by simp)
    · intro h
      rw [h, Nat.cast_zero]
      simp
  rw [hz, hopMass_eq_zero_iff n w hwpos, hz, hopMass_eq_zero_iff n w hwpos]
  constructor
  · intro h d' hjd
    exact h (opp d') ((hop_opp_iff n j i d').mp hjd)
  · intro h d hjd
    exact h (opp d) ((hop_opp_iff n i j d).mp hjd)

/-- With reversal-invariant weights the hop masses are symmetric. -/
theorem hopMass_symm (n : ℕ) [NeZero n] (w : Dir → ℕ) (hwsymm : ∀ d, w (opp d) = w d)
    (i j : Site n) : hopMass n w i j = hopMass n w j i := by
  simp only [hopMass]
  rw [← Equiv.sum_comp oppEquiv (fun d => if hop n i d = j then w d else 0)]
  refine Finset.sum_congr rfl fun d _ => ?_
  have h1 : hop n i (oppEquiv d) = j ↔ hop n j d = i := by
    show hop n i (opp d) = j ↔ hop n j d = i
    rw [hop_opp_iff, opp_opp]
  by_cases hd : hop n i (oppEquiv d) = j
  · rw [if_pos hd, if_pos (h1.mp hd)]
    exact hwsymm d
  · rw [if_neg hd, if_neg (fun hh => hd (h1.mpr hh))]

/-- With reversal-invariant weights the kernel is symmetric: detailed
balance with the uniform distribution. -/
theorem walkerK_symm (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (hwsymm : ∀ d, w (opp d) = w d) (i j : Site n) :
    walkerK n w hw i j = walkerK n w hw j i := by
  rw [walkerK_apply, walkerK_apply, hopMass_symm n w hwsymm i j]

/-! ## The executable

Bit-exact Philox trajectories. The counter is `(walker, step, 0, 0)` with
key `(seed, 0)`; the constructor draw is the word at step `0`, hops use the
words at steps `1..T`, so no counter is ever drawn twice. The direction is
the word's top 8 bits against the cumulative thresholds of the hop's
weight vector, and the constructor is `x = w mod n`, `y = (w ≫ log₂n) mod n`
of the low bits. -/

/-- The direction drawn from the top 8 bits `u` of a word against the
cumulative thresholds of the weight vector `w` (in 256ths). -/
def dirOf (w : Dir → ℕ) (u : ℕ) : Dir :=
  if u < w 0 then 0
  else if u < w 0 + w 1 then 1
  else if u < w 0 + w 1 + w 2 then 2
  else if u < w 0 + w 1 + w 2 + w 3 then 3
  else 4

/-- The registered constructor on the `2^sh × 2^sh` torus: `x = w mod 2^sh`,
`y = (w ≫ sh) mod 2^sh` — each walker starts uniform. -/
def ctorPos (sh : ℕ) (word : UInt32) : Site (2 ^ sh) :=
  let x : ℕ := word.toNat % 2 ^ sh
  let y : ℕ := (word.toNat >>> sh) % 2 ^ sh
  ((x : ZMod (2 ^ sh)), (y : ZMod (2 ^ sh)))

/-- The position of walker `m` after `t` steps under the schedule `ws` (hop
`s` uses the weights `ws s`); `sh = log₂ n`. -/
def traj (sh : ℕ) (ws : ℕ → Dir → ℕ) (seed : UInt32) : ℕ → ℕ → Site (2 ^ sh)
  | 0, m => ctorPos sh (rand seed 0 m.toUInt32).x0
  | t + 1, m =>
    hop (2 ^ sh) (traj sh ws seed t m)
      (dirOf (ws (t + 1)) ((rand seed (t + 1).toUInt32 m.toUInt32).x0 >>> 24).toNat)

/-- The positions of all `M` walkers after `t` steps. -/
def positions (sh : ℕ) (M : ℕ) (ws : ℕ → Dir → ℕ) (seed : UInt32) (t : ℕ) :
    Fin M → Site (2 ^ sh) :=
  fun m => traj sh ws seed t m.val

/-- The step-`s` direction draws of all `M` walkers. -/
def stepDirs (ws : ℕ → Dir → ℕ) (seed : UInt32) (M s : ℕ) : Array Dir :=
  Array.range M |>.map fun m =>
    dirOf (ws s) ((rand seed s.toUInt32 m.toUInt32).x0 >>> 24).toNat

/-- The east and west hop counts of all `M` walkers at step `s`. -/
def stepTally (ws : ℕ → Dir → ℕ) (seed : UInt32) (M s : ℕ) : ℕ × ℕ :=
  (stepDirs ws seed M s).foldl (fun acc d =>
    if d = 0 then (acc.1 + 1, acc.2) else if d = 1 then (acc.1, acc.2 + 1) else acc)
    (0, 0)

/-- The aggregate east and west hop counts of a whole `T`-step path. -/
def pathTally (ws : ℕ → Dir → ℕ) (seed : UInt32) (M T : ℕ) : ℕ × ℕ :=
  (Array.range T |>.map (fun s => stepTally ws seed M (s + 1))).foldl
    (fun acc t => (acc.1 + t.1, acc.2 + t.2)) (0, 0)

/-! ## Exact-DP goldens

The tally distribution of `e` walker-steps with weights `w`: `σ` takes the
value `(i − e)·a`, `a = ln (w 0 / w 1)`, with exact numerator `p[i]` over
the common denominator `256 ^ e` — the coefficients of
`(w 1 + (256 − w 0 − w 1)·x + w 0·x²) ^ e`. Horizons whose numerators
exceed the f64 range (`256 ^ e ≥ 2 ^ 1024`) are convolved in f64 instead. -/

/-- Convolution of coefficient arrays. -/
def polyMul (p q : Array ℕ) : Array ℕ :=
  if p.isEmpty || q.isEmpty then #[] else
    let n := p.size + q.size - 1
    let qi := Array.range q.size
    let acc := Array.range p.size |>.foldl (fun acc i =>
      let a := p[i]!
      qi.foldl (fun acc j =>
        Array.setIfInBounds acc (i + j) (acc[i + j]! + a * q[j]!)) acc)
      (Array.replicate n 0)
    acc

/-- Coefficient arrays raised to a power, by repeated squaring. -/
def polyPow : Array ℕ → ℕ → Array ℕ
  | _, 0 => #[1]
  | p, e + 1 =>
    let half := polyPow p ((e + 1) / 2)
    if (e + 1) % 2 = 0 then polyMul half half
    else polyMul (polyMul half half) p

/-- The exact tally numerators of `e` walker-steps of weights `w`: entry
`i` is the numerator of `P (n_E − n_W = i − e)` over `256 ^ e`. -/
def tallyNumerators (w : Dir → ℕ) (e : ℕ) : Array ℕ :=
  polyPow #[w 1, 256 - w 0 - w 1, w 0] e

/-- Convolution of f64 coefficient arrays. -/
def polyMulF (p q : Array Float) : Array Float :=
  if p.isEmpty || q.isEmpty then #[] else
    let n := p.size + q.size - 1
    let qi := Array.range q.size
    let acc := Array.range p.size |>.foldl (fun acc i =>
      let a := p[i]!
      qi.foldl (fun acc j =>
        Array.setIfInBounds acc (i + j) (acc[i + j]! + a * q[j]!)) acc)
      (Array.replicate n 0)
    acc

/-- f64 coefficient arrays raised to a power, by repeated squaring. -/
def polyPowF : Array Float → ℕ → Array Float
  | _, 0 => #[1]
  | p, e + 1 =>
    let half := polyPowF p ((e + 1) / 2)
    if (e + 1) % 2 = 0 then polyMulF half half
    else polyMulF (polyMulF half half) p

/-- The one-step tally distribution of `w` in f64: entry `i` is
`P (n_E − n_W = i − 1)`. -/
def stepProbs (w : Dir → ℕ) : Array Float :=
  #[(w 1).toFloat / 256, (256 - w 0 - w 1).toFloat / 256, (w 0).toFloat / 256]

/-- The tally distribution of `e` walker-steps in f64: entry `i` is
`P (n_E − n_W = i − e)`. -/
def tallyProbs (w : Dir → ℕ) (e : ℕ) : Array Float :=
  polyPowF (stepProbs w) e

/-- The schedule tally distribution over `T` hops in f64: entry `i` is
`P (n_E − n_W = i − M·T)`. -/
def schedProbs (ws : ℕ → Dir → ℕ) (M T : ℕ) : Array Float :=
  (Array.range T |>.map fun s => polyPowF (stepProbs (ws (s + 1))) M)
  |>.foldl polyMulF #[1]

/-! ## The K5 corner goldens

Exact count-marginals of the corner (`n = 4`, `M = 4`) in rational
arithmetic. A single walker is one of 16 sites indexed `x + 4·y`; the
per-walker kernel entry is its hop mass over 256. The count observer sees
only the region occupancy, so the per-walker emission is the in-region
indicator, and the `M`-walker count-sequence law is the `M`-fold
convolution of the per-walker indicator-sequence law. -/

/-- One corner hop on site indices `x + 4·y`. -/
def hopIdx (d : Dir) (s : ℕ) : ℕ :=
  match d with
  | 0 => (s % 4 + 1) % 4 + 4 * (s / 4)
  | 1 => (s % 4 + 3) % 4 + 4 * (s / 4)
  | 2 => s % 4 + 4 * ((s / 4 + 1) % 4)
  | 3 => s % 4 + 4 * ((s / 4 + 3) % 4)
  | _ => s

/-- The one-walker corner kernel in 256ths. -/
def cornerMass (w : Dir → ℕ) (a b : ℕ) : ℕ :=
  ∑ d : Dir, if hopIdx d a = b then w d else 0

/-- The per-walker law of length-`k` in-region indicator sequences: entry
`e` (the bit-packed sequence, `e = ∑ 2^t·e_t`) is the exact probability of
that in/out sequence, for one walker started uniform. -/
def emitLaw (w : Dir → ℕ) (inA : ℕ → Bool) (k : ℕ) : Array ℚ :=
  let ker := fun s s' => ((cornerMass w s s' : ℤ) : ℚ) / 256
  let emit : ℕ → Bool := fun s => inA s
  Array.range (2 ^ k) |>.map fun e =>
    let msg0 : Array ℚ := Array.range 16 |>.map fun s =>
      if emit s == (e % 2 == 1) then 1 / 16 else 0
    let msg := (Array.range (k - 1) |>.foldl (fun msg t =>
      Array.range 16 |>.map fun s' =>
        if emit s' == ((e >>> (t + 1)) % 2 == 1) then
          (Array.range 16 |>.foldl (fun acc s => acc + msg[s]! * ker s s') 0)
        else 0) msg0)
    msg.foldl (· + ·) 0

/-- Digit-wise subtraction of the packed binary sequence `e` from the
packed count sequence `c` in base `b`; `none` when any digit borrows. -/
def digitSub (b k : ℕ) (c e : ℕ) : Option ℕ :=
  (Array.range k |>.foldl (fun (acc : Option ℕ) t =>
    match acc with
    | none => none
    | some a =>
      let ct := (c / b ^ t) % b
      let et := (e / 2 ^ t) % 2
      if ct < et then none else some (a + (ct - et) * b ^ t)) (some 0))

/-- The `M`-walker count-sequence law over `k` times, in base `M + 1`: the
`M`-fold convolution of the per-walker indicator-sequence law. -/
def countLaw (M : ℕ) (perWalker : Array ℚ) (k : ℕ) : Array ℚ :=
  let base := M + 1
  let start : Array ℚ := (Array.range (base ^ k)).map fun c => if c == 0 then 1 else 0
  (Array.range M |>.foldl (fun law _ =>
    Array.range (base ^ k) |>.map fun c =>
      (Array.range (2 ^ k) |>.foldl (fun acc e =>
        match digitSub base k c e with
        | none => acc
        | some c' => acc + law[c']! * perWalker[e]!) 0))
    start)

/-- The Kullback–Leibler divergence between two count-sequence laws, in
f64. -/
def klFloat (p q : Array ℚ) : Float :=
  p.zip q |>.foldl (fun acc pq =>
    let r := pq.1 / pq.2
    acc + (pq.1.num.toFloat / pq.1.den.toFloat) *
      (r.num.toFloat / r.den.toFloat).log) 0

end TimesArrow.Walker

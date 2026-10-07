import TimesArrow.Philox
import TimesArrow.Markov.Chain
import TimesArrow.Markov.EntropyProduction
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

* the model, `walkerK`: one walker as `Site n → PMF (Site n)`; the
  synchronous product on `Fin M → Site n` remains to be formalized;
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

/-- The uniform distribution on walker configurations. -/
noncomputable def uniformConfig (n : ℕ) [NeZero n] (M : ℕ) : PMF (Fin M → Site n) :=
  PMF.uniformOfFintype (Fin M → Site n)

theorem uniformConfig_apply (n : ℕ) [NeZero n] (M : ℕ) (i : Fin M → Site n) :
    uniformConfig n M i = ((Fintype.card (Fin M → Site n) : ℝ≥0∞)⁻¹) :=
  PMF.uniformOfFintype_apply i

theorem uniformConfig_const (n : ℕ) [NeZero n] (M : ℕ) (i j : Fin M → Site n) :
    uniformConfig n M i = uniformConfig n M j := by
  rw [uniformConfig_apply, uniformConfig_apply]

theorem walkerK_row_sum (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (i : Site n) : ∑ j, walkerK n w hw i j = 1 := by
  have h := (walkerK n w hw i).tsum_coe
  rwa [tsum_fintype] at h

theorem walkerK_row_sum_toReal (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (i : Site n) : ∑ j, (walkerK n w hw i j).toReal = 1 := by
  rw [← toReal_sum (fun j _ => PMF.apply_ne_top _ _), walkerK_row_sum n w hw i,
    ENNReal.toReal_one]

/-! ## Tori of girth at least three

The registered sizes (`n = 4`, `n = 8`) are powers of two at least four, and
for such `n` the five hop displacements are pairwise distinct: east and west
move to different sites, so a hop between two sites has exactly one
direction, and the hop tally is well defined. -/

/-- The integer hop displacements are pairwise distinct. -/
theorem velInt_inj : Function.Injective velInt := by decide +kernel

theorem velInt_fst_bounds (d : Dir) :
    (velInt d).1 = -1 ∨ (velInt d).1 = 0 ∨ (velInt d).1 = 1 := by
  fin_cases d <;> decide

theorem velInt_snd_bounds (d : Dir) :
    (velInt d).2 = -1 ∨ (velInt d).2 = 0 ∨ (velInt d).2 = 1 := by
  fin_cases d <;> decide

/-- Integer displacements with components in `{-1, 0, 1}` stay distinct in
`ZMod n` whenever `3 ≤ n`. -/
theorem zmod_eq_of_three_le (n : ℕ) [NeZero n] (h3 : 3 ≤ n) {a b : ℤ}
    (ha : a = -1 ∨ a = 0 ∨ a = 1) (hb : b = -1 ∨ b = 0 ∨ b = 1)
    (h : (a : ZMod n) = (b : ZMod n)) : a = b := by
  by_contra hne
  rw [ZMod.intCast_eq_intCast_iff, Int.modEq_iff_dvd, Int.ofNat_dvd_left] at h
  have hpos : (b - a).natAbs ≠ 0 :=
    fun h0 => hne (by have := Int.natAbs_eq_zero.mp h0; omega)
  have hle : (b - a).natAbs ≤ 2 := by
    rcases ha with rfl | rfl | rfl <;> rcases hb with rfl | rfl | rfl <;> decide
  have hbot : n ≤ (b - a).natAbs := Nat.le_of_dvd (Nat.pos_of_ne_zero hpos) h
  omega

/-- **Distinct displacements.** On a torus with `3 ≤ n` the five hop
offsets are pairwise distinct sites. -/
theorem vel_inj (n : ℕ) [NeZero n] (h3 : 3 ≤ n) : Function.Injective (vel n) := by
  intro a b h
  have h1 : (((velInt a).1 : ZMod n)) = (((velInt b).1 : ZMod n)) := congrArg Prod.fst h
  have h2 : (((velInt a).2 : ZMod n)) = (((velInt b).2 : ZMod n)) := congrArg Prod.snd h
  have e1 : (velInt a).1 = (velInt b).1 :=
    zmod_eq_of_three_le n h3 (velInt_fst_bounds a) (velInt_fst_bounds b) h1
  have e2 : (velInt a).2 = (velInt b).2 :=
    zmod_eq_of_three_le n h3 (velInt_snd_bounds a) (velInt_snd_bounds b) h2
  fin_cases a <;> fin_cases b <;> simp_all [velInt]

/-- Hops out of one site have distinct targets, so a transition picks out
exactly one direction. -/
theorem hop_inj (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (s : Site n) :
    Function.Injective (hop n s) := by
  intro a b h
  exact vel_inj n h3 (add_left_cancel (by simpa only [hop] using h))

/-- The hop mass between adjacent sites is the weight of the (unique)
direction that connects them. -/
theorem hopMass_eq (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (w : Dir → ℕ) (i j : Site n)
    (d : Dir) (hd : hop n i d = j) : hopMass n w i j = w d := by
  simp only [hopMass]
  rw [Finset.sum_eq_single d]
  · rw [if_pos hd]
  · intro d' _ hne
    exact if_neg fun h => hne (hop_inj n h3 i (h.trans hd.symm))
  · intro hd
    exact absurd (Finset.mem_univ d) hd

/-- With positive weights a hop-connected pair has positive hop mass, and
the connecting direction exists. -/
theorem exists_hop_of_pos (n : ℕ) [NeZero n] (w : Dir → ℕ) (hwpos : ∀ d, 0 < w d)
    {i j : Site n} (h : hopMass n w i j ≠ 0) : ∃ d, hop n i d = j := by
  by_contra hcon
  push_neg at hcon
  exact h ((hopMass_eq_zero_iff n w hwpos i j).mpr hcon)

/-- The one-walker kernel between adjacent sites, by direction. -/
theorem walkerK_hop_apply (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) (s : Site n) (d : Dir) :
    walkerK n w hw s (hop n s d) = (w d : ℝ≥0∞) / 256 := by
  rw [walkerK_apply, hopMass_eq n h3 w s (hop n s d) d rfl]

theorem walkerK_hop_apply_toReal (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) (s : Site n) (d : Dir) :
    (walkerK n w hw s (hop n s d)).toReal = (w d : ℝ) / 256 := by
  have h256 : ((256 : ℝ≥0∞)).toReal = 256 := by norm_num
  rw [walkerK_hop_apply n h3 w hw s d, ENNReal.toReal_div, ENNReal.toReal_natCast, h256]

/-- The reverse hop's kernel value, by direction. -/
theorem walkerK_rev_hop_apply_toReal (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) (s : Site n) (d : Dir) :
    (walkerK n w hw (hop n s d) s).toReal = (w (opp d) : ℝ) / 256 := by
  have hrev : hop n (hop n s d) (opp d) = s := (hop_opp_iff n s (hop n s d) d).mp rfl
  have hkey : walkerK n w hw (hop n s d) s
      = walkerK n w hw (hop n s d) (hop n (hop n s d) (opp d)) := by rw [hrev]
  rw [hkey, walkerK_hop_apply_toReal n h3 w hw (hop n s d) (opp d)]

/-- The one-step log-ratio between a hop and its reverse, by direction. -/
theorem walkerK_hop_logRatio (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) (s : Site n) (d : Dir) :
    Real.log ((walkerK n w hw s (hop n s d)).toReal
        / (walkerK n w hw (hop n s d) s).toReal)
      = Real.log ((w d : ℝ) / (w (opp d) : ℝ)) := by
  rw [walkerK_hop_apply_toReal n h3 w hw s d, walkerK_rev_hop_apply_toReal n h3 w hw s d]
  exact congrArg Real.log (by field_simp)

/-! ## The product chain

`M` independent walkers take one step synchronously: the joint kernel is the
product of the one-walker kernels, and every walker-kernel fact lifts. -/

/-- The joint step of `M` independent walkers: from configuration `i`,
every walker draws its hop independently. -/
noncomputable def prodK (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (i : Fin M → Site n) : PMF (Fin M → Site n) :=
  PMF.ofFintype (fun j => ∏ m, walkerK n w hw (i m) (j m)) (by
    have h := Finset.sum_prod_piFinset (Finset.univ : Finset (Site n))
      (fun (m : Fin M) (s' : Site n) => walkerK n w hw (i m) s')
    rw [Fintype.piFinset_univ] at h
    rw [h]
    exact (Finset.prod_congr rfl fun m _ => walkerK_row_sum n w hw (i m)).trans
      Finset.prod_const_one)

theorem prodK_apply (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (i j : Fin M → Site n) :
    prodK n M w hw i j = ∏ m, walkerK n w hw (i m) (j m) := rfl

theorem prodK_apply_toReal (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) (i j : Fin M → Site n) :
    (prodK n M w hw i j).toReal = ∏ m, (walkerK n w hw (i m) (j m)).toReal := by
  rw [prodK_apply, ENNReal.toReal_prod]

/-- The product kernel is doubly stochastic: the joint column sums are one
(each walker kernel contributes an independent column sum). -/
theorem prodK_col_sum (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (j : Fin M → Site n) : ∑ i, prodK n M w hw i j = 1 := by
  have h := Finset.sum_prod_piFinset (Finset.univ : Finset (Site n))
    (fun (m : Fin M) (s : Site n) => walkerK n w hw s (j m))
  rw [Fintype.piFinset_univ] at h
  simp only [prodK_apply]
  rw [h]
  exact (Finset.prod_congr rfl fun m _ => walkerK_col_sum n w hw (j m)).trans
    Finset.prod_const_one

/-- Uniform configurations stay uniform, for every weight vector: the
registered start is exactly stationary for every arm (M1). -/
theorem prodK_stationary (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) :
    TimesArrow.Markov.IsStationary (prodK n M w hw) (uniformConfig n M) := by
  refine PMF.ext fun j => ?_
  show (uniformConfig n M).bind (prodK n M w hw) j = uniformConfig n M j
  rw [PMF.bind_apply, tsum_fintype]
  simp only [uniformConfig_apply]
  rw [← Finset.mul_sum, prodK_col_sum n M w hw j, mul_one]

/-- **Support symmetry of the product chain.** With positive weights every
joint move has its reverse available (M1). -/
theorem prodK_support (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (hwpos : ∀ d, 0 < w d) (i j : Fin M → Site n) :
    prodK n M w hw i j = 0 ↔ prodK n M w hw j i = 0 := by
  rw [prodK_apply, prodK_apply, Finset.prod_eq_zero_iff, Finset.prod_eq_zero_iff]
  constructor
  · rintro ⟨m, hm⟩
    exact ⟨m, Finset.mem_univ m, walkerK_support n w hw hwpos (i m) (j m) |>.mp hm.2⟩
  · rintro ⟨m, hm⟩
    exact ⟨m, Finset.mem_univ m, walkerK_support n w hw hwpos (i m) (j m) |>.mpr hm.2⟩

/-! ## Reversal: the swapped arms realize the reversed path law -/

/-- **Transposition by swapped weights.** If `w'` reads `w` through `opp`,
the hop masses of `w'` are the transposed hop masses of `w`. -/
theorem hopMass_opp (n : ℕ) [NeZero n] (w w' : Dir → ℕ) (hswap : ∀ d, w' d = w (opp d))
    (i j : Site n) : hopMass n w' i j = hopMass n w j i := by
  simp only [hopMass]
  refine Fintype.sum_equiv oppEquiv _ _ fun d => ?_
  show (if hop n i d = j then w' d else 0)
      = if hop n j (opp d) = i then w (opp d) else 0
  by_cases hd : hop n i d = j
  · rw [if_pos hd, if_pos ((hop_opp_iff n i j d).mp hd), hswap d]
  · rw [if_neg hd, if_neg fun h => hd ((hop_opp_iff n i j d).mpr h)]

/-- Reading the weights through `opp` transposes the one-walker kernel. -/
theorem walkerK_transpose (n : ℕ) [NeZero n] (w w' : Dir → ℕ)
    (hw : ∑ d, w d = 256) (hw' : ∑ d, w' d = 256) (hswap : ∀ d, w' d = w (opp d))
    (i j : Site n) : walkerK n w' hw' i j = walkerK n w hw j i := by
  rw [walkerK_apply n w' hw' i j, walkerK_apply n w hw j i, hopMass_opp n w w' hswap i j]

/-- Reading the weights through `opp` transposes the product kernel. -/
theorem prodK_transpose (n : ℕ) [NeZero n] (M : ℕ) (w w' : Dir → ℕ)
    (hw : ∑ d, w d = 256) (hw' : ∑ d, w' d = 256) (hswap : ∀ d, w' d = w (opp d))
    (i j : Fin M → Site n) :
    prodK n M w' hw' i j = prodK n M w hw j i := by
  simp only [prodK_apply]
  exact Finset.prod_congr rfl fun m _ => walkerK_transpose n w w' hw hw' hswap (i m) (j m)

/-- **The reversed arm realizes the reversed path law** (K3): with the
uniform start, the path law of the E↔W-swapped weights is exactly the law of
the time-reversed trajectories of the driven chain — the reversed arm is
the time reversal. -/
theorem reversedPathPMF_prodK (n : ℕ) [NeZero n] (M T : ℕ) :
    TimesArrow.Markov.reversedPathPMF (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T
      = TimesArrow.Markov.pathPMF (uniformConfig n M)
        (prodK n M reversedW reversedW_sum) T := by
  refine TimesArrow.Markov.reversedPathPMF_eq_pathPMF_transpose _ _
    (fun i j => prodK_transpose n M drivenW reversedW drivenW_sum reversedW_sum
      reversedW_eq i j) _ (uniformConfig_const n M) T

/-! ## Pathwise σ: the signed east/west tally

The observable a simulation accumulates: on every positive-probability
trajectory of the driven product chain, the path entropy production is the
number of east hops minus the number of west hops, times the drive
`ln 3`. -/

/-- A nonzero kernel entry has a nonzero hop mass. -/
theorem hopMass_ne_zero_of_walkerK (n : ℕ) [NeZero n] (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) {s s' : Site n} (h : walkerK n w hw s s' ≠ 0) :
    hopMass n w s s' ≠ 0 := by
  intro h0
  apply h
  rw [walkerK_apply, h0, Nat.cast_zero]
  simp

/-- The signed E/W score of one hop, read off the displacement: `+1` east,
`-1` west, `0` otherwise. -/
def netHop (n : ℕ) [NeZero n] (s s' : Site n) : ℤ :=
  if s' = s + vel n 0 then 1 else if s' = s + vel n 1 then -1 else 0

/-- The signed E/W score of one hop, by direction. -/
def hopDirScore (d : Dir) : ℤ := if d = 0 then 1 else if d = 1 then -1 else 0

/-- Distinct directions have distinct displacements. -/
theorem vel_pair_ne (n : ℕ) [NeZero n] (h3 : 3 ≤ n) {d d' : Dir} (h : d ≠ d') :
    vel n d ≠ vel n d' := fun h' => h (vel_inj n h3 h')

/-- A hop out of `s` lands on `s + vel k` exactly when its direction is
`k`. -/
theorem hop_eq_iff_dir (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (s : Site n) (d k : Dir) :
    hop n s d = s + vel n k ↔ d = k := by
  simp only [hop]
  rw [add_left_cancel_iff]
  exact (vel_inj n h3).eq_iff

theorem netHop_hop (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (s : Site n) (d : Dir) :
    netHop n s (hop n s d) = hopDirScore d := by
  simp only [netHop, hopDirScore, hop_eq_iff_dir n h3 s d 0, hop_eq_iff_dir n h3 s d 1]

/-- The driven one-step log-ratio, by direction: east and west carry the
drive `± ln 3`, north, south and stay carry none. -/
theorem logRatio_drivenW_dir (d : Dir) :
    Real.log ((drivenW d : ℝ) / (drivenW (opp d) : ℝ))
      = (hopDirScore d : ℝ) * Real.log 3 := by
  fin_cases d
  · show Real.log ((drivenW (0 : Dir) : ℝ) / (drivenW (opp 0) : ℝ))
        = (hopDirScore (0 : Dir) : ℝ) * Real.log 3
    rw [show ((drivenW (0 : Dir) : ℝ) / (drivenW (opp 0) : ℝ)) = 3 by norm_num
      [drivenW, opp]]
    simp [hopDirScore]
  · show Real.log ((drivenW (1 : Dir) : ℝ) / (drivenW (opp 1) : ℝ))
        = (hopDirScore (1 : Dir) : ℝ) * Real.log 3
    rw [show ((drivenW (1 : Dir) : ℝ) / (drivenW (opp 1) : ℝ)) = (3 : ℝ)⁻¹ by norm_num
      [drivenW, opp], Real.log_inv]
    simp [hopDirScore]
  · show Real.log ((drivenW (2 : Dir) : ℝ) / (drivenW (opp 2) : ℝ))
        = (hopDirScore (2 : Dir) : ℝ) * Real.log 3
    rw [show ((drivenW (2 : Dir) : ℝ) / (drivenW (opp 2) : ℝ)) = 1 by norm_num
      [drivenW, opp], Real.log_one]
    simp [hopDirScore]
  · show Real.log ((drivenW (3 : Dir) : ℝ) / (drivenW (opp 3) : ℝ))
        = (hopDirScore (3 : Dir) : ℝ) * Real.log 3
    rw [show ((drivenW (3 : Dir) : ℝ) / (drivenW (opp 3) : ℝ)) = 1 by norm_num
      [drivenW, opp], Real.log_one]
    simp [hopDirScore]
  · show Real.log ((drivenW (4 : Dir) : ℝ) / (drivenW (opp 4) : ℝ))
        = (hopDirScore (4 : Dir) : ℝ) * Real.log 3
    rw [show ((drivenW (4 : Dir) : ℝ) / (drivenW (opp 4) : ℝ)) = 1 by norm_num
      [drivenW, opp], Real.log_one]
    simp [hopDirScore]

/-- **Per-hop σ is the E/W score times the drive.** For any hop-connected
pair of sites, the log-ratio of the step to its reverse is the direction's
score times `ln 3`. -/
theorem logRatio_pair (n : ℕ) [NeZero n] (h3 : 3 ≤ n) {s s' : Site n}
    (h : walkerK n drivenW drivenW_sum s s' ≠ 0) :
    Real.log ((walkerK n drivenW drivenW_sum s s').toReal
        / (walkerK n drivenW drivenW_sum s' s).toReal)
      = (netHop n s s' : ℝ) * Real.log 3 := by
  obtain ⟨d, hd⟩ := exists_hop_of_pos n drivenW drivenW_pos
    (hopMass_ne_zero_of_walkerK n drivenW drivenW_sum h)
  subst hd
  rw [walkerK_hop_logRatio n h3 drivenW drivenW_sum s d, logRatio_drivenW_dir d,
    netHop_hop n h3 s d]

/-- The signed E/W tally of a whole trajectory of the product chain: the
integer the simulation accumulates per path. -/
def netHops (n : ℕ) [NeZero n] (M T : ℕ) (ω : Fin (T + 1) → Fin M → Site n) : ℤ :=
  ∑ t : Fin T, ∑ m : Fin M, netHop n (ω t.castSucc m) (ω t.succ m)

/-- **Pathwise σ is the hop tally** (M1, K1): on every positive-probability
trajectory of the driven product chain on a torus with `3 ≤ n`, the path
entropy production is the signed E/W hop count times `ln 3` — one integer
per path. -/
theorem pathEntropyProduction_eq_netHops (n : ℕ) [NeZero n] (h3 : 3 ≤ n)
    (M T : ℕ) (ω : Fin (T + 1) → Fin M → Site n)
    (hω : TimesArrow.Markov.pathPMF (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T ω ≠ 0) :
    TimesArrow.Markov.pathEntropyProduction (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T ω
      = (netHops n M T ω : ℝ) * Real.log 3 := by
  have hstat := prodK_stationary n M drivenW drivenW_sum
  have hsym := prodK_support n M drivenW drivenW_sum drivenW_pos
  have hfac : ∀ (t : Fin T) (m : Fin M),
      walkerK n drivenW drivenW_sum (ω t.castSucc m) (ω t.succ m) ≠ 0 := by
    intro t m
    have h1 := TimesArrow.Markov.pathPMF_apply (uniformConfig n M)
      (prodK n M drivenW drivenW_sum) T ω
    rw [h1] at hω
    have h2 := (Finset.prod_ne_zero_iff.mp (mul_ne_zero_iff.mp hω).2) t
      (Finset.mem_univ t)
    rw [prodK_apply] at h2
    exact (Finset.prod_ne_zero_iff.mp h2) m (Finset.mem_univ m)
  have hterm : ∀ t : Fin T,
      Real.log (((uniformConfig n M) (ω t.castSucc)
          * prodK n M drivenW drivenW_sum (ω t.castSucc) (ω t.succ)).toReal
        / ((uniformConfig n M) (ω t.succ)
          * prodK n M drivenW drivenW_sum (ω t.succ) (ω t.castSucc)).toReal)
      = ∑ m : Fin M, (netHop n (ω t.castSucc m) (ω t.succ m) : ℝ) * Real.log 3 := by
    intro t
    have hnn : ∀ m : Fin M,
        (walkerK n drivenW drivenW_sum (ω t.castSucc m) (ω t.succ m)).toReal ≠ 0 :=
      fun m => ENNReal.toReal_ne_zero.mpr ⟨hfac t m, PMF.apply_ne_top _ _⟩
    have hnn' : ∀ m : Fin M,
        (walkerK n drivenW drivenW_sum (ω t.succ m) (ω t.castSucc m)).toReal ≠ 0 :=
      fun m => ENNReal.toReal_ne_zero.mpr
        ⟨fun h0 => hfac t m
            ((walkerK_support n drivenW drivenW_sum drivenW_pos (ω t.succ m)
              (ω t.castSucc m)).mp h0),
          PMF.apply_ne_top _ _⟩
    have hc : ((uniformConfig n M) (ω t.succ)).toReal ≠ 0 := by
      have h0 : (0 : ℝ) < ((Fintype.card (Fin M → Site n) : ℕ) : ℝ) := by
        exact_mod_cast Fintype.card_pos
      rw [uniformConfig_apply, ENNReal.toReal_inv, ENNReal.toReal_natCast]
      exact inv_ne_zero (ne_of_gt h0)
    rw [uniformConfig_const n M (ω t.castSucc) (ω t.succ)]
    rw [toReal_mul, prodK_apply_toReal, toReal_mul, prodK_apply_toReal]
    field_simp
    rw [Real.log_div (Finset.prod_ne_zero_iff.mpr fun m _ => hnn m)
      (Finset.prod_ne_zero_iff.mpr fun m _ => hnn' m), Real.log_prod
      (fun m _ => hnn m), Real.log_prod (fun m _ => hnn' m),
      ← Finset.sum_sub_distrib]
    refine Finset.sum_congr rfl fun m _ => ?_
    rw [← Real.log_div (hnn m) (hnn' m)]
    exact logRatio_pair n h3 (hfac t m)
  rw [TimesArrow.Markov.pathEntropyProduction_eq_sum (prodK n M drivenW drivenW_sum)
    (uniformConfig n M) hstat hsym T ω hω]
  rw [Finset.sum_congr rfl fun t _ => hterm t]
  have hcast : (netHops n M T ω : ℝ)
      = ∑ t : Fin T, ∑ m : Fin M, (netHop n (ω t.castSucc m) (ω t.succ m) : ℝ) := by
    rw [netHops]
    push_cast
    rfl
  have hdist : ((netHops n M T ω : ℤ) : ℝ) * Real.log 3
      = ∑ t : Fin T, ∑ m : Fin M,
          (netHop n (ω t.castSucc m) (ω t.succ m) : ℝ) * Real.log 3 := by
    rw [hcast]
    simp only [Finset.sum_mul]
  exact hdist.symm


/-! ## The per-step entropy production of the driven model

The expectation factorizes over walkers, so the product chain's per-step
entropy production is `M` times the one-walker rate — the input behind
`EP = T · 2 ln 3` for the registered 16 walkers. -/

set_option maxHeartbeats 1000000 in
/-- **One component's mean under the product chain.** Averaging a functional
of one walker's hop over the joint step of `M` independent walkers from a
uniform configuration gives the one-walker average times `N ^ (M-1)`: every
other walker contributes an independent row sum. -/
theorem prod_factor {X : Type*} [Fintype X] [DecidableEq X] {M : ℕ} (m₀ : Fin M)
    (φ : X → X → ℝ) (hrow : ∀ s : X, ∑ s' : X, φ s s' = 1) (g : X → X → ℝ) :
    ∑ i : Fin M → X, ∑ j : Fin M → X, (∏ m, φ (i m) (j m)) * g (i m₀) (j m₀)
      = (∑ s : X, ∑ s' : X, φ s s' * g s s')
        * (Fintype.card X) ^ (M - 1) := by
  classical
  have hq : ∀ q : Fin M → X × X,
      (∏ m, φ (q m).1 (q m).2 * (if m = m₀ then g (q m).1 (q m).2 else 1))
        = (∏ m, φ (q m).1 (q m).2) * g ((q m₀).1) ((q m₀).2) := by
    intro q
    have hif : ∏ m, (if m = m₀ then g ((q m).1) ((q m).2) else 1)
        = g ((q m₀).1) ((q m₀).2) :=
      (Finset.prod_eq_single (s := Finset.univ) (a := m₀)
        (f := fun m => if m = m₀ then g ((q m).1) ((q m).2) else 1)
        (fun m _ hm => if_neg hm)
        (fun hcon => absurd (Finset.mem_univ m₀) hcon)).trans (if_pos rfl)
    rw [Finset.prod_mul_distrib, hif]
  have hsplit := Finset.sum_prod_piFinset (Finset.univ : Finset (X × X))
    (fun (m : Fin M) (p : X × X) => φ p.1 p.2 * (if m = m₀ then g p.1 p.2 else 1))
  rw [Fintype.piFinset_univ] at hsplit
  have hre : ∑ p : (Fin M → X) × (Fin M → X),
      (∏ m, φ (p.1 m) (p.2 m)) * g (p.1 m₀) (p.2 m₀)
      = ∑ q : Fin M → X × X,
          ∏ m, φ (q m).1 (q m).2 * (if m = m₀ then g (q m).1 (q m).2 else 1) :=
    Fintype.sum_equiv
      (⟨fun p m => (p.1 m, p.2 m), fun q => (fun m => (q m).1, fun m => (q m).2),
        fun p => rfl, fun q => rfl⟩ :
        ((Fin M → X) × (Fin M → X)) ≃ (Fin M → X × X)) _ _
      fun p => (hq (fun m => (p.1 m, p.2 m))).symm
  have hrowsum : ∀ m : Fin M,
      ∑ p : X × X, φ p.1 p.2 * (if m = m₀ then g p.1 p.2 else 1)
        = if m = m₀ then ∑ s : X, ∑ s' : X, φ s s' * g s s' else Fintype.card X := by
    intro m
    by_cases hm : m = m₀
    · rw [if_pos hm, Fintype.sum_prod_type]
      exact Finset.sum_congr rfl fun s _ => Finset.sum_congr rfl fun s' _ => by simp [hm]
    · rw [if_neg hm, Fintype.sum_prod_type]
      have h1 : ∀ s : X,
          ∑ s' : X, φ (s, s').1 (s, s').2 * (if m = m₀ then g (s, s').1 (s, s').2 else 1)
            = 1 := by
        intro s
        calc ∑ s' : X,
              φ (s, s').1 (s, s').2 * (if m = m₀ then g (s, s').1 (s, s').2 else 1)
            = ∑ s' : X, φ s s' := Finset.sum_congr rfl fun s' _ => by simp [hm]
          _ = 1 := hrow s
      rw [Finset.sum_congr rfl fun s _ => h1 s, Finset.sum_const, Finset.card_univ,
        nsmul_eq_mul, mul_one]
  calc ∑ i : Fin M → X, ∑ j : Fin M → X, (∏ m, φ (i m) (j m)) * g (i m₀) (j m₀)
      = ∑ p : (Fin M → X) × (Fin M → X),
          (∏ m, φ (p.1 m) (p.2 m)) * g (p.1 m₀) (p.2 m₀) :=
        (Fintype.sum_prod_type
          (fun p : (Fin M → X) × (Fin M → X) =>
            (∏ m, φ (p.1 m) (p.2 m)) * g (p.1 m₀) (p.2 m₀))).symm
    _ = ∑ q : Fin M → X × X,
          ∏ m, φ (q m).1 (q m).2 * (if m = m₀ then g (q m).1 (q m).2 else 1) := hre
    _ = ∏ m,
          ∑ p : X × X, φ p.1 p.2 * (if m = m₀ then g p.1 p.2 else 1) := hsplit
    _ = (∑ p : X × X, φ p.1 p.2 * (if m₀ = m₀ then g p.1 p.2 else 1))
          * ∏ m ∈ Finset.univ.erase m₀,
              ∑ p : X × X, φ p.1 p.2 * (if m = m₀ then g p.1 p.2 else 1) := by
        rw [Finset.mul_prod_erase Finset.univ
          (fun m => ∑ p : X × X, φ p.1 p.2 * (if m = m₀ then g p.1 p.2 else 1))
          (Finset.mem_univ m₀)]
    _ = (∑ s : X, ∑ s' : X, φ s s' * g s s')
          * (Fintype.card X) ^ (M - 1) := by
        have hA : ∑ p : X × X, φ p.1 p.2 * (if m₀ = m₀ then g p.1 p.2 else 1)
            = ∑ s : X, ∑ s' : X, φ s s' * g s s' := by
          rw [hrowsum m₀, if_pos rfl]
        have hB : ∏ m ∈ Finset.univ.erase m₀,
            ∑ p : X × X, φ p.1 p.2 * (if m = m₀ then g p.1 p.2 else 1)
          = (Fintype.card X) ^ (M - 1) := by
          rw [Finset.prod_congr rfl fun m hm => (hrowsum m).trans
            (if_neg (Finset.mem_erase.mp hm).1), Finset.prod_const,
            Finset.card_erase_of_mem (Finset.mem_univ m₀), Finset.card_univ,
            Fintype.card_fin]
        rw [hA, hB]

/-- **The score sum.** Averaging the E/W score of one hop of the driven
one-walker chain over all target sites gives `1/8` per site: east carries
`+48/256`, west `-16/256`, the rest carry nothing. -/
theorem score_pair_sum (n : ℕ) [NeZero n] (h3 : 3 ≤ n) :
    ∑ s : Site n, ∑ s' : Site n,
        (walkerK n drivenW drivenW_sum s s').toReal * (netHop n s s' : ℝ)
      = (Fintype.card (Site n)) * (1 / 8) := by
  classical
  have hpair : ∀ s s' : Site n,
      (walkerK n drivenW drivenW_sum s s').toReal * (netHop n s s' : ℝ)
        = ∑ d : Dir, (if s' = s + vel n d then ((drivenW d : ℝ) / 256)
            * (hopDirScore d : ℝ) else 0) := by
    intro s s'
    by_cases h0 : walkerK n drivenW drivenW_sum s s' = 0
    · have hm0 : hopMass n drivenW s s' = 0 := by
        rw [walkerK_apply, div_eq_zero_iff] at h0
        rcases h0 with h1 | h1
        · exact Nat.cast_eq_zero.mp h1
        · exact absurd h1 (by simp)
      have hno : ∀ d : Dir, s' ≠ s + vel n d := fun d h =>
        ((hopMass_eq_zero_iff n drivenW drivenW_pos s s').mp hm0) d h.symm
      rw [h0, ENNReal.toReal_zero, zero_mul]
      simp [hno]
    · obtain ⟨d, hd⟩ := exists_hop_of_pos n drivenW drivenW_pos
        (hopMass_ne_zero_of_walkerK n drivenW drivenW_sum h0)
      subst hd
      have hφ : (walkerK n drivenW drivenW_sum s (hop n s d)).toReal
          = (drivenW d : ℝ) / 256 := walkerK_hop_apply_toReal n h3 drivenW drivenW_sum s d
      rw [hφ, netHop_hop n h3 s d, Finset.sum_eq_single d]
      · rw [if_pos (show hop n s d = s + vel n d from rfl)]
      · intro d' _ hne
        refine if_neg fun h => ?_
        have h2 : vel n d = vel n d' := add_left_cancel h
        exact hne (vel_inj n h3 h2).symm
      · intro hcon
        exact absurd (Finset.mem_univ d) hcon
  have hdsum : ∑ d : Dir, ((drivenW d : ℝ) / 256) * (hopDirScore d : ℝ) = 1 / 8 := by
    rw [Fin.sum_univ_five]
    norm_num [drivenW, opp, hopDirScore]
  calc ∑ s : Site n, ∑ s' : Site n,
        (walkerK n drivenW drivenW_sum s s').toReal * (netHop n s s' : ℝ)
      = ∑ s : Site n, ∑ s' : Site n, ∑ d : Dir,
          (if s' = s + vel n d then ((drivenW d : ℝ) / 256)
            * (hopDirScore d : ℝ) else 0) :=
        Finset.sum_congr rfl fun s _ => Finset.sum_congr rfl fun s' _ => hpair s s'
    _ = ∑ s : Site n, ∑ d : Dir,
          ((drivenW d : ℝ) / 256) * (hopDirScore d : ℝ) := by
        refine Finset.sum_congr rfl fun s _ => ?_
        rw [Finset.sum_comm]
        refine Finset.sum_congr rfl fun d _ => ?_
        rw [Finset.sum_eq_single (s + vel n d)]
        · rw [if_pos rfl]
        · intro s' _ hne
          exact if_neg hne
        · intro hcon
          exact absurd (Finset.mem_univ _) hcon
    _ = ∑ d : Dir,
          (Fintype.card (Site n)) * (((drivenW d : ℝ) / 256) * (hopDirScore d : ℝ)) := by
        rw [Finset.sum_comm]
        exact Finset.sum_congr rfl fun d _ => by
          rw [Finset.sum_const, Finset.card_univ, nsmul_eq_mul]
    _ = (Fintype.card (Site n)) * (1 / 8) := by
        rw [← Finset.mul_sum, hdsum]

/-- **One walker's mean score under the product chain.** The mean E/W score
of walker `m₀`'s hop over one joint step from a uniform configuration is the
one-walker mean, `1/8`. -/
theorem one_step_score_mean (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (M : ℕ) (m₀ : Fin M) :
    ∑ i : Fin M → Site n, ∑ j : Fin M → Site n,
      ((uniformConfig n M) i).toReal
        * (((prodK n M drivenW drivenW_sum) i j).toReal
          * (netHop n (i m₀) (j m₀) : ℝ))
      = 1 / 8 := by
  have hcard : ((Fintype.card (Fin M → Site n) : ℕ) : ℝ)
      = ((Fintype.card (Site n) : ℕ) : ℝ) ^ M := by
    rw [Fintype.card_pi, Finset.prod_const, Finset.card_univ, Fintype.card_fin,
      Nat.cast_pow]
  have hfac : ∀ i : Fin M → Site n,
      ((uniformConfig n M) i).toReal
        = (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)⁻¹ := by
    intro i
    rw [uniformConfig_apply, ENNReal.toReal_inv, ENNReal.toReal_natCast, hcard]
  have hMpos : 0 < M := Fin.pos_iff_nonempty.mpr ⟨m₀⟩
  have key := prod_factor (X := Site n) m₀
    (fun s s' : Site n => (walkerK n drivenW drivenW_sum s s').toReal)
    (fun s => walkerK_row_sum_toReal n drivenW drivenW_sum s)
    (fun s s' : Site n => (netHop n s s' : ℝ))
  have hsumand : ∀ (i : Fin M → Site n) (j : Fin M → Site n),
      (((uniformConfig n M) i).toReal)
          * (((prodK n M drivenW drivenW_sum) i j).toReal
            * (netHop n (i m₀) (j m₀) : ℝ))
        = (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)⁻¹
          * ((∏ m, (walkerK n drivenW drivenW_sum (i m) (j m)).toReal)
            * (netHop n (i m₀) (j m₀) : ℝ)) := by
    intro i j
    rw [hfac i, prodK_apply_toReal]
  calc ∑ i : Fin M → Site n, ∑ j : Fin M → Site n,
      ((uniformConfig n M) i).toReal
        * (((prodK n M drivenW drivenW_sum) i j).toReal
          * (netHop n (i m₀) (j m₀) : ℝ))
      = (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)⁻¹ * ∑ i : Fin M → Site n,
          ∑ j : Fin M → Site n,
          (∏ m, (walkerK n drivenW drivenW_sum (i m) (j m)).toReal)
            * (netHop n (i m₀) (j m₀) : ℝ) := by
        simp only [hsumand, ← Finset.mul_sum]
    _ = (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)⁻¹
          * (((Fintype.card (Site n) : ℕ) : ℝ) * (1 / 8))
          * (((Fintype.card (Site n) : ℕ) : ℝ) ^ (M - 1)) := by
        rw [key, score_pair_sum n h3]
        ring
    _ = (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)⁻¹
          * (((Fintype.card (Site n) : ℕ) : ℝ) ^ (M - 1))
          * (((Fintype.card (Site n) : ℕ) : ℝ) * (1 / 8)) := by
        ring
    _ = 1 / 8 := by
        have hN : (0 : ℝ) < ((Fintype.card (Site n) : ℕ) : ℝ) := by
          exact_mod_cast Fintype.card_pos
        have hX : ((Fintype.card (Site n) : ℕ) : ℝ) ^ (M - 1) ≠ 0 :=
          pow_ne_zero _ (ne_of_gt hN)
        have hM1 : (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)
            = (((Fintype.card (Site n) : ℕ) : ℝ) ^ (M - 1))
              * ((Fintype.card (Site n) : ℕ) : ℝ) := by
          conv_lhs =>
            rw [show M = (M - 1) + 1 from (Nat.succ_pred_eq_of_pos hMpos).symm]
          rw [pow_succ]
        have hc2 : (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)⁻¹
            * (((Fintype.card (Site n) : ℕ) : ℝ) ^ (M - 1))
            * ((Fintype.card (Site n) : ℕ) : ℝ) = 1 := by
          rw [hM1, mul_assoc,
            inv_mul_cancel₀ (mul_ne_zero hX (ne_of_gt hN))]
        calc (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)⁻¹
              * (((Fintype.card (Site n) : ℕ) : ℝ) ^ (M - 1))
              * (((Fintype.card (Site n) : ℕ) : ℝ) * (1 / 8))
            = (((Fintype.card (Site n) : ℕ) : ℝ) ^ M)⁻¹
                * (((Fintype.card (Site n) : ℕ) : ℝ) ^ (M - 1))
                * ((Fintype.card (Site n) : ℕ) : ℝ) * (1 / 8) := by ring
          _ = 1 * (1 / 8) := by rw [hc2]
          _ = 1 / 8 := by rw [one_mul]

/-- **The per-step entropy production of the driven product chain** is `M`
times the one-walker rate `1/8 · ln 3`: extensivity turns one step of the
chain into the mean path entropy production, the pathwise tally turns that
into the mean hop tally, and the expectation factorizes over walkers. -/
theorem stepEntropyProduction_prodK (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (M : ℕ) :
    TimesArrow.Markov.stepEntropyProduction (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) = (M : ℝ) * (1 / 8) * Real.log 3 := by
  have hstat := prodK_stationary n M drivenW drivenW_sum
  have hsym := prodK_support n M drivenW drivenW_sum drivenW_pos
  have h1 := TimesArrow.Markov.toReal_entropyProduction_eq_natCast_mul_stepEntropyProduction
    (prodK n M drivenW drivenW_sum) (uniformConfig n M) hstat hsym 1
  rw [Nat.cast_one, one_mul] at h1
  have hac : ∀ ω : Fin 2 → (Fin M → Site n),
      TimesArrow.Markov.pathPMF (uniformConfig n M) (prodK n M drivenW drivenW_sum) 1
          (TimesArrow.Markov.reversePath ω) = 0
        → TimesArrow.Markov.pathPMF (uniformConfig n M) (prodK n M drivenW drivenW_sum) 1 ω
          = 0 :=
    fun ω h0 => by_contra fun hω =>
      (TimesArrow.Markov.pathPMF_reversePath_ne_zero (prodK n M drivenW drivenW_sum)
        (uniformConfig n M) hstat hsym 1 ω hω) h0
  have hmean := TimesArrow.Markov.toReal_entropyProduction (uniformConfig n M)
    (prodK n M drivenW drivenW_sum) 1 hac
  have hper : ∀ ω : Fin 2 → (Fin M → Site n),
      ((TimesArrow.Markov.pathPMF (uniformConfig n M) (prodK n M drivenW drivenW_sum) 1 ω).toReal
          * (netHops n M 1 ω : ℝ)) * Real.log 3
        = (TimesArrow.Markov.pathPMF (uniformConfig n M) (prodK n M drivenW drivenW_sum) 1 ω).toReal
          * TimesArrow.Markov.pathEntropyProduction (uniformConfig n M)
              (prodK n M drivenW drivenW_sum) 1 ω := by
    intro ω
    by_cases hω : TimesArrow.Markov.pathPMF (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) 1 ω = 0
    · rw [hω, ENNReal.toReal_zero]
      simp
    · rw [pathEntropyProduction_eq_netHops n h3 M 1 ω hω]
      ring
  have hE : ∑ ω : Fin 2 → (Fin M → Site n),
      (TimesArrow.Markov.pathPMF (uniformConfig n M) (prodK n M drivenW drivenW_sum) 1 ω).toReal
        * (netHops n M 1 ω : ℝ)
      = (M : ℝ) * (1 / 8) := by
    have h1t : ∀ ω : Fin 2 → (Fin M → Site n),
        (netHops n M 1 ω : ℝ) = ∑ t : Fin 1,
            ∑ m : Fin M, (netHop n (ω t.castSucc m) (ω t.succ m) : ℝ) := by
      intro ω
      rw [netHops]
      push_cast
      rfl
    have htrans := TimesArrow.Markov.toReal_sum_pathPMF_transition
      (prodK n M drivenW drivenW_sum) (uniformConfig n M)
      (prodK_stationary n M drivenW drivenW_sum) 1
      (fun (a b : Fin M → Site n) => ∑ m : Fin M, (netHop n (a m) (b m) : ℝ))
    rw [Nat.cast_one, one_mul] at htrans
    calc ∑ ω : Fin 2 → (Fin M → Site n),
          (TimesArrow.Markov.pathPMF (uniformConfig n M) (prodK n M drivenW drivenW_sum) 1 ω).toReal
            * (netHops n M 1 ω : ℝ)
        = ∑ ω : Fin 2 → (Fin M → Site n),
            (TimesArrow.Markov.pathPMF (uniformConfig n M) (prodK n M drivenW drivenW_sum) 1 ω).toReal
              * ∑ t : Fin 1,
                  ∑ m : Fin M, (netHop n (ω t.castSucc m) (ω t.succ m) : ℝ) :=
          Finset.sum_congr rfl fun ω _ => by rw [h1t ω]
      _ = ∑ i : Fin M → Site n, ((uniformConfig n M) i).toReal
            * ∑ j : Fin M → Site n,
                ((prodK n M drivenW drivenW_sum) i j).toReal
                  * ∑ m : Fin M, (netHop n (i m) (j m) : ℝ) := htrans
      _ = (M : ℝ) * (1 / 8) := by
          simp only [Finset.mul_sum]
          have c1 : ∀ (i : Fin M → Site n),
              (∑ j : Fin M → Site n, ∑ m : Fin M,
                  ((uniformConfig n M) i).toReal
                    * (((prodK n M drivenW drivenW_sum) i j).toReal
                      * (netHop n (i m) (j m) : ℝ)))
            = ∑ m : Fin M, ∑ j : Fin M → Site n,
                  ((uniformConfig n M) i).toReal
                    * (((prodK n M drivenW drivenW_sum) i j).toReal
                      * (netHop n (i m) (j m) : ℝ)) :=
            fun i => Finset.sum_comm
          rw [Finset.sum_congr rfl fun i _ => c1 i, Finset.sum_comm,
            Finset.sum_congr rfl fun m _ => one_step_score_mean n h3 M m,
            Finset.sum_const, Finset.card_fin, nsmul_eq_mul]
  rw [← h1, hmean, Finset.sum_congr rfl fun ω _ => (hper ω).symm, ← Finset.sum_mul,
    hE]

/-- The null product chain is symmetric in its configurations. -/
theorem prodK_symm_null (n : ℕ) [NeZero n] (M : ℕ) (i j : Fin M → Site n) :
    prodK n M nullW nullW_sum i j = prodK n M nullW nullW_sum j i := by
  simp only [prodK_apply]
  exact Finset.prod_congr rfl fun m _ =>
    walkerK_symm n nullW nullW_sum (by decide +kernel) (i m) (j m)

/-- The null product chain is in detailed balance with the uniform law. -/
theorem prodK_null_reversible (n : ℕ) [NeZero n] (M : ℕ) :
    TimesArrow.Markov.IsReversible (prodK n M nullW nullW_sum) (uniformConfig n M) := by
  intro i j
  rw [uniformConfig_const n M i j, prodK_symm_null n M i j]

/-- **The null model produces no entropy pathwise** (K2): the null product
chain is reversible, so every trajectory is exactly as probable as its time
reversal and `σ ≡ 0` — the undriven state orients nothing. -/
theorem null_path_sigma_zero (n : ℕ) [NeZero n] (M T : ℕ)
    (ω : Fin (T + 1) → Fin M → Site n) :
    TimesArrow.Markov.pathEntropyProduction (uniformConfig n M)
        (prodK n M nullW nullW_sum) T ω = 0 := by
  have hrev := TimesArrow.Markov.pathPMF_reversePath (prodK n M nullW nullW_sum)
    (uniformConfig n M) (prodK_null_reversible n M) T ω
  unfold TimesArrow.Markov.pathEntropyProduction
  rw [hrev]
  by_cases h0 : TimesArrow.Markov.pathPMF (uniformConfig n M)
      (prodK n M nullW nullW_sum) T ω = 0
  · rw [h0, ENNReal.toReal_zero, zero_div, Real.log_zero]
  · rw [div_self (ENNReal.toReal_ne_zero.mpr ⟨h0, PMF.apply_ne_top _ _⟩),
      Real.log_one]

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

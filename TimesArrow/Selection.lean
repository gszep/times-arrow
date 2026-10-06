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

/-! ## Scan lemmas -/

/-- The 24-bit draw of a slot is the Nat shift of the Philox word's value. -/
theorem u01_toNat (x : UInt32) : (u01 x).toNat = x.toNat >>> 8 := by
  have h8 : (UInt32.mod (8 : UInt32) (32 : UInt32)).toBitVec.toNat = 8 := by decide
  show (UInt32.shiftRight x 8).toNat = x.toNat >>> 8
  simp only [UInt32.shiftRight, UInt32.toNat, BitVec.ushiftRight_eq',
    BitVec.toNat_ushiftRight, h8]

/-- Every draw is a 24-bit integer. -/
theorem draw_lt (seed : UInt32) (j : ℕ) : draw seed j < 2 ^ 24 := by
  have hx := UInt32.toNat_lt (rand seed 0 j.toUInt32).x0
  rw [draw, u01_toNat, Nat.shiftRight_eq_div_pow]
  have h8 : (2 : Nat) ^ 8 = 256 := by decide
  have h24 : (2 : Nat) ^ 24 = 16777216 := by decide
  have h32 : (2 : Nat) ^ 32 = 4294967296 := by decide
  rw [h8, h24]
  rw [h32] at hx
  omega

/-- Selection needs picks still due. -/
theorem keep_lt (seed : UInt32) (slots count j picked : ℕ)
    (h : keep seed slots count j picked = true) : picked < count := by
  rw [keep, decide_eq_true_iff] at h
  by_contra hc
  rw [Nat.sub_eq_zero_of_le (by omega : count ≤ picked)] at h
  omega

/-- One below the bound, times a positive multiplier, stays below the
bound times the multiplier. -/
theorem pred_mul_lt (k t : ℕ) (hk : 0 < k) (ht : 0 < t) : (k - 1) * t < t * k := by
  obtain ⟨k', rfl⟩ : ∃ k', k = k' + 1 := ⟨k - 1, by omega⟩
  have e0 : (k' + 1 - 1) * t = k' * t := by rw [show k' + 1 - 1 = k' by omega]
  have e : k' * t + t = t * (k' + 1) := by ring
  omega

/-- With no more slots than picks due, the scan must select. -/
theorem keep_of_le (seed : UInt32) (slots count j picked : ℕ)
    (hp : picked < count) (hS : slots - j ≤ count - picked) :
    keep seed slots count j picked = true := by
  rw [keep, decide_eq_true_iff]
  have ht : 0 < count - picked := by omega
  have hd : draw seed j ≤ 2 ^ 24 - 1 := by have := draw_lt seed j; omega
  have h1 : draw seed j * (slots - j) ≤ (2 ^ 24 - 1) * (count - picked) :=
    Nat.mul_le_mul hd hS
  have h2 := pred_mul_lt (2 ^ 24) (count - picked) (by decide) ht
  omega

/-- The scan has one flag per remaining slot. -/
theorem flagsFrom_length (seed : UInt32) (slots count r j picked : ℕ) :
    (flagsFrom seed slots count r j picked).length = r := by
  induction r generalizing j picked with
  | zero => rfl
  | succ r ih => simp only [flagsFrom, List.length_cons, ih]

/-- The flags of the `r` remaining slots select `min count (picked + r)`. -/
theorem flagsFrom_countTrue (seed : UInt32) (slots count r j picked : ℕ)
    (hj : j + r = slots) (hp : picked ≤ count) :
    countTrue (flagsFrom seed slots count r j picked) + picked
      = min count (picked + r) := by
  induction r generalizing j picked with
  | zero => simp only [flagsFrom, countTrue]; omega
  | succ r ih =>
    have hj' : j + 1 + r = slots := by omega
    cases hk : keep seed slots count j picked
    · have hrest := ih (j + 1) (picked + (keep seed slots count j picked).toNat) hj'
        (by rw [hk, Bool.toNat_false]; omega)
      simp only [flagsFrom, countTrue, hk, Bool.toNat_false, Nat.add_zero] at hrest ⊢
      by_cases hpc : picked < count
      · have hgt : count - picked < slots - j := by
          by_contra hle
          have htrue := keep_of_le seed slots count j picked hpc (by omega)
          rw [htrue] at hk
          simp at hk
        omega
      · omega
    · have hkp := keep_lt seed slots count j picked hk
      have hrest := ih (j + 1) (picked + (keep seed slots count j picked).toNat) hj'
        (by rw [hk, Bool.toNat_true]; omega)
      simp only [flagsFrom, countTrue, hk, Bool.toNat_true] at hrest ⊢
      omega

/-- The flags have one entry per slot. -/
theorem flags_length (seed : UInt32) (slots count : ℕ) :
    (flags seed slots count).length = slots := flagsFrom_length seed slots count slots 0 0

/-- The scan selects exactly `min count slots` slots. -/
theorem flags_countTrue (seed : UInt32) (slots count : ℕ) :
    countTrue (flags seed slots count) = min count slots := by
  have h := flagsFrom_countTrue seed slots count slots 0 0 (by omega) (Nat.zero_le _)
  simp only [Nat.add_zero, Nat.zero_add] at h
  rw [flags]
  exact h

/-- Summing the flags over the slot indices counts the `true`s. -/
theorem sum_range_getD_countTrue (fl : List Bool) :
    ∑ j ∈ Finset.range fl.length, (fl.getD j false).toNat = countTrue fl := by
  induction fl with
  | nil => simp [countTrue]
  | cons b fl ih =>
    have h0 : (b :: fl).getD 0 false = b := rfl
    have hs : ∀ j ∈ Finset.range fl.length,
        ((b :: fl).getD (j + 1) false).toNat = (fl.getD j false).toNat :=
      fun j _ => rfl
    have hlen : (b :: fl).length = fl.length + 1 := rfl
    rw [hlen, Finset.sum_range_succ', h0, Finset.sum_congr rfl hs, ih, countTrue]
    omega

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

/-! ## Mass and support -/

/-- Assembled mass is the sum of the occupation bits. -/
theorem mass16_assemble (b : Fin 4 → Bool) :
    mass16 (assemble b) = ∑ k : Fin 4, (b k).toNat := by
  simp [mass16, bits_assemble]

/-- The mass of a flag-built site is the sum of its slot flags outside the
region, zero inside the region's complement. -/
theorem mass16_stateFromFlags (fl : List Bool) (n x0 y0 side : ℕ) [NeZero n] (p : Site n) :
    mass16 (stateFromFlags fl n x0 y0 side p)
      = ∑ k : Fin 4,
        (if inRegion n x0 y0 side p then (fl.getD (slotOf n x0 y0 side p k) false).toNat
          else 0) := by
  by_cases h : inRegion n x0 y0 side p = true
  · have hrw : ∀ k : Fin 4,
        (if inRegion n x0 y0 side p then (fl.getD (slotOf n x0 y0 side p k) false).toNat
          else 0)
        = (fl.getD (slotOf n x0 y0 side p k) false).toNat :=
      fun k => by rw [ite_eq_left h]
    rw [stateFromFlags, ite_eq_left h, Finset.sum_congr rfl fun k _ => hrw k]
    exact mass16_assemble _
  · have hrw : ∀ k : Fin 4,
        (if inRegion n x0 y0 side p then (fl.getD (slotOf n x0 y0 side p k) false).toNat
          else 0) = 0 :=
      fun k => by rw [ite_eq_right h]
    have hm : mass16 (0 : Fin 16) = 0 := by decide
    rw [stateFromFlags, ite_eq_right h, Finset.sum_congr rfl fun k _ => hrw k, hm,
      Finset.sum_const_zero]

/-- Bounds carried by every region member, in the shape `slotOf` needs. -/
theorem slotOf_lt (n x0 y0 side : ℕ) [NeZero n] {p : Site n}
  (hp : inRegion n x0 y0 side p = true) (k : Fin 4) :
  slotOf n x0 y0 side p k < 4 * side * side := by
  have hb := (decide_eq_true_iff).mp hp
  have hb1 : p.1.val - x0 < side := by omega
  have hb2 : p.2.val - y0 < side := by omega
  have hk := k.isLt
  have e2 : ((p.2.val - y0) + 1) * side ≤ side * side :=
    Nat.mul_le_mul_right side (by omega)
  have e3 : 4 * (((p.2.val - y0) * side + (p.1.val - x0)) + 1)
      = 4 * ((p.2.val - y0) * side + (p.1.val - x0)) + 4 := by ring
  have e4 : 4 * side * side = 4 * (side * side) := by ring
  have e5 : 4 * (((p.2.val - y0) * side + (p.1.val - x0)) + 1)
      ≤ 4 * ((p.2.val - y0 + 1) * side) := by
    have e6 : ((p.2.val - y0) + 1) * side = (p.2.val - y0) * side + side := by ring
    refine Nat.mul_le_mul_left 4 ?_
    omega
  simp only [slotOf]
  omega
/-- `slotOf` is injective on the region: div/mod gives back both sites. -/
theorem slotOf_injOn (n x0 y0 side : ℕ) [NeZero n] (q₁ q₂ : Site n × Fin 4)
  (h₁ : q₁ ∈ (Finset.univ.filter (fun q => inRegion n x0 y0 side q = true)).product
    (Finset.univ : Finset (Fin 4)))
  (h₂ : q₂ ∈ (Finset.univ.filter (fun q => inRegion n x0 y0 side q = true)).product
    (Finset.univ : Finset (Fin 4)))
  (he : slotOf n x0 y0 side q₁.1 q₁.2 = slotOf n x0 y0 side q₂.1 q₂.2) : q₁ = q₂ := by
  have r₁ : x0 ≤ q₁.1.1.val ∧ q₁.1.1.val < x0 + side ∧ y0 ≤ q₁.1.2.val
      ∧ q₁.1.2.val < y0 + side := by
    have hm : inRegion n x0 y0 side q₁.1 = true :=
      (Finset.mem_filter.mp (Finset.mem_product.mp h₁).1).2
    exact (decide_eq_true_iff).mp hm
  have r₂ : x0 ≤ q₂.1.1.val ∧ q₂.1.1.val < x0 + side ∧ y0 ≤ q₂.1.2.val
      ∧ q₂.1.2.val < y0 + side := by
    have hm : inRegion n x0 y0 side q₂.1 = true :=
      (Finset.mem_filter.mp (Finset.mem_product.mp h₂).1).2
    exact (decide_eq_true_iff).mp hm
  have b₁ : q₁.1.1.val - x0 < side := by omega
  have b₂ : q₁.1.2.val - y0 < side := by omega
  have b₃ : q₂.1.1.val - x0 < side := by omega
  have b₄ : q₂.1.2.val - y0 < side := by omega
  have hs0 : 0 < side := by omega
  have hk : q₁.2.val = q₂.2.val
      ∧ (q₁.1.2.val - y0) * side + (q₁.1.1.val - x0)
        = (q₂.1.2.val - y0) * side + (q₂.1.1.val - x0) := by
    have hl₁ := q₁.2.isLt
    have hl₂ := q₂.2.isLt
    simp only [slotOf] at he
    omega
  have hb : q₁.1.1.val - x0 = q₂.1.1.val - x0 := by
    have hmod₁ : ((q₁.1.2.val - y0) * side + (q₁.1.1.val - x0)) % side
        = ((q₂.1.2.val - y0) * side + (q₂.1.1.val - x0)) % side := by rw [hk.2]
    have hmod₂ : ∀ a b : ℕ, (a * side + b) % side = b % side := by
      intro a b; rw [Nat.add_comm, Nat.mul_comm, Nat.add_mul_mod_self_left]
    rw [hmod₂, hmod₂, Nat.mod_eq_of_lt b₁, Nat.mod_eq_of_lt b₃] at hmod₁
    omega
  have ha : (q₁.1.2.val - y0) * side = (q₂.1.2.val - y0) * side := by
    have hsum : (q₁.1.2.val - y0) * side + (q₁.1.1.val - x0)
        = (q₂.1.2.val - y0) * side + (q₂.1.1.val - x0) := hk.2
    omega
  have hca : q₁.1.2.val - y0 = q₂.1.2.val - y0 := Nat.mul_right_cancel hs0 ha
  have hxs : q₁.1.1.val = q₂.1.1.val := by omega
  have hys : q₁.1.2.val = q₂.1.2.val := by omega
  have hps : q₁.1 = q₂.1 :=
    Prod.ext_iff.mpr ⟨ZMod.val_injective n hxs, ZMod.val_injective n hys⟩
  exact Prod.ext_iff.mpr ⟨hps, Fin.eq_of_val_eq hk.1⟩
/-- Every slot comes from some region site and velocity. -/
theorem slotOf_surjOn (n x0 y0 side : ℕ) [NeZero n]
  (hx : x0 + side ≤ n) (hy : y0 + side ≤ n)
  (j : ℕ) (hj : j ∈ Finset.range (4 * side * side)) :
  ∃ q ∈ (Finset.univ.filter (fun q => inRegion n x0 y0 side q = true)).product
    (Finset.univ : Finset (Fin 4)), slotOf n x0 y0 side q.1 q.2 = j := by
  rcases Nat.eq_zero_or_pos side with h0 | hs0
  · rw [Finset.mem_range, h0, Nat.mul_zero] at hj
    exact absurd hj (by omega)
  · have hq : j / 4 < side * side := by
      have hj' := Finset.mem_range.mp hj
      rw [show 4 * side * side = side * side * 4 from by ring] at hj'
      exact (Nat.div_lt_iff_lt_mul (by omega : 0 < 4)).mpr hj'
    have hdiv : j / 4 / side < side := (Nat.div_lt_iff_lt_mul hs0).mpr hq
    have hmod : j / 4 % side < side := Nat.mod_lt _ hs0
    have hpx : x0 + j / 4 % side < n := by omega
    have hpy : y0 + j / 4 / side < n := by omega
    have hx : ((x0 + j / 4 % side : ℕ) : ZMod n).val = x0 + j / 4 % side := by
      simp only [ZMod.val_natCast, Nat.mod_eq_of_lt hpx]
    have hy : ((y0 + j / 4 / side : ℕ) : ZMod n).val = y0 + j / 4 / side := by
      simp only [ZMod.val_natCast, Nat.mod_eq_of_lt hpy]
    refine ⟨((((x0 + j / 4 % side : ℕ) : ZMod n), ((y0 + j / 4 / side : ℕ) : ZMod n)),
        (⟨j % 4, by omega⟩ : Fin 4)), ?_, ?_⟩
    · refine Finset.mem_product.mpr ⟨?_, Finset.mem_univ _⟩
      refine Finset.mem_filter.mpr ⟨Finset.mem_univ _, ?_⟩
      simp only [inRegion, decide_eq_true_eq, ZMod.val_natCast,
        Nat.mod_eq_of_lt hpx, Nat.mod_eq_of_lt hpy]
      exact ⟨Nat.le_add_right x0 (j / 4 % side), Nat.add_lt_add_left hmod x0,
        Nat.le_add_right y0 (j / 4 / side), Nat.add_lt_add_left hdiv y0⟩
    · have hd : j / 4 / side * side + j / 4 % side = j / 4 := by
        rw [Nat.mul_comm]; exact Nat.div_add_mod _ _
      have hd2 : 4 * (j / 4) + j % 4 = j := Nat.div_add_mod j 4
      have hsy : y0 + j / 4 / side - y0 = j / 4 / side := Nat.add_sub_cancel_left _ _
      have hsx : x0 + j / 4 % side - x0 = j / 4 % side := Nat.add_sub_cancel_left _ _
      simp only [slotOf, hx, hy, hsy, hsx]
      rw [hd]
      exact hd2

/-- The region slots, one flag per velocity of every region site, run
exactly over `range (4 · side²)` when the region fits in the lattice. -/
theorem sum_region_flags (fl : List Bool) (n x0 y0 side : ℕ) [NeZero n]
    (hx : x0 + side ≤ n) (hy : y0 + side ≤ n) :
    ∑ p, ∑ k : Fin 4,
      (if inRegion n x0 y0 side p then (fl.getD (slotOf n x0 y0 side p k) false).toNat
        else 0)
    = ∑ j ∈ Finset.range (4 * side * side), (fl.getD j false).toNat := by
  calc ∑ p : Site n, ∑ k : Fin 4,
        (if inRegion n x0 y0 side p then (fl.getD (slotOf n x0 y0 side p k) false).toNat
          else 0)
      = ∑ k : Fin 4, ∑ p : Site n,
          (if inRegion n x0 y0 side p then (fl.getD (slotOf n x0 y0 side p k) false).toNat
            else 0) := Finset.sum_comm
    _ = ∑ k : Fin 4, ∑ p ∈ Finset.univ.filter (fun q => inRegion n x0 y0 side q = true),
          (fl.getD (slotOf n x0 y0 side p k) false).toNat :=
        Finset.sum_congr rfl fun k _ => (Finset.sum_filter _ _).symm
    _ = ∑ p ∈ Finset.univ.filter (fun q => inRegion n x0 y0 side q = true),
            ∑ k : Fin 4, (fl.getD (slotOf n x0 y0 side p k) false).toNat :=
          Finset.sum_comm
    _ = ∑ q ∈ (Finset.univ.filter (fun q => inRegion n x0 y0 side q = true)).product
            (Finset.univ : Finset (Fin 4)),
            (fl.getD (slotOf n x0 y0 side q.1 q.2) false).toNat :=
          (Finset.sum_product (Finset.univ.filter (fun q => inRegion n x0 y0 side q = true))
            (Finset.univ : Finset (Fin 4))
            (fun q => (fl.getD (slotOf n x0 y0 side q.1 q.2) false).toNat)).symm
    _ = ∑ j ∈ Finset.range (4 * side * side), (fl.getD j false).toNat := by
        refine Finset.sum_nbij (fun q => slotOf n x0 y0 side q.1 q.2) ?_ ?_ ?_ ?_
        · intro q hq
          have hm : inRegion n x0 y0 side q.1 = true :=
            (Finset.mem_filter.mp (Finset.mem_product.mp hq).1).2
          exact Finset.mem_range.mpr (slotOf_lt n x0 y0 side hm q.2)
        · intro q₁ h₁ q₂ h₂ heq
          exact slotOf_injOn n x0 y0 side q₁ q₂ (Finset.mem_coe.mpr h₁)
            (Finset.mem_coe.mpr h₂) heq
        · intro j hj
          obtain ⟨q, hq, heq⟩ := slotOf_surjOn n x0 y0 side hx hy j hj
          exact ⟨q, Finset.mem_coe.mp hq, heq⟩
        · intro q hq
          rfl

/-- A state built from `4 · side²` flags holds exactly one particle per
`true` flag, when the region fits in the lattice. -/
theorem stateFromFlags_mass (fl : List Bool) (n x0 y0 side : ℕ) [NeZero n]
    (hx : x0 + side ≤ n) (hy : y0 + side ≤ n)
    (hlen : fl.length = 4 * side * side) :
    ∑ p, mass16 (stateFromFlags fl n x0 y0 side p) = countTrue fl := by
  rw [Finset.sum_congr rfl fun p _ => mass16_stateFromFlags fl n x0 y0 side p,
    sum_region_flags fl n x0 y0 side hx hy, ← hlen, sum_range_getD_countTrue fl]

/-- A state built from flags is empty outside the region. -/
theorem stateFromFlags_outside (fl : List Bool) (n x0 y0 side : ℕ) [NeZero n] (p : Site n)
    (h : inRegion n x0 y0 side p = false) : stateFromFlags fl n x0 y0 side p = 0 := by
  simp only [stateFromFlags]
  rw [ite_eq_right (by simpa using h)]

/-- The subset state vanishes outside its region. -/
theorem subsetState_outside (seed : UInt32) (n x0 y0 side count : ℕ) [NeZero n] (p : Site n)
    (h : inRegion n x0 y0 side p = false) : subsetState seed n x0 y0 side count p = 0 :=
  stateFromFlags_outside _ n x0 y0 side p h

/-- Selection sampling selects exactly the particles asked for: the
subset state holds exactly `min count (4 · side²)` particles — every slot
when the count exceeds the region. -/
theorem subsetState_mass (seed : UInt32) (n x0 y0 side count : ℕ) [NeZero n]
    (hx : x0 + side ≤ n) (hy : y0 + side ≤ n) :
    ∑ p, mass16 (subsetState seed n x0 y0 side count p) = min count (4 * side * side) := by
  have hlen : (flags seed (4 * side * side) count).length = 4 * side * side :=
    flags_length seed (4 * side * side) count
  rw [subsetState, stateFromFlags_mass _ n x0 y0 side hx hy hlen, flags_countTrue]

end TimesArrow.LatticeGas

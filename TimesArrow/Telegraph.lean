import Mathlib.InformationTheory.KullbackLeibler.KLFun
import Mathlib.Data.Int.Interval

/-!
# The intensity recursion of a light-like gas

Particles on the integer line hop one site per step, to the right or to the
left, and reverse direction with probability `a`. An ensemble of independent
particles is described by two intensity profiles `r l : ℤ → ℝ`, the expected
numbers of right-movers and left-movers leaving each site, here as ratios to
a uniform stationary intensity. One step maps them to

`r' x = (1 - a) * r (x - 1) + a * l (x + 1)`,
`l' x = a * r (x - 1) + (1 - a) * l (x + 1)`.

A link carrying intensity ratio `y` is assigned the information
`InformationTheory.klFun y = y * log y + 1 - y`. That a sum of `klFun` over
links is the relative entropy of a Poisson gas to its stationary state is
mathematics outside this file: the statements here are about the recursion.

## Main results

* `klFun_mix_add_le`: mixing two intensities at a vertex cannot increase
  their total information (convexity of `klFun`).
* `info_step_le`: the information on an interval whose two ends retreat by
  one site per step does not increase.
* `info_iterate_step_le`: the same after any number of steps.
-/

namespace TimesArrow.Telegraph

open InformationTheory Finset

/-- One step of the intensity recursion: right-movers arrive from the left
neighbour, left-movers from the right neighbour, and each reverses with
probability `a`. The pair is `(r, l)`. -/
def step (a : ℝ) (p : (ℤ → ℝ) × (ℤ → ℝ)) : (ℤ → ℝ) × (ℤ → ℝ) :=
  (fun x => (1 - a) * p.1 (x - 1) + a * p.2 (x + 1),
   fun x => a * p.1 (x - 1) + (1 - a) * p.2 (x + 1))

/-- The information carried by the links leaving the sites of `[A, B]`. -/
noncomputable def info (p : (ℤ → ℝ) × (ℤ → ℝ)) (A B : ℤ) : ℝ :=
  ∑ x ∈ Icc A B, (klFun (p.1 x) + klFun (p.2 x))

/-- Mixing two non-negative intensities with weights `(1 - a, a)` and
`(a, 1 - a)` does not increase the sum of their `klFun`. -/
theorem klFun_mix_add_le {a x y : ℝ} (ha0 : 0 ≤ a) (ha1 : a ≤ 1) (hx : 0 ≤ x) (hy : 0 ≤ y) :
    klFun ((1 - a) * x + a * y) + klFun (a * x + (1 - a) * y) ≤ klFun x + klFun y := by
  have h1 := convexOn_klFun.2 (Set.mem_Ici.2 hx) (Set.mem_Ici.2 hy) (sub_nonneg.2 ha1) ha0
    (by ring)
  have h2 := convexOn_klFun.2 (Set.mem_Ici.2 hx) (Set.mem_Ici.2 hy) ha0 (sub_nonneg.2 ha1)
    (by ring)
  simp only [smul_eq_mul] at h1 h2
  linarith

/-- A step keeps both intensity profiles non-negative. -/
theorem step_nonneg {a : ℝ} (ha0 : 0 ≤ a) (ha1 : a ≤ 1) {p : (ℤ → ℝ) × (ℤ → ℝ)}
    (hr : ∀ x, 0 ≤ p.1 x) (hl : ∀ x, 0 ≤ p.2 x) :
    (∀ x, 0 ≤ (step a p).1 x) ∧ ∀ x, 0 ≤ (step a p).2 x :=
  ⟨fun _ => add_nonneg (mul_nonneg (sub_nonneg.2 ha1) (hr _)) (mul_nonneg ha0 (hl _)),
   fun _ => add_nonneg (mul_nonneg ha0 (hr _)) (mul_nonneg (sub_nonneg.2 ha1) (hl _))⟩

/-- Any number of steps keeps both intensity profiles non-negative. -/
theorem iterate_step_nonneg {a : ℝ} (ha0 : 0 ≤ a) (ha1 : a ≤ 1) {p : (ℤ → ℝ) × (ℤ → ℝ)}
    (hr : ∀ x, 0 ≤ p.1 x) (hl : ∀ x, 0 ≤ p.2 x) (t : ℕ) :
    (∀ x, 0 ≤ ((step a)^[t] p).1 x) ∧ ∀ x, 0 ≤ ((step a)^[t] p).2 x := by
  induction t with
  | zero => exact ⟨hr, hl⟩
  | succ t ih =>
    rw [Function.iterate_succ_apply']
    exact step_nonneg ha0 ha1 ih.1 ih.2

/-- A sum of a non-negative function over the injective image of one finite
set inside another is at most its sum over the larger set. -/
theorem sum_comp_le_of_injOn {g : ℤ → ℝ} (hg : ∀ x, 0 ≤ g x) {e : ℤ → ℤ} {s t : Finset ℤ}
    (hinj : Set.InjOn e s) (h : ∀ x ∈ s, e x ∈ t) :
    ∑ x ∈ s, g (e x) ≤ ∑ y ∈ t, g y := by
  rw [← Finset.sum_image (f := g) hinj]
  exact Finset.sum_le_sum_of_subset_of_nonneg (Finset.image_subset_iff.2 h) fun y _ _ => hg y

/-- **The interval law.** After one step, the information on `[A + 1, B - 1]`
is at most the information that was on `[A, B]`: an interval whose two ends
retreat by one site per step gains nothing. -/
theorem info_step_le {a : ℝ} (ha0 : 0 ≤ a) (ha1 : a ≤ 1) {p : (ℤ → ℝ) × (ℤ → ℝ)}
    (hr : ∀ x, 0 ≤ p.1 x) (hl : ∀ x, 0 ≤ p.2 x) (A B : ℤ) :
    info (step a p) (A + 1) (B - 1) ≤ info p A B := by
  have hmix : ∀ x ∈ Icc (A + 1) (B - 1),
      klFun ((step a p).1 x) + klFun ((step a p).2 x)
        ≤ klFun (p.1 (x - 1)) + klFun (p.2 (x + 1)) :=
    fun x _ => klFun_mix_add_le ha0 ha1 (hr _) (hl _)
  have hR : ∑ x ∈ Icc (A + 1) (B - 1), klFun (p.1 (x - 1)) ≤ ∑ x ∈ Icc A B, klFun (p.1 x) :=
    sum_comp_le_of_injOn (g := fun x => klFun (p.1 x)) (e := fun x => x - 1)
      (fun x => klFun_nonneg (hr x)) (fun x _ y _ hxy => by simpa using hxy)
      (fun x hx => by rw [Finset.mem_Icc] at hx ⊢; omega)
  have hL : ∑ x ∈ Icc (A + 1) (B - 1), klFun (p.2 (x + 1)) ≤ ∑ x ∈ Icc A B, klFun (p.2 x) :=
    sum_comp_le_of_injOn (g := fun x => klFun (p.2 x)) (e := fun x => x + 1)
      (fun x => klFun_nonneg (hl x)) (fun x _ y _ hxy => by simpa using hxy)
      (fun x hx => by rw [Finset.mem_Icc] at hx ⊢; omega)
  calc info (step a p) (A + 1) (B - 1)
      ≤ ∑ x ∈ Icc (A + 1) (B - 1), (klFun (p.1 (x - 1)) + klFun (p.2 (x + 1))) :=
        Finset.sum_le_sum hmix
    _ = ∑ x ∈ Icc (A + 1) (B - 1), klFun (p.1 (x - 1))
          + ∑ x ∈ Icc (A + 1) (B - 1), klFun (p.2 (x + 1)) := Finset.sum_add_distrib
    _ ≤ ∑ x ∈ Icc A B, klFun (p.1 x) + ∑ x ∈ Icc A B, klFun (p.2 x) := add_le_add hR hL
    _ = info p A B := Finset.sum_add_distrib.symm

/-- **The interval law, iterated.** After `t` steps, the information on
`[A + t, B - t]` is at most the information that was on `[A, B]`. -/
theorem info_iterate_step_le {a : ℝ} (ha0 : 0 ≤ a) (ha1 : a ≤ 1) {p : (ℤ → ℝ) × (ℤ → ℝ)}
    (hr : ∀ x, 0 ≤ p.1 x) (hl : ∀ x, 0 ≤ p.2 x) (A B : ℤ) (t : ℕ) :
    info ((step a)^[t] p) (A + t) (B - t) ≤ info p A B := by
  induction t with
  | zero => simp
  | succ t ih =>
    have hq := iterate_step_nonneg ha0 ha1 hr hl t
    have h := info_step_le ha0 ha1 hq.1 hq.2 (A + t) (B - t)
    have e1 : A + ((t + 1 : ℕ) : ℤ) = A + t + 1 := by push_cast; ring
    have e2 : B - ((t + 1 : ℕ) : ℤ) = B - t - 1 := by push_cast; ring
    rw [Function.iterate_succ_apply', e1, e2]
    exact h.trans ih

end TimesArrow.Telegraph

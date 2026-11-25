import TimesArrow.Telegraph

/-!
# Light-like gas claims

The playground page of issue #14 shows a gas of particles that hop one site
per step and reverse with probability `a`. These claims are about its
intensity recursion `TimesArrow.Telegraph.step`, with
`InformationTheory.klFun` as the information of a link. That the sum of
`klFun` over the links of a region is the relative entropy of the Poisson
gas to its stationary state is mathematics outside these files.
-/

namespace TimesArrow.Telegraph

open InformationTheory

/-- **The dissipation at every vertex is non-negative.** Two non-negative
incoming intensities `x`, `y` leave a vertex as `(1 - a) * x + a * y` and
`a * x + (1 - a) * y`; the outgoing links carry at most the information of
the incoming ones. -/
theorem vertex_dissipation_nonneg (a x y : ℝ) (ha0 : 0 ≤ a) (ha1 : a ≤ 1)
    (hx : 0 ≤ x) (hy : 0 ≤ y) :
    klFun ((1 - a) * x + a * y) + klFun (a * x + (1 - a) * y) ≤ klFun x + klFun y :=
  klFun_mix_add_le ha0 ha1 hx hy

/-- **A region whose ends retreat at light speed never gains information.**
For any non-negative intensity profiles `r`, `l` and any reversal
probability `a`, the information on `[A + t, B - t]` after `t` steps is at
most the information on `[A, B]` at the start. -/
theorem horizon_region_never_gains (a : ℝ) (ha0 : 0 ≤ a) (ha1 : a ≤ 1) (r l : ℤ → ℝ)
    (hr : ∀ x, 0 ≤ r x) (hl : ∀ x, 0 ≤ l x) (A B : ℤ) (t : ℕ) :
    info ((step a)^[t] (r, l)) (A + t) (B - t) ≤ info (r, l) A B :=
  info_iterate_step_le ha0 ha1 hr hl A B t

/-- **A fixed wall can leak.** With no reversals, a right-moving excess at
site `0` on a uniform background: the fixed one-site region `[1, 1]` holds
no information before the step and a positive amount after it. -/
theorem fixed_wall_leak :
    info ((fun x => if x = 0 then 2 else 1, fun _ => 1) : (ℤ → ℝ) × (ℤ → ℝ)) 1 1 = 0 ∧
    0 < info (step 0 ((fun x => if x = 0 then 2 else 1, fun _ => 1) : (ℤ → ℝ) × (ℤ → ℝ))) 1 1 := by
  have h2 : 0 < klFun 2 := by
    refine lt_of_le_of_ne (klFun_nonneg (by norm_num)) fun h => ?_
    have := (klFun_eq_zero_iff (by norm_num : (0 : ℝ) ≤ 2)).1 h.symm
    norm_num at this
  constructor
  · simp [info, klFun_one]
  · simpa [info, step, klFun_one] using h2

end TimesArrow.Telegraph

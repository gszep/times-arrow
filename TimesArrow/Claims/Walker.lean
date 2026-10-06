import TimesArrow.Walker

namespace TimesArrow.Walker

/-- Every normalized walker weight vector preserves the uniform one-walker
distribution on a nonempty torus (the kernel is doubly stochastic). -/
theorem uniform_stationary (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256) :
    TimesArrow.Markov.IsStationary (walkerK n w hw)
      (PMF.uniformOfFintype (Site n)) :=
  walkerK_stationary n w hw

/-- Positive direction weights give unconditional support symmetry for the
one-walker kernel: every allowed hop has its reverse available. -/
theorem support_symmetric (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (hwpos : ∀ d, 0 < w d) (i j : Site n) :
    walkerK n w hw i j = 0 ↔ walkerK n w hw j i = 0 :=
  walkerK_support n w hw hwpos i j

/-- The registered null one-walker kernel is symmetric. -/
theorem null_kernel_symmetric (n : ℕ) [NeZero n] (i j : Site n) :
    walkerK n nullW nullW_sum i j = walkerK n nullW nullW_sum j i :=
  walkerK_symm n nullW nullW_sum (by decide +kernel) i j

/-- The `M`-walker product chain preserves the uniform configuration law for
every normalized weight vector: the registered uniform constructor is
exactly stationary for every arm (M1). -/
theorem product_uniform_stationary (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) :
    TimesArrow.Markov.IsStationary (prodK n M w hw) (uniformConfig n M) :=
  prodK_stationary n M w hw

/-- Support symmetry of the product chain: with positive weights every joint
move has its reverse available (M1). -/
theorem product_support_symmetric (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) (hwpos : ∀ d, 0 < w d) (i j : Fin M → Site n) :
    prodK n M w hw i j = 0 ↔ prodK n M w hw j i = 0 :=
  prodK_support n M w hw hwpos i j

/-- **The reversed arm is the time reversal** (K3): with the uniform start,
the path law of the E↔W-swapped weights is exactly the law of the
time-reversed trajectories of the driven chain. -/
theorem reversed_arm_is_reversal (n : ℕ) [NeZero n] (M T : ℕ) :
    TimesArrow.Markov.reversedPathPMF (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T
      = TimesArrow.Markov.pathPMF (uniformConfig n M)
        (prodK n M reversedW reversedW_sum) T :=
  reversedPathPMF_prodK n M T

/-- **Pathwise σ is the signed E/W hop tally** (M1, K1): on every
positive-probability trajectory of the driven product chain on a torus with
`3 ≤ n`, the path entropy production is the number of east hops minus the
number of west hops, times the drive `ln 3` — one integer per path, the
observable the simulation accumulates. -/
theorem path_sigma_eq_hop_tally (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (M T : ℕ)
    (ω : Fin (T + 1) → Fin M → Site n)
    (hω : TimesArrow.Markov.pathPMF (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T ω ≠ 0) :
    TimesArrow.Markov.pathEntropyProduction (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T ω
      = (netHops n M T ω : ℝ) * Real.log 3 :=
  pathEntropyProduction_eq_netHops n h3 M T ω hω

end TimesArrow.Walker

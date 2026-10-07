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

/-- **The driven model produces entropy linearly** (K1): for the registered
16 walkers on the 8×8 torus, `EP = T · 2 ln 3` — the extensivity theorem of
the library instantiated at the registered model. -/
theorem model_entropy_production (T : ℕ) :
    (TimesArrow.Markov.entropyProduction (uniformConfig 8 16)
        (prodK 8 16 drivenW drivenW_sum) T).toReal
      = (T : ℝ) * 2 * Real.log 3 := by
  have h := TimesArrow.Markov.toReal_entropyProduction_eq_natCast_mul_stepEntropyProduction
    (prodK 8 16 drivenW drivenW_sum) (uniformConfig 8 16)
    (prodK_stationary 8 16 drivenW drivenW_sum)
    (prodK_support 8 16 drivenW drivenW_sum drivenW_pos) T
  rw [stepEntropyProduction_prodK 8 (by decide) 16] at h
  rw [h]
  norm_num
  ring

/-- **The driven model's per-step rate is strictly positive** (K2): the
driven product chain dissipates — `2 ln 3 > 0`. -/
theorem driven_step_entropy_production_pos :
    0 < TimesArrow.Markov.stepEntropyProduction (uniformConfig 8 16)
        (prodK 8 16 drivenW drivenW_sum) := by
  rw [stepEntropyProduction_prodK 8 (by decide) 16,
    show (((16 : ℕ) : ℝ) * (1 / 8) * Real.log 3) = 2 * Real.log 3 from by norm_num]
  exact mul_pos (by norm_num) (Real.log_pos (by norm_num))

/-- **The null model produces no entropy pathwise** (K2): the null product
chain is reversible, so every trajectory is exactly as probable as its time
reversal and `σ ≡ 0` — the undriven state orients nothing. -/
theorem null_sigma_zero (n : ℕ) [NeZero n] (M T : ℕ)
    (ω : Fin (T + 1) → Fin M → Site n) :
    TimesArrow.Markov.pathEntropyProduction (uniformConfig n M)
        (prodK n M nullW nullW_sum) T ω = 0 :=
  null_path_sigma_zero n M T ω

end TimesArrow.Walker

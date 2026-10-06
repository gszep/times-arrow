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

end TimesArrow.Walker

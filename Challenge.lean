import TimesArrow.Philox
import TimesArrow.LatticeGas
import TimesArrow.Selection
import TimesArrow.Walker
import TimesArrow.Markov.Fluctuation

namespace TimesArrow.Walker

theorem uniform_stationary (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256) :
    TimesArrow.Markov.IsStationary (walkerK n w hw)
      (PMF.uniformOfFintype (Site n)) := by
  sorry

theorem support_symmetric (n : ℕ) [NeZero n] (w : Dir → ℕ) (hw : ∑ d, w d = 256)
    (hwpos : ∀ d, 0 < w d) (i j : Site n) :
    walkerK n w hw i j = 0 ↔ walkerK n w hw j i = 0 := by
  sorry

theorem null_kernel_symmetric (n : ℕ) [NeZero n] (i j : Site n) :
    walkerK n nullW nullW_sum i j = walkerK n nullW nullW_sum j i := by
  sorry

theorem product_uniform_stationary (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) :
    TimesArrow.Markov.IsStationary (prodK n M w hw) (uniformConfig n M) := by
  sorry

theorem product_support_symmetric (n : ℕ) [NeZero n] (M : ℕ) (w : Dir → ℕ)
    (hw : ∑ d, w d = 256) (hwpos : ∀ d, 0 < w d) (i j : Fin M → Site n) :
    prodK n M w hw i j = 0 ↔ prodK n M w hw j i = 0 := by
  sorry

theorem reversed_arm_is_reversal (n : ℕ) [NeZero n] (M T : ℕ) :
    TimesArrow.Markov.reversedPathPMF (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T
      = TimesArrow.Markov.pathPMF (uniformConfig n M)
        (prodK n M reversedW reversedW_sum) T := by
  sorry

theorem path_sigma_eq_hop_tally (n : ℕ) [NeZero n] (h3 : 3 ≤ n) (M T : ℕ)
    (ω : Fin (T + 1) → Fin M → Site n)
    (hω : TimesArrow.Markov.pathPMF (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T ω ≠ 0) :
    TimesArrow.Markov.pathEntropyProduction (uniformConfig n M)
        (prodK n M drivenW drivenW_sum) T ω
      = (netHops n M T ω : ℝ) * Real.log 3 := by
  sorry

theorem model_entropy_production (T : ℕ) :
    (TimesArrow.Markov.entropyProduction (uniformConfig 8 16)
        (prodK 8 16 drivenW drivenW_sum) T).toReal
      = (T : ℝ) * 2 * Real.log 3 := by
  sorry

theorem driven_step_entropy_production_pos :
    0 < TimesArrow.Markov.stepEntropyProduction (uniformConfig 8 16)
        (prodK 8 16 drivenW drivenW_sum) := by
  sorry

end TimesArrow.Walker

namespace TimesArrow.Markov

theorem mirror_tilt_identity {α : Type*} [Fintype α]
    (p : PMF α) (κ : α → PMF α) (T : ℕ)
    (hac : ∀ ω, pathPMF p κ T (reversePath ω) = 0 → pathPMF p κ T ω = 0) :
    ∑ ω, (pathPMF p κ T ω).toReal
        * Real.exp (-2 * pathEntropyProduction p κ T ω)
      = ∑ ω, (pathPMF p κ T ω).toReal
        * Real.exp (pathEntropyProduction p κ T ω) := by
  sorry

end TimesArrow.Markov

/-!
The claim statements that Comparator certifies, each proved by `sorry` here
and for real in `TimesArrow/Claims.lean` (and its children). Review these
statements, not the proofs.
-/

namespace TimesArrow.Philox

theorem philox_kat : ∀ v ∈ kat, philox v.1 v.2.1 v.2.2.1 = v.2.2.2 := by
  sorry

end TimesArrow.Philox

namespace TimesArrow.LatticeGas

theorem collide_collide (s : UInt32) : collide (collide s) = s := by
  sorry

theorem collide_flip :
    ∀ s : Fin 16, collide (flip s.val.toUInt32) = flip (collide s.val.toUInt32) := by
  sorry

theorem collide_mass :
    ∀ s : Fin 16, mass (collide s.val.toUInt32) = mass s.val.toUInt32 := by
  sorry

theorem mass_conserved (n : ℕ) [NeZero n] (s : State n) :
    ∑ p, mass16 (stepState n s p) = ∑ p, mass16 (s p) := by
  sorry

theorem subset_mass (seed : UInt32) (n x0 y0 side count : ℕ) [NeZero n]
    (hx : x0 + side ≤ n) (hy : y0 + side ≤ n) :
    ∑ p, mass16 (subsetState seed n x0 y0 side count p) = min count (4 * side * side) := by
  sorry

theorem packed_start (seed : UInt32) (n : ℕ) [NeZero n] (h8 : 8 ∣ n) :
    ∑ p, mass16 (packedState seed n p) = n * n / 8 ∧
    ∀ p : Site n,
      ¬ inRegion n (n / 2 - (n / 4) / 2) (n / 2 - (n / 4) / 2) (n / 4) p →
        packedState seed n p = 0 := by
  sorry

theorem null_start (seed : UInt32) (n : ℕ) [NeZero n] :
    ∑ p, mass16 (nullState seed n p) = n * n / 8 := by
  sorry

theorem lightcone (n : ℕ) [NeZero n] (t : ℕ) (p : Site n) (s₁ s₂ : State n)
    (h : ∀ q ∈ diamond n p t, s₁ q = s₂ q) :
    (stepState n)^[t] s₁ p = (stepState n)^[t] s₂ p := by
  sorry

theorem lightcone_point (n : ℕ) [NeZero n] (t : ℕ) (r p : Site n) (s₁ s₂ : State n)
    (h : ∀ q, q ≠ r → s₁ q = s₂ q) (hp : p ∉ diamond n r t) :
    (stepState n)^[t] s₁ p = (stepState n)^[t] s₂ p := by
  sorry

theorem momentum_conserved (n : ℕ) [NeZero n] (s : State n) :
    (∀ y : ZMod n, ∑ x, px16 (stepState n s (x, y)) = ∑ x, px16 (s (x, y))) ∧
    (∀ x : ZMod n, ∑ y, py16 (stepState n s (x, y)) = ∑ y, py16 (s (x, y))) ∧
    (∑ p, px16 (stepState n s p) = ∑ p, px16 (s p)) ∧
    (∑ p, py16 (stepState n s p) = ∑ p, py16 (s p)) := by
  sorry

theorem column_momentum_refuted :
    ∑ y, px16 (stepState 4 east4 (0, y)) ≠ ∑ y, px16 (east4 (0, y)) := by
  sorry

theorem checkerboard (n : ℕ) [NeZero n] (h2 : 2 ∣ n) (t : ℕ) (c : ZMod 2) (s : State n) :
    labelMass n h2 t c ((stepState n)^[t] s) = labelMass n h2 0 c s := by
  sorry

theorem step_inverse (n : ℕ) [NeZero n] :
    Function.Bijective (stepState n) ∧ ∀ s : State n,
      stepState n (revState n (stepState n (revState n s))) = s ∧
        revState n (stepState n (revState n (stepState n s))) = s := by
  sorry

theorem loschmidt_echo (n : ℕ) [NeZero n] (t : ℕ) (s : State n) :
    revState n ((stepState n)^[t] (revState n ((stepState n)^[t] s))) = s := by
  sorry

end TimesArrow.LatticeGas

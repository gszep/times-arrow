import Mathlib.InformationTheory.KullbackLeibler.DataProcessing
import Mathlib.Probability.Notation

/-!
# The causal second law

Relative entropy restricted to a region of space cannot increase when the
dynamics is causal for the pair of regions, in particular when the later
region lies in the domain of dependence of the earlier one. For a fixed
deterministic dynamics and pair of regions it holds for every pair of
states only if the dynamics is causal for that pair.

Configurations are functions `Site → Cell` from a finite set of sites to a
finite set of cells, with the discrete measurable structure that finite
types carry. A dynamics `f` is *causal* for a pair of regions `(S, R)`
when configurations agreeing on `S` have images agreeing on `R`. Causality
is exactly a factorization of the `R`-restricted dynamics through the
`S`-restriction of the input, and the data processing inequality for the
Kullback–Leibler divergence turns that factorization into the causal
second law:

* `klDiv_le_of_causal`: if `f` is causal for `(S, R)` then for any two
  finite measures, the divergence of the `R`-restricted images under `f`
  is at most the divergence of the `S`-restricted states.
* `klDiv_comp_le_of_causal`: the same for a Markov kernel whose
  `R`-marginal factors through the `S`-restriction of its input.
* `causal_of_klDiv_le`: the converse — the inequality already fails on two
  Dirac measures wherever causality fails, so it holds for every pair of
  states exactly when the dynamics is causal.
* `antitone_klDiv_restrict`: iterating a dynamics that is causal from
  `R t` to `R (t + 1)` makes the divergence of the `R t`-restrictions
  antitone in `t`.

This module imports nothing project-specific and follows Mathlib
conventions, as a candidate for upstream contribution.

## References

* [Cover & Thomas, *Elements of Information Theory*][cover_thomas_2006],
  Chapter 2: the data processing inequality for relative entropy.
-/

open MeasureTheory ProbabilityTheory InformationTheory
open scoped ENNReal

namespace TimesArrow

/-! ## Data processing along a factorization -/

/-- **Data processing along a factorization.** If `f` factors through a
measurable `r` via a measurable `g` (`f x = g (r x)` for every `x`), then
pushing measures through `f` keeps no more relative entropy than pushing
them through `r`: the divergence of the `f`-images is at most that of the
`r`-images. `InformationTheory.klDiv_map_le` is the case `r = id`. -/
theorem klDiv_map_factorization_le {X Y Z : Type*}
    [MeasurableSpace X] [MeasurableSpace Y] [MeasurableSpace Z]
    {μ ν : Measure X} [IsFiniteMeasure μ] [IsFiniteMeasure ν]
    {r : X → Z} {f : X → Y} {g : Z → Y}
    (hr : Measurable r) (hg : Measurable g) (h : ∀ x, f x = g (r x)) :
    klDiv (μ.map f) (ν.map f) ≤ klDiv (μ.map r) (ν.map r) := by
  have hfg : (g ∘ r) = f := funext fun x => (h x).symm
  have hμ : (μ.map r).map g = μ.map f := by
    rw [Measure.map_map hg hr, hfg]
  have hν : (ν.map r).map g = ν.map f := by
    rw [Measure.map_map hg hr, hfg]
  rw [← hμ, ← hν]
  exact klDiv_map_le _ _ hg

/-! ## Causal dynamics on configurations -/

section Configurations

variable {Site Cell : Type*}
  [Fintype Site] [MeasurableSpace Site] [MeasurableSingletonClass Site]
  [Fintype Cell] [MeasurableSpace Cell] [MeasurableSingletonClass Cell]

/-- The restriction of a configuration to the sites in `S`: the values on
`S` alone, as a configuration of the sites of `S`. -/
def restrict (S : Set Site) (s : Site → Cell) : ↥S → Cell :=
  fun x => s x.val

/-- A dynamics is *causal* for a pair of regions `(S, R)` when any two
configurations that agree on `S` have images that agree on `R`: the
values of `f` inside `R` depend only on the values of its input inside
`S`. When `R` lies inside the domain of dependence of `S`, this is the
relativistic light-cone constraint, and `S = R` says no information
enters a fixed region. -/
def Causal (f : (Site → Cell) → (Site → Cell)) (S R : Set Site) : Prop :=
  ∀ s₁ s₂, (∀ x ∈ S, s₁ x = s₂ x) → ∀ x ∈ R, f s₁ x = f s₂ x

omit [Fintype Site] [MeasurableSpace Site] [MeasurableSingletonClass Site]
  [Fintype Cell] [MeasurableSpace Cell] [MeasurableSingletonClass Cell] in
/-- Two configurations have the same `S`-restriction exactly when they
agree on `S`. -/
theorem restrict_eq_iff {S : Set Site} {s₁ s₂ : Site → Cell} :
    restrict S s₁ = restrict S s₂ ↔ ∀ x ∈ S, s₁ x = s₂ x := by
  constructor
  · intro h x hx
    have hx' := congrFun h ⟨x, hx⟩
    simpa only [restrict] using hx'
  · intro h
    funext x
    exact h x.val x.2

omit [Fintype Site] [MeasurableSpace Site] [MeasurableSingletonClass Site]
  [Fintype Cell] [MeasurableSpace Cell] [MeasurableSingletonClass Cell] in
/-- Causality says exactly that the `R`-restricted dynamics factors
through the `S`-restriction of the input. -/
theorem causal_iff_restrict (f : (Site → Cell) → (Site → Cell)) (S R : Set Site) :
    Causal f S R ↔
      ∀ s₁ s₂, restrict S s₁ = restrict S s₂ → restrict R (f s₁) = restrict R (f s₂) := by
  constructor
  · intro h s₁ s₂ hs
    exact (restrict_eq_iff).mpr (h s₁ s₂ ((restrict_eq_iff).mp hs))
  · intro h s₁ s₂ hs x hx
    exact (restrict_eq_iff).mp (h s₁ s₂ ((restrict_eq_iff).mpr hs)) x hx

omit [Fintype Site] [MeasurableSpace Site] [MeasurableSingletonClass Site]
  [Fintype Cell] [MeasurableSpace Cell] [MeasurableSingletonClass Cell] in
/-- Causality of `f` for `(S, R)` gives a factorization: the `R`-restricted
dynamics of any state is a function `g` of the `S`-restriction of that
state. The function `g` extends a partial configuration by a default
cell outside `S`; the choice outside `S` never matters. -/
theorem exists_factorization_of_causal [Inhabited Cell]
    {f : (Site → Cell) → (Site → Cell)} {S R : Set Site}
    (h : Causal f S R) :
    ∃ g : (↥S → Cell) → (↥R → Cell), ∀ s, restrict R (f s) = g (restrict S s) := by
  classical
  refine ⟨fun u x => f (fun y => if hy : y ∈ S then u ⟨y, hy⟩ else default) x.val, fun s => ?_⟩
  have he : ∀ y ∈ S,
      (fun y => if hy : y ∈ S then (restrict S s) ⟨y, hy⟩ else default) y = s y :=
    fun y hy => dite_eq_left hy
  have hc := h _ _ he
  funext x
  simpa only [restrict] using (hc x.val x.2).symm

omit [MeasurableSpace Site] [MeasurableSingletonClass Site] in
/-- **The causal second law, deterministic case.** If the dynamics `f` is
causal for `(S, R)` — the values of `f` inside `R` depend only on the
input values inside `S` — then relative entropy cannot increase between
the `S`-restricted measures and the `R`-restricted evolved ones. When `R`
lies inside the domain of dependence of `S`, this bounds the divergence
seen in `R` by the divergence already present in `S`. -/
theorem klDiv_le_of_causal [Inhabited Cell]
    {f : (Site → Cell) → (Site → Cell)} {S R : Set Site}
    (h : Causal f S R)
    {μ ν : Measure (Site → Cell)} [IsFiniteMeasure μ] [IsFiniteMeasure ν] :
    klDiv ((μ.map f).map (restrict R)) ((ν.map f).map (restrict R))
      ≤ klDiv (μ.map (restrict S)) (ν.map (restrict S)) := by
  obtain ⟨g, hg⟩ := exists_factorization_of_causal h
  have hm : Measurable (restrict (Cell := Cell) R) := by exact Measurable.of_discrete
  have hf : Measurable f := by exact Measurable.of_discrete
  have hms : Measurable (restrict (Cell := Cell) S) := by exact Measurable.of_discrete
  have hmg : Measurable g := by exact Measurable.of_discrete
  have key := klDiv_map_factorization_le (μ := μ) (ν := ν)
    (r := restrict S) (f := fun s => restrict R (f s)) (g := g) hms hmg hg
  have hμ : (μ.map f).map (restrict R) = μ.map (fun s => restrict R (f s)) := by
    rw [Measure.map_map hm hf]
    rfl
  have hν : (ν.map f).map (restrict R) = ν.map (fun s => restrict R (f s)) := by
    rw [Measure.map_map hm hf]
    rfl
  rw [hμ, hν]
  exact key

/-- The divergence between two distinct Dirac measures is infinite. -/
theorem klDiv_dirac_dirac_of_ne {Y : Type*} [MeasurableSpace Y]
    [MeasurableSingletonClass Y] {a b : Y} (h : a ≠ b) :
    klDiv (Measure.dirac a) (Measure.dirac b) = ∞ := by
  refine klDiv_of_not_ac fun hac => ?_
  have hba : b ∉ ({a} : Set Y) := by
    intro hba
    have hba' : b = a := by simpa using hba
    exact h hba'.symm
  have h2 : (Measure.dirac b) ({a} : Set Y) = 0 := by
    rw [Measure.dirac_apply' b (measurableSet_singleton a), Set.indicator_of_notMem hba]
  have h1 := hac h2
  rw [Measure.dirac_apply a {a}] at h1
  simp at h1

omit [MeasurableSpace Site] [MeasurableSingletonClass Site] in
/-- **Converse of the causal second law.** Wherever causality fails there
are two configurations agreeing on `S` whose images differ inside `R`; on
the corresponding Dirac measures the divergence of the `S`-restricted
states is zero while that of the `R`-restricted images is infinite. So the
inequality of `klDiv_le_of_causal` holds for every pair of states exactly
when the dynamics is causal for `(S, R)`. -/
theorem causal_of_klDiv_le
    {f : (Site → Cell) → (Site → Cell)} {S R : Set Site}
    (h : ∀ s₁ s₂ : Site → Cell,
      klDiv (((Measure.dirac s₁).map f).map (restrict R))
          (((Measure.dirac s₂).map f).map (restrict R))
        ≤ klDiv ((Measure.dirac s₁).map (restrict S))
            ((Measure.dirac s₂).map (restrict S))) :
    Causal f S R := by
  by_contra hnc
  simp only [Causal, not_forall, not_forall, exists_prop] at hnc
  obtain ⟨s₁, s₂, hS, x, hxR, hne⟩ := hnc
  have hRne : restrict R (f s₁) ≠ restrict R (f s₂) := by
    intro heq
    have hx' := congrFun heq ⟨x, hxR⟩
    simp only [restrict] at hx'
    exact hne hx'
  have hmr : Measurable (restrict (Cell := Cell) R) := by exact Measurable.of_discrete
  have hms : Measurable (restrict (Cell := Cell) S) := by exact Measurable.of_discrete
  have hmf : Measurable f := by exact Measurable.of_discrete
  have htop : klDiv (((Measure.dirac s₁).map f).map (restrict R))
      (((Measure.dirac s₂).map f).map (restrict R)) = ∞ := by
    rw [Measure.map_dirac' hmf s₁, Measure.map_dirac' hmf s₂,
      Measure.map_dirac' hmr (f s₁), Measure.map_dirac' hmr (f s₂),
      klDiv_dirac_dirac_of_ne hRne]
  have hzero : klDiv ((Measure.dirac s₁).map (restrict S))
      ((Measure.dirac s₂).map (restrict S)) = 0 := by
    rw [Measure.map_dirac' hms s₁, Measure.map_dirac' hms s₂,
      (restrict_eq_iff).mpr hS, klDiv_self]
  have hle := h s₁ s₂
  rw [htop, hzero] at hle
  exact absurd hle (by simp)

omit [MeasurableSpace Site] [MeasurableSingletonClass Site] in
set_option maxHeartbeats 1000000 in
/-- **The causal second law, stochastic case.** Let `κ` be a Markov
kernel whose `R`-marginal depends only on the `S`-restriction of its
input: there is a Markov kernel `κ'` on restricted configurations whose
value at the `S`-restriction of a state is the `R`-marginal of `κ` at
that state. Then the divergence of the `R`-marginals after `κ` is at most
that of the `S`-restricted input measures. -/
theorem klDiv_comp_le_of_causal
    {κ : Kernel (Site → Cell) (Site → Cell)} [IsMarkovKernel κ]
    {S R : Set Site} {κ' : Kernel (↥S → Cell) (↥R → Cell)} [IsMarkovKernel κ']
    (h : ∀ ω, (κ ω).map (restrict R) = κ' (restrict S ω))
    {μ ν : Measure (Site → Cell)} [IsFiniteMeasure μ] [IsFiniteMeasure ν] :
    klDiv ((κ ∘ₘ μ).map (restrict R)) ((κ ∘ₘ ν).map (restrict R))
      ≤ klDiv (μ.map (restrict S)) (ν.map (restrict S)) := by
  have hmr : Measurable (restrict (Cell := Cell) R) := by exact Measurable.of_discrete
  have hms : Measurable (restrict (Cell := Cell) S) := by exact Measurable.of_discrete
  have hker : κ.map (restrict R) = κ'.comap (restrict S) hms := by
    ext ω s hs
    rw [Kernel.map_apply κ hmr ω, h ω, Kernel.comap_apply κ' hms ω]
  have hμ : (κ ∘ₘ μ).map (restrict R) = (κ'.comap (restrict S) hms) ∘ₘ μ := by
    rw [Measure.map_comp μ κ hmr, hker]
  have hν : (κ ∘ₘ ν).map (restrict R) = (κ'.comap (restrict S) hms) ∘ₘ ν := by
    rw [Measure.map_comp ν κ hmr, hker]
  have hcomp : ∀ ρ : Measure (Site → Cell),
      (κ'.comap (restrict S) hms) ∘ₘ ρ = κ' ∘ₘ ρ.map (restrict S) := fun ρ => by
    rw [← Kernel.comp_deterministic_eq_comap κ' hms, ← Measure.comp_assoc,
      Measure.deterministic_comp_eq_map hms]
  rw [hμ, hν, hcomp μ, hcomp ν]
  exact klDiv_comp_right_le (μ.map (restrict S)) (ν.map (restrict S)) κ'

omit [MeasurableSpace Site] [MeasurableSingletonClass Site] in
/-- **The cone corollary.** Iterate a dynamics that is causal from
`R t` to `R (t + 1)` at every step. Then the divergence of the measures
restricted to `R t` is antitone in `t`: as the region follows the domain
of dependence, relative entropy inside it cannot increase. -/
theorem antitone_klDiv_restrict [Inhabited Cell]
    {f : (Site → Cell) → (Site → Cell)} {R : ℕ → Set Site}
    (h : ∀ t, Causal f (R t) (R (t + 1)))
    {μ ν : Measure (Site → Cell)} [IsFiniteMeasure μ] [IsFiniteMeasure ν] :
    Antitone (fun t =>
      klDiv ((μ.map f^[t]).map (restrict (R t))) ((ν.map f^[t]).map (restrict (R t)))) := by
  refine antitone_nat_of_succ_le fun t => ?_
  have hmf : Measurable f := by exact Measurable.of_discrete
  have hiter : ∀ ρ : Measure (Site → Cell), (ρ.map f^[t]).map f = ρ.map f^[t + 1] := by
    intro ρ
    rw [Measure.map_map hmf (hmf.iterate t), Function.iterate_succ']
  have key := klDiv_le_of_causal (h t) (μ := μ.map f^[t]) (ν := ν.map f^[t])
  rw [← hiter μ, ← hiter ν]
  exact key

end Configurations

end TimesArrow

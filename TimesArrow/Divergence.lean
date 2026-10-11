import Mathlib.Algebra.BigOperators.Group.Finset.Basic
import Mathlib.Algebra.BigOperators.Group.Finset.Sigma
import Mathlib.Algebra.BigOperators.Fin
import Mathlib.Algebra.Order.Group.Defs
import Mathlib.Data.ZMod.Basic
import Mathlib.Tactic.Abel
import Mathlib.Tactic.FinCases
import Mathlib.Tactic.Linarith

/-!
# Discrete divergence of an antisymmetric edge flux

A flux on a finite set of sites is a function `J : α → α → β` assigning to
every ordered pair of sites the amount flowing from the first to the
second. It is *antisymmetric* when what flows one way is exactly minus
what flows back, `J x y = -J y x`; its divergence `div J x = ∑ y, J x y`
is the total leaving a site.

* `sum_div_eq_outflux_add_sum_diag`: over any additive group, the
  divergence summed over a region is the flux out of the region across
  the cut, plus the region's self-fluxes (antisymmetry only forces
  `J x x` to be 2-torsion, so the diagonal survives; rings of
  characteristic two are the honest exception).
* `sum_div_eq_outflux`: on a linearly ordered commutative ring (`ℤ`,
  `ℚ`, `ℝ`) the self-fluxes vanish and the divergence theorem holds
  exactly: the net flux out of a region is the sum of the divergences
  inside it, because internal edges cancel pair by pair.
* `sum_div_eq_zero`, `outflux_union`, `outflux_compl`: total divergence is
  zero, boundary fluxes of disjoint regions add, and what leaves a
  region enters its complement.
* `Antisymm.mul`, `sum_div_eq_sum_pair_add_outflux`,
  `Symm.outflux_compl_eq_self`: a symmetric edge weight — in particular
  the product `J * w` of an antisymmetric current with an antisymmetric
  affinity, the bond entropy production — splits over a region into
  interior and boundary edges, the boundary term being the same read
  from either side.

`nnFlux` instantiates everything for nearest-neighbour fluxes on the
periodic lattice `ZMod n × ZMod n`: east and north bond fields determine
an antisymmetric flux (for `3 ≤ n`, when the four axial neighbours of a
site are distinct) whose divergence is the four-term difference the GPU
kernels accumulate. Nothing in this file depends on the rest of the
project; it is a candidate for contribution upstream.
-/

open Finset

namespace TimesArrow.Divergence

variable {α : Type*} [Fintype α] [DecidableEq α] {β : Type*}

/-- An antisymmetric edge flux: what flows from `x` to `y` is exactly
minus what flows back. -/
def Antisymm [Neg β] (J : α → α → β) : Prop := ∀ x y, J x y = -J y x

/-- A symmetric edge weight: it reads the same from either end. -/
def Symm (S : α → α → β) : Prop := ∀ x y, S x y = S y x

/-- The divergence of a flux at a site: the total flux leaving it. -/
def div [AddCommMonoid β] (J : α → α → β) (x : α) : β := ∑ y, J x y

/-- The outflux of a region: the total flux from the region into its
complement, i.e. through the boundary. -/
def outflux [AddCommMonoid β] (J : α → α → β) (V : Finset α) : β :=
  ∑ x ∈ V, ∑ y ∈ Vᶜ, J x y

/-! ## The divergence theorem -/

section Group

variable {β : Type*} [AddCommGroup β] {J : α → α → β}

omit [Fintype α] in
/-- Internal fluxes cancel up to the diagonal: summing an antisymmetric
flux over the ordered pairs of a region counts every internal edge
twice, once in each direction, so only the self-fluxes remain. -/
theorem sum_pair_eq_sum_diag (hJ : Antisymm J) (V : Finset α) :
    ∑ x ∈ V, ∑ y ∈ V, J x y = ∑ x ∈ V, J x x := by
  induction V using Finset.induction_on with
  | empty => simp
  | @insert a s ha ih =>
    have hL : ∑ x ∈ insert a s, ∑ y ∈ insert a s, J x y
        = (J a a + ∑ y ∈ s, J a y) + ∑ x ∈ s, (J x a + ∑ y ∈ s, J x y) := by
      simp_rw [Finset.sum_insert ha]
    have hcross : (∑ y ∈ s, J a y) + (∑ x ∈ s, J x a) = 0 := by
      have h : ∑ y ∈ s, (J a y + J y a) = 0 :=
        Finset.sum_eq_zero fun y _ => add_eq_zero_iff_eq_neg.mpr (hJ a y)
      rw [← Finset.sum_add_distrib]
      exact h
    have hY : ∑ x ∈ s, J x a = -(∑ y ∈ s, J a y) :=
      eq_neg_of_add_eq_zero_right hcross
    rw [hL, Finset.sum_insert ha, Finset.sum_add_distrib, ih, hY]
    abel

/-- **Discrete divergence theorem over any additive group**: the
divergence of an antisymmetric flux summed over a region is the flux out
of the region plus the region's self-fluxes. Over a ring of
characteristic two the self-fluxes need not vanish. -/
theorem sum_div_eq_outflux_add_sum_diag (hJ : Antisymm J) (V : Finset α) :
    ∑ x ∈ V, div J x = outflux J V + ∑ x ∈ V, J x x := by
  have h : ∀ x : α, ∑ y, J x y = (∑ y ∈ Vᶜ, J x y) + ∑ y ∈ V, J x y :=
    fun x => (Finset.sum_compl_add_sum V (J x)).symm
  simp only [div, outflux]
  rw [Finset.sum_congr rfl fun x _ => h x, Finset.sum_add_distrib,
    sum_pair_eq_sum_diag hJ V]

/-- Boundary fluxes of disjoint regions add: what crosses the shared cut
cancels. -/
theorem outflux_union (hJ : Antisymm J) {V W : Finset α} (hVW : Disjoint V W) :
    outflux J (V ∪ W) = outflux J V + outflux J W := by
  have hV := sum_div_eq_outflux_add_sum_diag hJ V
  have hW := sum_div_eq_outflux_add_sum_diag hJ W
  have hU := sum_div_eq_outflux_add_sum_diag hJ (V ∪ W)
  have hsum : ∑ x ∈ V ∪ W, div J x = (∑ x ∈ V, div J x) + ∑ x ∈ W, div J x :=
    Finset.sum_union hVW
  have hdiag : ∑ x ∈ V ∪ W, J x x = (∑ x ∈ V, J x x) + ∑ x ∈ W, J x x :=
    Finset.sum_union hVW
  calc outflux J (V ∪ W)
      = (∑ x ∈ V ∪ W, div J x) - ∑ x ∈ V ∪ W, J x x := by rw [hU]; abel
    _ = ((∑ x ∈ V, div J x) + ∑ x ∈ W, div J x)
        - ((∑ x ∈ V, J x x) + ∑ x ∈ W, J x x) := by rw [hsum, hdiag]
    _ = outflux J V + outflux J W := by rw [hV, hW]; abel

/-- What leaves a region enters its complement. -/
theorem outflux_compl (hJ : Antisymm J) (V : Finset α) :
    outflux J Vᶜ = -outflux J V := by
  simp only [outflux]
  rw [Finset.sum_comm, compl_compl]
  simp only [← Finset.sum_neg_distrib]
  exact Finset.sum_congr rfl fun a _ => Finset.sum_congr rfl fun b _ => hJ b a

end Group

section LinearOrdered

variable {β : Type*} [CommRing β] [LinearOrder β] [IsStrictOrderedRing β] {J : α → α → β}

omit [Fintype α] [DecidableEq α] in
/-- An antisymmetric flux on a linearly ordered commutative ring carries
no self-flux. -/
theorem Antisymm.self_eq_zero (hJ : Antisymm J) (x : α) : J x x = 0 := by
  have h : J x x + J x x = 0 := add_eq_zero_iff_eq_neg.mpr (hJ x x)
  rcases lt_trichotomy (J x x) 0 with h' | h' | h'
  · linarith
  · exact h'
  · linarith

/-- **Discrete divergence theorem.** On a linearly ordered commutative
ring (`ℤ`, `ℚ`, `ℝ`), the net flux out of any region is the sum of the
divergences inside it: internal edges are counted from both ends and
cancel. -/
theorem sum_div_eq_outflux (hJ : Antisymm J) (V : Finset α) :
    ∑ x ∈ V, div J x = outflux J V := by
  rw [sum_div_eq_outflux_add_sum_diag hJ V,
    Finset.sum_eq_zero fun x _ => hJ.self_eq_zero x, add_zero]

/-- An antisymmetric flux rearranges but creates nothing: its total
divergence is zero. -/
theorem sum_div_eq_zero (hJ : Antisymm J) :
    ∑ x, div J x = 0 := by
  have h := sum_div_eq_outflux hJ (Finset.univ : Finset α)
  simpa [outflux] using h

end LinearOrdered

/-! ## Entropy production on bonds -/

section Production

variable {β : Type*} [CommRing β] {J w : α → α → β} {S : α → α → β}

omit [Fintype α] [DecidableEq α] in
/-- The product of an antisymmetric current with an antisymmetric
affinity is a symmetric bond weight: entropy production sits on edges,
with no direction of flow. -/
theorem Antisymm.mul (hJ : Antisymm J) (hw : Antisymm w) : Symm (J * w) :=
  fun x y => by
    show J x y * w x y = J y x * w y x
    rw [hJ x y, hw x y, neg_mul_neg]

/-- Any edge weight splits over a region: the region's total is the
internal edges plus the outflux through the cut. -/
theorem sum_div_eq_sum_pair_add_outflux (F : α → α → β) (V : Finset α) :
    ∑ x ∈ V, div F x = (∑ x ∈ V, ∑ y ∈ V, F x y) + outflux F V := by
  have h : ∀ x : α, ∑ y, F x y = (∑ y ∈ V, F x y) + ∑ y ∈ Vᶜ, F x y := fun x =>
    ((add_comm (∑ y ∈ V, F x y) (∑ y ∈ Vᶜ, F x y)).trans
      (Finset.sum_compl_add_sum V (F x))).symm
  simp only [div, outflux]
  rw [Finset.sum_congr rfl fun x _ => h x, Finset.sum_add_distrib]

/-- The boundary term of a symmetric edge weight reads the same from both
sides: the cut between a region and its complement carries the same
amount whichever side sums it. -/
theorem Symm.outflux_compl_eq_self (hS : Symm S) (V : Finset α) :
    outflux S Vᶜ = outflux S V := by
  simp only [outflux]
  rw [Finset.sum_comm, compl_compl]
  exact Finset.sum_congr rfl fun a _ => Finset.sum_congr rfl fun b _ => hS b a

end Production

/-! ## Nearest-neighbour fluxes on the periodic lattice -/

section Lattice

variable {β : Type*} [AddCommGroup β] (n : ℕ)

/-- The unit displacement of the four axial directions on the torus:
0 east, 1 west, 2 north, 3 south. -/
def nnStep : Fin 4 → ZMod n × ZMod n :=
  fun d =>
    match d.val with
    | 0 => (1, 0)
    | 1 => (-1, 0)
    | 2 => (0, 1)
    | _ => (0, -1)

/-- The direction opposite to `d`: east ↔ west, north ↔ south. -/
def nnOpp : Fin 4 → Fin 4 :=
  fun d =>
    match d.val with
    | 0 => 1
    | 1 => 0
    | 2 => 3
    | _ => 2

/-- Stepping back is stepping in the opposite direction. -/
theorem nnStep_opp (d : Fin 4) : nnStep n (nnOpp d) = -nnStep n d := by
  fin_cases d <;> simp [nnStep, nnOpp]

/-- Reversing twice is the identity. -/
theorem nnOpp_involutive (d : Fin 4) : nnOpp (nnOpp d) = d := by
  fin_cases d <;> simp [nnOpp]

private theorem one_ne_zero' (h3 : 3 ≤ n) : (1 : ZMod n) ≠ 0 := by
  intro h
  rw [← Nat.cast_one (R := ZMod n)] at h
  have h2 := (ZMod.natCast_eq_zero_iff 1 n).mp h
  have := Nat.le_of_dvd (show (0:ℕ) < 1 by norm_num) h2
  omega

private theorem two_ne_zero' (h3 : 3 ≤ n) : (2 : ZMod n) ≠ 0 := by
  intro h
  rw [← Nat.cast_ofNat (n := 2) (R := ZMod n)] at h
  have h2 := (ZMod.natCast_eq_zero_iff 2 n).mp h
  have := Nat.le_of_dvd (show (0:ℕ) < 2 by norm_num) h2
  omega

/-- With `3 ≤ n` the four axial directions are distinct: the lattice has
no degenerate bonds, so the displacement between two sites determines
the direction. -/
theorem nnStep_injective (h3 : 3 ≤ n) : Function.Injective (nnStep n) := by
  have h1 : (1 : ZMod n) ≠ 0 := one_ne_zero' n h3
  have h2 : (1 : ZMod n) + (1 : ZMod n) ≠ 0 := fun h =>
    two_ne_zero' n h3 (by rw [← one_add_one_eq_two]; exact h)
  intro d₁ d₂ h
  fin_cases d₁ <;> fin_cases d₂ <;>
    first
    | rfl
    | exfalso
      have hL := congrArg Prod.fst h
      have hR := congrArg Prod.snd h
      simp only [nnStep] at hL hR
      first
      | exact h1 (by simpa using hL)
      | exact h1 (by simpa using hL.symm)
      | exact h1 (by simpa using hR)
      | exact h1 (by simpa using hR.symm)
      | exact h2 (eq_neg_iff_add_eq_zero.mp hL)
      | exact h2 (eq_neg_iff_add_eq_zero.mp hL.symm)
      | exact h2 (eq_neg_iff_add_eq_zero.mp hR)
      | exact h2 (eq_neg_iff_add_eq_zero.mp hR.symm)

/-- A per-direction flux `φ p d` — the amount leaving site `p` in
direction `d` — turned into an edge flux on the torus: the pair `(p, q)`
carries `φ p d` when `q` is `p`'s neighbour in direction `d`. -/
def nnFluxDir (φ : ZMod n × ZMod n → Fin 4 → β) :
    ZMod n × ZMod n → ZMod n × ZMod n → β :=
  fun p q => ∑ d, if q = p + nnStep n d then φ p d else 0

theorem nnFluxDir_eq_single (φ : ZMod n × ZMod n → Fin 4 → β)
    {p q : ZMod n × ZMod n} (d₀ : Fin 4) (h : q = p + nnStep n d₀)
    (huniq : ∀ d, q = p + nnStep n d → d = d₀) :
    nnFluxDir n φ p q = φ p d₀ :=
  (Finset.sum_eq_single d₀ (fun d _ hd => ite_eq_right fun hq => hd (huniq d hq))
    fun hd => absurd (Finset.mem_univ d₀) hd).trans (ite_eq_left h)

theorem nnFluxDir_eq_zero (φ : ZMod n × ZMod n → Fin 4 → β)
    {p q : ZMod n × ZMod n} (h : ∀ d, q ≠ p + nnStep n d) :
    nnFluxDir n φ p q = 0 :=
  Finset.sum_eq_zero fun d _ => ite_eq_right (h d)

/-- A per-direction flux whose return directions return the opposite
amount is an antisymmetric edge flux, provided the four axial neighbours
of a site are distinct (`3 ≤ n`). -/
theorem nnFluxDir_antisymm (φ : ZMod n × ZMod n → Fin 4 → β)
    (hφ : ∀ p d, φ p d = -φ (p + nnStep n d) (nnOpp d)) (h3 : 3 ≤ n) :
    Antisymm (nnFluxDir n φ) := by
  intro x y
  by_cases hy : ∃ d, y = x + nnStep n d
  · obtain ⟨d₀, hd₀⟩ := hy
    have huniq : ∀ d, y = x + nnStep n d → d = d₀ := fun d h' =>
      nnStep_injective n h3 (by
        have H : x + nnStep n d = x + nnStep n d₀ := h'.symm.trans hd₀
        have hb : nnStep n d - nnStep n d₀ = 0 := by
          rw [show nnStep n d = (x + nnStep n d) - x from by abel,
              show nnStep n d₀ = (x + nnStep n d₀) - x from by abel, H, sub_self]
        exact sub_eq_zero.mp hb)
    have hx : nnFluxDir n φ x y = φ x d₀ :=
      nnFluxDir_eq_single n φ d₀ hd₀ huniq
    have hxy : x = y + nnStep n (nnOpp d₀) := by
      rw [hd₀, nnStep_opp n d₀]
      abel
    have hyx : nnFluxDir n φ y x = φ y (nnOpp d₀) :=
      nnFluxDir_eq_single n φ (nnOpp d₀) hxy fun d h => by
        have hy' : y = x + nnStep n (nnOpp d) := by
          have h1 : y = x - nnStep n d := by rw [h]; abel
          rw [h1, nnStep_opp n d, ← sub_eq_add_neg]
        have h2 : nnOpp d = d₀ := huniq _ hy'
        calc d = nnOpp (nnOpp d) := (nnOpp_involutive d).symm
          _ = nnOpp d₀ := congrArg nnOpp h2
    rw [hx, hyx, hφ x d₀, hd₀]
  · rw [nnFluxDir_eq_zero n φ (fun d h => hy ⟨d, h⟩),
      nnFluxDir_eq_zero n φ fun d h => hy ⟨nnOpp d, by
        have h1 : y = x - nnStep n d := by rw [h]; abel
        rw [h1, nnStep_opp n d, ← sub_eq_add_neg]⟩, neg_zero]

/-- The per-direction flux read off the east and north bond fields:
east and north leave `p`, and the west and south directions return minus
the east and north fluxes of the sites they arrive at. -/
def bondDir (e u : ZMod n × ZMod n → β) : ZMod n × ZMod n → Fin 4 → β :=
  fun p d =>
    match d.val with
    | 0 => e p
    | 1 => -e (p - (1, 0))
    | 2 => u p
    | _ => -u (p - (0, 1))

/-- The nearest-neighbour flux of east and north bond fields `e`, `u` on
the periodic `n × n` torus: `e p` is the flux across the bond from `p`
to `p + (1, 0)` and `u p` across the bond from `p` to `p + (0, 1)`,
positive east/north; each return direction carries the opposite amount. -/
def nnFlux (e u : ZMod n × ZMod n → β) :
    ZMod n × ZMod n → ZMod n × ZMod n → β :=
  nnFluxDir n (bondDir n e u)

/-- The bond fields obey the return-direction rule, so their edge flux is
antisymmetric whenever the lattice has no degenerate bonds. -/
theorem nnFlux_antisymm (e u : ZMod n × ZMod n → β) (h3 : 3 ≤ n) :
    Antisymm (nnFlux n e u) := by
  refine nnFluxDir_antisymm n _ ?_ h3
  intro p d
  fin_cases d
  · show e p = -(-e (p + (1, 0) - (1, 0)))
    rw [neg_neg, show p + (1, 0) - (1, 0) = p from by
      rw [Prod.ext_iff]; constructor <;> simp [sub_eq_add_neg]]
  · show -e (p - (1, 0)) = -(e (p + (-1, 0)))
    rw [show p + (-1, 0) = p - (1, 0) from by
      rw [Prod.ext_iff]; constructor <;> simp [sub_eq_add_neg]]
  · show u p = -(-u (p + (0, 1) - (0, 1)))
    rw [neg_neg, show p + (0, 1) - (0, 1) = p from by
      rw [Prod.ext_iff]; constructor <;> simp [sub_eq_add_neg]]
  · show -u (p - (0, 1)) = -(u (p + (0, -1)))
    rw [show p + (0, -1) = p - (0, 1) from by
      rw [Prod.ext_iff]; constructor <;> simp [sub_eq_add_neg]]

/-- Bond entropy production: a bond-field current times a bond-field
affinity, per ordered pair. -/
def nnProd [Mul β] (e u ε ν : ZMod n × ZMod n → β) :
    ZMod n × ZMod n → ZMod n × ZMod n → β :=
  fun p q => nnFlux n e u p q * nnFlux n ε ν p q

variable [NeZero n]

/-- The divergence of a per-direction flux is its total outflow: summing
the edge flux over all `q` picks out each direction's `φ p d`. -/
theorem div_nnFluxDir (φ : ZMod n × ZMod n → Fin 4 → β) (p : ZMod n × ZMod n) :
    div (nnFluxDir n φ) p = ∑ d, φ p d := by
  simp only [div, nnFluxDir]
  rw [Finset.sum_comm]
  exact Finset.sum_congr rfl fun d _ =>
    (Finset.sum_eq_single (p + nnStep n d)
      (fun q _ hq => ite_eq_right hq)
      fun hd => absurd (Finset.mem_univ _) hd).trans (ite_eq_left rfl)

/-- The divergence of a bond-field flux is the four-term difference the
kernels accumulate: east out minus east in, north out minus north in. -/
theorem div_nnFlux (e u : ZMod n × ZMod n → β) (p : ZMod n × ZMod n) :
    div (nnFlux n e u) p = e p - e (p - (1, 0)) + u p - u (p - (0, 1)) := by
  have h0 : bondDir n e u p 0 = e p := rfl
  have h1 : bondDir n e u p 1 = -e (p - (1, 0)) := rfl
  have h2 : bondDir n e u p 2 = u p := rfl
  have h3 : bondDir n e u p 3 = -u (p - (0, 1)) := rfl
  have h : ∑ d, bondDir n e u p d
      = e p - e (p - (1, 0)) + u p - u (p - (0, 1)) := by
    rw [Fin.sum_univ_four, h0, h1, h2, h3]
    abel
  simp only [nnFlux]
  rw [div_nnFluxDir, h]

end Lattice

end TimesArrow.Divergence

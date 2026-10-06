import Mathlib.Logic.Function.Basic
import Mathlib.Logic.Function.Iterate

/-!
# Reversible dynamics

Two general facts about a map inverted by conjugation with an involution.
Nothing here refers to any particular dynamical system; both are candidates
for contribution upstream.
-/

namespace Function

variable {α : Type*}

/-- If `g` is an involution and conjugating `f` by `g` inverts `f` on one
side, then `g ∘ f ∘ g` is the two-sided inverse of `f`. -/
theorem involutive_conj_inverse (f g : α → α) (hg : Involutive g)
    (h : ∀ s, f (g (f (g s))) = s) :
    Bijective f ∧ ∀ s, g (f (g (f s))) = s := by
  have key : ∀ x, f (g (f x)) = g x := fun x => by simpa only [hg x] using h (g x)
  have right : ∀ s, g (f (g (f s))) = s := fun s => by rw [key s, hg s]
  have li : LeftInverse (fun x => g (f (g x))) f := right
  have ri : RightInverse (fun y => g (f (g y))) f := h
  exact ⟨⟨li.injective, ri.surjective⟩, right⟩

/-- The Loschmidt echo: under the same hypotheses, evolve `t` steps, apply
the conjugator, evolve `t` steps and apply it again: every state returns to
itself. -/
theorem involutive_conj_echo (f g : α → α) (hg : Involutive g)
    (h : ∀ s, f (g (f (g s))) = s) (t : ℕ) (s : α) :
    g (f^[t] (g (f^[t] s))) = s := by
  have key : ∀ x, f (g (f x)) = g x := fun x => by simpa only [hg x] using h (g x)
  have iter : ∀ (t : ℕ) (x : α), f^[t] (g (f^[t] x)) = g x := by
    intro t
    induction t with
    | zero => exact fun _ => rfl
    | succ t ih =>
      intro x
      have inner : f^[t + 1] x = f (f^[t] x) := Function.iterate_succ_apply' f t x
      have outer : f^[t + 1] (g (f^[t + 1] x)) = f^[t] (f (g (f^[t + 1] x))) :=
        Function.iterate_succ_apply f t _
      rw [outer, inner, key (f^[t] x)]
      exact ih x
  rw [iter t s]
  exact hg s

end Function

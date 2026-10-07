import TimesArrow.WalkerProfile

namespace TimesArrow.Walker

/-- **The walker light cone (003, C1).** From any start, a walker's circle
displacement from where it began is at most `t` after `t` steps: the
synchronous-hop lattice speed, for every weights schedule and every draw
stream. The deterministic profile start is the instance
`start = profileStart n`; the uniform constructor of 002 is another. -/
theorem walker_lightcone (n : ℕ) [NeZero n] (start : ℕ → Site n)
    (ws : ℕ → Dir → ℕ) (seed : UInt32) (m t : ℕ) :
    zmodDist n (trajFrom n start ws seed t m).1 (start m).1 ≤ t :=
  trajFrom_lightcone n start ws seed m t

end TimesArrow.Walker

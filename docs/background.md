# Background and literature map

This is a living document. Entries marked *(verify)* have not been checked
against the source yet. Check each one before relying on it.

## Two notions of time

| | Relativity | Non-equilibrium thermodynamics |
|---|---|---|
| What time is | Proper time along a worldline, `dτ² = dt² − dx² − dy²` | The direction of entropy production |
| Built-in structure | Light cones: which events can influence which | None microscopically. The arrow is statistical, plus a low-entropy past |
| Time reversal | Equations are T-symmetric. The spacetime is time-orientable, but the orientation is extra data | Microdynamics are T-symmetric. Typical paths are not |
| Perspective | Reference frame | System/environment partition (coarse-graining) |
| Transformations | Lorentz group | No general theory (this is open question Q5) |
| Invariants | Interval, proper time, rest mass | Total fine-grained entropy under bijective or unitary dynamics |

The core framing: relativity gives the cone, thermodynamics picks the half.

## Thermodynamic arrow

- Jarzynski equality, `⟨e^{−βW}⟩ = e^{−βΔF}`. Jarzynski, PRL 78, 2690 (1997).
- Crooks fluctuation theorem, `P_F(W)/P_R(−W) = e^{β(W−ΔF)}`. Crooks, PRE 60, 2721 (1999).
- Mean dissipation as a relative entropy between forward and reversed path
  measures. Kawai, Parrondo & Van den Broeck, PRL 98, 080602 (2007).
- Entropy production as system–reservoir correlation,
  `Σ = I(S:E) + D(ρ_E' ‖ ρ_E^eq)`. Esposito, Lindenberg & Van den Broeck,
  New J. Phys. 12, 013013 (2010).
- Thermodynamic uncertainty relation. Barato & Seifert, PRL 114, 158101 (2015).
- Classical speed limits from entropy production. Shiraishi, Funo & Saito,
  PRL 121, 070601 (2018).
- Memory and the psychological arrow. Mlodinow & Brun, PRE 89, 052102 (2014).
  Landauer (1961) and Bennett (1982) on the thermodynamics of records.
- Decoherence and redundant records (quantum Darwinism). Zurek, Nat. Phys. 5, 181 (2009).
- Reversible lattice gases and cellular automata. Hardy, Pomeau & de Pazzis,
  J. Math. Phys. 14, 1746 (1973). Toffoli & Margolus, *Cellular Automata
  Machines* (MIT Press, 1987).

## Relativistic thermodynamics and horizons

- Tolman–Ehrenfest: `T √(−g_00)` is constant in equilibrium. Tolman, Phys. Rev. 35, 904 (1930).
  Tolman & Ehrenfest, Phys. Rev. 36, 1791 (1930).
- Covariant inverse temperature `β^μ = u^μ / T`. Global equilibrium requires
  `β^μ` to be a Killing vector (van Kampen, Israel). *(verify: primary refs)*
- Temperature transformation debate: Planck/Einstein (`T' = T/γ`) versus Ott
  (`T' = γT`), Ott, Z. Phys. 175, 70 (1963). Many argue there is no unique
  answer without a choice of rest frame.
- Instability and acausality of first-order relativistic dissipation.
  Hiscock & Lindblom, PRD 31, 725 (1985).
- Link between the second law and causality. Gavassino, "Can we make sense of
  dissipation without causality?", PRX 12, 041001 (2022). *(verify)*
- Relativistic Brownian motion review. Dunkel & Hänggi, Phys. Rep. 471, 1 (2009).
- Stochastic thermodynamics of relativistic Brownian motion. Pal & Deffner,
  New J. Phys. 22, 073054 (2020). *(verify)*
- Unruh effect, `T = a / 2π`. Unruh, PRD 14, 870 (1976).
- Bisognano–Wichmann: the modular flow of the vacuum on a Rindler wedge is
  the boost. J. Math. Phys. 16, 985 (1975) and 17, 303 (1976).
- Lattice entanglement Hamiltonians from correlation matrices. Peschel,
  J. Phys. A 36, L205 (2003).
- KMS condition: thermal states are periodic in imaginary time with period `β`.
- Einstein equation as an equation of state (`δQ = T dS` on local Rindler
  horizons). Jacobson, PRL 75, 1260 (1995). Verlinde, JHEP 04 (2011) 029.

## Emergent time and emergent causality

- Thermal time hypothesis: physical time is the modular flow of the
  statistical state. Connes & Rovelli, Class. Quantum Grav. 11, 2899 (1994).
- Page–Wootters: time as correlation with a clock subsystem. PRD 27, 2885 (1983).
  Experimental illustration: Moreva et al., PRA 89, 052122 (2014).
- Lieb–Robinson bounds: emergent light cones from local interactions. Commun.
  Math. Phys. 28, 251 (1972).
- Causal sets: Bombelli, Lee, Meyer & Sorkin, PRL 59, 521 (1987). Classical
  sequential growth: Rideout & Sorkin, PRD 61, 024002 (2000).
- Is time's arrow perspectival? Rovelli, arXiv:1505.01125 (2015).

## Frames and partitions

- Virtual quantum subsystems: tensor-product structure is induced by the
  accessible observables. Zanardi, PRL 87, 077901 (2001).
- Quantum mereology. Carroll & Singh, PRA 103, 022213 (2021).
- Quantum reference frames. Giacomini, Castro-Ruiz & Brukner, Nat. Commun.
  10, 494 (2019). Perspective-neutral framework: Vanrietvelde, Höhn, Giacomini &
  Castro-Ruiz, Quantum 4, 225 (2020).

## Clocks

- The thermodynamic cost of timekeeping bounds clock accuracy. Erker et al.,
  PRX 7, 031022 (2017). Experiment: Pearson et al., PRX 11, 021029 (2021).
- Quantum clocks and time dilation. Smith & Ahmadi, Nat. Commun. 11, 5360 (2020).
  Castro-Ruiz, Giacomini & Brukner, PNAS 114, E2303 (2017).

## Tooling references

- LeanArchitect: Lean-native blueprint metadata. Zhu, Monticone, Welleck &
  Avigad, ITP 2026. <https://github.com/hanwenzhu/LeanArchitect>
- leanblueprint (Massot). <https://github.com/PatrickMassot/leanblueprint>
- Cedar: verification-guided development, with an executable Lean model
  differentially tested against production code.
- PhysLean (formerly HepLean): Lorentz group and physics formalizations in Lean 4.

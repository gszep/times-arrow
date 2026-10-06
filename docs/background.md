# Background and literature map

This is a living document. Citations are checked against Crossref or arXiv.

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

## Reversible lattice gases and coarse-graining (001)

- HPP. Hardy, Pomeau & de Pazzis, PRL **31**, 276 (1973); J. Math. Phys. **14**,
  1746 (1973); Hardy, de Pazzis & Pomeau, PRA **13**, 1949 (1976). Square
  lattice, four velocities, head-on pairs rotate 90°, collide-then-stream,
  periodic. Conserved: particle number (≡ energy, all speeds equal), both
  momentum components, per-row x-momentum and per-column y-momentum. Two-line
  argument: collide preserves `n_E − n_W` and `n_N − n_S` at every site (the
  only moved states, `0101 ↔ 1010`, have both zero), and streaming carries
  E/W movers along their row while N/S movers cross rows carrying
  `n_E − n_W = 0` (mirror for columns), so `Σ_x (n_E − n_W)` per row and
  `Σ_y (n_N − n_S)` per column are invariant (Lean proof pending).
  Momentum therefore never diffuses between rows (or columns), which kills
  shear transport independently of the tensor anisotropy below.
- Spurious invariant: the **checkerboard parity**. A particle's site parity
  flips every step, so `(x+y+t) mod 2` labels each particle for all time; the
  even and odd populations never collide with one another. This is the HPP
  checkerboard invariant. Wolf-Gladrow, *Lattice-Gas Cellular Automata and
  Lattice Boltzmann Models*, LNM 1725 (Springer, 2000), §3.1.1; Chopard & Droz,
  *Cellular Automata Modeling of Physical Systems* (CUP, 1998), §2.5.
- Anisotropy: the fourth-rank lattice tensor `Σ_i c_i^α c_i^β c_i^γ c_i^δ` is
  not isotropic on the square lattice, so the viscosity is a tensor and HPP
  does not recover Navier–Stokes. Frisch, Hasslacher & Pomeau, PRL **56**, 1505
  (1986) replaced it with a hexagonal (six-velocity) lattice whose lattice
  tensors are isotropic; this is why FHP works.
- Transport. Hardy, de Pazzis & Pomeau (1976) derive a Green–Kubo transport
  coefficient and measure its correlation function: after a short exponential
  decay it falls as `t^{−S}` (a long-time tail), compared with theory.
- Invariant of reversible CA. Pomeau, J. Phys. A **17**, L415 (1984): a class
  of reversible cellular automata has an exact time invariant, "a kind of
  energy".
- Reversibility. Fredkin & Toffoli, Int. J. Theor. Phys. **21**, 219 (1982);
  Margolus, Physica D **10**, 81 (1984); Toffoli & Margolus, *Cellular Automata
  Machines* (MIT Press, 1987). The HPP step is a bijection (collision is an
  involution, streaming a permutation). The bare velocity flip `R` conjugates
  the collide-then-stream step `E = S∘C` to `R E R = S^{−1} C = (C S)^{−1}`,
  which equals `E^{−1}` only up to the collision/streaming order; the exact
  reversal is `R` combined with a half-step shift (equivalently apply
  `E^{−1} = C∘S^{−1}`). Chopard & Droz §2.5 assert the plain flip retraces.
- Causal cone. Every particle moves at most one axial cell per step, so HPP's
  light cone is the diamond `|x|+|y| ≤ t`, not a Euclidean disc.
- Damage spreading. Bagnoli, Rechtman & Ruffo, Phys. Lett. A **172**, 34
  (1992). Loschmidt echo in a hydrodynamic experiment. Jeanneret & Bartolo,
  Nat. Commun. **5**, 4474 (2014).

## Observational (coarse-grained) entropy

- Entropy is defined relative to a coarse-graining, a set of macrostates with
  volumes; it lies below the fine-grained entropy and the second law is its
  increase. Šafránek, Deutsch & Aguirre, PRA **99**, 010101(R) (2019);
  thermalization in closed systems, PRA **99**, 012103 (2019); classical
  version, Šafránek, Aguirre & Deutsch, PRE **102**, 032106 (2020);
  introduction, Found. Phys. **51**, 101 (2021); generic increase, Nagasawa,
  Kato, Wakakuwa & Buscemi, Phys. Rev. Research **6**, 043327 (2024).
- Deutsch, "Quantum statistical mechanics in a closed system", PRA **43**, 2046
  (1991): coarse-grained entropy from a density matrix.

## Relativistic thermodynamics and horizons

- Tolman–Ehrenfest: `T √(−g_00)` is constant in equilibrium. Tolman, Phys. Rev. 35, 904 (1930).
  Tolman & Ehrenfest, Phys. Rev. 36, 1791 (1930).
- Covariant inverse temperature `β^μ = u^μ / T`. Global equilibrium requires
  `β^μ` to be a Killing vector. Israel & Stewart, Ann. Phys. **118**, 341
  (1979); Becattini, PRL **108**, 244502 (2012).
- Temperature transformation debate: Planck/Einstein (`T' = T/γ`) versus Ott
  (`T' = γT`), Ott, Z. Phys. 175, 70 (1963). Many argue there is no unique
  answer without a choice of rest frame.
- Instability and acausality of first-order relativistic dissipation.
  Hiscock & Lindblom, PRD 31, 725 (1985).
- Link between the second law and causality. Gavassino, "Can we make sense of
  dissipation without causality?", PRX 12, 041001 (2022).
- Relativistic Brownian motion review. Dunkel & Hänggi, Phys. Rep. 471, 1 (2009).
- Stochastic thermodynamics of relativistic Brownian motion. Pal & Deffner,
  New J. Phys. 22, 073054 (2020).
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
- physlib (formerly PhysLean/HepLean), `leanprover-community/physlib`: the
  Lorentz group, special relativity, statistical mechanics and
  thermodynamics. It has an AI contribution policy (`AI-POLICY.md`).
- Mathlib: KL divergence (`InformationTheory/KullbackLeibler`, with Gibbs'
  inequality and a chain rule), `Kernel.Invariant` and `Kernel.IsReversible`
  (detailed balance between sets, with `IsReversible.invariant`), and
  `Matrix.rowStochastic` (over ordered rings only, so not directly over
  ℝ≥0∞). As far as we found, it has no finite-state Markov chain library,
  no PMF-level KL computation and no fluctuation theorems;
  `TimesArrow/Markov/` starts one.
- Comparator (Lean FRO): a sandboxed judge that re-checks proofs against a
  permitted-axiom list.
- Hesper (`Verilean/hesper`): a Lean DSL that generates WGSL and CUDA
  kernels. Alpha.

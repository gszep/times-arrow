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
- Trajectory entropy production `σ = Δs_sys + Q/T` and the integral fluctuation
  theorem `⟨e^{−σ}⟩ = 1`. Seifert, PRL 95, 040602 (2005).
- Entropy production as system–reservoir correlation,
  `Σ = I(S:E) + D(ρ_E' ‖ ρ_E^eq)`. Esposito, Lindenberg & Van den Broeck,
  New J. Phys. 12, 013013 (2010).
- Thermodynamic uncertainty relation. Barato & Seifert, PRL 114, 158101 (2015).
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
- Information-theoretic bounds on observational entropy via strengthened
  relative-entropy monotonicity; Petz recovery; the "coarse-grained state" from
  retrodiction. Buscemi, Schindler & Šafránek, New J. Phys. **25**, 053002 (2023).

## Coarse-graining as a channel (Q5)

- Lumped Markov chains: the coarse-grained thermodynamics is exact only when
  intra-macrostate states equilibrate; otherwise hidden terms enter the entropy
  balance. Esposito, PRE **85**, 041125 (2012).
- Partial entropy production over a subset of transitions satisfies its own
  integral fluctuation theorem (the origin of hidden entropy production).
  Shiraishi & Sagawa, PRE **91**, 012130 (2015).
- A marginal observer still gets an effective thermodynamics with a fluctuation
  relation and second law, built on a hidden time reversal. Polettini & Esposito,
  PRL **119**, 240601 (2017).
- Observable entropy production is a lower bound on the total; the gap (hidden
  EP) and the observable part each satisfy an IFT. Bisker, Polettini, Gingrich &
  Horowitz, J. Stat. Mech. (2017) 093210.
- Equality in relative-entropy monotonicity holds exactly for sufficient
  statistics/subalgebras: the coarse-grainings that lose no information.
  Petz, Commun. Math. Phys. **105**, 123 (1986).
- Entropy inequalities over the lattice of set partitions (Han's inequality, the
  submodularity side of the refinement order). Han, Inf. Control **36**, 133 (1978).
- A one-parameter coarse-graining semigroup with a monotone already exists in
  physics: the renormalization group, along which relative entropy decreases.
  Apenko, Physica A **391**, 62 (2012).

## Relativistic thermodynamics and horizons

- Tolman–Ehrenfest: `T √(−g_00)` is constant in equilibrium. Tolman, Phys. Rev. 35, 904 (1930).
  Tolman & Ehrenfest, Phys. Rev. 36, 1791 (1930).
- Covariant inverse temperature `β^μ = u^μ / T`; the equilibrium phase-space
  density is `∝ exp(β_μ p^μ)` in signature `(−,+,+)`. Global equilibrium requires
  `β^μ` to be a Killing vector. Israel & Stewart, Ann. Phys. **118**, 341
  (1979); Becattini, PRL **108**, 244502 (2012).
- Temperature transformation debate: Planck/Einstein (`T' = T/γ`) versus Ott
  (`T' = γT`), Ott, Z. Phys. 175, 70 (1963). Many argue there is no unique
  answer without a choice of rest frame.
- Instability and acausality of first-order relativistic dissipation.
  Hiscock & Lindblom, PRD 31, 725 (1985).
- Link between the second law and causality. Gavassino, "Can we make sense of
  dissipation without causality?", PRX 12, 041001 (2022).
- Unruh effect, `T = a / 2π`. Unruh, PRD 14, 870 (1976).
- Bisognano–Wichmann: the modular flow of the vacuum on a Rindler wedge is
  the boost. J. Math. Phys. 16, 985 (1975) and 17, 303 (1976).
- Lattice entanglement Hamiltonians from correlation matrices. Peschel,
  J. Phys. A 36, L205 (2003).
- KMS condition: thermal states are periodic in imaginary time with period `β`.
- Einstein equation as an equation of state (`δQ = T dS` on local Rindler
  horizons). Jacobson, PRL 75, 1260 (1995). Verlinde, JHEP 04 (2011) 029.

## Relativistic stochastic dynamics and trajectory entropy (004)

- Covariant relativistic Brownian motion. Hakim, J. Math. Phys. **6**, 1482
  (1965).
- Relativistic Ornstein–Uhlenbeck (ROU) process: a covariant relativistic
  Langevin process with a relativistic fluctuation–dissipation theorem; the
  Jüttner equilibrium is confirmed by simulation. Debbasch, Mallick & Rivet,
  J. Stat. Phys. **88**, 945 (1997).
- The ROU process in an arbitrary inertial frame: it has a preferred frame —
  the fluid rest frame, "mandatory", no contradiction of relativity — while
  the formalism stays "perfectly covariant, although not manifestly
  covariant", and its distribution function is a Lorentz scalar.
  Barbachoux, Debbasch & Rivet, EPJ B **19**, 37 (2001). Covariant Kolmogorov
  equation and entropy current, so the mean entropy production is the
  divergence of a covariant current (a scalar): EPJ B **23**, 487 (2001).
- Discretization dilemma of the relativistic Langevin equation: of the
  Ito/Stratonovich/Hänggi–Klimontovich interpretations only HK has the Jüttner
  distribution stationary. Dunkel & Hänggi, PRE **71**, 016124 (2005) and
  PRE **72**, 036106 (2005); review, incl. Lorentz transformations of SDEs,
  Phys. Rep. **471**, 1 (2009).
- Reparametrizing from coordinate time to proper time multiplies the
  stationary density by 1/energy. Dunkel, Hänggi & Weber, PRE **79**, 010101
  (2009). Stationary distributions and entropy depend on the time
  parameterization. Cubero & Dunkel, EPL **87**, 30005 (2009).
- A dilute relativistic gas equilibrates to Jüttner, measured simultaneously
  in its rest frame. Cubero, Casado-Pascual, Dunkel, Talkner & Hänggi, PRL
  **99**, 170601 (2007). Finite-propagation-velocity (Poisson–Kac) noise is
  also consistent with Jüttner. Giona, EPL **126**, 50001 (2019).
- Lorentz-invariance of the distribution in phase space. Van Kampen, Physica
  **43**, 244 (1969).
- Relativistic fluctuation theorems: heat is the exchanged four-momentum
  projected on the bath's local time axis, and the theorems pick the physical
  discretization. Fingerle, C. R. Physique **8**, 696 (2007). Stochastic heat
  and work for the relativistic Langevin equation, with a simultaneity caveat
  for feedback: Pal & Deffner, New J. Phys. **22**, 073054 (2020). Heat
  statistics of the ROU particle: Paraguassú & Morgado, EPJ B **94**, 197
  (2021).
- Covariant stochastic thermodynamics and fluctuation theorems in curved
  spacetime, with time reversal defined as the map to the past-directed
  observer. Wang, Cai, Cui & Zhao, SciPost Phys. Core **7**, 082 (2024);
  Cai, Wang & Zhao, PRE **111**, 024102 (2025) and Phys. Lett. B **860**,
  139220 (2025).
- Two-point-measurement entropy production in stationary spacetimes is tied
  to the observer's proper time and differs between observers in relative
  motion — the irreversibility of time dilation. Basso, Maziero & Céleri,
  Class. Quantum Grav. **40**, 195001 (2023); quantum detailed fluctuation
  theorem in curved spacetime, with observer-dependent entropy production,
  Basso, Maziero & Céleri, PRL **134**, 050406 (2025).
- Open (004's opening): the per-path flat-spacetime claim `σ[Λγ] = σ[γ]` —
  entropy production as a Lorentz scalar along a worldline, with `β^μ` a
  four-vector and the reversal fixed by the bath — is stated nowhere we found.

## Emergent time and emergent causality

- Thermal time hypothesis: physical time is the modular flow of the
  statistical state. Connes & Rovelli, Class. Quantum Grav. 11, 2899 (1994).
- Page–Wootters: time as correlation with a clock subsystem. PRD 27, 2885 (1983).
  Experimental illustration: Moreva et al., PRA 89, 052122 (2014).
- Causal sets: Bombelli, Lee, Meyer & Sorkin, PRL 59, 521 (1987). Classical
  sequential growth: Rideout & Sorkin, PRD 61, 024002 (2000).
- Is time's arrow perspectival? Rovelli, arXiv:1505.01125 (2015).

## Cones and speed limits (Q3, 003)

- Quantum cones from locality (exponential tails): Lieb & Robinson, Commun.
  Math. Phys. 28, 251 (1972), DOI 10.1007/bf01645779. Review: Nachtergaele &
  Sims, Contemp. Math. 529, 141 (2010), DOI 10.1090/conm/529/10429.
  Locality limits correlation growth: Bravyi, Hastings & Verstraete, PRL 97,
  050401 (2006). Survey of LR-type speed limits: Chen, Lucas & Yin,
  Rep. Prog. Phys. 86, 116001 (2023), arXiv:2303.07386.
- Classical cone bounds: Marchioro, Pellegrinotti, Pulvirenti & Triolo,
  J. Stat. Phys. 19, 499 (1978), DOI 10.1007/bf01011695; anharmonic lattices
  with explicit velocity, Raz & Sims, J. Stat. Phys. 137, 79 (2009),
  DOI 10.1007/s10955-009-9839-5; Nachtergaele, Raz, Schlein & Sims,
  Commun. Math. Phys. 286, 1073 (2009), DOI 10.1007/s00220-008-0630-2;
  long-range causal regions, Métivier, Bachelard & Kastner, PRL 112, 210601
  (2014); equilibration timescales, Nickelsen & Kastner, PRL 122, 180602
  (2019); butterfly cone in a classical spin chain, Das et al., PRL 121,
  024101 (2018).
- Open/dissipative locality: Poulin, PRL 104, 190401 (2010); Barthel &
  Kliesch, PRL 108, 230504 (2012); Sweke, Eisert & Kastner, J. Phys. A 52,
  424003 (2019). Diffusivity bounded by the Lieb–Robinson velocity and the
  decoherence time: Han & Hartnoll, PRL 121, 170601 (2018), arXiv:1806.01859
  — of which 001's `D ≈ λ/2` (λ the collision time) is the classical
  kinetic instance.
- Thermodynamic speed limits: Shiraishi, Funo & Saito, PRL 121, 070601
  (2018); unified with the TUR, Vo, Van Vu & Hasegawa, PRE 102, 062132
  (2020); always-saturated topological form, Van Vu & Saito, PRL 130, 010402
  (2023); discrete Wasserstein distance lower-bounds entropy production,
  Van Vu & Saito, PRX 13, 011013 (2023); Langevin, Sabbagh, Movilla
  Miangolarra & Georgiou, PRR 6, 033308 (2024); general activities,
  Nagayama, Yoshimura & Ito, PRR 7, 013307 (2025).
- **Conjecture (literature absence):** no published bound combining a causal
  cone with entropy production was found in the 2026-10-07 exploration.
  This is not an established novelty claim. Candidate composition for 003,
  issue #9 (a concatenation of two inequalities, not an empirical conjecture):
  `W₁(p₀, p_t) ≤ min(v t, ∫√(σ a) dt)` with σ the entropy-production rate
  and a the edge-length-squared-weighted dynamical activity.

## Frames and partitions

- Virtual quantum subsystems: tensor-product structure is induced by the
  accessible observables. Zanardi, PRL 87, 077901 (2001).
- Quantum mereology. Carroll & Singh, PRA 103, 022213 (2021).
- Quantum reference frames. Giacomini, Castro-Ruiz & Brukner, Nat. Commun.
  10, 494 (2019). Perspective-neutral framework: Vanrietvelde, Höhn, Giacomini &
  Castro-Ruiz, Quantum 4, 225 (2020).
- Quantum reference-frame changes as symmetries, with relational observables and
  a relational trace. Krumm, Höhn & Müller, Quantum **5**, 530 (2021).
- Relative subsystems: frame transformations are reversible only relative to the
  chosen subsystem, not for the whole universe. Castro-Ruiz & Oreshkov,
  arXiv:2110.13199.

## Entanglement Hamiltonians and modular flow (Q6, 007)

- Modular flow is geometric for wedges in any Poincaré-covariant QFT
  (Bisognano–Wichmann, above) and for their conformal images: double cones of
  the free massless scalar, Hislop & Longo, Commun. Math. Phys. **84**, 71
  (1982), general free massless fields, Hislop, Ann. Phys. **185**, 193
  (1988), conformal nets, Brunetti, Guida & Longo, Commun. Math. Phys. **156**,
  201 (1993). Bounded (finite-lifetime) trajectories see a diamond temperature:
  Martinetti & Rovelli, Class. Quantum Grav. **20**, 4919 (2003),
  arXiv:gr-qc/0212074.
- The modular data of one wedge reconstruct the translations and the Poincaré
  group: Borchers, Commun. Math. Phys. **132**, 189 (1990) and **179**, 703
  (1996). The Lorentz group is the modular flow of one special partition, not
  a group of partition changes (006's finding).
- Geometric modular action plus the KMS condition force the Unruh/Hawking
  temperature: Sewell, Phys. Lett. A **79**, 23 (1980).
- Non-geometric modular flow: disjoint intervals of the 2D massless Dirac
  field flow non-locally, with "teleportation" between components — Casini &
  Huerta, Class. Quantum Grav. **26**, 185005 (2009); free-field entanglement
  review, J. Phys. A **42**, 504007 (2009). The ball of a CFT is the conformal
  image of a thermal state on the hyperbolic cylinder: Casini, Huerta & Myers,
  JHEP 1105, 036 (2011), arXiv:1102.0440.
- Thermal time and the Tolman effect: "temperature as the speed of time".
  Rovelli & Smerlak, Class. Quantum Grav. **28**, 075007 (2011).
- Entanglement Hamiltonians of free lattice models from correlation matrices,
  bosons and fermions (review). Eisler & Peschel, J. Phys. A **42**, 504003
  (2009).
- Lattice Bisognano–Wichmann: the BW ansatz on 1D and 2D lattices, working
  best near criticality — Giudici, Mendes-Santos, Calabrese & Dalmonte, PRB
  **98**, 134403 (2018), arXiv:1807.01322; exact vs lattice-BW modular
  Hamiltonians in critical chains — close reduced density matrices can hide
  very different modular Hamiltonians — Zhang, Calabrese, Dalmonte &
  Rajabpour, SciPost Phys. Core **2**, 007 (2020), arXiv:2003.00315; critical
  chains vs CFT — Mendes-Santos, Giudici, Dalmonte & Rajabpour, PRB **100**,
  155122 (2019), arXiv:1906.00471; non-critical chains, triangular profiles —
  Eisler, Di Giulio, Tonni & Peschel, J. Stat. Mech. (2020) 103102,
  arXiv:2007.01804; massless harmonic chains recover the CFT interval
  entanglement Hamiltonian in the continuum limit — Di Giulio & Tonni,
  J. Stat. Mech. (2020) 033102, arXiv:1911.07188; semi-infinite
  nonrelativistic free fermions: BW exact up to a nonuniversal prefactor —
  Eisler, J. Stat. Mech. (2025) 013101, arXiv:2410.16433.
- Entanglement-Hamiltonian spectroscopy and tomography in quantum simulators:
  Dalmonte, Vermersch & Zoller, Nat. Phys. **14**, 827 (2018), arXiv:1707.04455;
  Kokail et al., Nat. Phys. **17**, 936 (2021), arXiv:2009.09000.
- Open (checked 2026-10-07): no exact 2D lattice half-plane entanglement
  Hamiltonian is published. 1D says the BW shape survives the lattice with
  boundary-layer deviations and prefactor non-universality; whether the 2D
  EH converges to the discretised boost, mass-blind as in the continuum, is
  007's pre-registerable question (issue #11).

## Clocks

- The thermodynamic cost of timekeeping bounds clock accuracy. Erker et al.,
  PRX 7, 031022 (2017). Experiment: Pearson et al., PRX 11, 021029 (2021).
- Brownian protein-cycle clocks driven by a constant force: the cost of a
  given precision diverges as the clock's uncertainty vanishes. Barato &
  Seifert, PRX **6**, 041053 (2016).
- Autonomous quantum clocks: the finite-dimensional "quasi-ideal" clock, with
  a polynomial precision advantage over stochastic clocks of the same
  dimension. Woods, Silva & Oppenheim, Ann. Henri Poincaré **20**, 125
  (2019); axiomatic autonomous ticking clocks, Woods, Quantum **5**, 381
  (2021); dimensional versus entropic advantage reconciled, Pour Tak Dost &
  Woods, arXiv:2303.10029. Reviews: Milburn, Contemp. Phys. **61**, 69
  (2020); Marín Guzmán, Erker, Gasparinetti, Huber & Yunger Halpern,
  Rep. Prog. Phys. **87**, 122001 (2024).
- Bounds on tick statistics: the TUR (Barato & Seifert, PRL 114, 158101
  (2015)) and dissipation bounds on all steady-state current fluctuations
  (Gingrich, Horowitz, Perunov & England, PRL **116**, 120601 (2016));
  precision versus dynamical activity (Di Terlizzi & Baiesi, J. Phys. A
  **52**, 02LT03 (2018)); first-passage bounds on intertick intervals
  (Garrahan, PRE **95**, 032134 (2017)).
- Quantum clocks and time dilation: localized-wave-packet clocks see the
  classical factor, superposed momenta a quantum correction. Smith & Ahmadi,
  Nat. Commun. **11**, 5360 (2020). Entanglement of quantum clocks through
  gravity: Castro Ruiz, Giacomini & Brukner, PNAS 114, E2303 (2017). Temporal
  localisability of events near gravitating bodies: Castro-Ruiz, Giacomini,
  Belenchia & Brukner, Nat. Commun. **11**, 2672 (2020).
- No published work combines clock-accuracy bounds with relativistic
  covariance (checked 2026-10-07): thermodynamic clock results are
  non-relativistic, relativistic clock results are entropy-free. Open for 005
  (issue #10): whether the TUR on a dissipative clock along a worldline is a
  covariant bound on resolved proper time.

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

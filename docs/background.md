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

## Local arrow field (#13)

Conjecture (issue #13): a partition's clock rate is the entropy flux through
its surface; shrinking the surface around a point gives a thermodynamic time
field, the local entropy-production density `σ = ∇·s` (divergence theorem).
Valid only in a hydrodynamic window: below the microscopic scale the local
arrow fluctuates (fluctuation theorem), above it geometry dominates. Frames
enter through how the surface moves (`s^μ n_μ`); the local rate `∂_μ s^μ` is a
Lorentz scalar. Nothing below establishes the whole claim; each line is prior
art the pieces rest on.

Entropy currents and the local second law (verified):

- Eckart, Phys. Rev. **58**, 919 (1940), DOI 10.1103/physrev.58.919. First
  relativistic dissipative fluid with an entropy 4-current `s^μ = s u^μ + q^μ/T`
  and `σ = ∂_μ s^μ ≥ 0`; the source is a Lorentz scalar. The covariant origin
  of "flux through a surface = local rate".
- Israel & Stewart, Ann. Phys. **118**, 341 (1979), DOI
  10.1016/0003-4916(79)90130-1. Already above; causal second-order entropy
  current. The covariant entropy current `Σ^μ = s u^μ + Q^μ/T` is in
  Barbachoux, Debbasch & Rivet, EPJ B **23**, 487 (2001) (§004 above).
- de Groot & Mazur, *Non-Equilibrium Thermodynamics* (North-Holland, 1962;
  Dover, 1984). Local-equilibrium entropy-production density as a sum of
  fluxes times thermodynamic forces, `σ = Σ_i J_i X_i`; the non-relativistic
  continuum local second law. Reviewed in *Science* **140**, 168 (1963).
- Glansdorff & Prigogine, Phys. Lett. **7**, 243 (1963), DOI
  10.1016/0031-9163(63)90313-5; Glansdorff, "The Second Law of Thermodynamics
  and the Local Equilibrium Assumption" (1971), DOI
  10.1007/978-3-7091-2844-2_3. The local-equilibrium assumption is what makes
  `σ(x,t) ≥ 0` a pointwise field; it is an assumption, and it fails below the
  hydrodynamic window.
- Elze, Rafelski & Turko, Phys. Lett. B **506**, 123 (2001), DOI
  10.1016/s0370-2693(01)00378-1. Entropy production in relativistic
  hydrodynamics. Becattini, Daher & Sheng, Phys. Lett. B **850**, 138533
  (2024), DOI 10.1016/j.physletb.2024.138533. Entropy current and scalar
  entropy production for spin hydrodynamics.
- Hohenberg & Halperin, Rev. Mod. Phys. **49**, 435 (1977), DOI
  10.1103/revmodphys.49.435. Fluctuating hydrodynamics: Gaussian noise added
  to the dissipative currents; the fields whose divergence is the fluctuating
  local σ. (Relativistic form: Torrieri, JHEP **02** (2021) 175, DOI
  10.1007/jhep02(2021)175; Mullins, Hippert & Noronha, PRL **134**, 232302
  (2025), DOI 10.1103/physrevlett.134.232302.)

Time functions (verified):

- Hawking, Proc. R. Soc. A **308**, 433 (1969; commonly dated 1968), DOI
  10.1098/rspa.1969.0018. A global time function exists: a scalar strictly
  increasing on every future-directed causal curve. The closest prior object
  to a "thermodynamic time field", but it is geometric and carries no entropy.
- Bernal & Sánchez, Commun. Math. Phys. **243**, 461 (2003), DOI
  10.1007/s00220-003-0982-6; smooth Cauchy time functions, Commun. Math. Phys.
  **257**, 43 (2005), arXiv:gr-qc/0401112; Lett. Math. Phys. **77**, 183 (2006),
  arXiv:gr-qc/0512095. Every globally hyperbolic spacetime admits a smooth
  time function whose level sets are Cauchy surfaces — the basis for shrinking
  a surface around a point. Review: Minguzzi, Living Rev. Relativ. **22**, 4
  (2019), DOI 10.1007/s41114-019-0019-x.
- **Conjecture (absence, checked 2026-10-11):** no work was found tying a time
  function to an entropy current, or giving a scalar "thermodynamic time field"
  whose level sets are the constant-time slices. Time functions are purely
  causal; thermal time (below) is a modular flow, not a spatial field.

Thermal time and local temperature as a clock rate (verified):

- Tolman–Ehrenfest, Connes & Rovelli and Rovelli & Smerlak are already above
  (Class. Quantum Grav. **28**, 075007 (2011), DOI
  10.1088/0264-9381/28/7/075007, is "temperature as the speed of time").
- Haggard & Rovelli, PRD **87**, 084001 (2013), arXiv:1302.0724, DOI
  10.1103/physrevd.87.084001. Zeroth law in a general-covariant setting: when
  the state is KMS for a flow, that flow defines the thermal time and its
  rate is the temperature.
- Chirco, Haggard & Rovelli, PRD **88**, 084027 (2013), arXiv:1309.0777, DOI
  10.1103/physrevd.88.084027. Equilibrium from coupling a system to a clock;
  a local temperature is the local rate of the thermal flow.

Point limits of partitions in QFT (verified):

- Jacobson, PRL **75**, 1260 (1995), and "Entanglement equilibrium and the
  Einstein equation", PRL **116**, 201101 (2016), arXiv:1505.04753, DOI
  10.1103/physrevlett.116.201101. For small geodesic balls, stationarity of
  vacuum entanglement at fixed volume (a first law `δS = δ⟨H⟩`) is equivalent
  to the Einstein equation: a local thermodynamic relation emerging from a
  point limit of partitions.
- Blanco, Casini, Hung & Myers, JHEP **08** (2013) 060, arXiv:1305.3182, DOI
  10.1007/jhep08(2013)060. First law of entanglement `ΔS = ΔH` for spherical
  regions, and relative entropy. Casini, Huerta & Myers (JHEP **05** (2011)
  036) is already above. Caveat on the first-order argument: Casini, Galante &
  Myers, JHEP **03** (2016) 194, DOI 10.1007/jhep03(2016)194.

Spatially resolved fluctuation theorems (verified):

- Ayton, Evans & Searles, "A local fluctuation theorem", J. Chem. Phys.
  **115**, 2033 (2001), DOI 10.1063/1.1385158. An FT for the entropy produced
  in a local subvolume; the small-region limit is where the local arrow is
  undetermined.
- Gradenigo, Puglisi & Sarracino, J. Chem. Phys. **137**, 014509 (2012), DOI
  10.1063/1.4731633. Entropy production and its fluctuations in
  non-equilibrium fluctuating hydrodynamics.
- Bertini, De Sole, Gabrielli, Jona-Lasinio & Landim, "Macroscopic fluctuation
  theory", Rev. Mod. Phys. **87**, 593 (2015), DOI 10.1103/revmodphys.87.593.
  Large deviations of macroscopic fluctuations; `P(σ_region < 0) ∼ e^{−V t I}`
  in the hydrodynamic limit — the quantitative form of "the arrow is
  deterministic above the microscopic window". Speck, Engel & Seifert,
  J. Stat. Mech. (2012) P12001, DOI 10.1088/1742-5468/2012/12/p12001.
  Spatially extended version: Maes, cond-mat/0101064.

Cosmological recurrence:

- Dyson, Kleban & Susskind, "Disturbing implications of a cosmological
  constant", JHEP **10** (2002) 011, arXiv:hep-th/0208013, DOI
  10.1088/1126-6708/2002/10/011. De Sitter recurrence and its entropy
  paradoxes: relevant to whether a global arrow is well-defined at late times.

## Causal second law: classical and order-theoretic prior art (#14)

Checked 2026-11-25 against the arXiv, Crossref and Semantic Scholar APIs.
Claim under test (issue #14): for local lattice dynamics with a strict light
cone, (1) relative entropy between two evolving states restricted to a region
is non-increasing when the later region is causally nested in the earlier
one; (2) the converse; (3) reversible dynamics give no one-way arrow;
(4) a fixed region's change splits into a loss term and a boundary inflow.
`all:`-phrase searches on arXiv cover title and abstract only, so every
absence below is an absence *in metadata*, not in full text. Semantic
Scholar's bulk search was rate-limited (429); single-DOI lookups worked.

**A — classical lattice systems.** Verdict: the ingredients are established
(data processing, locality, information decay on networks, reversible-CA
thermodynamics); the composite statement (1) and the converse (2) were
**not found** for classical CA, PCA or lattice gases.

- Takesue, "Reversible Cellular Automata and Statistical Mechanics",
  PRL **59**, 2499 (1987), DOI 10.1103/physrevlett.59.2499. "Reversible
  cellular automata are used to investigate the thermodynamic behavior of
  large systems... it is numerically shown that a canonical distribution
  is realized under certain conditions concerning the conserved
  quantities." **literature** (3): reversible local dynamics relax given a
  suitable initial ensemble.
- Takesue, J. Stat. Phys. **56**, 371 (1989), DOI 10.1007/bf01044442.
  "every ERCA satisfies the Liouville theorem or the preservation of phase
  space volume... If a locally defined quantity is conserved, however, it
  prevents the realization of statistical mechanics." **literature** (3):
  local conservation laws block thermodynamic behaviour in reversible CA;
  an arrow needs a special initial slice.
- Maes, "Nonequilibrium physics aspects of probabilistic cellular
  automata", arXiv:1605.02876, DOI 10.1007/978-3-319-65558-1_9. "when
  time-symmetry is broken in the stationary process, there is a fluctuation
  symmetry for a corresponding entropy flux." **literature** (3): in PCA
  the arrow comes from the update's broken time-symmetry (noise), not from
  reversibility.
- Evans & Schulman, "Signal propagation and noisy circuits", IEEE Trans.
  Inf. Theory **45**, 2367 (1999), DOI 10.1109/18.796377. In a noisy circuit
  "the information is bounded by the sum over all paths... of a quantity
  that is exponentially small in the length of the path", supporting "the
  view of information as a kind of fluid that flows from the input to the
  output along the wires". **literature**: data processing plus locality,
  i.e. information enters only through the boundary and decays with
  distance — the classical network form of (1) for mutual information.
- Polyanskiy & Wu, "Strong data-processing inequalities for channels and
  Bayesian networks", arXiv:1508.06025, DOI 10.1007/978-1-4939-7005-6_7.
  "given SDPI for each constituent channel in a Bayesian network, how to
  produce an end-to-end SDPI?" — contraction of KL divergence across
  networks of local channels. **literature**: the quantitative toolbox for
  a strict version of (1).
- Yau, "Relative entropy and hydrodynamics of Ginzburg-Landau models",
  Lett. Math. Phys. **22**, 63 (1991), DOI 10.1007/bf00400379. Relative
  entropy to local-equilibrium states as the Lyapunov functional of lattice
  dynamics. **literature** (also D).
- Wagner, "An H-theorem for the lattice Boltzmann approach to
  hydrodynamics", EPL **44**, 144 (1998), DOI 10.1209/epl/i1998-00448-8.
  "usual nine-velocity models do not obey an H-theorem but models that do
  obey an H-theorem can be constructed." **literature**: a lattice
  H-functional exists only for special updates.
- Kelly & Wall, "Coarse-grained entropy and causal holographic
  information in AdS/CFT", JHEP **03** (2014) 118, arXiv:1309.3610, DOI
  10.1007/jhep03(2014)118. "The 'future one-point entropy' is defined by
  generalizing this conjecture to future domains of dependence... the
  future one-point entropy obeys a nontrivial second law."
  **literature** (QFT/holography): a second law for an entropy defined on
  a future domain of dependence — the closest published "second law on a
  DOD".
- Dowling, Floerchinger & Haas, "Second law of thermodynamics for
  relativistic fluids formulated with relative entropy", PRD **102**,
  105002 (2020), arXiv:2008.02706, DOI 10.1103/physrevd.102.105002. "A
  local version of the second law similar to the one used in relativistic
  fluid dynamics can be formulated with relative entropy or even relative
  entanglement entropy in a space-time region bounded by two light
  cones." **literature**: the closest published relative of (1) —
  relative-entropy monotonicity on a light-cone-bounded region — but for
  quantum states/relativistic fluids, not classical lattice dynamics.
- Jakšić, Pillet & Szczepanek, "Dynamical conservation laws in quantum
  spin systems", arXiv:2610.21489 (2026). "we prove conservation of the
  specific entropy, specific energy, and specific relative entropy...
  The transported local Hamiltonians admit surface energies that vanish
  per unit volume in the van Hove limit." **literature**: the quantum-
  lattice version of (1)+(4) — bulk conservation up to surface terms under
  Lieb–Robinson transport.
- Casini, "Relative entropy and the Bekenstein bound", Class. Quantum
  Grav. **25**, 205021 (2008), arXiv:0804.2182, DOI
  10.1088/0264-9381/25/20/205021. Relative entropy "between the vacuum and
  another state, both reduced to a local region". **literature**: relative
  entropy on local regions is the sharp entropy bound (quantum; nested
  regions contract by Araki monotonicity).
- **Conjecture (absence, checked 2026-11-25):** arXiv metadata searches
  for "relative entropy"+"cellular automata", "probabilistic cellular
  automata"+"relative entropy", "causal diamond"+"relative entropy" return
  0 hits; "light cone"+"relative entropy" gives 7, all quantum/field-
  theory. Statement (1) is a composite of DPI and locality **(derived
  here)**; nobody appears to have stated it, or the converse (2), for
  classical lattice dynamics.

**B — order-theoretic unification.** Verdict: every ingredient exists;
the identification "the causal order is exactly the order along which a
second law holds for all states" was **not found**.

- Lieb & Yngvason, "The physics and mathematics of the second law",
  Phys. Rep. **310**, 1 (1999), arXiv:cond-mat/9708200, DOI
  10.1016/s0370-1573(98)00082-9. "the existence and uniqueness of S is
  proved to be a consequence of certain basic properties of the relation
  of adiabatic accessibility among equilibrium states" — the second law as
  an order-theoretic statement about a preorder on *states*.
  **literature**.
- Minguzzi, "Time functions as utilities", Commun. Math. Phys. **298**,
  855 (2010), arXiv:0909.0890, DOI 10.1007/s00220-010-1048-1. "the time
  or temporal functions can be used to recover the K+ relation which
  indeed turns out to be the intersection of the time or temporal
  orderings." **literature**: under stable causality the `K⁺` relation,
  which contains the causal relation and need not equal it (Theorems 3.3
  and 4.1), is exactly the order along which *every* time function
  increases — an analogy for the converse (2), not the lattice statement.
- Malament, J. Math. Phys. **18**, 1399 (1977); Hawking, King & McCarthy,
  J. Math. Phys. **17**, 174 (1976). As stated in Minguzzi's review
  (Lorentzian causality theory, Living Rev. Relativ. **22** (2019), DOI
  10.1007/s41114-019-0019-x): a map "which takes future directed null
  geodesics to future directed null geodesics is a C∞ diffeomorphism and
  hence a conformal isometry", and a chronological bijection of
  distinguishing spacetimes "must also be a smooth conformal isometry".
  **literature**: causal structure fixes the metric up to a conformal
  factor — the slot a Tolman temperature (or entropy rate) would have to
  fill.
- Sorkin's causal-set slogan "order plus number equals geometry"
  (Bombelli–Lee–Meyer–Sorkin, above; the phrase quoted in Dribus, "On the
  axioms of causal set theory", arXiv:1311.2148). **conjecture**: the
  "number" is a counting measure; nobody replaces it by an entropy.
- Martin & Panangaden, "A domain of spacetime intervals in general
  relativity", Commun. Math. Phys. **267**, 463 (2006), arXiv:gr-qc/0407094,
  DOI 10.1007/s00220-006-0066-5. "a globally hyperbolic spacetime with its
  causality relation is a bicontinuous poset whose interval topology is
  the manifold topology", so a globally hyperbolic spacetime can be
  "reconstruct[ed]... in a purely order theoretic manner". **literature**.
- Process theories: Chiribella, D'Ariano & Perinotti, "Informational
  derivation of quantum theory", PRA **84**, 012311 (2011),
  arXiv:1011.6451 — "Five elementary axioms—causality, ...—define a
  broad class of theories"; Coecke & Lal, "Causal categories: relativisti-
  cally interacting processes", Found. Phys. **43**, 458 (2012),
  arXiv:1107.6019, DOI 10.1007/s10701-012-9646-8 — "correlations, either
  classical or quantum, force terminality of the tensor unit" (causality
  as a unique discarding effect); Chiribella & Scandolo, "Microcanonical
  thermodynamics in general physical theories", NJP **19**, 123043
  (2017), arXiv:1608.04460 — "the convertibility of states by unital
  operations is completely characterised by a majorisation criterion".
  **literature**: thermodynamics as a convertibility order inside theories
  whose causal structure is an axiom.
- Gavassino, PRX **12**, 041001 (2022), already above: "'stability' is a
  Lorentz-invariant property of dissipative theories if and only if the
  principle of causality is respected." **literature**: the closest
  published iff between dissipation and causality (continuum, not
  lattice, and about stability, not relative entropy).
- Liu, Ebler & Dahlsten, "Thermodynamics of quantum switch information
  capacity activation", PRL **129**, 230604 (2022), arXiv:2205.07406.
  "there may indeed be an information capacity increase for consecutive
  thermalizations obeying the first and second laws... if these are
  placed in an indefinite order", at the cost of the switch's coherence.
  **literature**: the second law is sensitive to causal order (quantum).
- **Conjecture:** the specific unification — "the causal order of regions
  is exactly the order along which a second law holds for all states,
  conformal factor from local temperature (Tolman)" — was not found
  anywhere, in any of these languages. Jacobson's equation-of-state
  result and the thermal-time papers (above) are the nearest neighbours.

**C — time functions from entropy.** Verdict: **not found**; the absence
conjecture of 2026-10-11 survives a second round.

- Searched 2026-11-25 (arXiv metadata): "thermodynamic time function" (0
  hits); "time function"+"entropy" (13, none weights Hawking's or Geroch's
  time function by entropy); "causal set"+"arrow of time" (2, neither
  builds an entropy time); "entropy"+"domain of dependence" (10, closest
  below).
- Rideout & Zohren, "Evidence for an entropy bound from fundamentally
  discrete gravity", Class. Quantum Grav. **23**, 6195 (2006),
  arXiv:gr-qc/0606065, DOI 10.1088/0264-9381/23/22/008. "a bound for the
  entropy contained in this region can be derived from a counting of
  potential 'degrees of freedom' associated to the Cauchy horizon of its
  future domain of dependence." **literature**: causal-set entropy
  counting on domains of dependence — but a bound, not a time function.
- Caticha, "Entropic time", AIP Conf. Proc. **1305**, 200 (2011),
  arXiv:1011.0746, DOI 10.1063/1.3573617. "Entropic time is introduced as
  a book-keeping device to keep track of the accumulation of changes"...
  it "incorporates a natural distinction between past and future".
  **literature**: a time-from-entropy program exists, but on configuration
  space in the entropic-dynamics framework, not a Lorentzian time function
  weighted by entropy production.
- **Conjecture (absence):** no published work ties Hawking's/Geroch's
  geometric time function to an entropy current, or uses entropy as the
  "number" in causal sets. Checked 2026-10-11 and, with the terms above,
  2026-11-25.

**D — fixed-region decomposition.** Verdict: **partly established**; the
exact sign-definite loss/collar split was **not found**.

- Horowitz & Esposito, "Thermodynamics with continuous information flow",
  PRX **4**, 031015 (2014), arXiv:1402.3276, DOI
  10.1103/physrevx.4.031015. "while the joint system satisfies the second
  law, the entropy balance for the relevant system is modified by an
  information term related to the mutual information rate between the two
  systems." **literature**: a subsystem's entropy change is production
  plus a boundary information term; a subsystem can appear to run
  backwards while the joint system does not.
- Esposito, PRE **85**, 041125 (2012) and Shiraishi & Sagawa, PRE **91**,
  012130 (2015) (both above): hidden and partial entropy production — the
  decomposition of entropy production into region-local pieces with their
  own fluctuation relations. **literature**.
- Yau (1991, above) and Jakšić–Pillet–Szczepanek (above): relative-entropy
  Lyapunov functionals for lattice dynamics, and surface energies that
  vanish per unit volume — bulk-minus-boundary decompositions one step
  away from (4). **literature**.
- The continuum shape of (4) is the entropy balance `∂_t S_region =
  ∫σ − ∮ j_s·n` of local thermodynamics (de Groot–Mazur; Eckart, above).
  **literature** for the balance; **derived here** for the conditional-
  relative-entropy chain-rule version for two evolving states.
- **Conjecture (absence):** no prior work was found stating, for relative
  entropy between two evolving states on a fixed region, a decomposition
  into a non-positive bulk loss plus a non-negative collar inflow. The
  split is the chain rule; a perimeter bound on the inflow needs a bound on
  the likelihood ratio (**derived here**: at most `|collar|·log|Cell|` for
  a finite alphabet and a uniform product reference, while one boundary bit
  with `P(1)=1`, `Q(1)=ε` already contributes `log(1/ε)`). Searched: "entropy production"+"cellular
  automata", "entropy production"+"lattice gas" (arXiv metadata), and
  the stochastic-thermodynamics decomposition literature above.

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

## Causal second law: horizons, modular flow and quantum lattices (#14)

Search of arXiv and publisher full text on 2026-11-25; quotations below identify
the supporting passage. **Literature** means a result in the cited source;
**derived here** means an elementary deduction, not a Lean theorem; **conjecture**
includes an unverified literature absence. Causality and data processing alone
do not choose a future direction or supply a physical clock.

**A. Horizons and entropy theorems — literature, with corrections.**

- Wall, *Phys. Rev. D* **85**, 104049 (2012), arXiv:1105.3445v6, §§2.5–2.8,
  proves a semiclassical generalized second law for causal horizons, minimally
  coupled fields and general relativity, subject to horizon-algebra axioms
  (determinism, ultralocality, local Lorentz invariance, stability) and the
  stated renormalization assumptions. Abstract: “comparing any slice of the
  horizon to any earlier slice”; §2.6: the KMS vacuum is restricted to the
  horizon **above** each cut. A later cut removes an initial portion of each
  horizon generator, giving nested future-horizon algebras; §2.7 includes
  future null infinity for information escaping the horizon. “Relative entropy
  decreases under restriction to the future horizon above a later cut” is fair;
  restriction to the cut itself is not. Relating that decrease to increasing
  area/4G plus exterior entropy uses the semiclassical gravitational equation,
  horizon thermality and renormalization, not data processing alone. Section
  2.5 explicitly flags the infinite-system free-energy identity with
  renormalized quantities as an assumption.
- Casini, *Class. Quantum Grav.* **25**, 205021 (2008), arXiv:0804.2182,
  §4, derives a well-defined **vacuum-subtracted, modular-energy** version of
  the Bekenstein bound from positivity of relative entropy; abstract: “the
  positivity of the relative entropy ... constitutes a well defined statement
  of the bound”. This is not an unconditional proof of every naive entropy
  bound: the modular energy need not be a simple total energy for every region.
- Casini & Huerta, *J. Phys. A* **40**, 7031 (2007),
  arXiv:cond-mat/0610375, abstract: “Lorentz symmetry and the strong subadditive
  property” give an entropic c-theorem in **1+1** dimensions. Their *Phys.
  Rev. D* **85**, 125016 (2012), arXiv:1202.5650, abstract, proves circle
  entropy concavity in 2+1 using SSA and Lorentz covariance, but states that
  irreversibility follows **provided** there is an intrinsic fixed-point
  definition of the constant term. Calling that paper alone an unconditional
  F-theorem proof omits its qualification.
- Casini, Testé & Torroba, *J. Phys. A* **50**, 364001 (2017),
  arXiv:1703.10656, abstract and §7: null-plane vacuum modular Hamiltonians
  obey a “Markov property” implying SSA saturation; for a CFT the conformally
  related null cone is included. This is a statement about those regions and
  the vacuum, not arbitrary spacelike regions or all states.

**B. Modular free energy and clocks — literature.** Casini 2008, §§3–5,
arXiv:0804.2182, eqs. (18)–(22), writes `D(ρ‖ω)=β(F(ρ)−F(ω))` for a
thermal reference and discusses the Hartle–Hawking exterior. Equivalently, in
a finite regulator with `Kω=−log ω` and `Δ` relative to ω,
`D(ρ‖ω)=Δ⟨Kω⟩−ΔS`; in continuum QFT the separately divergent terms require a
valid subtraction/algebraic definition. Wall §2.6 makes precisely this
free-energy comparison for horizon cuts, then uses gravity to obtain the GSL.
Connes & Rovelli, arXiv:gr-qc/9406019, abstract, **propose**, rather than
prove universally, “the physical time-flow ... is determined by the
thermodynamical state”; Rovelli & Smerlak, arXiv:1005.2985, abstract, identify
equilibrium temperature with the rate of thermal time relative to proper time
in stationary spacetimes. Martinetti & Rovelli, arXiv:gr-qc/0212074, abstract,
study a finite-lifetime observer's diamond in a four-dimensional CFT; the
vacuum modular flow is geometric and their thermal-time interpretation gives
an observer-dependent diamond temperature, even at zero acceleration. Wong,
Klich, Pando Zayas & Vaman,
arXiv:1305.3291, abstract, derive a spatially varying entanglement temperature
for spherical CFT regions. These are close prior art for the rate interpretation;
the modular flow need not be geometric for a general state or region.

**C. Strict causal quantum models — literature and conjecture.** D'Ariano &
Perinotti, arXiv:1608.02004, abstract, derive free Weyl/Dirac/Maxwell dynamics
in an appropriate low-wavevector limit of local automata. D'Ariano, Mosco,
Perinotti & Tosini, arXiv:1406.1021, abstract: their 1D Dirac automaton is
linear in fields and “isomorphic to a quantum walk”. Arrighi, Facchini &
Forets, arXiv:1404.4499, abstract: the Dirac walk is covariant only to first
order; their distinct clock walk/automaton is exactly discretely covariant.
Do not conflate a one-particle walk with a specified filled many-body vacuum.

- Eisler & Peschel, arXiv:1805.00078, introduction, state that the lattice
  interval EH “does not have exactly the conformal form”; Eisler, Tonni &
  Peschel, arXiv:1902.04474, abstract, recover the CFT continuum limit only
  including farther-neighbour hopping. Giudici, Mendes-Santos, Calabrese &
  Dalmonte, arXiv:1807.01322, §II and §III.C, compare lattice BW predictions
  to 1D/2D models and extract the sound velocity from entanglement spectra:
  their velocity comes from the **low-momentum relativistic dispersion**, and
  is “generically different” from momentum-dependent group velocity. It is
  not identified with a strict cone or Lieb–Robinson bound. Their continuous-
  time Hamiltonians are not, by themselves, strict discrete-time QCAs.
  Dalmonte, Vermersch & Zoller, *Nat. Phys.* **14**, 827 (2018),
  arXiv:1707.04455, abstract, propose spectroscopy of suitably constructed BW
  entanglement Hamiltonians; this is not a general exact lattice theorem.
- **Literature:** Shi et al., *Nat. Commun.* **14**, 3263 (2023), DOI
  10.1038/s41467-023-39064-6, abstract and Fig. 3, report stimulated analog
  Hawking radiation from quantum-walk-like dynamics in a superconducting
  fermionic lattice, with a fitted effective temperature; the continuous-time,
  inhomogeneous analog horizon is not a strict QCA vacuum Unruh measurement.
  An entangled-photon quantum walk near a synthetic Rindler horizon is reported
  in *Phys. Rev. Research* **6**, 013233 (2024), DOI
  10.1103/PhysRevResearch.6.013233, abstract; it reports optical escape, not a
  vacuum thermal spectrum.
- **Conjecture (bounded absence):** searches combining “quantum walk” / “quantum
  cellular automaton” with “entanglement Hamiltonian”, “Bisognano-Wichmann”,
  “relative entropy”, “light cone”, “Unruh” and “Hawking” found no paper
  calculating both the vacuum half-line BW ramp and exact causal-cone relative
  entropy monotonicity for the same strictly causal discrete-time model. No
  such QCA-specific ramp slope or Unruh temperature was verified. This is not
  evidence of absence, and does not negate the analog results above.

**D. Fermionic numerics — literature and derived here.** Peschel, *J. Phys. A*
**36**, L205 (2003), arXiv:cond-mat/0212631, eqs. (9)–(12), gives
`ζ=(1+e^ε)⁻¹` and `Hᵀ=log[(1−C)/C]` using `Cij=⟨c†i cj⟩`. With instead
`Cij=⟨c†j ci⟩`, for number-conserving Gaussian states on the same finite
subsystem and `ρ=Z⁻¹ exp(−Σij c†i hij cj)`, the equivalent formula is
`h=log[(I−C)C⁻¹]`. **Derived here**, inserting this into Casini's definition:

`D(ρC‖ρD)=tr[C(log C−log D)+(I−C)(log(I−C)−log(I−D))]`.

Matrix logarithms are applied separately: C and D need not commute. This
formula assumes gauge-invariant Gaussian states; anomalous pairing requires
the full Nambu/Majorana covariance with its convention-dependent factor 1/2.
The displayed inverse is for spectra strictly in `(0,1)`; for zero/one modes
use support limits, with `D=∞` when state support is not contained in reference
support. Rottoli, Murciano & Calabrese, *JHEP* **06** (2023) 139, eq. (4.8),
explicitly give `h=log[(I−C)/C]` and say the computation “must be performed at
high precision”; they use up to 300 digits. Near 0 or 1, rounding destroys
logarithms; clipping changes the state and must not be presented as a bound.

**E. Classical comparison and thermal crossover — derived here / literature.**
For a finite classical nearest-neighbour Gibbs model with positive weights,
split `H=H_A+H_B+H_∂`. Summing B gives
`−log p_A=βH_A−log Σ_{s_B} exp[−β(H_B+H_∂)]+const`: the correction depends
only on A's boundary spins, though it can be nonlocal **along** that boundary.
Thus the original interior couplings retain uniform β; this is not a theorem
about arbitrary classical reference measures or effective bulk descriptions.
The thermodynamic limit requires a Gibbs specification and care with infinite
normalizations. By contrast the Lorentz-vacuum half-space modular weight is
linear, but not every quantum reference state has a local ramp.
Cardy & Tonni, arXiv:1608.01283, §3.2, eq. (32), give the exact finite-
temperature interval weight in a 1+1 CFT. **Derived here:** its half-line
limit gives `β_eff(x)=β(1−exp(−2πx/β))` in units `v=1` for `−log ρ`:
linear `2πx` near the cut and approaching the uniform physical β far away.
This is a CFT thermal-state result, not an arbitrary excited-state theorem.
Wen, Ryu & Ludwig, arXiv:1807.04440, abstract, show approach to the thermal
entanglement Hamiltonian after a special-class 1+1 CFT quench.

**F. Novelty — conjecture, not a priority claim.** The exact joint demonstration
in C remains a candidate numerical contribution, not established novelty.
The slogan “causal order from entropy monotonicity, conformal factor from local
temperature” is also unverified as new. **Literature:** Jacobson,
arXiv:gr-qc/9504004, abstract, obtains the Einstein equation from horizon
entropy proportional to area and `δQ=T dS`; Rovelli–Smerlak above already link
clock rate, temperature and Tolman's equilibrium relation. Dribus,
arXiv:1311.2148, abstract, quotes Sorkin's “order plus number equals geometry”:
the counting measure supplies volume, not automatically a temperature.
**Derived here:** data processing yields only an order of distinguishability
for a chosen family of channels; reconstructing causal order requires the
separate converse for all admissible state pairs, while recovering a metric
scale from a temperature requires a normalized physical clock and additional
geometric/equilibrium assumptions. No such reconstruction follows merely from
the slogan.

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

## Causal second law: the information current, stability and causality (#14)

Search 2026-11-25: arXiv and publisher full text for “information current
stability causality”, “relativistic Boltzmann relative entropy current”,
“entropy spacelike hypersurface”, “lattice Boltzmann H theorem”, “telegraph
entropy Lorentz”, and “stochastic network relative entropy causal cuts”. The
arXiv abstracts or publisher texts linked below were read, not just metadata.
An unlocated prior statement is a **conjecture**, not a novelty certificate.

**A — literature, central recollection confirmed with limits.** Gavassino,
Antonelli & Haskell, “Thermodynamic Stability Implies Causality”, PRL **128**,
010606 (2022), [arXiv:2105.14621](https://arxiv.org/abs/2105.14621),
equations (3)–(5), (9) and causality argument: “localised perturbations to the
equilibrium state cannot propagate outside their future light-cone”. They define
`E^μ = −δs^μ − α*_I δJ_I^μ` using the finite change from equilibrium, entropy
current `s`, conserved currents `J_I`, and equilibrium reservoir affinities
`α*_I`; `E[Σ] = ∫Σ E^μ n_μ dΣ` uses a **past-directed** unit normal. For
all timelike past normals the density is nonnegative, vanishes exactly when
all perturbations vanish, and `∇_μ E^μ ≤ 0` on solutions. Under these local
conditions and the paper's smoothness, localized-perturbation and near-
equilibrium assumptions, the integrated current is a Lyapunov functional and
the equilibrium exterior of the future cone stays unperturbed. This is not a
general nonlinear or stochastic network theorem. Strict definiteness matters;
causality of a current alone does not identify the entire state.

**A — literature, converse is not general.** The same paper says “causality
alone does not imply stability”, distinguishing off-shell thermodynamic
stability against virtual perturbations from on-shell mode stability. Geroch &
Lindblom's special divergence-type class does have a causality-to-equilibrium-
stability result under its additional assumptions; see B. Gavassino, “Can We
Make Sense of Dissipation without Causality?”, PRX **12**, 041001 (2022),
[arXiv:2111.05254](https://arxiv.org/abs/2111.05254), theorem 2: “If a causal
(linear) theory presents a growing Fourier mode in one reference frame, then
it is linearly unstable in all reference frames.” Thus causal **linear mode**
stability in one inertial frame gives it in all, with the paper's homogeneous
stationary-background and solution assumptions; it is not a proof that
causality alone creates an entropy law.

**A — literature, transport.** Heller, Serantes, Spaliński & Withers,
“Rigorous Bounds on Transport from Causality”, PRL **130**, 261601 (2023),
[arXiv:2212.07434](https://arxiv.org/abs/2212.07434), derive “two-sided bounds
on all transport coefficients in units of this radius”, including an upper
diffusivity bound, from causal retarded response and analyticity, not the
information-current theorem; their qualification excludes relevant stochastic
fluctuations. Gavassino, [arXiv:2301.06651](https://arxiv.org/abs/2301.06651),
abstract, derives the same dispersion constraint from covariant stability.

**B — literature, history.** Hiscock & Lindblom, PRD **31**, 725 (1985),
[paper](https://www.math.tecnico.ulisboa.pt/~jnatar/nonarxivpapers/HiscockLindblom.pdf),
study the classic Eckart/Landau–Lifshitz first-order class: despite an entropy
law, equilibrium has unstable modes; this is not a no-go for every modern
first-order frame. Their abstract reports “small spatially bounded departures
from equilibrium” that “diverge exponentially with time”.
For Israel–Stewart, the 2024 primary treatment by Gavassino et al.,
[arXiv:2401.13852](https://arxiv.org/abs/2401.13852), contrasts transient
variables and entropy-current construction with first-order theories; it
describes a “timelike future-directed information current” even at first order.
Geroch & Lindblom, PRD **41**, 1855 (1990),
[paper](https://electronicsandbooks.com/edt/manual/Magazine/P/Physical%20Review%20D/PhysRevD%201982-1994/root/data/PhysRevD%201982-1994/pdf/PRD/v41/i6/PRD_v41_i06_p1855_1.pdf),
construct divergence-type theories with an entropy law and examine nonlinear
causality; §I says causality of that class “implies stability of the equilibrium
states”. Kovtun, [arXiv:1907.08191](https://arxiv.org/abs/1907.08191), finds
stable first-order hydrodynamic frames. Hoult & Kovtun, PRD **106**, 066023
(2022), [paper](https://arxiv.org/abs/2112.14042), explain BDNK: appropriately
chosen frames yield hyperbolicity and stable equilibrium with positive entropy
production within the derivative expansion, not necessarily an exact
nonnegative entropy divergence for arbitrary gradients.

**C — literature and derived here, kinetic theory.** Gavassino et al. 2022,
equation (9), already give the causal kinetic information current near
equilibrium: `E^μ = ∫(δf)^2 p^μ/[2 f_eq(1+ε f_eq)] d³p/p⁰ + O(δf³)`;
the paper says the ideal-gas current obeys all three conditions. For the
nonlinear classical Boltzmann equation with elastic number- and four-momentum-
conserving collisions and global Jüttner equilibrium `ln f_eq = α + β_μ p^μ`,
Rocha, Gavassino & Mullins, [arXiv:2405.10878](https://arxiv.org/html/2405.10878),
equation (7) and conclusion, **already state exactly the proposed current**
`D^μ = ∫(f ln(f/f_eq)−f+f_eq)p^μ d³p/[(2π)³p⁰]` (their `E^μ`). They write
“The fully nonlinear information current” is “manifestly timelike
future-directed” and has “non-positive divergence due to the H-theorem”.
Their equation (7) is valid for arbitrarily large fluctuations; their linear
stochastic construction is a separate result. **Derived here:** convexity and
future momentum give causal direction, with `∂_μ D^μ = −∂_μ s^μ ≤ 0` from
collision invariants when β is Killing. This assumes suitable integrability
and no external forcing; a local equilibrium or quantum gas needs a different
calculation (the same paper gives quantum statistics in Appendix A). We did
not verify the exact nonlinear formula
in de Groot–van Leeuwen–van Weert, Cercignani–Kremer or Israel 1963; do not
attribute it to them on this search. An absolute entropy current being timelike
is a distinct, convention-sensitive assertion: the nonnegative relative
entropy integrand makes `D` causal without requiring it for `s`.

**D — literature and derived here, slices and boundaries.** Gavassino et al.
2022, equations (3)–(5), state positivity on arbitrary spacelike surfaces and
non-positive current divergence; their proof uses spacelike boundaries taken
arbitrarily close to null.
**Derived here:** Gauss gives nonincrease between ordered complete Cauchy slices
when side flux vanishes or has the needed sign, and likewise for bounded
domains with the appropriate sign on the whole side boundary. Divergence
alone suffices for complete slices with no side flux; causality supplies the
universal sign on null or spacelike oriented boundary pieces. A timelike
surface has spacelike normal, so causal currents can cross it either way;
there is no universal sign. This does **not** imply that only horizon-bounded
regions can have a monotone clock: reflecting/no-flux boundaries, special
states or dynamics, and suitable timelike boundaries can also make the side
term favourable. An individual null flux may vanish. We found no separately
verified ordinary-fluid horizon-clock theorem.

**E — literature and derived here, discrete and telegraph.** Succi, Karlin &
Chen, [arXiv:cond-mat/0205639](https://arxiv.org/abs/cond-mat/0205639),
survey an `H` theorem in discrete phase space; the abstract emphasizes
“compliance of the method with macroscopic evolutionary constraints”. We did
not find a verified arbitrary-tilted-cut statement in that source. Heller,
Serantes, Spaliński, Svensson & Withers,
[arXiv:2011.13864](https://arxiv.org/abs/2011.13864), call the telegrapher
equation “a causal theory with a hydrodynamic sector”. Serva,
[arXiv:2004.11983](https://arxiv.org/abs/2004.11983), introduction, says a
boosted light-speed persistent process generally has “an unbalanced
probability rate of velocity inversion”: covariance of a family does not mean
the same symmetric rates in every frame. **Derived here:** on a periodic line,
the two-velocity symmetric-rate process has non-increasing KL divergence to
its uniform stationary distribution by streaming plus Markov data processing;
its rate is a nonnegative direction-flip contribution. We did not verify a
published many-fingered-time or entropy-production theorem for this process.
The separate classical/order lane is responsible for a fuller network search.

**F — conjecture, novelty and logical conditions.** The hydrodynamic current,
foliation argument and ordinary channel contraction are prior art; an exact
lightlike lattice-gas demonstration with a rigorously qualified converse may
still be new, but absence is unproved. **Derived here:** a later cut marginal
must factor through the earlier cut by the *same* stochastic channel for both
states (including all necessary inputs and correlations) for KL contraction.
For a converse, an outside variable must have actual operational influence,
and the quantified state pairs must permit changing it while keeping the
earlier cut fixed. A graph edge erased by its channel is a counterexample to
characterising the declared graph order; restricted state families can also
hide influence. Equal earlier marginals and unequal later marginals witness
failure, provided those pairs are admissible. No Lean proof is claimed here.

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

## Dephasing, mixing and recurrence (#12)

Each citation below was checked against Crossref or arXiv on 2026-10-11.
**literature** = published and verified; **conjecture** = a literature-absence
or an unverified reading.

**Integrable dephasing (phase mixing).**
- Free motion on a rectangle conserves `|v_x|`, `|v_y|`, so a released
  ensemble is a superposition of periodic modes; the direction average is a
  stationary-phase/Bessel integral whose coarse observables fall as
  `t^{−d/2}` in `d` dimensions. Textbook.
- Phase mixing as collisionless dephasing: **Landau damping** in a Vlasov
  plasma (exponential in time for analytic data) — Mouhot & Villani, *Acta
  Math.* **207**, 29 (2011), DOI 10.1007/s11511-011-0068-9. **Violent
  relaxation** of a collisionless stellar system and the coarse-grained
  Lynden-Bell distribution — Lynden-Bell, *MNRAS* **136**, 101 (1967), DOI
  10.1093/mnras/136.1.101; textbook in Binney & Tremaine, *Galactic
  Dynamics* (2008), DOI 10.1515/9781400828722.
- Algebraic relaxation of ideal classical particles in a **1D box**, from the
  free-motion phases — Gebhard & zu Münster, *Ann. Phys. (Berlin)* **523**,
  552 (2011), DOI 10.1002/andp.201100080.

**Hyperbolic (dispersing) billiards and the Lorentz gas.**
- Sinai billiard ergodicity — Sinai, *Russ. Math. Surveys* **25**, 137 (1970),
  DOI 10.1070/rm1970v025n02abeh003794. Markov partitions for dispersed
  billiards — Bunimovich & Sinai, *Commun. Math. Phys.* **78**, 247 (1980),
  DOI 10.1007/bf01942372; for planar hyperbolic billiards — Bunimovich,
  Sinai & Chernov, *Russ. Math. Surveys* **45**, 105 (1990), DOI
  10.1070/rm1990v045n03abeh002355, and **46**, 47 (1991), DOI
  10.1070/rm1991v046n04abeh002827.
- **Finite horizon**: exponential decay of correlations in the periodic
  Lorentz gas — Bunimovich & Sinai, *Commun. Math. Phys.* **78**, 479 (1981),
  DOI 10.1007/bf02046760; general hyperbolic machinery — Young, *Ann. of
  Math.* **147**, 585 (1998), DOI 10.2307/120960. Book: Chernov & Markarian,
  *Chaotic Billiards*, Math. Surveys Monogr. **127**, AMS (2006), DOI
  10.1090/surv/127.
- **Infinite horizon** (corridors): correlations decay as a power law `~ 1/t`
  and the gas is **superdiffusive** (displacement variance `~ t log t`) —
  Bleher, *J. Stat. Phys.* **66**, 315 (1992), DOI 10.1007/bf01060071; limit
  laws and recurrence — Szász & Varjú, *J. Stat. Phys.* **129**, 59 (2007),
  DOI 10.1007/s10955-007-9367-0. Near-recurrence in infinite-horizon Lorentz
  tubes — Lenci & Troubetzkoy, *Physica D* **240**, 1510 (2011), DOI
  10.1016/j.physd.2011.06.020.
- **Nowhere-dispersing** (focusing) billiards are still ergodic and mixing —
  Bunimovich, *Commun. Math. Phys.* **65**, 295 (1979), DOI
  10.1007/bf01197884. Mixing rate ↔ recurrence-time statistics — Young,
  *Israel J. Math.* **110**, 153 (1999), DOI 10.1007/bf02808180.
- **#12's "one scatterer halves the echo, nine kill the tail".** The
  infinite-horizon mechanism (corridors ⇒ power-law, not exponential, tails)
  is textbook and agrees with #12's power-law fits for 0/1/9 scatterers. The
  specific amplitudes — one scatterer halving the `k = 1` revival while
  near-axis channels survive, nine reducing the `t ≈ 8000` coherent tail to
  the seed-noise floor — are **not** in the cited literature (conjecture: our
  observation).

**Revivals.**
- Quantum wave-packet revivals and fractional revivals — Robinett, *Phys.
  Rep.* **392**, 1 (2004), DOI 10.1016/j.physrep.2003.11.002; Averbukh &
  Perelman, *Phys. Lett. A* **139**, 449 (1989), DOI
  10.1016/0375-9601(89)90943-2.
- Billiard revivals: circular billiard — Robinett & Heppelmann, *Phys. Rev.
  A* **65**, 062103 (2002), DOI 10.1103/physreva.65.062103;
  equilateral-triangle billiard — Doncheski & Robinett, *Ann. Phys.* **299**,
  208 (2002), DOI 10.1006/aphy.2002.6276.
- Classical revivals of a particle ensemble in a box: the per-direction period
  `2L/v` is elementary, and the 1D-box revival/relaxation envelope is treated
  by Gebhard & zu Münster (2011). The 2D **lattice-direction spike structure**
  (`r₂ ∝ k^{−1/2}`) is **not** covered (conjecture).

**Exact recurrence in discrete chaotic maps.**
- Cat map mod `N` period — Dyson & Falk, *Amer. Math. Monthly* **99**, 603
  (1992), DOI 10.1080/00029890.1992.11995900; original theory — Arnold &
  Avez, *Ergodic Problems of Classical Mechanics* (1968); formula and
  generalisations — Bao & Yang, *Nonlinear Dyn.* **70**, 1365 (2012), DOI
  10.1007/s11071-012-0539-3; Nance, arXiv:1111.2984; Arnold/Euler-number
  sequence — Ramassamy, *Arnold Math. J.* **3**, 519 (2017), DOI
  10.1007/s40598-018-0079-0.
- Quantum cat map — Hannay & Berry, *Physica D* **1**, 267 (1980), DOI
  10.1016/0167-2789(80)90026-3.
- Quantized baker map — Balazs & Voros, *Ann. Phys.* **190**, 1 (1989), DOI
  10.1016/0003-4916(89)90259-5; classical structures — Saraceno, *Ann.
  Phys.* **199**, 37 (1990), DOI 10.1016/0003-4916(90)90367-w;
  coarse-grained entropy and its partition dependence — Schack & Caves,
  *PRL* **69**, 3413 (1992), DOI 10.1103/physrevlett.69.3413, and *PRL*
  **71**, 525 (1993), DOI 10.1103/physrevlett.71.525.
- **Conjecture:** we did not verify a single canonical citation for the exact
  period of the **discretized baker map** on an `N × N` grid; the cat-map
  period formula above is the clean text.

**Recurrence theorems.**
- Poincaré's recurrence theorem and the Zermelo–Boltzmann recurrence
  objection — review: Steckline, *Am. J. Phys.* **51**, 894 (1983), DOI
  10.1119/1.13373. Mean return time: Kac's lemma — Kac, *Bull. Amer. Math.
  Soc.* **53**, 1002 (1947), DOI 10.1090/s0002-9904-1947-08927-8.
- Quantum recurrence theorem — Bocchieri & Loinger, *Phys. Rev.* **107**, 337
  (1957), DOI 10.1103/physrev.107.337.
- For `N` particles the mean recurrence time grows exponentially in `N`
  (Kac's lemma; `~ e^{S}`), so it is unobservable for macroscopic `N`.
  **#12**'s estimate `~(1/a)^N` is consistent (conjecture on the exact
  scaling).

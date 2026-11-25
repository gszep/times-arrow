# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "scipy", "python-flint"]
# ///
"""
Brute-force validation of every convention qca.py relies on, on systems
small enough to enumerate (2-3 sites, 4-6 modes, Fock dimension 16-64):

  V1  W = S C reproduces cos omega = cos theta cos k; gap 2|theta| at k=0;
      low-energy speed sqrt(cos theta); maximal group velocity cos theta.
  V2  single-particle support expands at cone speed exactly 1 (no faster).
  V3  W @ V = V @ diag(exp(-i omega)) for the band basis from bands().
  V4  G -> W G W^dagger is the correlation-matrix update of the
      second-quantised walk (against the Fock-space unitary exp(a^dag L a)).
  V5  the Gaussian relative-entropy formula equals the many-body
      Tr[rho (ln rho - ln omega)] on a region.
  V6  the Peschel matrix h = ln((1-G)/G) satisfies, on a region,
      -ln omega_R = a^dag h a - ln Z with ln Z = sum ln(1 + e^{-h_i}),
      i.e. K = -ln omega_R has single-particle part h.
  V7  D = Delta<K> - Delta S (E2 identity) on a region, both sides from
      independent computations.
  V8  vacuum G is a projector, stationary under W; thermal G_beta too.
"""
import numpy as np
from scipy.linalg import expm, logm
import qca

ok = lambda name, val, tol: print(f"{name}: {val:.3e}  {'PASS' if val < tol else 'FAIL'} (tol {tol:.0e})")

# ---- V1/V2: dispersion and cone ------------------------------------------------
n, theta = 512, 0.4
V, om, ks = qca.bands(n, theta)
W = qca.walk(n, theta)
cos_om = np.cos(om[1::2])  # positive band, k order matches ks
ok("V1 cos(omega) - cos t cos k", np.abs(cos_om - np.cos(theta) * np.cos(ks)).max(), 1e-12)
gap = om[1::2].min()
ok("V1 gap vs theta", abs(gap - theta), 1e-12)
# exact low-energy speed from cos omega = cos t cos k (derived):
# omega^2 = theta^2 + c^2 k^2 with c^2 = theta cos(theta)/sin(theta).
kk = np.linspace(5e-4, 1e-3, 3)
om_small = qca.group_velocity(kk, theta)[1]
c_exact = np.sqrt(theta * np.cos(theta) / np.sin(theta))
c_meas = np.sqrt((om_small ** 2 - theta ** 2) / kk ** 2)
ok("V1 low-energy speed sqrt(t cos t / sin t)", np.abs(c_meas - c_exact).max(), 1e-4)
print(f"V1 note: sqrt(cos t) = {np.sqrt(np.cos(theta)):.6f} vs exact Dirac speed "
      f"{c_exact:.6f} at theta={theta} (they differ; the prompt's sqrt(cos t) is the small-theta approx)")
kk2 = np.linspace(0.01, np.pi / 2, 4000)
vg = qca.group_velocity(kk2, theta)[0]
ok("V1 max group velocity vs cos t", abs(vg.max() - np.cos(theta)), 1e-6)

# cone: start from a delta state, apply W repeatedly
v0 = np.zeros(2 * n, dtype=complex); v0[2 * 256] = 1.0  # R mode at site 256
for t in (1, 5, 17):
    vt = np.linalg.matrix_power(W, t) @ v0
    dist = np.nonzero(np.abs(vt) > 1e-14)[0] // 2
    reach = np.abs(dist - 256).max()
    print(f"V2 t={t}: max support reach {reach} (cone speed 1 -> {reach == t})")

# ---- V3: band basis diagonalises W ---------------------------------------------
ok("V3 ||W V - V diag||", np.abs(W @ V - V @ np.diag(np.exp(-1j * om))).max(), 1e-12)
ok("V3 V unitary", np.abs(V.conj().T @ V - np.eye(2 * n)).max(), 1e-12)

# ---- Fock-space helpers --------------------------------------------------------
def fock_dim(m):
    return 1 << m

def number_ops(m):
    """Matrices N_ij = a_i^dag a_j in the occupation basis, dim 2^m."""
    dim = fock_dim(m)
    Ns = np.zeros((m, m, dim, dim), dtype=complex)
    for occ in range(dim):
        for j in range(m):
            if not (occ >> j) & 1:
                continue
            sgn1 = (-1) ** bin(occ & ((1 << j) - 1)).count("1")
            occ2 = occ & ~(1 << j)
            for i in range(m):
                if (occ2 >> i) & 1:
                    continue
                sgn2 = (-1) ** bin(occ2 & ((1 << i) - 1)).count("1")
                Ns[i, j, occ2 | (1 << i), occ] = sgn1 * sgn2
    return Ns

def quadratic(L, mm):
    """sum_ij L_ij a_i^dag a_j on mm modes, as a 2^mm x 2^mm matrix."""
    Ns = number_ops(mm)
    return np.einsum("ij,ijxy->xy", L, Ns)

def corr_from_rho(rho, m):
    """G_ij = Tr[rho a_i^dag a_j] via the transpose of the number-op matrix."""
    Ns = number_ops(m)
    return np.einsum("xy,ijyx->ij", rho, Ns)

def gaussian_rho(G, m):
    """rho = Z^{-1} exp(-sum h_ij a_i^dag a_j), h = ln((1-G)/G) (Hermitian)."""
    ew, Q = np.linalg.eigh(G)
    h = Q @ np.diag(np.log((1 - ew) / ew)) @ Q.conj().T
    rho = expm(-quadratic(h, m))
    return rho / np.trace(rho)

# ---- V4: correlation-matrix update ---------------------------------------------
rng = np.random.default_rng(0)
m = 4  # 2 sites
n2, th2 = m // 2, 0.4
W2 = qca.walk(n2, th2)
# random valid correlation matrix: random eigenvalues in [0,1], random basis
ew = rng.random(m)
Q = np.linalg.qr(rng.standard_normal((m, m)) + 1j * rng.standard_normal((m, m)))[0]
G = (Q * ew) @ Q.conj().T
rho = gaussian_rho(G, m)
U = expm(quadratic(logm(W2), m))
rho2 = U @ rho @ U.conj().T
# corr_from_rho gives <a_i^dag a_j> = (qca G)^T; the update of the qca
# convention is G -> W G W^dag (verified here against the Fock evolution).
G_fock = corr_from_rho(rho2, m).T
ok("V4 ||W G W^dag - G_bruteforce||", np.abs(W2 @ G @ W2.conj().T - G_fock).max(), 1e-12)

# ---- V5: relative entropy formula vs many-body -----------------------------------
# two random Gaussian states on m modes; region = first 2 modes (site 0)
ew1 = rng.random(m); ew2 = rng.random(m)
Q1 = np.linalg.qr(rng.standard_normal((m, m)) + 1j * rng.standard_normal((m, m)))[0]
Q2 = np.linalg.qr(rng.standard_normal((m, m)) + 1j * rng.standard_normal((m, m)))[0]
Gp_full, Gw_full = (Q1 * ew1) @ Q1.conj().T, (Q2 * ew2) @ Q2.conj().T
rho_p, rho_w = gaussian_rho(Gp_full, m), gaussian_rho(Gw_full, m)
R = [0, 1]
Gp, Gw = Gp_full[R][:, R], Gw_full[R][:, R]
D_mb = np.real(np.trace(rho_p @ (logm(rho_p) - logm(rho_w))))  # no partial trace needed: m small = region
# full-system formula (region = everything) must equal the many-body value
D_f = qca.rel_entropy(Gp_full, Gw_full)["D"]
ok("V5 formula vs many-body (full)", abs(D_f - D_mb), 1e-10)

# region via partial trace: region = the two low modes (site 0)
def partial_trace_low(rho, k_keep, m_tot):
    """Trace out the high modes, keeping the low k_keep modes (LSBs)."""
    A = rho.reshape(2 ** (m_tot - k_keep), 2 ** k_keep, 2 ** (m_tot - k_keep), 2 ** k_keep)
    return np.einsum("aiaj->ij", A)

keep = 2
rp, rw = partial_trace_low(rho_p, keep, m), partial_trace_low(rho_w, keep, m)
D_mb_r = np.real(np.trace(rp @ (logm(rp) - logm(rw))))
D_f_r = qca.rel_entropy(Gp, Gw)["D"]
ok("V5 formula vs many-body (region)", abs(D_f_r - D_mb_r), 1e-10)

# ---- V6: Peschel h --------------------------------------------------------------
# -ln omega_R = sum_ij h_ij a_i^dag a_j + ln Z on the region modes, with
# h = ln((1-G_R)/G_R) in qca's G_ij = <a_j^dag a_i> convention, and
# ln Z = sum_i ln(1 + e^{-h_i}). (Orientation fixed by this brute force.)
eww, QQ = np.linalg.eigh(Gw)
h = QQ @ np.diag(np.log((1 - eww) / eww)) @ QQ.conj().T
K_mb = -logm(rw)
H_f = quadratic(h, keep)  # region has `keep` modes
lnZ = np.sum(np.log(1 + np.exp(-np.log((1 - eww) / eww))))
ok("V6 -ln omega_R - (a^dag h a + ln Z)", np.abs(K_mb - (H_f + lnZ * np.eye(2 ** keep))).max(), 1e-10)

# ---- V7: E2 identity -------------------------------------------------------------
S_p = qca.entropy(np.linalg.eigvalsh(Gp))
S_w = qca.entropy(np.linalg.eigvalsh(Gw))
DK = np.real(np.trace((Gp - Gw) @ h))
ok("V7 D - (Delta<K> - Delta S)", abs(D_f_r - (DK - (S_p - S_w))), 1e-10)

# ---- V8: stationarity -------------------------------------------------------------
Vb, omb, _ = qca.bands(64, 0.4)
gv = qca.vacuum_band(omb)
Gr = (Vb * gv) @ Vb.conj().T
ok("V8 vacuum projector", np.abs(Gr @ Gr - Gr).max(), 1e-12)
W64 = qca.walk(64, 0.4)
ok("V8 vacuum stationary", np.abs(W64 @ Gr @ W64.conj().T - Gr).max(), 1e-12)
gt = qca.thermal_band(omb, 2.0)
Gt = (Vb * gt) @ Vb.conj().T
ok("V8 thermal stationary", np.abs(W64 @ Gt @ W64.conj().T - Gt).max(), 1e-12)
ok("V8 null D(omega||omega) [f64 floor, 80 modes]", abs(qca.null_level(Gr[:80, :80])["D"]), 1e-9)

# ---- V9: Arb region vacuum agrees with the f64 one ------------------------------
sites = list(range(10, 30))
Gw_arb = qca.region_vacuum_arb(sites, 64, 0.4, dps=80)
Gw_f64 = qca.restrict(np.diag(qca.vacuum_band(omb)), Vb, sites)
diff = max(abs(complex(Gw_arb[i, j].real.mid()) + 1j * float(Gw_arb[i, j].imag.mid())
               - Gw_f64[i, j]) for i in range(40) for j in range(40))
ok("V9 Arb vs f64 region vacuum", diff, 1e-13)
_, rad = qca.acb_mid_rad(Gw_arb[0, 1])
print(f"V9 sample entry radius: {rad:.2e}")

# ---- V10: certified pipeline vs brute force with a vacuum reference -------------
# 10-site ring (20 modes, Fock dim 2^20), region = sites {0..3} (8 modes):
# 2*len(region) < N so the restricted vacuum is strictly full rank (smaller
# rings force exact 0/1 eigenvalues and D = +∞). The vacuum and packet state
# are pure Slater determinants; the region states come from an exact partial
# trace and D from exact matrix logs.
n10, th10 = 10, 0.4
V10, om10, ks10 = qca.bands(n10, th10)
gw10_band = np.diag(qca.vacuum_band(om10))
ph10 = qca.packet_band(om10, ks10, 0.9, 0.8, 2.0)
Gp10_band = gw10_band + np.outer(ph10, ph10.conj())

def apply_cre(u, psi, m):
    """Apply a^dag(u) = sum_i conj(u_i) a_i^dag to a Fock vector."""
    D = len(psi)
    occ = np.arange(D)
    out = np.zeros(D, dtype=complex)
    for i in range(m):
        bit = 1 << i
        sel = (occ & bit) == 0
        tgt = occ[sel] | bit
        cnt = np.bitwise_count(occ[sel] & (bit - 1))
        sgn = np.where(cnt & 1, -1, 1)  # uint8 arithmetic would wrap: use int
        out[tgt] += sgn * np.conj(u[i]) * psi[sel]
    return out

m10 = 2 * n10
psi = np.zeros(1 << m10)
psi[0] = 1.0
for f in range(m10):
    if om10[f] < 0:
        psi = apply_cre(V10[:, f], psi, m10)
psi_w = psi / np.linalg.norm(psi)
u_p = V10 @ ph10
psi_p = apply_cre(u_p, psi_w, m10)
psi_p /= np.linalg.norm(psi_p)

def region_rho(psi, nreg_modes):
    """Partial trace over the high modes, keeping the low nreg_modes bits."""
    hi = m10 - nreg_modes
    P = psi.reshape(1 << hi, 1 << nreg_modes)
    return P.T @ P.conj()

rp10, rw10 = region_rho(psi_p, 8), region_rho(psi_w, 8)
D_mb_r = np.real(np.trace(rp10 @ (logm(rp10) - logm(rw10))))
Gp10 = qca.restrict(Gp10_band, V10, [0, 1, 2, 3])
corr_rp = np.einsum("xy,ijyx->ij", rp10, number_ops(8))  # <a_i^dag a_j>
ok("V10 region correlation vs brute force", np.abs(corr_rp - Gp10).max(), 1e-12)
ref10 = qca.vac_ref_prep(4, n10, th10, dps=60)
S_p10 = qca.entropy(np.linalg.eigvalsh(Gp10))
D_cert = qca.acb_mid_rad(qca.rel_entropy_vac(Gp10, ref10, S_p_f64=S_p10, dps=60))
ok("V10 certified vs many-body (region)", abs(D_cert[0] - D_mb_r), 1e-8)
print(f"V10 certified D = {D_cert[0]:.12f} +-{D_cert[1]:.0e}, many-body = {D_mb_r:.12f}")

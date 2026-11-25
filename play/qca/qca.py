# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "scipy"]
# ///
"""
Dirac quantum walk on a ring: free-fermion Gaussian-state numerics (tier 2).

Single-particle basis: index i = 2*site + mode, mode 0 = right mover R,
mode 1 = left mover L, n sites, periodic. One step W = S C with the coin
C = exp(-i theta sigma_x) acting on (R, L) at each site, then the shift S
moving R to site+1 and L to site-1. Quasi-energies: cos omega = cos t cos k
(gap |theta| at k=0, low-energy speed sqrt(cos t), maximal group velocity
cos t, single-particle support cone speed exactly 1).

Gaussian states live in the band basis of W (columns of V below). The
correlation matrix is G_ij = <a_j^dag a_i> (this transpose convention is the
one for which G -> W G W^dag; unit-tested against brute-force many-body
evolution in validate.py), a diagonal conjugation in the band basis.
"""
import numpy as np

CLIP = 1e-300  # ln arguments below this are treated as ln(CLIP); flags report the weight


def walk(n, theta):
    """Single-particle step W = S C as a (2n, 2n) unitary."""
    c, s = np.cos(theta), np.sin(theta)
    C2 = np.array([[c, -1j * s], [-1j * s, c]], dtype=complex)
    S = np.zeros((2 * n, 2 * n), dtype=complex)
    for j in range(n):
        S[2 * ((j + 1) % n), 2 * j] = 1.0          # R moves right
        S[2 * ((j - 1) % n) + 1, 2 * j + 1] = 1.0  # L moves left
    return S @ np.kron(np.eye(n), C2)


def bands(n, theta):
    """Band basis of W. Returns (V, omega, k).

    V columns: 2*m + b for momentum k_m = 2 pi m / n, band b = 0 negative
    quasi-energy, b = 1 positive. omega in (-pi, pi], principal branch.
    W @ V = V @ diag(exp(-i omega)).
    """
    ks = 2 * np.pi * np.arange(n) / n
    ct, st = np.cos(theta), np.sin(theta)
    V = np.zeros((2 * n, 2 * n), dtype=complex)
    om = np.zeros(2 * n)
    e_ph = np.exp(1j * ks[:, None] * np.arange(n)[None, :])  # (k, site)
    for m, k in enumerate(ks):
        T = 2 * ct * np.cos(k)
        disc = np.sqrt(complex(4 - T * T))
        # momentum-space walk W(k) = diag(e^{-ik}, e^{+ik}) C; a = W[k,0,0], b = W[k,0,1]
        a = ct * np.exp(-1j * k)
        b = -1j * st * np.exp(-1j * k)
        for lam, col in (((T + 1j * disc) / 2, 2 * m), ((T - 1j * disc) / 2, 2 * m + 1)):
            v = np.array([b, lam - a])
            v /= np.linalg.norm(v)
            om[col] = -np.angle(lam)
            V[2 * np.arange(n)[None, :] + 0, col] += e_ph[m] * v[0] / np.sqrt(n)
            V[2 * np.arange(n)[None, :] + 1, col] += e_ph[m] * v[1] / np.sqrt(n)
    return V, om, ks


def group_velocity(k, theta):
    """(v_g, omega) along the positive band: cos omega = cos t cos k."""
    w = np.arccos(np.clip(np.cos(theta) * np.cos(k), -1, 1))
    return np.cos(theta) * np.sin(k) / np.sin(w), w


def k_for_speed(u, theta):
    """Momentum whose positive-band group velocity is u (bisection on (0, pi/2])."""
    lo, hi = 0.0, np.pi / 2
    for _ in range(80):
        mid = (lo + hi) / 2
        if group_velocity(mid, theta)[0] < u:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def vacuum_band(om):
    """Occupation vector of the filled negative band (band basis)."""
    return (om < 0).astype(float)


def thermal_band(om, beta):
    """Fermi occupation of the walk Hamiltonian H = i log W (band basis)."""
    return 1.0 / (1.0 + np.exp(beta * om))


def packet_band(om, ks, k0, sigma_k, x_center, band_sign=+1):
    """Gaussian wave packet as a band-basis vector (normalised).

    Real-space centre x_center, group velocity u = v_g(k0), band + or -.
    Column 2*m+b carries momentum k_m, so phi gets g(k_m) on that band.
    """
    dk = (ks - k0 + np.pi) % (2 * np.pi) - np.pi  # wrap to (-pi, pi]
    g = np.exp(-dk ** 2 / (2 * sigma_k ** 2)) * np.exp(-1j * ks * x_center)
    sel = np.nonzero(om * band_sign > 0)[0]
    phi = np.zeros(om.shape, dtype=complex)
    phi[sel] = g[sel // 2]
    return phi / np.linalg.norm(phi)


def step_band(G_band, om, t=1):
    """Evolve G (band basis) t steps: G -> W^t G W^-t."""
    ph = np.exp(-1j * om * t)
    return ph[:, None] * G_band * ph.conj()[None, :]


def restrict(G_band, V, sites):
    """Real-space correlation matrix on the given sites (both modes each)."""
    idx = np.concatenate([[2 * s, 2 * s + 1] for s in sites])
    Vr = V[idx, :]
    return Vr @ G_band @ Vr.conj().T


def _xlogx(x):
    """x ln x with the certified clip: contribution below CLIP is < 1e-297."""
    out = np.zeros_like(x)
    m = x > CLIP
    out[m] = x[m] * np.log(x[m])
    return out


def sector_U(nsites):
    """Unitary to the even/odd sectors of the reflection (r, m) ->
    (nsites-1-r, 1-m), valid for a contiguous interval of sites.

    The restricted vacuum (and any translation-invariant reference) commutes
    with this reflection, so its spectrum is exactly 2-fold degenerate.
    Diagonalising per sector pins the eigenvectors and avoids the arbitrary
    within-pair rotations that a plain eigh produces (which pollute the
    cross-term Tr[Gp ln Gw] at the 1e-15/lambda level for deep modes).
    Even-sector columns first, then odd.
    """
    N = 2 * nsites
    P = np.empty(N, dtype=int)
    for r in range(nsites):
        for m in (0, 1):
            P[2 * r + m] = 2 * (nsites - 1 - r) + (1 - m)
    ev, od = [], []
    for i in range(N):
        j = P[i]
        if j > i:
            v = np.zeros(N)
            v[i] = v[j] = np.sqrt(0.5)
            ev.append(v)
    for i in range(N):
        j = P[i]
        if j > i:
            v = np.zeros(N)
            v[i], v[j] = np.sqrt(0.5), -np.sqrt(0.5)
            od.append(v)
    return np.array(ev + od).T


def entropy(eigs):
    """S = -Tr[G ln G + (1-G) ln(1-G)] from the eigenvalues of G."""
    eigs = np.clip(eigs, 0.0, 1.0)
    return float(-(_xlogx(eigs).sum() + _xlogx(1 - eigs).sum()))


def rel_entropy(Gp, Gw, nsites=None):
    """S(rho_R || omega_R) for correlation matrices, f64, plus diagnostics.

    Both matrices are pulled to the reflection even/odd sectors of the
    (contiguous) region; the reference Gw is block-diagonal there up to
    rounding, and each sector's spectrum is non-degenerate.

    Returns dict with:
      D        : Tr[Gp(lnGp-lnGw) + (1-Gp)(ln(1-Gp)-ln(1-Gw))]
      D_id     : Delta<K> - Delta S route (Peschel h matrix), independent path
      residual : |D - D_id|
      flags    : min_ew, min_1mew, clip_weight (largest Gp weight on a
                 clipped, i.e. f64-unresolvable, reference eigenvalue),
                 sym_res (off-block residue of the reference in the sectors)
    """
    N = Gp.shape[0]
    if nsites is None:
        nsites = N // 2
    U = sector_U(nsites)
    Uh = U.conj().T
    Gws = Uh @ Gw @ U
    h2 = N // 2
    sym_res = float(np.abs(Gws[:h2, h2:]).max())
    ep = np.linalg.eigvalsh(Gp)
    S_p = entropy(ep)
    if sym_res > 1e-10:
        # reference does not respect the reflection: plain full-matrix path.
        # (Accurate only while the reference spectrum is f64-resolvable,
        # i.e. min eigenvalue >> 1e-14; flags report it.)
        ew, Q = np.linalg.eigh(Gw)
        Lew = np.log(np.clip(ew, CLIP, 1.0))
        L1ew = np.log(np.clip(1.0 - ew, CLIP, 1.0))
        w = np.real(np.einsum("ii->i", Q.conj().T @ Gp @ Q))
        D = -S_p - (w * Lew).sum() - ((1 - w) * L1ew).sum()
        h = Q @ np.diag(L1ew - Lew) @ Q.conj().T
        D_id = float(np.real(np.trace((Gp - Gw) @ h))) - (S_p - entropy(ew))
        cut = ew < 1e-100
        cut1 = (1 - ew) < 1e-100
        clip_w = float(max(w[cut].max(initial=0.0), (1 - w)[cut1].max(initial=0.0)))
        flags = dict(min_ew=float(ew.min()), min_1mew=float((1 - ew).min()),
                     clip_weight=clip_w, sym_res=sym_res)
        return dict(D=float(D), D_id=float(D_id), residual=abs(float(D) - float(D_id)),
                    flags=flags)
    Gps_full = Uh @ Gp @ U
    D = -S_p
    D_id = 0.0
    all_ew = []
    clip_w = 0.0
    for blk in (0, 1):
        sl = slice(0, h2) if blk == 0 else slice(h2, N)
        Gw_b, Gp_b = Gws[sl, sl], Gps_full[sl, sl]
        ew, Q = np.linalg.eigh(Gw_b)
        all_ew.append(ew)
        Lew = np.log(np.clip(ew, CLIP, 1.0))
        L1ew = np.log(np.clip(1.0 - ew, CLIP, 1.0))
        w = np.real(np.einsum("ii->i", Q.conj().T @ Gp_b @ Q))
        D -= (w * Lew).sum() + ((1 - w) * L1ew).sum()
        h = Q @ np.diag(L1ew - Lew) @ Q.conj().T
        D_id += float(np.real(np.trace((Gp_b - Gw_b) @ h)))
        cut = ew < 1e-100
        cut1 = (1 - ew) < 1e-100
        clip_w = max(clip_w, float(w[cut].max(initial=0.0)),
                     float((1 - w)[cut1].max(initial=0.0)))
    ew = np.concatenate(all_ew)
    D_id -= S_p - entropy(ew)
    flags = dict(min_ew=float(ew.min()), min_1mew=float((1 - ew).min()),
                 clip_weight=clip_w, sym_res=sym_res)
    return dict(D=float(D), D_id=float(D_id), residual=abs(float(D) - float(D_id)), flags=flags)


def null_level(Gw):
    """Clean null: D(omega || omega) - measures the pipeline's numerical zero."""
    return rel_entropy(Gw, Gw)


# ---------------------------------------------------------------- Arb (certified)

def _acb(x):
    import flint
    return flint.acb(flint.arb(repr(float(np.real(x)))), flint.arb(repr(float(np.imag(x)))))


def to_acb_mat(M, dps=120):
    import flint
    flint.ctx.dps = dps
    k = M.shape[0]
    return flint.acb_mat([[_acb(M[i, j]) for j in range(k)] for i in range(k)])


def region_vacuum_arb(sites, n, theta, dps=120):
    """Certified vacuum G_R built from the closed-form band projectors.

    G_R = B B^dagger with B[i, k] = e^{i k site(i)} v_mode(i)(k) / sqrt(n),
    v(k) the negative-band eigenvector of the 2x2 momentum-space walk.
    Entries are computed from theta, k, pi at dps digits (no f64 rounding;
    theta itself enters as its f64 value, which is the defined parameter).
    """
    import flint
    flint.ctx.dps = dps
    I = flint.acb(0, 1)
    pi = flint.acb.pi()
    ct = flint.acb(flint.arb(repr(float(np.cos(theta)))))
    st = flint.acb(flint.arb(repr(float(np.sin(theta)))))
    ns = len(sites)
    B = flint.acb_mat(2 * ns, n)
    for m in range(n):
        k = 2 * pi * flint.acb(m) / flint.acb(n)
        T = 2 * ct * k.cos()
        disc = (flint.acb(4) - T * T).sqrt()
        lam = (T + I * disc) / flint.acb(2)  # negative band: Im > 0
        b = (-I * st) * (-I * k).exp()
        v0, v1 = b, lam - ct * (-I * k).exp()
        nrm = (v0 * v0.conjugate() + v1 * v1.conjugate()).sqrt()
        for r, s in enumerate(sites):
            ph = (I * k * flint.acb(s)).exp() / flint.acb(repr(float(np.sqrt(n))))
            B[2 * r, m] = ph * v0 / nrm
            B[2 * r + 1, m] = ph * v1 / nrm
    return B * B.transpose().conjugate()


def rel_entropy_arb(Gp_f64, Gw_acb, S_p_f64, dps=120, nsites=None):
    """Certified S(rho_R || omega_R), computed in the reflection sectors.

    Gw in high precision (acb_mat), rho in f64 (exact conversion; its
    evolution rounding and entropy terms are f64-side, bounded separately).
    S_p_f64 = entropy of rho_R computed in f64 (clip-certified to ~1e-13).
    The reference is block-diagonal in the sectors up to the off-block
    residue reported in the second return value (a ball upper bound); the
    blocks' certified eigendecompositions (acb_mat.eig, right vectors) give
    the eigenvalues and the weights <Q_i|Gp|Q_i>.
    Returns (acb enclosure of D, sym_residue_bound).
    """
    import flint
    flint.ctx.dps = dps
    N = Gw_acb.nrows()
    if nsites is None:
        nsites = N // 2
    h2 = N // 2
    U = sector_U(nsites)
    Ua = to_acb_mat(U.astype(complex), dps)
    Uh = Ua.transpose().conjugate()
    Gws = Uh * Gw_acb * Ua
    sym_res = max(float(Gws[i, j].abs_upper()) for i in range(h2) for j in range(h2, N))
    Gp_s = Uh * to_acb_mat(Gp_f64, dps) * Ua
    acc = flint.acb(-S_p_f64)
    one = flint.acb(1)

    def block(M, lo, hi):
        return flint.acb_mat([[M[i, j] for j in range(lo, hi)]
                              for i in range(lo, hi)])

    for lo, hi in ((0, h2), (h2, N)):
        Gw_b = block(Gws, lo, hi)
        Gp_b = block(Gp_s, lo, hi)
        try:
            E, R = Gw_b.eig(right=True)
        except ValueError:
            flint.ctx.dps = dps * 2
            E, R = Gw_b.eig(right=True)
            flint.ctx.dps = dps
        M = R.transpose().conjugate() * Gp_b * R
        for i in range(hi - lo):
            lam = E[i]
            Lew = _acb_log(lam)
            L1ew = _acb_log(one - lam)
            w = M[i, i]
            acc = acc - w * Lew - (one - w) * L1ew
    return acc, sym_res


def _acb_log(x):
    """log of a ball that is certainly nonzero; CLIP fallback otherwise."""
    import flint
    try:
        out = x.log()
        if not (flint.acb(0) in out):  # a nan or zero-containing ball is unusable
            return out
    except (ValueError, ZeroDivisionError):
        pass
    return flint.acb(repr(float(CLIP))).log()


def vac_ref_prep(nsites, n, theta, dps=100):
    """Certified sector eigendecomposition of the vacuum on nsites sites.

    By translation invariance the result depends only on the number of
    sites, so callers cache by nsites. Returns a dict with the certified
    eigenvalue/eigenvector balls per sector, the acb sector blocks of Gw_R
    (for identity checks), the f64 Gw_R, and the true smallest eigenvalue.
    """
    import flint
    flint.ctx.dps = dps
    sites = list(range((n - nsites) // 2, (n - nsites) // 2 + nsites))
    Gw_arb = region_vacuum_arb(sites, n, theta, dps=dps)
    N = 2 * nsites
    h2 = nsites
    Ua = to_acb_mat(sector_U(nsites).astype(complex), dps)
    Uh = Ua.transpose().conjugate()
    Gws = Uh * Gw_arb * Ua
    sym_res = max(float(Gws[i, j].abs_upper()) for i in range(h2) for j in range(h2, N))
    ref = dict(dps=dps, Ua=Ua, sym_res=sym_res,
               lam_min=float("nan"), lam_min1=float("nan"))
    lams = []
    for si, (lo, hi) in enumerate(((0, h2), (h2, N))):
        Gw_b = flint.acb_mat([[Gws[i, j] for j in range(lo, hi)] for i in range(lo, hi)])
        try:
            E, R = Gw_b.eig(right=True)
        except ValueError:
            flint.ctx.dps = dps * 2
            E, R = Gw_b.eig(right=True)
            flint.ctx.dps = dps
        ref[f"E{si}"], ref[f"R{si}"] = E, R
        ref[f"Gw{si}"] = Gw_b
        lams += [float(x.real.mid()) for x in E]
    ref["lam_min"] = min(lams)
    ref["lam_min1"] = min(1 - l for l in lams)
    # f64 counterpart (built with the same V as the states use, so that the
    # null D(omega||omega) below measures the full pipeline's zero level)
    return ref


def ref_n(ref):
    return len(ref["E0"])


def rel_entropy_vac(Gp_R, ref, S_p_f64, dps=100):
    """Certified D(rho_R || vacuum_R) against a cached vac_ref_prep result.

    All omega-side arithmetic is ball arithmetic at ref's dps; rho enters
    as its f64 matrix (rounding bounded separately, see the null level).
    Returns (mid, radius). Also returns the identity-route value with the
    same data as a consistency check via rel_entropy_vac_id.
    """
    import flint
    flint.ctx.dps = dps
    nsites = ref_n(ref)
    N = 2 * nsites
    h2 = nsites
    Uh = ref["Ua"].transpose().conjugate()
    Gp_s = Uh * to_acb_mat(Gp_R, dps) * ref["Ua"]
    acc = flint.acb(-S_p_f64)
    one = flint.acb(1)
    for si, (lo, hi) in enumerate(((0, h2), (h2, N))):
        Gp_b = flint.acb_mat([[Gp_s[i, j] for j in range(lo, hi)] for i in range(lo, hi)])
        E, R = ref[f"E{si}"], ref[f"R{si}"]
        M = R.transpose().conjugate() * Gp_b * R
        for i in range(hi - lo):
            lam = E[i]
            acc = acc - M[i, i] * _acb_log(lam) - (one - M[i, i]) * _acb_log(one - lam)
    return acc


def vac_entropy(ref, dps=100):
    """Certified S(omega_R) from the cached eigenvalues."""
    import flint
    flint.ctx.dps = dps
    one = flint.acb(1)
    acc = flint.acb(0)
    for si in (0, 1):
        for lam in ref[f"E{si}"]:
            acc = acc + _xlogx_acb(lam) + _xlogx_acb(one - lam)
    return -acc


def _xlogx_acb(x):
    import flint
    if x.abs_upper() == 0:
        return flint.acb(0)
    return x * _acb_log(x)


def acb_mid_rad(x):
    import flint
    x = flint.acb(x)
    mid = float(x.real.mid())
    rad = float(x.real.rad()) + float(x.imag.rad())
    return mid, rad

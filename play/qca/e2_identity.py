# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "scipy", "python-flint"]
# ///
"""
E2 (the rate): check D(rho_R || omega_R) = Delta<K_R> - Delta S_R numerically,
with Delta taken between rho and omega on the same region.

Conventions are brute-force verified against many-body physics in
validate.py (V6: K = a^dag h a + ln Z with h = ln((1-G)/G); V7: the
identity itself on a small system). Here the identity is checked along the
E1 trajectories with certified arithmetic on the vacuum side:

  Delta<K>  = Tr[(Gp - Gw) h],  h = ln((1-Gw)/Gw) from the same certified
             sector eigendecomposition (Arb balls, dps 100)
  Delta S   = S(rho_R) - S(omega_R), the latter certified (vac_entropy)
  D         = certified relative entropy (rel_entropy_vac)

The two sides share the eigendecomposition, so this is a consistency check
of the certified assembly; the convention-level proof is V7. For the
thermal reference (spectrum f64-resolvable) the identity is checked with
two fully independent f64 routes and that residual is quoted from the E1
run (residual_max of the thermal configs).

Output: play/qca/results/e2_identity.json plus printed residuals.
"""
import json
import os
import numpy as np
import qca
from e1_arrow import region, quench_band, VacRef, DPS


def identity_check(Gp_R, ref, S_p, dps=DPS):
    """Certified D and Delta<K> - Delta S for one region state."""
    import flint
    flint.ctx.dps = dps
    nsites = ref_n = len(ref["E0"])
    N = 2 * nsites
    h2 = nsites
    Uh = ref["Ua"].transpose().conjugate()
    Gp_s = Uh * qca.to_acb_mat(Gp_R, dps) * ref["Ua"]
    one = flint.acb(1)
    DK = flint.acb(0)
    for si, (lo, hi) in enumerate(((0, h2), (h2, N))):
        Gp_b = flint.acb_mat([[Gp_s[i, j] for j in range(lo, hi)] for i in range(lo, hi)])
        Gw_b = ref[f"Gw{si}"]
        E, R = ref[f"E{si}"], ref[f"R{si}"]
        # Tr[(Gp-Gw) h] = Tr[(R^dag (Gp-Gw) R) diag(ln((1-L)/L))]
        M = R.transpose().conjugate() * (Gp_b - Gw_b) * R
        heig = [qca._acb_log(one - E[i]) - qca._acb_log(E[i]) for i in range(hi - lo)]
        tr = flint.acb(0)
        for i in range(hi - lo):
            tr = tr + M[i, i] * heig[i]
        DK = DK + tr
    S_w = qca.vac_entropy(ref, dps=dps)
    D = qca.rel_entropy_vac(Gp_R, ref, S_p, dps=dps)
    rhs = DK + S_w - flint.acb(S_p)   # Delta<K> - Delta S = DK - (S_p - S_w)
    return D, rhs


def main():
    rng = np.random.default_rng(14)
    n, theta = 512, 0.4
    a0, b0 = 216, 275
    V, om, ks = qca.bands(n, theta)
    gw_band = np.diag(qca.vacuum_band(om))
    vacref = VacRef(n, theta, V, gw_band)
    u_max = np.cos(theta)
    k_max = qca.k_for_speed(u_max * (1 - 1e-12), theta)
    sig = 0.22
    phi = qca.packet_band(om, ks, +k_max, sig, a0 - 4)
    states = {
        "packet": gw_band + np.outer(phi, phi.conj()),
        "quench": quench_band(V, gw_band, list(range(a0 - 3, a0 + 3)), rng),
    }
    checks = []
    for v in (0.0, 0.5, 0.95, 1.0):
        T = 60 if v == 0 else int(25 / v)
        for name, G0 in states.items():
            for t in (0, T // 3, 2 * T // 3, T):
                sites = region("shrinking", v, t, (a0, b0), 40, n)
                if not (10 <= len(sites) <= 62):
                    continue
                ph = np.exp(-1j * om * t)
                Gt = ph[:, None] * G0 * ph.conj()[None, :]
                Gp_R = qca.restrict(Gt, V, sites)
                S_p = qca.entropy(np.linalg.eigvalsh(Gp_R))
                ref = vacref.prep(len(sites))
                D, rhs = identity_check(Gp_R, ref, S_p)
                d_mid, d_rad = qca.acb_mid_rad(D)
                r_mid, r_rad = qca.acb_mid_rad(rhs)
                checks.append(dict(v=v, state=name, t=t, n_sites=len(sites),
                                   D=d_mid, D_rad=d_rad, rhs=r_mid, rhs_rad=r_rad,
                                   residual=abs(d_mid - r_mid)))
            print(f"v={v} {name}: max residual so far "
                  f"{max(c['residual'] for c in checks):.2e}", flush=True)
    res_max = max(c["residual"] for c in checks)
    rad_max = max(c["D_rad"] + c["rhs_rad"] for c in checks)
    e1 = json.load(open("results/e1_arrow.json"))
    thermal_res = max(r["residual_max"] for r in e1["results"] if "reference" in r)
    print(f"\nE2 vacuum (certified, dps={DPS}): max |D - (Delta<K> - Delta S)| "
          f"over {len(checks)} checks: {res_max:.2e} (ball radii sum <= {rad_max:.2e})")
    print(f"E2 thermal (f64, two independent routes): max residual {thermal_res:.2e}")
    os.makedirs("results", exist_ok=True)
    with open("results/e2_identity.json", "w") as f:
        json.dump(dict(dps=DPS, checks=checks, residual_max=res_max,
                       thermal_f64_residual_max=thermal_res), f, indent=1)


if __name__ == "__main__":
    main()

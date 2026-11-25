# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "scipy", "python-flint"]
# ///
"""
E1 (the arrow): relative entropy D(t) = S(rho_t|R_t || omega|R_t) for a
Dirac quantum walk on a ring, against moving walls.

Theory under test (issue #14, exploratory): if R_{t+1} lies inside the
domain of dependence of R_t (walls recede at >= the cone speed 1), D never
increases (data processing + locality); for slower walls it can.

Region kinds (walls move by floor(vt) in total):
  shrinking   [a0+floor(vt), b0-floor(vt)]   walls recede inwards
  translating [a0+floor(vt), a0+floor(vt)+L0w-1]  window slides at v
  growing     [g0-floor(vt), g0+L0w-1+floor(vt)]  walls move outwards

States (vacuum reference), all disturbances placed to hit the LEFT wall:
  packet  one positive-band Gaussian packet 4 sites outside the left wall,
           moving in at the maximal group velocity u = cos(theta) = 0.921
  quench   Haar single-particle unitary on 6 sites straddling the left
           wall (its correlations carry components at every speed up to
           the strict cone speed 1)
  two      counter-propagating packets at u = cos(theta) entering both
           walls

Catch geometry (reported per run): a packet catches a shrinking wall at
t_catch = d/(u - v) and the region survives t_alive = (L0/2 - 5)/v, so the
maximal-velocity front can only reach walls with v < u AND t_catch within
the run; for v in (cos(theta), 1) no wave packet can ever catch - any rise
there must come from the quench's cone-speed-1 front and should be
exponentially small but need not vanish. At v >= 1 the theorem forbids any
rise.

Numerics: the restricted vacuum spectrum piles up exponentially near 0 and
1 (measured here: lambda_min ~ 1e-25 for 40 sites at theta = 0.4), far
below f64 resolution, while the excited states put non-negligible weight
on those modes - so the vacuum-reference D is computed in certified ball
arithmetic (python-flint/Arb, dps = 100): the region vacuum is rebuilt
exactly from the closed-form band projectors, split into the reflection
even/odd sectors (each non-degenerate), and eigendecomposed with certified
enclosures (vac_ref_prep, cached per region length - translation invariance
leaves ~26 distinct regions). rho's correlation matrix is evolved in f64
(error ~1e-15 per entry) and its entropy is f64 with the certified clip
bound; the clean null D(omega||omega) through the same pipeline measures
the combined zero level, which sets the tolerance. The thermal reference
(beta = 2) has its restricted spectrum bounded away from 0/1 (interlacing:
within [f(pi-theta), f(theta)] ~ [0.004, 0.996]), so that run is pure f64
with the two independent routes as a residual.

Output: play/qca/results/e1_arrow.json plus a printed table.
"""
import json
import os
import numpy as np
import qca

OUT = "results/e1_arrow.json"
DPS = 100


def haar(k, rng):
    z = rng.standard_normal((k, k)) + 1j * rng.standard_normal((k, k))
    q, r = np.linalg.qr(z)
    return q @ np.diag(np.diag(r) / np.abs(np.diag(r)))


def quench_band(V, gw_band, window_sites, rng):
    """Haar single-particle unitary on the window's modes, in band basis."""
    n2 = V.shape[0]
    idx = np.concatenate([[2 * s, 2 * s + 1] for s in window_sites])
    U = np.eye(n2, dtype=complex)
    U[np.ix_(idx, idx)] = haar(len(idx), rng)
    G_rs = V @ gw_band @ V.conj().T
    return V.conj().T @ (U @ G_rs @ U.conj().T) @ V


def region(kind, v, t, base, L0w, n):
    a0, b0 = base
    if kind == "shrinking":
        return list(range(a0 + int(v * t), b0 - int(v * t) + 1))
    if kind == "translating":
        s = a0 + int(v * t)
        return list(range(s, s + L0w))
    if kind == "growing":
        return list(range(a0 - int(v * t), b0 + int(v * t) + 1))
    raise ValueError(kind)


class VacRef:
    """Certified vacuum reference, cached by region length."""

    def __init__(self, n, theta, V, gw_band, dps=DPS):
        self.n, self.theta, self.V, self.gw_band, self.dps = n, theta, V, gw_band, dps
        self.cache = {}

    def prep(self, nsites):
        if nsites not in self.cache:
            ref = qca.vac_ref_prep(nsites, self.n, self.theta, dps=self.dps)
            sites = list(range((self.n - nsites) // 2, (self.n - nsites) // 2 + nsites))
            Gw_f64 = qca.restrict(self.gw_band, self.V, sites)
            S_p = qca.entropy(np.linalg.eigvalsh(Gw_f64))
            D_null = qca.rel_entropy_vac(Gw_f64, ref, S_p, dps=self.dps)
            ref["Gw_f64"] = Gw_f64
            mid, rad = qca.acb_mid_rad(D_null)
            ref["null_mid"], ref["null_rad"] = mid, rad
            self.cache[nsites] = ref
        return self.cache[nsites]

    def D(self, Gp_R, nsites):
        ref = self.prep(nsites)
        S_p = qca.entropy(np.linalg.eigvalsh(Gp_R))
        mid, rad = qca.acb_mid_rad(qca.rel_entropy_vac(Gp_R, ref, S_p, dps=self.dps))
        return mid, rad, ref["null_mid"], ref["null_rad"], ref["lam_min"]


def run_config(kind, v, name, G_band0, V, om, vacref, base, L0w, n, T):
    """Certified D(t) along the evolution; per-step radius and null level."""
    Ds, rads, nulls = [], [], []
    for t in range(T + 1):
        sites = region(kind, v, t, base, L0w, n)
        if len(sites) < 10 or len(sites) > 62:
            break
        ph = np.exp(-1j * om * t)
        Gt = ph[:, None] * G_band0 * ph.conj()[None, :]
        Gp_R = qca.restrict(Gt, V, sites)
        d, rad, null, null_rad, _ = vacref.D(Gp_R, len(sites))
        Ds.append(d)
        rads.append(rad)
        nulls.append(null)
    Ds = np.array(Ds)
    nulls, rads = np.array(nulls), np.array(rads)
    tol = max(1e-9, 20 * float(np.abs(nulls).max(initial=0)),
              20 * float(rads.max(initial=0)))
    inc = Ds[1:] - Ds[:-1] if len(Ds) > 1 else np.array([])
    return dict(kind=kind, v=v, state=name, T=int(len(Ds) - 1), D=Ds.tolist(),
                rad_max=float(rads.max(initial=0)), null_max=float(np.abs(nulls).max(initial=0)),
                tol=float(tol), n_increase=int((inc > tol).sum()),
                t_max_increase=int(np.argmax(inc)) + 1 if len(inc) else 0,
                max_increase=float(inc.max()) if len(inc) else 0.0,
                D0=float(Ds[0]))


def run_config_f64(kind, v, name, G_band0, V, om, gw_band, base, L0w, n, T):
    """f64 pipeline for references whose restricted spectrum is resolved."""
    Ds, res, nulls = [], [], []
    Gw_cache = {}
    for t in range(T + 1):
        sites = region(kind, v, t, base, L0w, n)
        if len(sites) < 10 or len(sites) > 70:
            break
        ph = np.exp(-1j * om * t)
        Gt = ph[:, None] * G_band0 * ph.conj()[None, :]
        Gp_R = qca.restrict(Gt, V, sites)
        key = (sites[0], sites[-1], len(sites))
        if key not in Gw_cache:
            Gw_cache[key] = qca.restrict(gw_band, V, sites)
        Gw_R = Gw_cache[key]
        r = qca.rel_entropy(Gp_R, Gw_R)
        Ds.append(r["D"])
        res.append(r["residual"])
        nulls.append(qca.null_level(Gw_R)["D"])
    Ds = np.array(Ds)
    nulls, res = np.array(nulls), np.array(res)
    tol = max(1e-9, 10 * float(nulls.max(initial=0)), 10 * float(res.max(initial=0)))
    inc = Ds[1:] - Ds[:-1] if len(Ds) > 1 else np.array([])
    return dict(kind=kind, v=v, state=name, T=int(len(Ds) - 1), D=Ds.tolist(),
                residual_max=float(res.max(initial=0)), null_max=float(nulls.max(initial=0)),
                tol=float(tol), n_increase=int((inc > tol).sum()),
                t_max_increase=int(np.argmax(inc)) + 1 if len(inc) else 0,
                max_increase=float(inc.max()) if len(inc) else 0.0,
                D0=float(Ds[0]))


def main():
    rng = np.random.default_rng(14)
    n, theta = 512, 0.4
    u_max = np.cos(theta)          # maximal group velocity (at k = pi/2)
    L0, a0, b0 = 60, 216, 275      # shrinking interval: 60 sites
    L0w = 40                       # translating window / growing base length
    d_gap = 4                      # packet starts this far outside the wall
    V, om, ks = qca.bands(n, theta)
    gw_band = np.diag(qca.vacuum_band(om))
    vacref = VacRef(n, theta, V, gw_band)
    k_max = qca.k_for_speed(u_max * (1 - 1e-12), theta)  # ~ pi/2
    sig = 0.22
    phi = qca.packet_band(om, ks, +k_max, sig, a0 - d_gap)
    p2 = qca.packet_band(om, ks, -k_max, sig, b0 + d_gap + 1)
    p2 = p2 - np.vdot(phi, p2) * phi
    p2 /= np.linalg.norm(p2)
    states = {
        "packet": gw_band + np.outer(phi, phi.conj()),
        "quench": quench_band(V, gw_band, list(range(a0 - 3, a0 + 3)), rng),
        "two": gw_band + np.outer(phi, phi.conj()) + np.outer(p2, p2.conj()),
    }
    bases = {"shrinking": (a0, b0), "translating": (a0, a0 + L0w - 1),
             "growing": (236, 236 + L0w - 1)}
    speeds = {"shrinking": [0.0, 0.25, 0.5, 0.75, 0.9, 0.95, 1.0, 1.5],
              "translating": [0.25, 0.5, 0.8, 0.9, 0.95, 1.0, 1.5],
              "growing": [0.25, 0.5]}
    T_of = {"shrinking": lambda v: 60 if v == 0 else int(25 / v),
            "translating": lambda v: 50,
            "growing": lambda v: int(10 / v)}
    results, arb = [], []
    for kind in ("shrinking", "translating", "growing"):
        for v in speeds[kind]:
            T = T_of[kind](v)
            for name, G0 in states.items():
                r = run_config(kind, v, name, G0, V, om, vacref, bases[kind], L0w, n, T)
                # catch geometry: packet front at u_max, gap d_gap from the wall
                if name in ("packet", "two"):
                    if kind == "growing":       # wall moves toward the packet
                        t_catch = d_gap / (u_max + v)
                    else:                       # wall recedes / window flees
                        t_catch = d_gap / (u_max - v) if v < u_max else float("inf")
                    r["t_catch"] = t_catch
                    r["catch"] = bool(t_catch <= r["T"])
                else:  # quench: disturbance sits on the wall from t = 0
                    r["t_catch"], r["catch"] = 0.0, True
                results.append(r)
                print(f"[{kind} v={v}] {name}: D0={r['D0']:.6f} "
                      f"n_inc={r['n_increase']} max_inc={r['max_increase']:.3e} "
                      f"tol={r['tol']:.1e} catch={r['catch']} "
                      f"t_catch={r['t_catch']:.1f}", flush=True)
                # independent full rebuild (no cache) at t=0 and the max step
                for t in sorted({0, min(r["t_max_increase"], r["T"])}):
                    sites = region(kind, v, t, bases[kind], L0w, n)
                    if not (10 <= len(sites) <= 62):
                        continue
                    ph = np.exp(-1j * om * t)
                    Gt = ph[:, None] * G0 * ph.conj()[None, :]
                    Gp_R = qca.restrict(Gt, V, sites)
                    ref = qca.vac_ref_prep(len(sites), n, theta, dps=DPS)
                    S_p = qca.entropy(np.linalg.eigvalsh(Gp_R))
                    d = qca.rel_entropy_vac(Gp_R, ref, S_p, dps=DPS)
                    mid, rad = qca.acb_mid_rad(d)
                    i = min(t, len(r["D"]) - 1)
                    arb.append(dict(kind=kind, v=v, state=name, t=t,
                                   D_run=r["D"][i], D_rebuild=mid, radius=rad,
                                   diff=abs(r["D"][i] - mid)))
    for nsites, ref in sorted(vacref.cache.items()):
        print(f"vacuum lambda_min at {nsites} sites: {ref['lam_min']:.3e} "
              f"(1-lambda)_min: {ref['lam_min1']:.3e}  null: {ref['null_mid']:.1e} "
              f"+-{ref['null_rad']:.0e}", flush=True)

    # larger f64 run with a thermal reference (spectrum bounded off 0/1)
    nT, betaT, L0T = 1024, 2.0, 60
    VT, omT, ksT = qca.bands(nT, theta)
    gwT_band = np.diag(qca.thermal_band(omT, betaT))
    a0T, b0T = nT // 2 - L0T // 2, nT // 2 + L0T // 2 - 1
    phiT = qca.packet_band(omT, ksT, qca.k_for_speed(0.8, theta), sig, a0T - 10)
    vvec = (1 - qca.thermal_band(omT, betaT)) * phiT
    vvec /= np.linalg.norm(vvec)
    GT_band = gwT_band + np.outer(vvec, vvec.conj())
    ev = np.linalg.eigvalsh(qca.restrict(GT_band, VT, list(range(a0T, b0T + 1))))
    print(f"thermal excited region eigs in [{ev.min():.4f}, {ev.max():.4f}]", flush=True)
    for v in (0.0, 0.5, 1.0):
        r = run_config_f64("shrinking", v, "packet@thermal", GT_band, VT, omT, gwT_band,
                          (a0T, b0T), L0T, nT, 40 if v == 0 else int(25 / v))
        r["reference"] = f"thermal beta={betaT} n={nT}"
        results.append(r)
        print(f"[thermal v={v}] D0={r['D0']:.6f} n_inc={r['n_increase']} "
              f"max_inc={r['max_increase']:.3e} tol={r['tol']:.1e}", flush=True)

    os.makedirs("results", exist_ok=True)
    with open(OUT, "w") as f:
        json.dump(dict(n=n, theta=theta, L0=L0, L0w=L0w, a0=a0, b0=b0, d_gap=d_gap,
                       u_max=u_max, cone_speed=1.0, dps=DPS, sigma_k=sig,
                       results=results, rebuild_checks=arb,
                       lam_min={k: r["lam_min"] for k, r in vacref.cache.items()},
                       null={k: [r["null_mid"], r["null_rad"]] for k, r in vacref.cache.items()}),
                  f, indent=1)

    print("\n=== E1 summary (shrinking walls, vacuum reference) ===")
    print(f"u_max = cos(theta) = {u_max:.4f}, cone speed 1")
    print(f"{'v':>5} {'state':>8} {'D(0)':>10} {'#inc':>5} {'max inc':>10} {'tol':>8} {'catch':>7} {'t_c':>7}")
    for r in results:
        if r["kind"] == "shrinking" and "reference" not in r:
            print(f"{r['v']:>5} {r['state']:>8} {r['D0']:>10.6f} {r['n_increase']:>5} "
                  f"{r['max_increase']:>10.3e} {r['tol']:>8.1e} "
                  f"{str(r['catch']):>7} {r['t_catch']:>7.1f}")
    print(f"\nrebuild checks: max |D_run - D_rebuild| = "
          f"{max(a['diff'] for a in arb):.1e} (max radius {max(a['radius'] for a in arb):.0e})")


if __name__ == "__main__":
    main()

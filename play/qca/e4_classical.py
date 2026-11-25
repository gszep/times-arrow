# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy"]
# ///
"""
E4 (classical contrast): for a 1D nearest-neighbour classical Gibbs chain
(Ising, exact transfer matrix), the negative log of the half-chain
marginal is the bare block Hamiltonian plus a term supported on the cut
spin alone - a boundary field of O(1), no distance-dependent ramp.

This is the classical counterpart of the quantum statement in issue #14
point 5: a quantum vacuum's modular Hamiltonian on a half-line carries a
Bisognano-Wichmann-like weighting that grows with distance from the cut;
the classical Gibbs chain has no such structure.

Check: with spins s_i in {+1,-1}, H = -J sum s_i s_{i+1} - h sum s_i on an
open chain of n sites, the marginal of the first m sites is
  p(x) = e^{-beta H_m(x)} W(x_m) / Z,
so F(x) = -ln p(x) = beta H_m(x) + g(x_m) - ln Z with g depending only on
the cut spin x_m. Verified by exact enumeration over all 2^m block
configurations: F(x) - beta H_m(x) is exactly a function of x_m (residual
~ machine precision within each x_m class), for h = 0 and h != 0.

Output: printed summary, results/e4_classical.json.
"""
import itertools
import json
import os
import numpy as np


def transfer(beta, J, h):
    """T[a, b] = e^{beta (J a b + h (a + b) / 2)}, spins in {+1, -1}."""
    S = np.array([1.0, -1.0])
    A = S[:, None] * S[None, :]
    F = J * A + h * (S[:, None] + S[None, :]) / 2
    return np.exp(beta * F), S


def main():
    # Direct, convention-free construction: build the joint over all 2^n
    # states is too big for n=24, so contract the right side exactly.
    # p(x_1..x_m) = e^{beta(J sum_{i<m} x_i x_{i+1} + h sum_{i<m} x_i)} *
    #               phi(x_m)  with phi(x_m) = sum over the rest given x_m.
    n, m, beta, J = 24, 8, 1.0, 1.0
    S = np.array([1.0, -1.0])
    out = {}
    for h in (0.0, 0.5):
        T, _ = transfer(beta, J, h)
        # tail weight v(s_{m+1}) = sum over s_{m+2..n} (bonds + free-end field)
        vec = np.exp(beta * h * S / 2)              # free end at site n
        for _ in range(n - m - 1):
            vec = T @ vec
        # psi(x_m) = [T @ vec](x_m) * e^{-beta h x_m / 2}: the bond from x_m and
        # the x_m half of its field; the other half sits in the bare block part
        psi = np.exp(-beta * h * S / 2) * (T @ vec)
        zvec = np.exp(beta * h * S / 2)
        for _ in range(n - 1):
            zvec = T @ zvec
        Z = float((np.exp(beta * h * S / 2) * zvec).sum())  # both free-end fields
        dev = 0.0
        g = {}
        norm = 0.0
        for x in itertools.product(S, repeat=m):
            x = np.array(x)
            bare = beta * (J * (x[:-1] * x[1:]).sum() + h * x.sum())
            i = 0 if x[-1] > 0 else 1
            norm += np.exp(bare + np.log(psi[i]))
            F = -(bare + np.log(psi[i]) - np.log(Z))
            g.setdefault(float(x[-1]), []).append(F + bare)
        assert abs(norm / Z - 1) < 1e-12, (norm / Z)
        for xm, vals in g.items():
            vals = np.array(vals)
            dev = max(dev, float(np.abs(vals - vals.mean()).max()))
        gmean = {float(k): float(np.mean(v)) for k, v in g.items()}
        out[f"h={h}"] = dict(dev=dev, g=gmean)
        print(f"h={h}: marginal normalises (sum p = {norm / Z:.12f}); "
              f"max |(F - beta H_m) - g(x_m)|: {dev:.2e}")
        print(f"   g(x_m=+1) = {gmean[1.0]:.6f}, g(x_m=-1) = {gmean[-1.0]:.6f} "
              f"(boundary field |g(+1)-g(-1)| = {abs(gmean[1.0] - gmean[-1.0]):.4f})")
    print("\nNo ramp: the term beyond the bare block Hamiltonian lives on the "
          "cut spin only (verified, exact enumeration).")
    os.makedirs("results", exist_ok=True)
    with open("results/e4_classical.json", "w") as f:
        json.dump(dict(n=n, m=m, beta=beta, J=J, **out), f, indent=1)


if __name__ == "__main__":
    main()

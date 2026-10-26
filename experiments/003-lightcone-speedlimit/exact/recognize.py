"""Bounded PSLQ search using BootLoops' headless gate (tools/ on PYTHONPATH).

Input: certify.py JSON on stdin. Output: search evidence, not equality proofs.
"""
import json
import sys

from mpmath import mp
from pslq_gate import members_audit, reverify, two_prec_stable


mp.dps = 220
data = json.load(sys.stdin)
assert min(v["accuracy_bits"] for v in data["values"].values()) > 700
values = {k: mp.mpf(v["search_midpoint"]) for k, v in data["values"].items()}
text = lambda x: mp.nstr(x, 210, strip_zeros=False)
slopes = {f"s{w}": mp.sqrt(mp.mpf(128 * (128 - 2*w)) / 256**2 * mp.log(mp.mpf(128-w)/w))
          for w in (5, 4, 8)}
bases = {
    "elementary": {"1": mp.mpf(1), "pi": mp.pi, "sqrt_pi": mp.sqrt(mp.pi),
                   "sqrt_2": mp.sqrt(2), "sqrt_3": mp.sqrt(3),
                   **{f"log_{p}": mp.log(p) for p in (2, 3, 5, 7, 31, 41)}},
    # Rational model constants span Q and are represented once by 1.
    "model": {"1": mp.mpf(1), **slopes},
    # Continuous-time / exponential-generating-function arguments at time 1.
    "bessel": {"1": mp.mpf(1), "exp(-1/2)": mp.exp(-mp.mpf(1)/2),
               **{f"I{order}({label})": mp.besseli(order, z)
                  for label, z in [("1/2", mp.mpf(1)/2), ("sqrt(15)/8", mp.sqrt(15)/8)]
                  for order in (0, 1)}},
}
results = []
for name, basis in bases.items():
    pool = {key: text(v) for key, v in basis.items()}
    names = list(pool)
    audit = members_audit(pool, names, dps=180, h=10**6, maxsteps=10000)
    assert not audit, audit
    # In-basket control, safely below the coefficient cap.
    control = 2*basis[names[0]]/3 + 5*basis[names[1]]/7
    for digits in (120, 180):
        assert two_prec_stable(text(control), names, pool, dps_pair=(digits, digits),
                               maxcoeff=10**6, maxsteps=10000)
    for key in ("C_fit", "calm_eta", "h8_crossing", "calm_Ediss"):
        for power in (1, 2):
            target = text(values[key]**power)
            vectors = [two_prec_stable(target, names, pool, dps_pair=(d, d),
                                      maxcoeff=10**6, maxsteps=10000) for d in (120, 180)]
            assert vectors[0] == vectors[1], vectors
            row = {"target": key, "power": power, "basis": name, "vector": vectors[0]}
            if vectors[0]:
                row["check_200d"] = reverify({"target": target, "members": names,
                                              "vector": vectors[0]}, pool, dps=200, tol="1e-190")
                assert row["check_200d"]["ok"]
            results.append(row)

# Definition-level controls: these are recognitions of known input formulas.
controls = {"continuum_squared_times_pi": (values["continuum"]**2 * mp.pi, 1, 1)}
for name, e, w in [("w5", 123, 5), ("w4", 124, 4), ("wind", 125, 3), ("h8", 120, 8)]:
    x = (values["branch_" + name] / (mp.mpf(63)/64))**2 * mp.log(mp.mpf(e)/w)
    controls[name] = (x, e-w, e+w)
checks = {}
for name, (x, num, den) in controls.items():
    with mp.workdps(200):
        vector = mp.pslq([x, mp.mpf(1)], maxcoeff=10**6, maxsteps=10000)
        assert vector and abs(vector[0]*x+vector[1]) < mp.mpf("1e-190")
        checks[name] = {"vector": vector, "residual": text(abs(vector[0]*x+vector[1])),
                        "expected_rational": f"{num}/{den}"}
print(json.dumps({"search_dps": [120, 180], "residual_dps": 200,
                  "maxcoeff": 10**6, "maxsteps": 10000,
                  "bases": {k: list(v) for k, v in bases.items()},
                  "member_audits_and_controls": "passed for all three bases",
                  "searches": results, "definition_controls": checks}, indent=2))

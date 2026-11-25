# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy"]
# ///
"""
Post-process results/e1_arrow.json: for shrinking walls moving in integer
steps s_t = floor(vt), D can only increase on steps where the wall fails to
advance (s_{t+1} = s_t, possible iff v < 1), because only then does the new
region reach outside the old one's domain of dependence. This script checks
that every measured increase sits on a stalled step, and that walls that
advance every step (v >= 1) never rise.

Run: uv run e1_stalls.py
"""
import json

def main():
    d = json.load(open("results/e1_arrow.json"))
    bad = 0
    total_inc, total_stalled_with_inc = 0, 0
    for r in d["results"]:
        if r["kind"] != "shrinking" or "reference" in r:
            continue
        v, T, tol = r["v"], r["T"], r["tol"]
        stalled = [t + 1 for t in range(T) if int(v * (t + 1)) == int(v * t)]
        inc = [i + 1 for i in range(len(r["D"]) - 1) if r["D"][i + 1] - r["D"][i] > tol]
        off = [s for s in inc if s not in stalled]
        bad += len(off)
        total_inc += len(inc)
        if v == 0.0:
            continue  # fixed region: every step is a stalled step
        print(f"v={v:<5} {r['state']:>8}: rises {len(inc)}/{len(stalled)} stalled steps, "
              f"off-stall rises: {len(off)}")
    print(f"\ntotal rises {total_inc}; rises off stalled steps: {bad} (must be 0)")


if __name__ == "__main__":
    main()

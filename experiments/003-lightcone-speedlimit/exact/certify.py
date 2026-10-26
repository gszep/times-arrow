"""Certified evaluation of the locked 003 constants; no sampled trajectories.

Run: uv run --with mpmath --with python-flint certify.py [decimal_precision]
JSON goes to stdout. Keep output in scratch, not in the results/ sweep dataset.
"""
import json
import math
import sys
import time

from flint import arb, ctx, fmpq


def chain(e, w, steps):
    """Exact integer mass recurrence; only logs/square roots use Arb."""
    n = 1024
    counts = [64513] + [1] * (n - 1)
    denominator = 65536
    activity = arb(fmpq(e + w, 256))
    envelope = [arb(0)]
    crossing = None
    for s in range(steps):
        assert sum(counts) == denominator
        sigma = arb(0)
        for x in range(n):
            forward, reverse = e * counts[x], w * counts[(x + 1) % n]
            if forward != reverse:
                sigma += arb(fmpq(forward - reverse, 256 * denominator)) * arb(
                    fmpq(forward, reverse)
                ).log()
        assert sigma > 0
        envelope.append(envelope[-1] + (activity * sigma).sqrt())
        left, right = envelope[-2] - s, envelope[-1] - (s + 1)
        if s > 0 and crossing is None:
            if left > 0 and right < 0:
                crossing = s + left / (left - right)
            else:
                assert left > 0 and right > 0
        counts = [
            (256 - e - w) * counts[x]
            + e * counts[(x - 1) % n]
            + w * counts[(x + 1) % n]
            for x in range(n)
        ]
        denominator *= 256
    assert sum(counts) == denominator
    distance = fmpq(sum(min(x, n - x) * c for x, c in enumerate(counts)), denominator) - 4
    return envelope[-1], crossing, distance


def constants():
    calm_e, calm_cross, calm_w = chain(64, 64, 512)
    # Independent closed-form rational numerator, including the antipode at T=n/2.
    assert calm_w == fmpq(63 * 512 * math.comb(1024, 512), 64 * 2**1024)
    _, h8_cross, _ = chain(120, 8, 11)
    a = arb(fmpq(63, 64))

    def slope(e, w):
        return (arb(fmpq((e + w) * (e - w), 256**2)) * arb(fmpq(e, w)).log()).sqrt()

    # These decimal training times are exact inputs of the lock, NOT exact crossings.
    c_fit = (arb(fmpq(17167, 1000)) * (1 - slope(123, 5))
             + arb(fmpq(23935, 1000)) * (1 - slope(124, 4))) / 2
    out = {"C_fit": c_fit, "calm_W1": arb(calm_w), "calm_Ediss": calm_e,
           "calm_eta": arb(calm_w) / calm_e, "calm_crossing": calm_cross,
           "h8_crossing": h8_cross, "h8_prediction": c_fit / (1 - slope(120, 8)),
           "continuum": 1 / arb.pi().sqrt()}
    for name, e, w in [("w5", 123, 5), ("w4", 124, 4), ("wind", 125, 3), ("h8", 120, 8)]:
        rho = arb(fmpq(e, w)).log()
        b = a * ((rho / 2).tanh() / rho).sqrt()
        # Check the equivalent rational/log expression with independent evaluation.
        assert b.overlaps(a * (arb(fmpq(e - w, e + w)) / rho).sqrt())
        out["branch_" + name] = b
    return out


def report(values, started):
    # Arb's printed radius includes decimal display rounding. Never print a bare
    # midpoint as a certified value. The midpoint is separately marked for PSLQ.
    for value in values.values():
        assert value.is_finite() and value.rel_accuracy_bits() > 600
    return {"precision_dps": ctx.dps, "execution_seconds": time.monotonic() - started,
            "values": {name: {"ball": value.str(65),
                              "search_midpoint": value.mid().str(210, radius=False),
                              "accuracy_bits": value.rel_accuracy_bits()}
                       for name, value in values.items()}}


if __name__ == "__main__":
    ctx.dps = int(sys.argv[1]) if len(sys.argv) > 1 else 240
    started = time.monotonic()
    print(json.dumps(report(constants(), started), indent=2))

# /// script
# requires-python = ">=3.12"
# dependencies = ["jax[cuda12]", "numpy", "scipy"]
# ///
"""Tier 2 trial on Artemis: Philox in JAX checked against the contract, then
f64 `eigh` on the GPU against CPU LAPACK. `uv run jax_trial.py`."""

import json
import os
import socket
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import scipy.linalg

here = Path(__file__).parent
sizes = (1000, 2000, 4000, 7000, 10000)


def matrix(n):
    b = np.random.default_rng(n).standard_normal((n, n))
    return (b + b.T) / 2


def residual(a, w, v):
    return float(np.linalg.norm(a @ v - v * w) / np.linalg.norm(a))


# CPU LAPACK runs before JAX is imported: with the XLA runtime live in the same
# process, OpenBLAS ran 3-25x slower.
runs, w_cpu = [], {}
for n in sizes:
    a = matrix(n)
    t = time.perf_counter()
    w_cpu[n], v = scipy.linalg.eigh(a, driver="evd")
    runs.append(dict(n=n, cpuSeconds=time.perf_counter() - t, cpuResidual=residual(a, w_cpu[n], v)))
    print(json.dumps(runs[-1]))

import jax

jax.config.update("jax_enable_x64", True)
import jax.numpy as jnp
ph = json.loads((here / "../../contract.json").read_text())["philox"]
M0, M1 = (jnp.uint64(m) for m in ph["M"])
W0, W1 = (jnp.uint32(w) for w in ph["W"])


@jax.jit
def philox(c, k0, k1):
    """Philox4x32-10 on counters `c` (shape [..., 4]) and keys `k0`, `k1`."""
    c0, c1, c2, c3 = (c[..., i] for i in range(4))
    for _ in range(ph["rounds"]):
        p0, p1 = M0 * c0.astype(jnp.uint64), M1 * c2.astype(jnp.uint64)
        hi0, lo0 = (p0 >> 32).astype(jnp.uint32), p0.astype(jnp.uint32)
        hi1, lo1 = (p1 >> 32).astype(jnp.uint32), p1.astype(jnp.uint32)
        c0, c1, c2, c3 = hi1 ^ c1 ^ k0, lo1, hi0 ^ c3 ^ k1, lo0
        k0, k1 = k0 + W0, k1 + W1
    return jnp.stack([c0, c1, c2, c3], -1)


def rand(seed, step, site):
    zero = jnp.zeros_like(site)
    return philox(jnp.stack([site, step, zero, zero], -1), seed, zero)


def u01(x):
    return (x >> 8).astype(jnp.float32) * jnp.float32(1 / 16777216)


u32 = lambda xs: jnp.asarray(xs, jnp.uint32)
kat, stream = ph["kat"], ph["stream"]
got = philox(u32([v["ctr"] for v in kat]), u32([v["key"][0] for v in kat]), u32([v["key"][1] for v in kat]))
checks = [("Philox known-answer vectors", got.tolist() == [v["out"] for v in kat])]
r = rand(*(u32([v[f] for v in stream]) for f in ("seed", "step", "site")))
expected = np.float32(np.array([v["u01"] for v in stream])) / np.float32(16777216)
checks.append(
    (
        "Philox stream and u01",
        r.tolist() == [v["out"] for v in stream] and np.array_equal(np.asarray(u01(r)).view(np.uint32), expected.view(np.uint32)),
    )
)
for name, ok in checks:
    print("pass" if ok else "FAIL", name)
assert all(ok for _, ok in checks)

gpu = jax.devices("gpu")[0]
for row in runs:
    a = matrix(row["n"])
    a_gpu = jax.device_put(a, gpu)
    jnp.linalg.eigh(a_gpu)[0].block_until_ready()  # compile
    t = time.perf_counter()
    w, v = jnp.linalg.eigh(a_gpu)
    w.block_until_ready()
    row["gpuSeconds"] = time.perf_counter() - t
    w, v = np.asarray(w), np.asarray(v)
    row["gpuResidual"] = residual(a, w, v)
    row["maxEigenvalueDifference"] = float(np.max(np.abs(w - w_cpu[row["n"]])))
    print(json.dumps(row))

git = lambda *a: subprocess.run(["git", *a], capture_output=True, text=True, cwd=here).stdout.strip()
(here / "results").mkdir(exist_ok=True)
(here / f"results/{socket.gethostname()}-jax.json").write_text(
    json.dumps(
        dict(
            commit=git("rev-parse", "HEAD"),
            dirty=git("status", "--porcelain", "--untracked-files=no") != "",
            host=socket.gethostname(),
            backend="jax",
            date=datetime.now(timezone.utc).isoformat(),
            adapter=dict(device=gpu.device_kind, jax=jax.__version__, cpus=os.cpu_count(), blas=np.show_config("dicts")["Build Dependencies"]["blas"]["name"]),
            checks=[dict(name=n, pass_=ok) for n, ok in checks],
            runs=runs,
        ),
        indent=1,
    )
    + "\n"
)

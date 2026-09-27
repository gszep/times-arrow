# /// script
# requires-python = ">=3.12"
# dependencies = ["cupy-cuda12x[ctk]", "numpy"]
# ///
"""Tier 1 trial on Artemis: Philox and HPP as CuPy RawKernels, checked against
the contract, then timed like the WGSL sweep. `uv run cupy_trial.py`."""

import json
import socket
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import cupy as cp
import numpy as np

here = Path(__file__).parent
contract = json.loads((here / "../../contract.json").read_text())
ph, hpp = contract["philox"], contract["hpp"]
nibbles = [sum(s << (4 * i) for i, s in enumerate(hpp["collide"][k : k + 8])) for k in (0, 8)]

source = f"""
#define M0 {ph["M"][0]}u
#define M1 {ph["M"][1]}u
#define W0 {ph["W"][0]}u
#define W1 {ph["W"][1]}u
#define ROUNDS {ph["rounds"]}u
#define COLLIDE_LO {nibbles[0]}u
#define COLLIDE_HI {nibbles[1]}u
typedef unsigned int u32;

__device__ uint4 philox(uint4 c, u32 k0, u32 k1) {{
  for (u32 r = 0; r < ROUNDS; r++) {{
    u32 hi0 = __umulhi(M0, c.x), lo0 = M0 * c.x;
    u32 hi1 = __umulhi(M1, c.z), lo1 = M1 * c.z;
    c = make_uint4(hi1 ^ c.y ^ k0, lo1, hi0 ^ c.w ^ k1, lo0);
    k0 += W0; k1 += W1;
  }}
  return c;
}}

__device__ uint4 rand(u32 seed, u32 step, u32 site) {{
  return philox(make_uint4(site, step, 0u, 0u), seed, 0u);
}}

__device__ u32 u01bits(u32 x) {{ return __float_as_uint((float)(x >> 8) * (1.0f / 16777216.0f)); }}

extern "C" __global__ void kat(const uint4* in, uint4* out, int count) {{
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i < count) out[i] = philox(in[2 * i], in[2 * i + 1].x, in[2 * i + 1].y);
}}

extern "C" __global__ void stream(const uint4* in, uint4* out, int count) {{
  int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= count) return;
  uint4 r = rand(in[i].x, in[i].y, in[i].z);
  out[2 * i] = r;
  out[2 * i + 1] = make_uint4(u01bits(r.x), u01bits(r.y), u01bits(r.z), u01bits(r.w));
}}

__device__ u32 collide(u32 s) {{ return ((s >> 3 ? COLLIDE_HI : COLLIDE_LO) >> ((s & 7u) * 4u)) & 0xfu; }}

extern "C" __global__ void init(u32* dst, u32 n, u32 seed) {{
  u32 x = blockIdx.x * blockDim.x + threadIdx.x, y = blockIdx.y * blockDim.y + threadIdx.y;
  if (x < n && y < n) dst[y * n + x] = rand(seed, 0u, y * n + x).x & 0xfu;
}}

extern "C" __global__ void step(const u32* src, u32* dst, u32 n) {{
  u32 x = blockIdx.x * blockDim.x + threadIdx.x, y = blockIdx.y * blockDim.y + threadIdx.y;
  if (x >= n || y >= n) return;
  u32 m = n - 1u;
  #define AT(X, Y) collide(src[((Y) & m) * n + ((X) & m)])
  dst[y * n + x] = (AT(x - 1u, y) & 1u) | (AT(x, y - 1u) & 2u) | (AT(x + 1u, y) & 4u) | (AT(x, y + 1u) & 8u);
}}
"""
module = cp.RawModule(code=source)
k = {name: module.get_function(name) for name in ("kat", "stream", "init", "step")}


def launch(kernel, count, *args):
    kernel(((count + 255) // 256,), (256,), args)


class Hpp:
    def __init__(self, n):
        self.n, self.a, self.b = n, cp.zeros(n * n, cp.uint32), cp.zeros(n * n, cp.uint32)

    def grid(self):
        g = (self.n + 15) // 16
        return (g, g), (16, 16)

    def init(self, seed):
        k["init"](*self.grid(), (self.a, np.uint32(self.n), np.uint32(seed)))

    def step(self, t):
        for _ in range(t):
            k["step"](*self.grid(), (self.a, self.b, np.uint32(self.n)))
            self.a, self.b = self.b, self.a

    def state(self):
        return "".join(format(int(s), "x") for s in self.a.get())


def f32bits(m):
    return int(np.float32(m / 16777216).view(np.uint32))


results = []
kat = ph["kat"]
inp = cp.asarray([w for v in kat for w in v["ctr"] + v["key"] + [0, 0]], cp.uint32)
out = cp.zeros(4 * len(kat), cp.uint32)
launch(k["kat"], len(kat), inp, out, np.int32(len(kat)))
got = out.get().reshape(-1, 4).tolist()
results.append(("Philox known-answer vectors", all(g == v["out"] for g, v in zip(got, kat))))

stream = ph["stream"]
inp = cp.asarray([w for v in stream for w in (v["seed"], v["step"], v["site"], 0)], cp.uint32)
out = cp.zeros(8 * len(stream), cp.uint32)
launch(k["stream"], len(stream), inp, out, np.int32(len(stream)))
got = out.get().reshape(-1, 8).tolist()
results.append(
    ("Philox stream and u01", all(g == v["out"] + [f32bits(m) for m in v["u01"]] for g, v in zip(got, stream)))
)

for g in hpp["golden"]:
    h = Hpp(g["n"])
    h.init(g["seed"])
    h.step(g["t"])
    results.append((f"HPP seed {g['seed']}, n {g['n']}, t {g['t']}", h.state() == g["state"]))

for name, ok in results:
    print("pass" if ok else "FAIL", name)
assert all(ok for _, ok in results)


def checksum(a):
    i = cp.arange(a.size, dtype=cp.uint32)
    return int((a * (2 * i + 1)).sum(dtype=cp.uint32))


steps, runs = 500, []
for n in (1024, 2048, 4096, 8192):
    for _ in range(3):
        h = Hpp(n)
        h.init(1)
        h.step(10)
        start, end = cp.cuda.Event(), cp.cuda.Event()
        start.record()
        h.step(steps)
        end.record()
        end.synchronize()
        seconds = cp.cuda.get_elapsed_time(start, end) / 1000
        runs.append(
            dict(n=n, steps=steps + 10, seconds=seconds, cellUpdatesPerSecond=n * n * steps / seconds, checksum=checksum(h.a))
        )
        print(json.dumps(runs[-1]))
        del h

git = lambda *a: subprocess.run(["git", *a], capture_output=True, text=True, cwd=here).stdout.strip()
props = cp.cuda.runtime.getDeviceProperties(0)
(here / "results").mkdir(exist_ok=True)
(here / f"results/{socket.gethostname()}-cupy.json").write_text(
    json.dumps(
        dict(
            commit=git("rev-parse", "HEAD"),
            dirty=git("status", "--porcelain", "--untracked-files=no") != "",
            host=socket.gethostname(),
            backend="cupy",
            date=datetime.now(timezone.utc).isoformat(),
            steps=steps,
            adapter=dict(device=props["name"].decode(), cuda=cp.cuda.runtime.runtimeGetVersion(), cupy=cp.__version__),
            checks=[dict(name=n, pass_=ok) for n, ok in results],
            runs=runs,
        ),
        indent=1,
    )
    + "\n"
)

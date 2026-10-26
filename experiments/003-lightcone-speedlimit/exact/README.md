# Exact constants (exploratory tooling)

`certify.py` evaluates the locked registration with exact integer probability
numerators and Arb logs/square roots. It checks mass exactly at every step,
the calm endpoint against its rational binomial formula, and strict crossing
brackets before interpolation. It prints enclosing balls, plus separately
labelled midpoints for recognition. The default is 240 decimal working digits;
the precision argument must leave more than 600 accurate bits in every result.
This is a numerical audit, not a new Lean proof or a GPU result.

```sh
uv run --with mpmath --with python-flint \
  experiments/003-lightcone-speedlimit/exact/certify.py > "$TMPDIR/opencode/003-certified.json"
```

The `C_fit` inputs `17167/1000` and `23935/1000` are the locked rounded
training times. Replacing them with exact-chain crossings would change the
definition. h8 crosses between steps 10 and 11, inside the single-step windows;
the denominator for calm η uses all 512 pre-hop distributions, not window means.

`recognize.py` uses BootLoops' PSLQ gate. Clone
`https://github.com/BootLoops-ai/bootloops` into scratch; the tested revision is
`95dfb7251f00d05a1c5a5184bde1a2ce5ebad270`. Put its `tools/` on `PYTHONPATH`:

```sh
PYTHONPATH="$TMPDIR/opencode/003-bootloops/tools" \
  uv run --with mpmath --with python-flint \
  experiments/003-lightcone-speedlimit/exact/recognize.py \
  < "$TMPDIR/opencode/003-certified.json" > "$TMPDIR/opencode/003-pslq.json"
```

It searches each of C_fit, calm η, h8 crossing and calm E_diss, and their
squares, in three explicitly printed bases at 120 and 180 digits, coefficient
cap 10⁶ and 10,000 iterations. Each basis gets a member-relation audit and
an in-basis positive control. Rational model constants are represented once by
1 to avoid a linearly dependent basis. Hits are rechecked at 200 digits.
The Bessel basis uses the time-one exponential-generating-function arguments
for calm and h8; it does not identify the synchronous propagator with a
continuous-time heat kernel. Nulls mean only that this bounded search found
no relation. Residuals are mpmath diagnostics, not certified equality proofs;
a printed zero is rounded arithmetic, not a proof of equality.

The additional continuum/branch controls encode known defining formulas;
recovering them is not a newly discovered identity. Proving any genuinely new
identity requires symbolic reasoning or a matching Lean theorem. The test
environment uses python-flint 0.9.0 and mpmath 1.4.1. Outputs belong in scratch;
the issue comment carries the reviewed findings and certified intervals.

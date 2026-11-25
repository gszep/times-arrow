# Owner scratch for issue #14 (exploration, not on main)

Scripts behind the owner's comments on issue #14. Tier 2 Python, run with
`uv run --with numpy --with scipy --with mpmath python <file> <args>`.

- `ref3.py` → `ref3.json`: f64 reference for the playground gas (the page's
  right end retreats at light speed; this script's is fixed, with identical
  numbers for the default state).
- `tau.py`: the causal-past time function.
- `qw.py`: first f64 check of relative-entropy monotonicity in a Dirac walk.
- `ramp.py θ L N digits`: multiprecision modular Hamiltonian of an interval in
  the split-step walk's vacuum, against the Bisognano–Wichmann ramp.
- `bw.py θ…`, `bw2.py θ…` (`bw2.out.txt`): variational Bisognano–Wichmann
  fit, without and with a cut offset.
- `leak.py θ d0` (`leak-1.0.out.txt`): leaks through a receding wall, thermal
  reference.

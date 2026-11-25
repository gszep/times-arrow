# Exploration (owner): BW variational test with a cut offset x0 (lattice shift of the entangling points), f64.
import numpy as np, sys
from scipy.optimize import minimize
exec(open('bw.py').read().split("N = 4096")[0])
N = 8192
print('theta   L   c_best    x0     D(best)    | c at x0=0  D        | cos(theta)  D(c=cos,x0 best)  D(c=1,x0 best)')
for th in [float(a) for a in sys.argv[1:]]:
    k, w, P, H = model(th, N)
    for L in [16, 32, 64, 128, 256]:
        G = blocks(k, P, L); Hr = blocks(k, H, L); S = entropy(G)
        pos = np.repeat(np.arange(L) + 0.5, 2); mid = (pos[:, None] + pos[None, :])/2
        def D(c, x0):
            ch = (mid + x0)*(L + x0 - mid)/(L + 2*x0)
            K = 2*np.pi/c*ch*Hr; K = (K + K.conj().T)/2
            return float(np.real(np.trace(G @ K)) + np.logaddexp(0, -np.linalg.eigvalsh(K)).sum() - S)
        r = minimize(lambda p: D(p[0], p[1]), [np.cos(th), 0.0], method='Nelder-Mead', options=dict(xatol=1e-6, fatol=1e-10))
        r0 = minimize(lambda p: D(p[0], 0.0), [np.cos(th)], method='Nelder-Mead', options=dict(xatol=1e-6, fatol=1e-10))
        rc = minimize(lambda p: D(np.cos(th), p[0]), [0.0], method='Nelder-Mead'); r1 = minimize(lambda p: D(1.0, p[0]), [0.0], method='Nelder-Mead')
        print(f'{th:5.2f} {L:4d}  {r.x[0]:.4f}  {r.x[1]:+.3f}  {r.fun:.3e}  | {r0.x[0]:.4f}  {r0.fun:.3e} | {np.cos(th):.4f}     {rc.fun:.3e}        {r1.fun:.3e}', flush=True)

# Exploration (owner): Bisognano–Wichmann test for the vacuum of a strictly causal split-step walk (f64, variational).
# W = S_down C(-th) S_up C(th); strict cone 1 site/step; gapless at k=0 with emergent speed cos th.
# BW ansatz: K_c[x,y] = (2 pi / c) * chord((x+y)/2) * Heff[x-y] on an interval of L sites. Best c minimises D(rho_A || exp(-K_c)).
import numpy as np, sys
from scipy.optimize import minimize_scalar
def model(th, N):
    k = 2*np.pi*(np.arange(N)+0.5)/N - np.pi
    c, s = np.cos(th), np.sin(th)
    C1 = np.array([[c, -s], [s, c]]); C2 = np.array([[c, s], [-s, c]])
    W = np.zeros((N, 2, 2), complex)
    for i, kk in enumerate(k):
        W[i] = np.diag([1, np.exp(1j*kk)]) @ C2 @ np.diag([np.exp(-1j*kk), 1]) @ C1
    cw = np.real(W[:, 0, 0] + W[:, 1, 1])/2; w = np.arccos(np.clip(cw, -1, 1))
    ns = 1j*(W - cw[:, None, None]*np.eye(2))/np.sin(w)[:, None, None]
    return k, w, (np.eye(2) - ns)/2, w[:, None, None]*ns
def blocks(k, M, L):                        # M(k) 2x2 -> real-space 2L x 2L matrix on sites 0..L-1
    d = np.arange(-(L-1), L)
    Md = np.einsum('kd,kab->dab', np.exp(1j*np.outer(k, d)), M)/len(k)
    out = np.zeros((2*L, 2*L), complex)
    for x in range(L):
        for y in range(L):
            out[2*x:2*x+2, 2*y:2*y+2] = Md[x-y+L-1]
    return out
def entropy(G):
    z = np.clip(np.linalg.eigvalsh(G), 1e-300, 1); z = z[(z > 1e-15) & (z < 1-1e-15)]
    return float(-(z*np.log(z) + (1-z)*np.log1p(-z)).sum())
N = 4096
print('theta  L   c_best  cos(theta)  strict  D(c_best)   D(c=cos)    D(c=1)     S_A')
for th in [float(a) for a in sys.argv[1:]]:
    k, w, P, H = model(th, N)
    for L in [16, 32, 64, 128]:
        G = blocks(k, P, L); Hr = blocks(k, H, L); S = entropy(G)
        pos = np.repeat(np.arange(L) + 0.5, 2); mid = (pos[:, None] + pos[None, :])/2
        chord = (N/np.pi)*np.sin(np.pi*mid/N)*np.sin(np.pi*(L-mid)/N)/np.sin(np.pi*L/N)
        K1 = 2*np.pi*chord*Hr; K1 = (K1 + K1.conj().T)/2
        kap = np.linalg.eigvalsh(K1); e1 = float(np.real(np.trace(G @ K1)))
        D = lambda c: e1/c + np.logaddexp(0, -kap/c).sum() - S
        r = minimize_scalar(D, bounds=(0.2, 2.0), method='bounded', options=dict(xatol=1e-10))
        print(f'{th:5.2f} {L:4d}  {r.x:.4f}   {np.cos(th):.4f}     1.0   {r.fun:.3e}  {D(np.cos(th)):.3e}  {D(1.0):.3e}  {S:.4f}')

# Exploration (owner): three regimes of a receding wall in a strictly causal quantum walk (f64, thermal reference so it is well conditioned).
# Split-step walk W = S_down C(-th) S_up C(th): strict cone 1 site/step, maximal group velocity cos(th).
# Region [a0 + floor(v t), b0 - t]: left wall recedes at v, right end at light speed. Disturbance: a random local unitary d0 sites left of the wall.
import numpy as np, scipy.linalg as sl, sys
rng = np.random.default_rng(7)
N, th, beta = 400, float(sys.argv[1]), 2.0
c, s = np.cos(th), np.sin(th)
def site_op(M): return np.kron(np.eye(N), M)
Su = np.zeros((2*N, 2*N)); Sd = np.zeros((2*N, 2*N))
for x in range(N):
    Su[2*((x+1) % N), 2*x] = 1; Su[2*x+1, 2*x+1] = 1          # up moves right
    Sd[2*x, 2*x] = 1; Sd[2*((x-1) % N)+1, 2*x+1] = 1          # down moves left
W = Sd @ site_op(np.array([[c, s], [-s, c]])) @ Su @ site_op(np.array([[c, -s], [s, c]]))
T, Z = sl.schur(W.astype(complex), output='complex'); om = -np.angle(np.diag(T))
print(f'# theta={th} max group velocity {c:.4f}; |quasi-energy| max {np.abs(om).max():.3f}; unitarity {np.abs(W.T@W-np.eye(2*N)).max():.1e}')
Go = (Z * (1/(1+np.exp(beta*om)))) @ Z.conj().T
print(f'# reference stationary to {np.abs(W@Go@W.conj().T-Go).max():.1e}')
def logm_h(A):
    w, v = np.linalg.eigh(A); return (v * np.log(np.clip(w, 1e-300, None))) @ v.conj().T
def relent(Gr, Gq):
    I = np.eye(len(Gr))
    return float(np.real(np.trace(Gr @ (logm_h(Gr) - logm_h(Gq)) + (I-Gr) @ (logm_h(I-Gr) - logm_h(I-Gq)))))
def idx(a, b): 
    s_ = np.arange(a, b+1); return np.sort(np.concatenate([2*s_, 2*s_+1]))
a0, b0, d0, w = 150, 330, int(sys.argv[2]), 6
ii = idx(a0-d0-w, a0-d0-1); A = rng.normal(size=(len(ii),)*2) + 1j*rng.normal(size=(len(ii),)*2); Q, _ = np.linalg.qr(A)
U = np.eye(2*N, dtype=complex); U[np.ix_(ii, ii)] = Q; G0 = U @ Go @ U.conj().T
steps = 80
hist = [G0]
for t in range(steps): hist.append(W @ hist[-1] @ W.conj().T)
print('wall v   D(0)       rises>1e-11  largest rise   total rise    D(max)      note')
for v in [0.25, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25]:
    D = []
    for t in range(steps+1):
        a, b = a0 + int(np.floor(v*t + 1e-9)), b0 - t
        if b - a < 4: break
        j = idx(a, b); D.append(relent(hist[t][np.ix_(j, j)], Go[np.ix_(j, j)]))
    D = np.array(D); inc = np.diff(D)
    note = 'slower than every packet' if v < c else ('between group velocity and strict cone' if v < 1 else 'strict cone or faster')
    print(f'{v:5.2f}  {D[0]:10.3e}  {int((inc > 1e-11).sum()):6d}     {max(inc.max(), 0):10.3e}   {inc[inc > 0].sum():10.3e}   {D.max():10.3e}   {note}')

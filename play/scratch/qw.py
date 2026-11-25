import numpy as np, scipy.linalg as sl
rng = np.random.default_rng(1)
def walk(N, th):
    c, s = np.cos(th), np.sin(th)
    C = np.kron(np.eye(N), np.array([[c, -1j*s], [-1j*s, c]]))
    S = np.zeros((2*N, 2*N))
    for x in range(N):
        S[2*((x+1) % N), 2*x] = 1        # R moves right
        S[2*((x-1) % N)+1, 2*x+1] = 1    # L moves left
    return S @ C
def logm_h(A):
    w, v = np.linalg.eigh(A); w = np.clip(w, 1e-300, None)
    return (v * np.log(w)) @ v.conj().T
def relent(Gr, Go):
    I = np.eye(len(Gr))
    return np.real(np.trace(Gr @ (logm_h(Gr) - logm_h(Go)) + (I-Gr) @ (logm_h(I-Gr) - logm_h(I-Go))))
def idx(sites, N):
    s = np.array(sites) % N
    return np.sort(np.concatenate([2*s, 2*s+1]))
N, th, beta = 128, 0.4, 2.0
W = walk(N, th)
ev, V = np.linalg.eig(W)
# W is normal: orthonormalise eigenvectors via Schur
T, Z = sl.schur(W, output='complex'); ev = np.diag(T); om = -np.angle(ev)
k = 2*np.pi*np.arange(N)/N
pred = np.arccos(np.cos(th)*np.cos(k))
print('dispersion check', np.allclose(np.sort(np.abs(om)), np.sort(np.concatenate([pred, pred])), atol=1e-9), 'gap', np.abs(om).min(), th)
Go = (Z * (1/(1+np.exp(beta*om)))) @ Z.conj().T
print('stationary', np.abs(W @ Go @ W.conj().T - Go).max())
# local quench: random unitary on window of 6 sites centred at x0
def quench(G, x0, w=6):
    U = np.eye(2*N, dtype=complex); ii = idx(range(x0, x0+w), N)
    A = rng.normal(size=(len(ii), len(ii))) + 1j*rng.normal(size=(len(ii), len(ii)))
    Q, _ = np.linalg.qr(A); U[np.ix_(ii, ii)] = Q
    return U @ G @ U.conj().T
for name, x0 in [('quench outside region (x0=20)', 20), ('quench inside region (x0=61)', 61)]:
    print(name)
    for v in [0, 0.25, 0.5, 0.75, 1.0, 1.5]:
        G = quench(Go, x0); a0, b0 = 40, 88; D = []
        for t in range(0, 22):
            sh = int(np.floor(v*t)); a, b = a0+sh, b0-sh
            if b - a < 2: break
            ii = idx(range(a, b+1), N)
            D.append(relent(G[np.ix_(ii, ii)], Go[np.ix_(ii, ii)]))
            G = W @ G @ W.conj().T
        D = np.array(D); inc = np.diff(D)
        print(f'  v={v:4}: D0={D[0]:.4e} Dend={D[-1]:.4e} rises={np.sum(inc>1e-9)} maxrise={inc.max():.3e}')

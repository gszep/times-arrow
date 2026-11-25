# Exploration (owner): does the vacuum's modular Hamiltonian of a strictly causal walk ramp with the emergent speed or the strict cone?
# Split-step walk, two modes (up, down) per site: W = S_down C(-th) S_up C(th), C(a) = [[cos a, -sin a],[sin a, cos a]],
# S_up shifts up one site right, S_down shifts down one site left. Strict cone: one site per step.
# Bloch: cos w = cos^2 th cos k + sin^2 th -> gapless at k = 0 with emergent (and maximal group) speed cos th.
import sys, time
from mpmath import mp, mpf, mpc, matrix, cos, sin, acos, exp, pi, log, eigh, sqrt
th = mpf(sys.argv[1]); L = int(sys.argv[2]); N = int(sys.argv[3]); mp.dps = int(sys.argv[4])
def bloch(k):
    c, s = cos(th), sin(th)
    C1 = matrix([[c, -s], [s, c]]); C2 = matrix([[c, s], [-s, c]])
    Su = matrix([[exp(-1j*k), 0], [0, 1]]); Sd = matrix([[1, 0], [0, exp(1j*k)]])
    return Sd * C2 * Su * C1
t0 = time.time()
# G(d)[a,b] = (1/N) sum_k e^{ikd} P_-(k)[a,b],  H(d) likewise with w n.sigma ; twisted grid avoids k = 0
Gd = {d: matrix(2, 2) for d in range(-(L-1), L)}; Hd = {d: matrix(2, 2) for d in range(-(L-1), L)}
I2 = matrix([[1, 0], [0, 1]]); chk = mpf(0)
for j in range(N):
    k = 2*pi*(j + mpf(1)/2)/N - pi
    W = bloch(k); cw = ((W[0, 0] + W[1, 1])/2).real; w = acos(cw)
    chk = max(chk, abs(cw - (cos(th)**2*cos(k) + sin(th)**2)))
    ns = 1j*(W - cw*I2)/sin(w)                 # n.sigma, Hermitian, squares to 1
    P = (I2 - ns)/2; Hk = w*ns
    for d in Gd:
        ph = exp(1j*k*d)/N
        Gd[d] += ph*P; Hd[d] += ph*Hk
print(f'# th={float(th)} L={L} N={N} dps={mp.dps} dispersion residual {float(chk):.1e}  ({time.time()-t0:.0f}s)', flush=True)
n = 2*L; G = matrix(n, n)
for x in range(L):
    for y in range(L):
        for a in range(2):
            for b in range(2):
                G[2*x+a, 2*y+b] = Gd[x-y][a, b]
herm = max(abs(G[i, j] - G[j, i].conjugate()) for i in range(n) for j in range(n))
z, V = eigh(G)
eps = [log((1-zi)/zi) for zi in z]
print(f'# hermiticity {float(herm):.1e}; zeta range [{float(z[0]):.3e}, 1-{float(1-z[n-1]):.3e}]; |eps|max {float(max(abs(e) for e in eps)):.1f}  ({time.time()-t0:.0f}s)', flush=True)
h = V * matrix(n, n) 
D = matrix(n, n)
for i in range(n): D[i, i] = eps[i]
h = V * D * V.H
def blk(M, x, y): return matrix([[M[2*x+a, 2*y+b] for b in range(2)] for a in range(2)])
def proj(A, B):                                # least-squares coefficient of A on B
    num = sum((B[a, b].conjugate()*A[a, b]) for a in range(2) for b in range(2)); den = sum(abs(B[a, b])**2 for a in range(2) for b in range(2))
    return (num/den).real
c_eff = cos(th)
print('# x = distance of the bond midpoint from the left cut; ratio = EH bond block projected on H_eff bond block; c_fit = 2 pi chord(x) / ratio')
for x in range(L-1):
    xm = mpf(x + 1)                            # cut at -1/2, site j at j+1/2, bond (j,j+1) midpoint at j+1
    r = proj(blk(h, x, x+1), Hd[-1])
    chord = (N/pi)*sin(pi*xm/N)*sin(pi*(L-xm)/N)/sin(pi*mpf(L)/N)
    if x < 12 or x % 4 == 0:
        print(f'{x+1:3d}  ratio {float(r):10.4f}   ratio/chord {float(r/chord):8.4f}   c_fit {float(2*pi*chord/r):.4f}   [2pi/c_eff {float(2*pi/c_eff):.4f}, 2pi/1 {float(2*pi):.4f}; c_eff {float(c_eff):.4f}]')

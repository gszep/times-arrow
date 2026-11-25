# Reference (f64) for the play page. Light-like "telegraph" gas: every particle moves one site per step (right or left)
# and reverses with probability a per step. Exact ensemble = independent Poisson link occupations; we evolve the
# deviations d = lambda - nu of the link intensities from the uniform stationary intensity nu = 1.
import numpy as np, json
n, T, a, A, hw, xr, R = 2048, 768, 1/64, 4.0, 12, 900, 52
c = n//2; centres = (c-20, c+40)
def phi(d):                      # relative-entropy density of a Poisson link: (1+d)ln(1+d) - d, stable for small d
    d = np.asarray(d, dtype=float); small = np.abs(d) < 1e-2
    return np.where(small, d*d/2 - d**3/6 + d**4/12 - d**5/20, (1+d)*np.log1p(d) - d)
x = np.arange(n)
blob = sum(np.where(np.abs(x-xc) < hw, A*np.cos(np.pi*(x-xc)/(2*hw))**2, 0.0) for xc in centres)
r = np.zeros((T+1, n)); l = np.zeros((T+1, n)); r[0] = blob; l[0] = blob   # out-links of vertex (x,t): right, left
sig = np.zeros((T+1, n))
for t in range(T):
    rin, lin = np.roll(r[t], 1), np.roll(l[t], -1)     # arrivals at vertex (x,t+1): right-mover from x-1, left-mover from x+1
    r[t+1] = (1-a)*rin + a*lin; l[t+1] = a*rin + (1-a)*lin
    sig[t+1] = phi(rin) + phi(lin) - phi(r[t+1]) - phi(l[t+1])          # dissipation at the vertex, >= 0
tt, xx = np.meshgrid(np.arange(T), x, indexing='ij')
def D_cut(u, s):                 # relative entropy on the slice f = s of the frame moving at u: links p->q with f(p) < s <= f(q), f = t - u(x-c)
    fp = tt - u*(xx-c); tot = 0.0
    for d, lam in ((1, r[:T]), (-1, l[:T])):
        fq = (tt+1) - u*(xx+d-c); m = (fp < s) & (s <= fq); tot += phi(lam[m]).sum()
    return tot
def D_wall(v, steps=400):        # relative entropy of the region right of a wall at c + floor(v t), on rest-frame slices
    return np.array([(phi(r[t]) + phi(l[t]))[(x >= c+int(np.floor(v*t))) & (x <= c+xr)].sum() for t in range(steps)])
out = {'params': dict(n=n, T=T, a=a, A=A, hw=hw, centres=[int(k-c) for k in centres], xr=xr, R=R), 'D0': float((phi(r[0])+phi(l[0])).sum()),
       'sum_sigma': float(sig.sum()), 'min_sigma': float(sig.min()), 'D_T': float((phi(r[T])+phi(l[T])).sum())}
out['frame'] = {}
for u in [0.0, 0.25, 0.5, 0.75, -0.75]:
    s0 = int(np.ceil(R*abs(u)))+1; s1 = int(np.floor((T-1)*(1-abs(u)) - R*abs(u)))
    D = np.array([D_cut(u, s) for s in range(s0, s1+1)])
    out['frame'][str(u)] = dict(s0=s0, s1=s1, rises=int(np.sum(np.diff(D) > 1e-12)), D_first=float(D[0]), D_s100=float(D_cut(u, 100)), D_last=float(D[-1]))
out['wall'] = {}
for v in [0, 0.25, 0.5, 0.75, 0.9, 0.95, 1.0, 1.25, 1.5]:
    D = D_wall(v); inc = np.diff(D)
    out['wall'][str(v)] = dict(D0=float(D[0]), D50=float(D[50]), D200=float(D[200]), rises=int(np.sum(inc > 1e-13)), largest_rise=float(max(inc.max(), 0)), t_first_rise=int(np.argmax(inc > 1e-13)) if (inc > 1e-13).any() else None, total_rise=float(inc[inc > 0].sum()))
print(json.dumps(out))

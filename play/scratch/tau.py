# Exploration (owner): the causal-past time function of the light-like gas.
# tau(p) = dissipation summed over the causal past of p = information about the initial state already destroyed in p's past.
import numpy as np
n, T, a, A, hw = 2048, 400, 1/64, 4.0, 12
c = n//2; centres = (c-20, c+40)
def phi(d):
    d = np.asarray(d, dtype=float); small = np.abs(d) < 1e-2
    return np.where(small, d*d/2 - d**3/6 + d**4/12 - d**5/20, (1+d)*np.log1p(d) - d)
x = np.arange(n)
blob = sum(np.where(np.abs(x-xc) < hw, A*np.cos(np.pi*(x-xc)/(2*hw))**2, 0.0) for xc in centres)
r = np.zeros((T+1, n)); l = np.zeros((T+1, n)); r[0] = blob; l[0] = blob
sig = np.zeros((T+1, n))
for t in range(T):
    rin, lin = np.roll(r[t], 1), np.roll(l[t], -1)
    r[t+1] = (1-a)*rin + a*lin; l[t+1] = a*rin + (1-a)*lin
    sig[t+1] = phi(rin) + phi(lin) - phi(r[t+1]) - phi(l[t+1])
tau = np.zeros((T+1, n))
for t in range(1, T+1):
    tau[t] = sig[t] + np.roll(tau[t-1], 1) + np.roll(tau[t-1], -1) - (tau[t-2] if t >= 2 else 0)
# brute-force check of the recurrence at a few events
for (xx, tt) in [(c, 50), (c+100, 200), (c-150, 399)]:
    s = np.arange(1, tt+1)[:, None]; y = x[None, :]
    brute = sig[1:tt+1][(np.abs(y - xx) <= tt - s) & ((y - xx - (tt - s)) % 2 == 0)].sum()
    print('tau', (xx-c, tt), tau[tt, xx], 'brute (same sublattice)', brute)
# monotone along every causal link (and "stay", two steps)
print('min increment along links', min((tau[1:] - np.roll(tau[:-1], 1, axis=1)).min(), (tau[1:] - np.roll(tau[:-1], -1, axis=1)).min()))
# Gauss: tau(p) = D(base of p's past) - D(links leaving the past of p)
D0 = (phi(r[0]) + phi(l[0])).sum(); print('D0', D0, ' tau max', tau.max(), ' at', np.unravel_index(tau.argmax(), tau.shape))
for tt in (50, 100, 200, 400):
    row = tau[tt]; print(f't={tt}: tau at x-c = -300,-200,-100,-50,0,50,100,200,300:', np.round([row[c+k] for k in (-300,-200,-100,-50,0,50,100,200,300)], 3))
# shape of level sets: for a few levels, the time at which each x first reaches the level
for lev in (5, 20, 60, 100, 130):
    first = [(int(np.argmax(tau[:, c+k] >= lev)) if (tau[:, c+k] >= lev).any() else None) for k in (-200,-100,-50,-20,0,10,40,80,150,250)]
    print(f'level {lev}: first time reached at x-c = -200,-100,-50,-20,0,10,40,80,150,250 ->', first)

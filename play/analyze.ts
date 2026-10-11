// Shared numeric analysis for the playground page and the protocol driver.

/** The free table's geometric ringing periods, 100/√(m²+n²) steps, with the
 * m²+n² value each comes from (a particle conserves |v_x|, |v_y|, so its x
 * and y motions are periodic; the slowest is 2L/v = 100 steps on an axis). */
export const TABLE_PERIODS = [1, 2, 4, 5, 8, 9, 10, 13].map((j) => ({ j, f: Math.sqrt(j) / 100, period: 100 / Math.sqrt(j) }));

/** Number of exact-revival directions at t = 100k of a centre release: the
 * lattice points on the circle of radius k (both k·cosθ and k·sinθ integral). */
export const dirsOnCircle = (k: number) => {
  let c = 0;
  for (let a = 0; a <= k; a++)
    for (let b = 0; b <= k; b++)
      if (a * a + b * b === k * k && (a > 0 || b > 0)) c += a === 0 || b === 0 ? 2 : 4;
  return c;
};

/** Unweighted two-cell coarse entropy S(p) = −p ln p − (1−p) ln(1−p). */
export const sUnw = (p: number) => (p <= 0 || p >= 1 ? 0 : -p * Math.log(p) - (1 - p) * Math.log(1 - p));

/** Volume-weighted (observational) coarse entropy per particle, in nats:
 * S_obs = −p ln(p/a) − (1−p) ln((1−p)/(1−a)) = ln A_table − D(p‖a); for the
 * unit table this is −D(p‖a), maximal (0) exactly at the equilibrium p = a. */
export const sObs = (p: number, a: number) => {
  const t1 = p <= 0 ? 0 : p * Math.log(p / a);
  const t2 = p >= 1 ? 0 : (1 - p) * Math.log((1 - p) / (1 - a));
  return -(t1 + t2);
};

/** Ordinary least squares y = slope·x + intercept, with R². */
export function linfit(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r2: (sxy * sxy) / (sxx * syy) };
}

/** Amplitude spectrum of a uniformly sampled series (dt in steps): Hann
 * window, mean removed, zero-padded to a power of two. Returns frequencies
 * in cycles/step and amplitudes in the units of y. */
export function spectrum(y: number[], dt: number) {
  const m = y.length;
  if (m < 4) return { f: [] as number[], a: [] as number[] };
  const mean = y.reduce((s, v) => s + v, 0) / m;
  const n = 2 ** Math.ceil(Math.log2(m));
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let wsum = 0;
  for (let i = 0; i < m; i++) {
    const w = m > 1 ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1)) : 1;
    wsum += w;
    re[i] = (y[i] - mean) * w;
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
      }
    }
  }
  const f: number[] = [];
  const a: number[] = [];
  for (let j = 1; j <= n / 2; j++) {
    f.push(j / (n * dt));
    a.push((2 * Math.hypot(re[j], im[j])) / wsum);
  }
  return { f, a };
}

/** Local maxima of a spectrum, strongest first. */
export function peaks(f: number[], a: number[], top = 8) {
  const out: { f: number; a: number }[] = [];
  for (let j = 1; j < a.length - 1; j++) {
    if (a[j] > a[j - 1] && a[j] >= a[j + 1]) out.push({ f: f[j], a: a[j] });
  }
  out.sort((x, y) => y.a - x.a);
  return out.slice(0, top);
}

/** Non-overlapping RMS envelope of a uniformly sampled series (dt in steps),
 * one point per window of `win` steps. */
export function rmsEnvelope(y: number[], win: number, dt: number) {
  const per = Math.max(1, Math.round(win / dt));
  const out: { t: number; r: number }[] = [];
  for (let i = 0; i + per <= y.length; i += per) {
    let s = 0;
    for (let j = i; j < i + per; j++) s += y[j] * y[j];
    out.push({ t: (i + per / 2) * dt, r: Math.sqrt(s / per) });
  }
  return out;
}

// Tests for the committed scorer, all against the locked registration:
//   node experiments/001-irreversibility/score.test.ts
// Three synthetic ensembles at the registered configuration — one that must
// score supported, one that must keep the supported label through the
// registered one-run allowance, one that must refute E1, E2, the R1 control
// and S1(b)–(d) through their registered clauses — and the smoke results,
// whose bit-level checks must hold and whose statistical verdicts must read
// n/a (it is not the registered configuration).
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { damageDepths, sampleTimes } from "./run.ts";
import { renderVerdict, score } from "./score.ts";
import type { Results } from "./score.ts";
import type { RunResult } from "./run.ts";

const N = 1024;
const T_MAX = 32768;
const T_E = 16384;
const MASS = (N * N) / 8;
const MU = 5.7e5;
const BS = [4, 8, 16, 32, 64];
const CAP = Math.round(0.0605 * 4 * N * N);
const grid = sampleTimes(T_MAX);
const depths = [...new Set([...sampleTimes(T_E).map((t) => T_E - t), ...damageDepths(T_E)])].sort((a, b) => a - b);
const adapter = { vendor: "intel", architecture: "", device: "", description: "", fallback: false };
const S = (entries: Record<number, number>) => entries;

/** A null run: an equilibrium level with a ±2-nat alternating per-seed
 * offset, so the registered band is μ̂ = MU, 3σ̂ ≈ 6.2 at every t. */
const nullRun = (seed: number): RunResult => ({
  config: { n: N, seed, mode: "null", tMax: T_MAX, tE: T_E, b: BS },
  adapter,
  forward: grid.map((t) => ({ t, S: S(Object.fromEntries(BS.map((b) => [b, MU + (seed % 2 ? 2 : -2)]))), mass: MASS, momDev: 0 })),
  profiles: { px: [], py: [] },
  echo: [],
  finalHamming: null,
  naiveHamming: null,
  naiveS: null,
  undo: null,
});

/** Per-seed deviations used to refute or to exercise the one-run allowance. */
type Opts = {
  rise4?: number; // replaces rise(4) (E2 ratio clause)
  rise8?: number; // replaces rise(8) (E2 monotonicity inversion)
  slowEntry?: boolean; // asymptote 20 nats below the band until t = 20100 (E1 entry)
  naiveHamming?: number; // 0: the flip-only control recovers (R1)
  Hhalf?: number; // replaces H(n/2) (S1b)
  sdOut?: boolean; // Sd dips 30 nats below the band at every r ≥ 1024 (S1d)
  sdFinal?: number; // replaces Sd at r = tE (S1d undo fraction)
};

const packedRun = (seed: number, o: Opts = {}): RunResult => {
  const rise = Object.fromEntries(
    BS.map((b) => [b, ({ 4: 3.0e5, 8: 3.7e5, 16: 3.89e5, 32: 4.0e5, 64: 4.0e5 } as Record<number, number>)[b]]),
  ) as Record<number, number>;
  if (o.rise4 !== undefined) rise[4] = o.rise4;
  if (o.rise8 !== undefined) rise[8] = o.rise8;
  for (const b of BS) rise[b] *= 1 + 1e-4 * Math.sin(seed * b);
  rise[64] = rise[32];
  const s0 = Object.fromEntries(BS.map((b) => [b, MU - rise[b]])) as Record<number, number>;
  // The rise enters the band near t ≈ 3300 (τ = 300) and never dips again;
  // slowEntry holds the asymptote 20 nats below the band until t = 20100.
  const curve = (b: number, t: number) => {
    if (o.slowEntry && t >= 20100) return MU;
    const asymptote = rise[b] - (o.slowEntry ? 20 : 0);
    return s0[b] + asymptote * (1 - Math.exp(-t / 300));
  };
  return {
    config: { n: N, seed, mode: "packed", tMax: T_MAX, tE: T_E, b: BS },
    adapter,
    forward: grid.map((t) => ({
      t,
      S: S(Object.fromEntries(BS.map((b) => [b, curve(b, t)]))),
      mass: MASS,
      momDev: 0,
    })),
    profiles: { px: [], py: [] },
    echo: depths.map((r) => ({
      r,
      Sp: S(Object.fromEntries(BS.map((b) => [b, curve(b, T_E - r)]))),
      Sd: S(
        Object.fromEntries(
          BS.map((b) => [
            b,
            o.sdOut && r >= 1024 ? MU - 30 : o.sdFinal !== undefined && r === T_E ? o.sdFinal : MU,
          ]),
        ),
      ),
      massP: MASS,
      massD: MASS + (seed % 2 ? 1 : -1),
      H: r === 0 ? 1 : (o.Hhalf !== undefined && r === N / 2 ? o.Hhalf : Math.min(Math.round(Math.exp(0.032 * r)), CAP)),
      sites: r === 0 ? 1 : 1000,
      maxDist: Math.min(r, N / 2),
    })),
    finalHamming: 0,
    naiveHamming: o.naiveHamming ?? CAP,
    naiveS: S({ 16: MU }),
    undo: null,
  };
};

const ensemble = (packedOpts: (seed: number) => Opts): Results => ({
  commit: "synthetic",
  dirty: false,
  smoke: false,
  params: { n: N, tMax: T_MAX, tE: T_E, seeds: Array.from({ length: 16 }, (_, i) => i + 1), b: BS },
  runs: [
    ...Array.from({ length: 16 }, (_, i) => packedRun(i + 1, packedOpts(i + 1))),
    ...Array.from({ length: 16 }, (_, i) => nullRun(i + 1)),
  ],
});

console.log(renderVerdict(score(ensemble(() => ({})))));

// Must score supported: every registered rule holds in all 16 seeds.
{
  const v = score(ensemble(() => ({})));
  assert.equal(v.registered, true);
  assert.equal(v.claims.L1.verdict, "verified");
  assert.equal(v.claims.L2.verdict, "verified");
  assert.equal(v.claims.L3.verdict, "verified");
  assert.equal(v.claims.E1.verdict, "supported");
  assert.deepEqual(v.claims.E1.failures, []);
  assert.equal(v.claims.E1.s0.ok, true);
  assert.ok(v.claims.E1.seeds.every((s) => s.tStar !== null && s.tStar <= T_E));
  assert.ok(v.claims.E1.seeds.every((s) => s.longestExcursion === 0 && s.finalInBand));
  assert.equal(v.claims.E2.verdict, "supported");
  assert.deepEqual(v.claims.E2.inversions, []);
  assert.ok(1.2 <= v.claims.E2.meanRatio && v.claims.E2.meanRatio <= 1.5);
  assert.ok(v.claims.E2.sdRatio <= 0.05);
  assert.ok(v.claims.E2.edges.every((e) => e.wins === 16));
  assert.equal(v.claims.R1.exact.verdict, "verified");
  assert.equal(v.claims.R1.control.verdict, "supported");
  assert.equal(v.claims.S1.a.verdict, "verified");
  assert.equal(v.claims.S1.bcd.verdict, "supported");
  assert.deepEqual(v.claims.S1.bcd.failing, []);
  assert.deepEqual(v.claims.S1.b.failing, []);
  assert.deepEqual(v.claims.S1.c.failing, []);
  assert.deepEqual(v.claims.S1.d.failing, []);
  assert.ok(v.claims.S1.d.perRun.every((s) => Math.abs(s.pristineU! - 1) < 1e-12));
  assert.ok(v.claims.S1.d.perRun.every((s) => s.U! <= 0.05));
  assert.ok(v.claims.S1.c.perRun.every((s) => 0.05 <= s.decorr! && s.decorr! <= 0.07));
  assert.ok(v.claims.S1.b.perRun.every((s) => s.Hhalf! >= 1000));
  assert.ok(0.02 < v.claims.S1.beta.mean! && v.claims.S1.beta.mean! < 0.05, `β̂ ${v.claims.S1.beta.mean}`);
  console.log("pass: the supported ensemble scores supported everywhere");
}

// Must keep the supported label through the one-run allowance: one seed
// fails the E1 entry, one inverts the E2 monotonicity.
{
  const v = score(ensemble((seed) => (seed === 15 ? { slowEntry: true } : seed === 2 ? { rise8: 4.05e5 } : {})));
  assert.equal(v.claims.E1.verdict, "supported");
  assert.deepEqual(v.claims.E1.failures, [15]);
  assert.equal(v.claims.E2.verdict, "supported");
  assert.deepEqual(v.claims.E2.inversions, [2]);
  assert.equal(v.claims.S1.bcd.verdict, "supported");
  console.log("pass: one failing run keeps the label, with the failure reported");
}

// Must refute: two seeds never enter by t = 16384 (E1), the mean ratio
// leaves [1.2, 1.5] (E2), the control recovers on one seed (R1), and (b)
// fails on two seeds while (d) fails on two more (S1 ≥ 2-of-16).
{
  const v = score(
    ensemble((seed) => ({
      rise4: 2.4e5,
      ...(seed === 15 || seed === 16 ? { slowEntry: true } : {}),
      ...(seed === 3 ? { naiveHamming: 0 } : {}),
      ...(seed === 5 || seed === 6 ? { Hhalf: 500 } : {}),
      ...(seed === 7 ? { sdOut: true } : {}),
      ...(seed === 8 ? { sdFinal: MU + 2e5 } : {}),
    })),
  );
  assert.equal(v.claims.E1.verdict, "refuted");
  assert.deepEqual(v.claims.E1.failures, [15, 16]);
  assert.equal(v.claims.E2.verdict, "refuted");
  assert.ok(v.claims.E2.meanRatio > 1.5, `ratio ${v.claims.E2.meanRatio}`);
  assert.equal(v.claims.R1.exact.verdict, "verified");
  assert.equal(v.claims.R1.control.verdict, "refuted");
  assert.equal(v.claims.S1.a.verdict, "verified");
  assert.equal(v.claims.S1.bcd.verdict, "refuted");
  assert.deepEqual(v.claims.S1.b.failing, [5, 6]);
  assert.deepEqual(v.claims.S1.d.failing, [7, 8]);
  assert.deepEqual([...v.claims.S1.bcd.failing].sort((a, b) => a - b), [5, 6, 7, 8]);
  assert.equal(v.claims.L1.verdict, "verified");
  assert.equal(v.claims.L2.verdict, "verified");
  console.log("pass: the refuted ensemble refutes E1, E2, the R1 control and S1(b)–(d)");
}

// The smoke output: bit-level checks hold, statistical verdicts are n/a.
{
  const smokeFile = new URL("results/calcifer-smoke.json", import.meta.url);
  assert.ok(existsSync(smokeFile), "results/calcifer-smoke.json is missing; run the smoke sweep first");
  const v = score(JSON.parse(readFileSync(smokeFile, "utf8")), smokeFile.pathname);
  assert.equal(v.registered, false);
  assert.equal(v.claims.L1.verdict, "verified");
  assert.equal(v.claims.L2.verdict, "verified");
  assert.equal(v.claims.L3.verdict, "verified");
  assert.equal(v.claims.R1.exact.verdict, "verified");
  assert.equal(v.claims.R1.control.verdict, "supported");
  assert.equal(v.claims.E1.verdict, "n/a");
  assert.equal(v.claims.E2.verdict, "n/a");
  assert.equal(v.claims.S1.bcd.verdict, "n/a");
  assert.ok(v.claims.S1.d.perRun.every((s) => Math.abs(s.pristineU! - 1) < 1e-9), `pristine U ${v.claims.S1.d.perRun.map((s) => s.pristineU)}`);
  console.log("pass: the smoke run scores verified bit for bit, statistics n/a");
}

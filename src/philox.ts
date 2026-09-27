import contract from "../contract.json" with { type: "json" };

const { M, W, rounds } = contract.philox;
const u = (x: number) => `0x${x.toString(16)}u`;

/** Philox4x32-10 and the project stream in WGSL, with constants from the contract. */
export const philoxWgsl = /* wgsl */ `
const PHILOX_M0 = ${u(M[0])};
const PHILOX_M1 = ${u(M[1])};
const PHILOX_W = vec2u(${u(W[0])}, ${u(W[1])});
const PHILOX_ROUNDS = ${rounds}u;

// (hi, lo) words of the 64-bit product, from 16-bit halves.
fn mulhilo(a: u32, b: u32) -> vec2u {
  let al = a & 0xffffu; let ah = a >> 16u;
  let bl = b & 0xffffu; let bh = b >> 16u;
  let lh = al * bh; let hl = ah * bl;
  let mid = ((al * bl) >> 16u) + (lh & 0xffffu) + (hl & 0xffffu);
  return vec2u(ah * bh + (lh >> 16u) + (hl >> 16u) + (mid >> 16u), a * b);
}

fn philox(ctr: vec4u, key: vec2u) -> vec4u {
  var c = ctr;
  var k = key;
  for (var r = 0u; r < PHILOX_ROUNDS; r++) {
    let p0 = mulhilo(PHILOX_M0, c.x);
    let p1 = mulhilo(PHILOX_M1, c.z);
    c = vec4u(p1.x ^ c.y ^ k.x, p1.y, p0.x ^ c.w ^ k.y, p0.y);
    k += PHILOX_W;
  }
  return c;
}

fn rand(seed: u32, step: u32, site: u32) -> vec4u {
  return philox(vec4u(site, step, 0u, 0u), vec2u(seed, 0u));
}

fn u01(x: u32) -> f32 {
  return f32(x >> 8u) * (1.0 / 16777216.0);
}
`;

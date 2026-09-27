import { Hpp } from "../../src/hpp.ts";

/** `Σ sᵢ (2i + 1) mod 2³²`, the same on every backend, to compare large states. */
export function checksum(s: Uint32Array): number {
  let acc = 0;
  for (let i = 0; i < s.length; i++) acc = (acc + Math.imul(s[i], 2 * i + 1)) >>> 0;
  return acc;
}

/** HPP cell updates per second for `steps` steps of an `n × n` lattice from
seed 1. Throws on any GPU error or device loss, which would otherwise read
back as zeros or a partial state. */
export async function bench(device: GPUDevice, n: number, steps: number) {
  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("validation");
  const hpp = new Hpp(device, n);
  hpp.init(1);
  hpp.step(10);
  await device.queue.onSubmittedWorkDone();
  const t0 = performance.now();
  hpp.step(steps);
  await device.queue.onSubmittedWorkDone();
  const seconds = (performance.now() - t0) / 1000;
  const sum = checksum(await hpp.words());
  hpp.destroy();
  const errors = [await device.popErrorScope(), await device.popErrorScope()].filter((e) => e !== null);
  if (errors.length) throw new Error(errors.map((e) => e.message).join("; "));
  const lost = await Promise.race([device.lost, null]);
  if (lost) throw new Error(`device lost: ${lost.message}`);
  return { n, steps: steps + 10, seconds, cellUpdatesPerSecond: (n * n * steps) / seconds, checksum: sum };
}

import { checkContract, philoxStream } from "../../src/check.ts";
import { gpu } from "../../src/gpu.ts";
import { Hpp } from "../../src/hpp.ts";
import { bench } from "./bench.ts";

const out = document.getElementById("out")!;
const params = new URLSearchParams(location.search);
const n = Number(params.get("n") ?? 1024);
const steps = Number(params.get("steps") ?? 200);

const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

try {
  const { device, adapter } = await gpu();
  const probe = {
    adapter,
    check: () => checkContract(device),
    bench: (n: number, steps: number) => bench(device, n, steps),
    rand: (triples: number[][]) => philoxStream(device, triples),
    hpp: async (seed: number, n: number, t: number) => {
      const h = new Hpp(device, n);
      h.init(seed);
      h.step(t);
      const s = await h.state();
      h.destroy();
      return s;
    },
  };
  const checks = await probe.check();
  const b = await probe.bench(n, steps);
  out.innerHTML = `
    <p>Adapter: ${adapter.vendor} ${adapter.architecture} ${adapter.description}${adapter.fallback ? " (software fallback)" : ""}</p>
    <table>${checks.map((c) => row([c.pass ? "✓" : "✗", c.name, c.detail])).join("")}</table>
    <p>HPP ${b.n}×${b.n}, ${steps} steps: <b>${(b.cellUpdatesPerSecond / 1e9).toFixed(2)}</b> × 10⁹ cell updates/s</p>`;
  Object.assign(window, { probe });
} catch (e) {
  out.textContent = String(e instanceof Error ? e.message : e);
  Object.assign(window, { probeError: out.textContent });
}

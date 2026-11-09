import contract from "../../contract.json" with { type: "json" };
import { checkContract, philoxKnownAnswers, philoxStream, same } from "../../src/check.ts";
import { gpu } from "../../src/gpu.ts";
import { Hpp, nullState, packedState } from "../../src/hpp.ts";
import { bench } from "./bench.ts";

const out = document.getElementById("out")!;
const params = new URLSearchParams(location.search);
const n = Number(params.get("n") ?? 1024);
const steps = Number(params.get("steps") ?? 200);
const vector = document.querySelector<HTMLSelectElement>("#vector")!;
const fault = document.querySelector<HTMLInputElement>("#fault")!;
const boundaryOut = document.getElementById("boundary")!;
const claim = contract.claims.find((c) => c.name === "TimesArrow.Philox.philox_kat")!;
document.getElementById("claim")!.textContent =
  `${claim.status}: ${claim.statement}\n\nAxioms used: ${claim.axioms.join(", ")}\nAllowed axioms: ${contract.allowedAxioms.join(", ")}`;
contract.philox.kat.forEach((_, i) => vector.add(new Option(`Vector ${i + 1}`, String(i))));
const requested = Number(params.get("vector") ?? 0);
vector.value = String(Number.isInteger(requested) && requested >= 0 && requested < vector.length ? requested : 0);
fault.checked = params.get("fault") === "1";

const row = (cells: string[]) => `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;

try {
  const { device, adapter } = await gpu();
  const boundary = async (index: number, corrupt: boolean) => {
    if (!Number.isInteger(index) || !contract.philox.kat[index]) throw new Error("Unknown known-answer vector");
    const g = contract.philox.kat[index];
    const expected = [...g.out];
    if (corrupt) expected[0] = (expected[0] ^ 1) >>> 0;
    const actual = (await philoxKnownAnswers(device))[index];
    return { index, corrupt, counter: g.ctr, key: g.key, expected, actual,
      pass: same(actual, expected), differingWords: actual.filter((w, i) => w !== expected[i]).length };
  };
  const showBoundary = async () => {
    vector.disabled = fault.disabled = true;
    try {
      const index = Number(vector.value);
      const result = await boundary(index, fault.checked);
      const url = new URL(location.href);
      url.searchParams.set("vector", String(index));
      url.searchParams.set("fault", fault.checked ? "1" : "0");
      history.replaceState(null, "", url);
      const hex = (w: number) => w.toString(16).padStart(8, "0");
      boundaryOut.innerHTML = `
        <p><b>${result.pass ? "VERIFIED for this input" : "MISMATCH"}</b> · ${result.differingWords}/4 words differ.</p>
        <p>${result.corrupt ? "Teaching control: expected word 0 has one bit flipped. A mismatch is expected, not a refutation of Lean." : "Unmodified contract: any mismatch here fails this GPU check. Passing is not a proof for untested inputs."}</p>
        <p style="overflow-wrap: anywhere">Counter (hex): ${result.counter.map(hex).join(" ")}<br>Key (hex): ${result.key.map(hex).join(" ")}</p>
        <table><caption>Exact u32 comparison (hexadecimal)</caption>
          <thead><tr><th>Word</th><th>${result.corrupt ? "Altered" : "Contract"}</th><th>GPU</th><th>Equal?</th></tr></thead>
          <tbody>${result.actual.map((w, i) => row([String(i), hex(result.expected[i]), hex(w), w === result.expected[i] ? "yes" : "no"])).join("")}</tbody>
        </table>`;
    } catch (e) {
      boundaryOut.textContent = `Check unavailable: ${String(e)}`;
      throw e;
    } finally {
      vector.disabled = fault.disabled = false;
    }
  };
  vector.onchange = fault.onchange = () => { void showBoundary().catch(console.error); };
  const probe = {
    adapter,
    boundary,
    check: () => checkContract(device),
    bench: (n: number, steps: number) => bench(device, n, steps),
    rand: (triples: number[][]) => philoxStream(device, triples),
    init: async (mode: "packed" | "null", seed: number, n: number) => {
      const s = mode === "packed" ? await packedState(device, seed, n) : await nullState(device, seed, n);
      return Array.from(s, (w) => w.toString(16)).join("");
    },
    hpp: async (seed: number, n: number, t: number) => {
      const h = new Hpp(device, n);
      h.init(seed);
      h.step(t);
      const s = await h.state();
      h.destroy();
      return s;
    },
  };
  await showBoundary();
  const checks = await probe.check();
  const b = await probe.bench(n, steps);
  out.innerHTML = `
    <p>Adapter: ${adapter.vendor} ${adapter.architecture} ${adapter.description}${adapter.fallback ? " (software fallback)" : ""}</p>
    <table>${checks.map((c) => row([c.pass ? "✓" : "✗", c.name, c.detail])).join("")}</table>
    <p>HPP ${b.n}×${b.n}, ${steps} steps: <b>${(b.cellUpdatesPerSecond / 1e9).toFixed(2)}</b> × 10⁹ cell updates/s</p>`;
  Object.assign(window, { probe });
} catch (e) {
  out.textContent = String(e instanceof Error ? e.message : e);
  boundaryOut.textContent = `Check unavailable: ${out.textContent}. The exported Lean statement above remains readable.`;
  Object.assign(window, { probeError: out.textContent });
}

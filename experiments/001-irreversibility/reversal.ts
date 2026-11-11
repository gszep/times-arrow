import { Hpp, mass4 } from "../../src/hpp.ts";

/** A two-particle teaching example, not an ensemble or a new physics claim. */
export async function reversalLesson(device: GPUDevice, paired: boolean) {
  const h = new Hpp(device, 4);
  const initial = new Uint32Array(16);
  initial[5] = 1; // east at (1, 1)
  initial[paired ? 5 : 6] |= 4; // move only the west particle
  const states: Record<string, number[]> = {};
  try {
    h.load(initial);
    states.initial = Array.from(await h.words());
    h.step(1);
    const forward = await h.words();
    states.forward = Array.from(forward);
    h.inv(1);
    states.inverse = Array.from(await h.words());
    h.load(forward);
    h.flip(); h.step(1); h.flip();
    states.flip = Array.from(await h.words());
    h.load(forward);
    h.rev(); h.step(1); h.rev();
    states.echo = Array.from(await h.words());
    const mismatch = (key: string) => states[key].reduce((sum, s, i) => sum + mass4(s ^ initial[i]), 0);
    return {
      paired, states,
      mass: Object.fromEntries(Object.entries(states).map(([key, words]) => [key, words.reduce((sum, s) => sum + mass4(s), 0)])),
      hamming: { inverse: mismatch("inverse"), flip: mismatch("flip"), echo: mismatch("echo") },
    };
  } finally {
    await device.queue.onSubmittedWorkDone();
    h.destroy();
  }
}

export async function mountReversalLesson(device: GPUDevice) {
  const button = document.querySelector<HTMLButtonElement>("#lesson-toggle")!;
  const output = document.querySelector<HTMLElement>("#lesson-output")!;
  const params = new URLSearchParams(location.search);
  let paired = params.get("lesson") === "pair";
  const render = async () => {
    button.disabled = true;
    try {
      const r = await reversalLesson(device, paired);
      const labels: Record<string, string> = {
        initial: "1. Initial state", forward: "2. Collide, then stream",
        inverse: "3a. Exact inverse", flip: "3b. Flip-only return", echo: "3c. Corrected return",
      };
      output.replaceChildren();
      for (const [key, words] of Object.entries(r.states)) {
        const card = document.createElement("div");
        const heading = document.createElement("b");
        heading.textContent = labels[key];
        const grid = document.createElement("div");
        grid.className = "lesson-grid";
        grid.setAttribute("role", "img");
        grid.setAttribute("aria-label", `${labels[key]}: ${words.map((s, i) => s ? `(${i % 4},${Math.floor(i / 4)}) ${["east", "down", "west", "up"].filter((_, bit) => s & (1 << bit)).join(" and ")}` : "").filter(Boolean).join("; ")}`);
        for (const s of words) {
          const cell = document.createElement("span");
          cell.textContent = ["→", "↓", "←", "↑"].filter((_, bit) => s & (1 << bit)).join("") || "·";
          grid.append(cell);
        }
        const caption = document.createElement("small");
        caption.textContent = `${r.mass[key]} particles` + (key in r.hamming ? ` · ${r.hamming[key as keyof typeof r.hamming]} differing bits` : "");
        card.append(heading, grid, caption);
        output.append(card);
      }
      document.querySelector("#lesson-status")!.textContent =
        `${paired ? "Head-on pair" : "Separated control"}: exact inverse ${r.hamming.inverse}, flip-only ${r.hamming.flip}, corrected ${r.hamming.echo} differing bits. ` +
        (paired ? "The flip-only return leaves a vertical pair instead of the original horizontal pair." : "Without a collision in this trajectory, even the flip-only return recovers. This control alone cannot distinguish the recipes.");
      button.textContent = paired ? "Move west particle apart (control)" : "Move west particle onto east particle";
    } catch (error) {
      document.querySelector("#lesson-status")!.textContent = `GPU check unavailable: ${error}`;
      throw error;
    } finally {
      button.disabled = false;
    }
  };
  button.onclick = () => {
    paired = !paired;
    const url = new URL(location.href);
    url.searchParams.set("lesson", paired ? "pair" : "separated");
    history.replaceState(null, "", url);
    void render().catch(console.error);
  };
  await render();
}

import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "vite";

const chrome =
  process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome";
const linuxFlags = [
  "--enable-unsafe-webgpu",
  "--ignore-gpu-blocklist",
  "--enable-features=Vulkan",
  "--use-angle=vulkan",
  "--disable-vulkan-surface",
];

export type Evaluate = (expression: string) => Promise<any>;

/**
 * Serve the repo with Vite, open `page` in a throwaway headless Chrome, wait
 * for `window.probe`, and pass an evaluator to `fn`. Aborts on a software
 * adapter. Everything is shut down afterwards.
 */
export async function headless<T>(page: string, fn: (evaluate: Evaluate) => Promise<T>): Promise<T> {
  const server = await createServer({ logLevel: "error" });
  await server.listen();
  const profile = mkdtempSync(join(tmpdir(), "times-arrow-chrome-"));
  const browser = spawn(
    chrome,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      ...(process.platform === "linux" ? linuxFlags : []),
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  try {
    let port = "";
    for (let i = 0; i < 100 && !port; i++) {
      await sleep(100);
      try {
        port = readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0];
      } catch {}
    }
    const url = new URL(page, server.resolvedUrls!.local[0]).href;
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${url}`, { method: "PUT" })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.onopen = resolve;
      ws.onerror = reject;
    });
    const pending = new Map<number, (m: any) => void>();
    ws.onmessage = (e) => {
      const m = JSON.parse(String(e.data));
      pending.get(m.id)?.(m);
    };
    let id = 0;
    const evaluate: Evaluate = (expression) =>
      new Promise((resolve, reject) => {
        const i = ++id;
        pending.set(i, (m) => {
          pending.delete(i);
          const r = m.result;
          if (m.error || r.exceptionDetails) reject(new Error(JSON.stringify(m.error ?? r.exceptionDetails)));
          else resolve(r.result.value);
        });
        ws.send(
          JSON.stringify({
            id: i,
            method: "Runtime.evaluate",
            params: { expression, awaitPromise: true, returnByValue: true },
          }),
        );
      });
    for (let i = 0; !(await evaluate("!!(window.probe || window.probeError)")); i++) {
      if (i > 600) throw new Error(`${url} never exposed window.probe`);
      await sleep(100);
    }
    const error = await evaluate("window.probeError");
    if (error) throw new Error(error);
    const adapter = await evaluate("probe.adapter");
    if (adapter.fallback) throw new Error(`software adapter: ${JSON.stringify(adapter)}`);
    const result = await fn(evaluate);
    ws.close();
    return result;
  } finally {
    const exited = new Promise((resolve) => browser.once("exit", resolve));
    browser.kill();
    await exited;
    await server.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

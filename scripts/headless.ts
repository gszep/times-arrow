import { execSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
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

/** Sweep provenance: the commit, whether tracked changes exist, the host,
 * and now. Untracked files do not count as dirty (untracked results made
 * past Artemis runs look dirty). */
export function provenance(smoke = false) {
  const git = (cmd: string) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();
  return {
    commit: git("rev-parse HEAD"),
    dirty: git("status --porcelain --untracked-files=no") !== "",
    host: hostname().split(".")[0],
    date: new Date().toISOString(),
    smoke,
  };
}

/** Write the committed results file `<dir>/<name>.json`: minified — the
 * compact form, exactly the fields the scorer and the page read. */
export function writeResults(dir: URL, name: string, data: unknown) {
  mkdirSync(dir, { recursive: true });
  const file = new URL(`${name}.json`, dir);
  writeFileSync(file, JSON.stringify(data) + "\n");
  console.log(file.pathname);
}

/** Write the full raw sweep output to the scratch dir (never Git), print
 * its path and SHA-256, and return both. Upload it to the experiment's
 * `results-NNN` release and record the SHA-256 in the compact file's
 * `release` block. */
export function writeRaw(name: string, data: unknown) {
  const dir = join(tmpdir(), "times-arrow-results");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${name}.json`);
  writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
  console.log(`${file} sha256 ${sha256}`);
  return { file, sha256 };
}

/**
 * Serve the repo with Vite, open `page` in a throwaway headless Chrome, wait
 * for `window.probe`, and pass an evaluator to `fn`. Aborts on a software
 * adapter, and on any vendor other than `expectedVendor` when one is given
 * (third argument, defaulting to `TIMES_ARROW_VENDOR`; unset only disables
 * the vendor check for callers that do not expect a specific GPU — the 001
 * sweep always passes one). Everything is shut down afterwards.
 */
export async function headless<T>(
  page: string,
  fn: (evaluate: Evaluate) => Promise<T>,
  expectedVendor = process.env.TIMES_ARROW_VENDOR,
): Promise<T> {
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
    if (expectedVendor && adapter.vendor.toLowerCase() !== expectedVendor.toLowerCase())
      throw new Error(`adapter vendor "${adapter.vendor}" is not the expected "${expectedVendor}": ${JSON.stringify(adapter)}`);
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

// An artifact rendered unseen (plan-m23 §3.7, Q117): in a headless browser found on the machine, as isorite shows it
// (a sandboxed frame given its document through srcdoc, its data over the bridge), its controls touched, so that its
// errors and the kit's complaints come back to Iso with what it wrote. With no browser, only the static checks run.

import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Rendered {
  /** The kit started (it said it was ready). */
  rendered: boolean;
  errors: string[];
  /** What it drew: SVG marks, and 100 for each canvas with anything on it. */
  drawn: number;
  height: number;
  /** A PNG of it on the ground asked for, when asked. */
  screenshot?: Uint8Array;
}
/** A file the artifact may read, by its path relative to it: text or bytes, or null when there's none. */
export type Reader = (rel: string) => Promise<string | Uint8Array | null>;

/** A Chromium on this machine: ISORITE_BROWSER, Playwright's own, or a browser installed in the usual places. */
export function findBrowser(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.ISORITE_BROWSER && existsSync(env.ISORITE_BROWSER)) return env.ISORITE_BROWSER;
  const cache = env.PLAYWRIGHT_BROWSERS_PATH ?? (process.platform === "darwin" ? join(homedir(), "Library", "Caches", "ms-playwright") : process.platform === "win32" ? join(env.LOCALAPPDATA ?? "", "ms-playwright") : join(homedir(), ".cache", "ms-playwright"));
  const found: string[] = [];
  try {
    for (const d of readdirSync(cache).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d)).sort().reverse()) {
      for (const p of ["chrome-linux/headless_shell", "chrome-headless-shell-linux64/chrome-headless-shell", "chrome-linux/chrome", "chrome-linux64/chrome",
        "chrome-mac/headless_shell", "chrome-headless-shell-mac-arm64/chrome-headless-shell", "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
        "chrome-win/headless_shell.exe", "chrome-headless-shell-win64/chrome-headless-shell.exe", "chrome-win/chrome.exe"]) found.push(join(cache, d, p));
    }
  } catch { /* no Playwright browsers */ }
  found.push(
    "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/snap/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Chromium.app/Contents/MacOS/Chromium",
    join(env["PROGRAMFILES"] ?? "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
    join(env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
  );
  return found.find((p) => existsSync(p)) ?? null;
}

type Browser = { newPage(o: object): Promise<Page>; close(): Promise<void> };
type Page = {
  on(ev: string, fn: (x: { type?(): string; text?(): string; message?: string }) => void): void;
  setContent(html: string): Promise<void>; evaluate(script: string): Promise<unknown>; exposeFunction(name: string, fn: (...a: never[]) => unknown): Promise<void>;
  waitForTimeout(ms: number): Promise<void>; frames(): { evaluate(script: string): Promise<unknown> }[]; mainFrame(): unknown; setViewportSize(s: { width: number; height: number }): Promise<void>;
  screenshot(o: object): Promise<Uint8Array>; close(): Promise<void>;
};
// What runs in the browser, as script text (the server is typed for Node, not the DOM).
/** The host: a sandboxed frame given the document, and the bridge, answering files through window.isoRead. */
const HOST = `(doc, ground) => {
  const f = document.getElementById("f");
  window.said = []; window.ready = false;
  const tell = (m, t = []) => f.contentWindow.postMessage({ isorite: 0, ...m }, "*", t);
  addEventListener("message", async (e) => {
    const m = e.data;
    if (e.source !== f.contentWindow || !m || m.isorite !== 0) return;
    if (m.type === "ready") { window.ready = true; tell({ type: "ground", ground }); tell({ type: "look", look: "isorite" }); }
    else if (m.type === "file" || m.type === "bytes") {
      const got = await window.isoRead(m.path);
      if (got.error) tell({ type: "reply", id: m.id, error: got.error });
      else if (m.type === "bytes") { const buf = got.b64 !== undefined ? Uint8Array.from(atob(got.b64), (c) => c.charCodeAt(0)).buffer : new TextEncoder().encode(got.text).buffer; tell({ type: "reply", id: m.id, bytes: buf }, [buf]); }
      else tell({ type: "reply", id: m.id, text: got.text ?? atob(got.b64) });
    }
    else if (m.type === "height") f.style.height = Math.min(8000, Math.ceil(m.height) + 4) + "px";
    else if (m.type === "error") window.said.push(String(m.message));
  });
  f.srcdoc = doc;
}`;
/** What it drew: SVG marks, and 100 for each canvas with anything on it (a WebGL one, if it has a size). */
const DRAWN = `(() => {
  let n = document.querySelectorAll("svg path, svg line, svg circle, svg rect, svg polyline, svg polygon, svg text").length;
  for (const c of document.querySelectorAll("canvas")) {
    try {
      const g = c.getContext("2d");
      if (g) { const d = g.getImageData(0, 0, c.width, c.height).data; if (d.some((v, i) => v !== d[i % 4])) n += 100; }
      else n += 100;
    } catch { n += 100; }
  }
  return n;
})()`;
/** Every control touched: sliders to three quarters, choices to their second, buttons pressed, a drag on a canvas. */
const TOUCH = `(async () => {
  for (const r of document.querySelectorAll("input[type=range]")) { r.value = String(+r.min + (+r.max - +r.min) * 0.75); r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); }
  for (const s of document.querySelectorAll("select")) if (s.options.length > 1) { s.selectedIndex = 1; s.dispatchEvent(new Event("change", { bubbles: true })); }
  for (const b of document.querySelectorAll("button, input[type=checkbox]")) if (!b.closest("iso-note")) b.click();
  await new Promise((r) => setTimeout(r, 400));
  const c = document.querySelector("canvas");
  if (c) {
    const r = c.getBoundingClientRect(), at = (t, x) => c.dispatchEvent(new PointerEvent(t, { clientX: r.left + x, clientY: r.top + r.height / 2, bubbles: true, pointerId: 1 }));
    at("pointerdown", r.width / 2); at("pointermove", r.width / 2 + 60); at("pointerup", r.width / 2 + 60);
    c.dispatchEvent(new MouseEvent("click", { clientX: r.left + r.width / 3, clientY: r.top + r.height / 3, bubbles: true }));
  }
})()`;

let launched: Promise<Browser> | null = null;
async function browser(path: string): Promise<Browser> {
  launched ??= (async () => {
    const { chromium } = await import("playwright-core") as unknown as { chromium: { launch(o: object): Promise<Browser> } };
    return chromium.launch({ executablePath: path, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  })().catch((e) => { launched = null; throw e; });
  return launched;
}
export async function closeBrowser(): Promise<void> { const b = await launched?.catch(() => null); launched = null; await b?.close(); }

/** Render an assembled artifact (packages/kit's assemble) unseen, answer its bridge from `read` for the files in
 *  `uses`, touch its controls, and say what happened. */
export async function renderArtifact(doc: string, uses: string[], read: Reader, opts: { executable: string; ground?: string; width?: number; screenshot?: boolean; timeout?: number }): Promise<Rendered> {
  const b = await browser(opts.executable), width = opts.width ?? 1100;
  const page = await b.newPage({ viewport: { width, height: 900 } });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type?.() === "error") errors.push(m.text!()); });
  page.on("pageerror", (e) => errors.push(e.message ?? String(e)));
  const work = (async (): Promise<Rendered> => {
    await page.exposeFunction("isoRead", async (rel: string) => {
      if (!uses.includes(rel)) return { error: `${rel} is not in the artifact's manifest (isorite:uses)` };
      const got = await read(rel);
      if (got === null) return { error: `${rel}: no such file beside the artifact` };
      return typeof got === "string" ? { text: got } : { b64: Buffer.from(got).toString("base64") };
    });
    await page.setContent(`<!doctype html><html><body style="margin:0;background:${opts.ground === "quartz" ? "#F2F0EA" : "#07101C"}"><iframe id="f" sandbox="allow-scripts" style="display:block;width:${width}px;height:900px;border:0"></iframe></body></html>`);
    await page.evaluate(`(${HOST})(${JSON.stringify(doc)}, ${JSON.stringify(opts.ground ?? "lapis")})`);
    await page.waitForTimeout(2000);
    const ready = await page.evaluate("window.ready") as boolean;
    const frame = page.frames().find((fr) => fr !== page.mainFrame());
    const height = await page.evaluate('document.getElementById("f").offsetHeight') as number;
    const drawn = frame ? await frame.evaluate(DRAWN) as number : 0;
    let screenshot: Uint8Array | undefined;
    if (opts.screenshot) { await page.setViewportSize({ width, height: Math.max(400, Math.min(height, 4000)) }); screenshot = await page.screenshot({ fullPage: true }); }
    // Every control touched: sliders to three quarters, choices to their second, buttons pressed, a drag on a canvas.
    if (frame) await frame.evaluate(TOUCH);
    await page.waitForTimeout(600);
    const said = await page.evaluate("window.said") as string[];
    return { rendered: ready, errors: [...new Set([...said, ...errors])].slice(0, 12), drawn, height, ...(screenshot ? { screenshot } : {}) };
  })();
  // An artifact that never yields (a loop with no end) is reported, not waited on.
  const timeout = new Promise<Rendered>((resolve) => setTimeout(() => resolve({ rendered: false, errors: ["it didn't finish starting within the time allowed: a loop that never ends?"], drawn: 0, height: 0 }), opts.timeout ?? 20_000));
  try { return await Promise.race([work, timeout]); } finally { await page.close().catch(() => undefined); }
}

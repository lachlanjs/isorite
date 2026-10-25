import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { findOpenCode, lastAsked, openCodeConfig, startScripted, type Scripted } from "@isorite/opencode";
import { PORT } from "./serve.ts";
import { setSwitch } from "./switches.ts";

// The terminal's session in Iso's pane (M11; M12: while Iso may edit files or run commands). A real OpenCode 2 server, against a scripted model, is
// attached to the test server for these tests only (as `isorite term` attaches one), and let go after. Skipped
// where OpenCode 2 is not installed.

let opencode: string | null = null;
try { opencode = findOpenCode().command; } catch { /* skipped */ }
test.skip(!opencode, "needs OpenCode 2");

const URL_ = `http://localhost:${PORT}`;
let root = "", model: Scripted | null = null, server: ChildProcess | null = null;

async function tell(path: string, body: unknown): Promise<Response> {
  const { token } = (await (await fetch(`${URL_}/api/session`)).json()) as { token: string };
  return fetch(URL_ + "/api/" + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: URL_ }, body: JSON.stringify(body) });
}

test.beforeAll(async () => {
  model = await startScripted((req) => {
    const asked = lastAsked(req);
    if (asked.includes("run the tests")) {
      if (req.messages.at(-1)?.role === "tool") return { text: "The tests pass." };
      return { tool: req.tools.find((t) => /^(shell|bash)$/.test(t)) ?? "shell", args: { command: "echo tests pass", description: "run the tests" } };
    }
    return { text: `Built: ${asked.split("\n")[0]}` };
  });
  root = mkdtempSync(join(tmpdir(), "isorite-build-"));
  const config = join(root, "opencode"), project = join(root, "project");
  mkdirSync(config); mkdirSync(project);
  writeFileSync(join(config, "opencode.json"), JSON.stringify({ ...openCodeConfig({ url: model.url, models: ["scripted"] }), permissions: [{ action: "shell", resource: "*", effect: "ask" }] }));
  const port = await new Promise<number>((done) => { const s = createServer().listen(0, "127.0.0.1", () => { const p = (s.address() as { port: number }).port; s.close(() => done(p)); }); });
  const password = randomBytes(12).toString("hex"), url = `http://127.0.0.1:${port}`;
  server = spawn(opencode!, ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: project, stdio: "ignore",
    env: { ...process.env, OPENCODE_CONFIG_DIR: config, OPENCODE_PASSWORD: password, ISORITE_GATEWAY_KEY: "k", XDG_CONFIG_HOME: join(root, "c"), XDG_DATA_HOME: join(root, "d"), XDG_STATE_HOME: join(root, "s") },
  });
  for (let i = 0; ; i++) {
    const r = await tell("terminal/attach", { url, password, directory: project });
    if (r.ok) break;
    if (i > 120) throw new Error("OpenCode's server did not start: " + (await r.text()));
    await new Promise((d) => setTimeout(d, 250));
  }
});

test.afterAll(async () => {
  await tell("terminal/detach", {}).catch(() => undefined);
  server?.kill();
  await model?.close();
  if (root) rmSync(root, { recursive: true, force: true });
});

const pane = (page: Page) => page.locator('[data-pane="iso"]');
const box = (page: Page) => page.getByRole("textbox", { name: "Message Iso" });
async function toIso(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
}

test("with a terminal attached and Iso allowed to run commands, the pane is its session: asked from here, answered, and a command allowed here", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await setSwitch(page, "run", true);
  const log = page.getByRole("log", { name: "The terminal's session" });
  await expect(log).toBeVisible();
  const name = test.info().project.name;
  await box(page).fill(`hello from ${name}`);
  await box(page).press("Enter");
  const turn = log.locator(".turn").filter({ hasText: `hello from ${name}` });
  await expect(turn.locator(".said")).toHaveText(`Built: hello from ${name}`);
  await expect(turn.locator(".from")).toHaveText("from here");

  // A command: OpenCode asks; it is allowed here, runs, and its line opens on its output.
  await box(page).fill("run the tests");
  await box(page).press("Enter");
  const asks = log.getByRole("group", { name: "The terminal's agent asks before it does this" });
  await expect(asks).toContainText("run echo tests pass");
  await page.screenshot({ path: `test-results/screens/${name}-build-asks.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await asks.getByRole("button", { name: "Allow once" }).click();
  const ran = log.locator(".turn").last();
  await expect(ran.locator(".said")).toHaveText("The tests pass.");
  await expect(asks).toHaveCount(0);
  await ran.locator(".tool summary").click();
  await expect(ran.locator(".tool pre")).toHaveText("tests pass");
  await page.screenshot({ path: `test-results/screens/${name}-build-ran.png`, fullPage: true });
  // Back to Iso's own conversation, and to the terminal's again: the session is kept.
  await setSwitch(page, "run", false);
  await expect(page.getByRole("log", { name: "The conversation with Iso" })).toBeVisible();
  await setSwitch(page, "run", true);
  await expect(turn.locator(".said")).toHaveText(`Built: hello from ${name}`);
});

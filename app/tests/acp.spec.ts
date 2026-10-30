import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { NOTES, PORT } from "./serve.ts";
import { setSwitch } from "./switches.ts";

// An agent's session over ACP in Iso's pane (M25): `isorite acp` between a front end (this test, as Toad would be)
// and a scripted ACP agent (no model), against the test server's base. Asked in the front end or in the pane; the
// files it reads with its own tools are the base's notes; what it asks back through isorite's MCP is kept here.

const MAIN = fileURLToPath(new URL("../../packages/server/src/main.ts", import.meta.url));
const SCRIPTED = fileURLToPath(new URL("../../packages/server/test/fixtures/scripted-acp.ts", import.meta.url));
const URL_ = `http://localhost:${PORT}`;
let wrapper: ChildProcess | null = null, session = "", id = 0;
const answers = new Map<number, { result?: { sessionId?: string } }>();

/** A request from the front end; its answer, once it comes. */
async function ask(method: string, params: object): Promise<{ result?: { sessionId?: string } }> {
  const mine = ++id;
  wrapper!.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: mine, method, params }) + "\n");
  await expect.poll(() => answers.has(mine), { timeout: 30_000 }).toBe(true);
  return answers.get(mine)!;
}

test.beforeAll(async () => {
  wrapper = spawn(process.execPath, [MAIN, "acp", "--agent", `"${process.execPath}" "${SCRIPTED}"`, NOTES, "--port", String(PORT)], { stdio: ["pipe", "pipe", "inherit"] });
  void (async () => {
    for await (const line of createInterface({ input: wrapper!.stdout! })) {
      const m = JSON.parse(line) as { id?: number; method?: string; result?: { sessionId?: string } };
      if (typeof m.id === "number" && !m.method) answers.set(m.id, m);
    }
  })();
  await ask("initialize", { protocolVersion: 1, clientCapabilities: {} });
  session = (await ask("session/new", { cwd: NOTES, mcpServers: [] })).result!.sessionId!;
  await expect.poll(async () => ((await (await fetch(`${URL_}/api/terminal`)).json()) as { session: string | null }).session, { timeout: 30_000 }).toBe(session);
});

test.afterAll(async () => {
  wrapper?.stdin?.end();
  wrapper?.kill();
});

const box = (page: Page) => page.getByRole("textbox", { name: "Message Iso" });
async function toIso(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
}

test("an ACP agent's session in the pane: asked in the front end, the notes it read with its own tools, a question back kept, a command allowed here", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await setSwitch(page, "run", true);
  const log = page.getByRole("log", { name: "The terminal's session" });
  await expect(log).toBeVisible();
  const name = test.info().project.name;

  // Asked in the front end: it reads a note's file and asks a question back through isorite's MCP.
  const asked = `read basics/bit.md\nask basics/bit\n${name}`;
  void ask("session/prompt", { sessionId: session, prompt: [{ type: "text", text: asked }] });
  const turn = log.locator(".turn").filter({ hasText: name });
  await expect(turn.locator(".from")).toHaveText("in the terminal");
  await expect(turn.locator(".tool").first()).toContainText("The bit");
  await expect(turn.locator(".said a[href]")).toHaveText("as the note says");
  const question = turn.locator(".asks");
  await expect(question).toContainText("Why does it drift?");
  await page.screenshot({ path: `test-results/screens/${name}-acp-turn.png`, fullPage: true });
  await question.getByRole("button", { name: /^Keep/ }).click();
  await expect(question.getByRole("button", { name: "Why does it drift?" })).toBeVisible();

  // Asked from here: the agent asks before a command, allowed here.
  await box(page).fill("permit");
  await box(page).press("Enter");
  const asks = log.getByRole("group", { name: "The terminal's agent asks before it does this" });
  await expect(asks).toContainText("Scripted wants to run ls");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await asks.getByRole("button", { name: "Allow once" }).click();
  await expect(asks).toHaveCount(0);
  const ran = log.locator(".turn").last();
  await expect(ran.locator(".from")).toHaveText("from here");
  await expect(ran.locator(".said")).toContainText("Done");
});

// A scripted ACP agent attached to the test server's base (M25), as the browser tests attach one: `isorite acp`
// between a front end (the test, as Toad would be) and the scripted agent (no model). What it does is a line each in
// the prompt (packages/server/test/fixtures/scripted-acp.ts); asked from the front end, or from the pane.

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { expect, type Page } from "@playwright/test";
import { NOTES, PORT } from "./serve.ts";

const MAIN = fileURLToPath(new URL("../../packages/server/src/main.ts", import.meta.url));
const SCRIPTED = fileURLToPath(new URL("../../packages/server/test/fixtures/scripted-acp.ts", import.meta.url));
const URL_ = `http://localhost:${PORT}`;

export interface Attached {
  /** A request from the front end, and its answer once it comes. */
  ask(method: string, params: object): Promise<{ result?: { sessionId?: string } }>;
  /** The session the front end opened. */
  session: string;
  detach(): void;
}

/** Attach the scripted agent, a session open from its front end, shown in the pane. */
export async function attach(): Promise<Attached> {
  const wrapper: ChildProcess = spawn(process.execPath, [MAIN, "acp", "--agent", `"${process.execPath}" "${SCRIPTED}"`, NOTES, "--port", String(PORT)], { stdio: ["pipe", "pipe", "inherit"] });
  const answers = new Map<number, { result?: { sessionId?: string } }>();
  let id = 0;
  void (async () => {
    for await (const line of createInterface({ input: wrapper.stdout! })) {
      const m = JSON.parse(line) as { id?: number; method?: string; result?: { sessionId?: string } };
      if (typeof m.id === "number" && !m.method) answers.set(m.id, m);
    }
  })();
  const ask = async (method: string, params: object) => {
    const mine = ++id;
    wrapper.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: mine, method, params }) + "\n");
    await expect.poll(() => answers.has(mine), { timeout: 30_000 }).toBe(true);
    return answers.get(mine)!;
  };
  await ask("initialize", { protocolVersion: 1, clientCapabilities: {} });
  const session = (await ask("session/new", { cwd: NOTES, mcpServers: [] })).result!.sessionId!;
  await expect.poll(async () => ((await (await fetch(`${URL_}/api/terminal`)).json()) as { session: string | null }).session, { timeout: 30_000 }).toBe(session);
  return { ask, session, detach: () => { wrapper.stdin?.end(); wrapper.kill(); } };
}

/** The pane's box, and Iso's pane brought forward on a phone. */
export const box = (page: Page) => page.getByRole("textbox", { name: "Message the agent" });
export async function toIso(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
}
/** The session shown in the pane. */
export const log = (page: Page) => page.getByRole("log", { name: "The agent's session" });

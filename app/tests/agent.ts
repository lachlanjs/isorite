// Helpers for the tests of the Agent pane. The test server offers a scripted model for isorite's own agent
// (ISORITE_SCRIPTED=1, packages/server/src/pi/scripted.ts): `attach()` puts it in the pane, with a new session, and
// `detach()` takes it out again, so the pane is as it was (no agent) for the tests that want none. A prompt to it is a
// script, a line each: `read <note>`, `edit <note> <old> => <new>`, `wait <ms>`, `fail <why>`, `draw`, `cite <link>`…

import { expect, request, type Page } from "@playwright/test";
import { PORT } from "./serve.ts";

const BASE = `http://localhost:${PORT}/`;

async function scripted(on: boolean): Promise<void> {
  const api = await request.newContext({ baseURL: BASE });
  try {
    const { token } = (await (await api.get("api/session")).json()) as { token: string };
    const res = await api.post("api/terminal/scripted", { data: { on }, headers: { "x-isorite-token": token, origin: new URL(BASE).origin } });
    expect(res.ok(), `the scripted model ${on ? "in" : "out"}: ${await res.text()}`).toBe(true);
  } finally { await api.dispose(); }
}

export interface Attached {
  detach(): Promise<void>;
}

/** The scripted model in the pane, in a new session. */
export async function attach(): Promise<Attached> {
  await scripted(true);
  return { detach: () => scripted(false) };
}

/** The pane's box, and the Agent pane brought forward on a phone. */
export const box = (page: Page) => page.getByRole("textbox", { name: "Message the agent" });
export async function toAgent(page: Page): Promise<void> {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Agent/ }).click();
}
/** The session shown in the pane. */
export const log = (page: Page) => page.getByRole("log", { name: "The agent's session" });
/** Ask in the box, and the turn it makes (by a word only it has). */
export async function ask(page: Page, text: string, mark: string) {
  // Not while the last turn runs: then it would be queued into that turn.
  await expect(page.getByRole("button", { name: "Stop the agent" })).toHaveCount(0, { timeout: 15_000 });
  await box(page).fill(text);
  await box(page).press("Enter");
  const turn = log(page).locator(".turn").filter({ hasText: mark });
  await expect(turn).toHaveCount(1);
  return turn;
}

import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { PORT } from "./serve.ts";

// The agent chosen for the pane (M25), with no front end of its own: from Iso's empty conversation, an agent of the
// ACP registry or a command, started by the server for this base; asked here; stopped from the drawer.

const SCRIPTED = fileURLToPath(new URL("../../packages/server/test/fixtures/scripted-acp.ts", import.meta.url));
const URL_ = `http://localhost:${PORT}`;

async function toIso(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Agent/ }).click();
}

test.afterEach(async () => {
  // None chosen, whatever the test left.
  const token = ((await (await fetch(`${URL_}/api/session`)).json()) as { token: string }).token;
  await fetch(`${URL_}/api/acp/choose`, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: URL_ }, body: JSON.stringify({ choice: null }) });
  await expect.poll(async () => ((await (await fetch(`${URL_}/api/terminal`)).json()) as { connected: boolean }).connected, { timeout: 15_000 }).toBe(false);
});

test("an agent chosen for the pane: the registry's listed, a command attached, asked here, stopped from the drawer", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  const pane = page.locator('[data-pane="iso"]');
  // No agent attached: how to attach one.
  const attach = pane.getByRole("region", { name: "Choose your agent" });
  await expect(attach).toContainText("choose your agent", { timeout: 15_000 });

  // The registry's agents, to choose from; or a command of your own.
  await attach.getByRole("button", { name: "another agent" }).click();
  const pick = attach.getByRole("combobox", { name: "An agent of the ACP registry" });
  await expect(pick.locator("option")).toHaveText(["An agent of the ACP registry…", "Claude Agent 0.99.1", "Codex 2.5.0"]);
  await attach.getByRole("textbox", { name: "Or the command of an ACP agent" }).fill(`"${process.execPath}" "${SCRIPTED}"`);
  await attach.locator("form").getByRole("button", { name: "use in this pane" }).click();

  // Started for this base: the pane is its session, asked here.
  const log = page.getByRole("log", { name: "The agent's session" });
  await expect(log).toContainText("Scripted's session shows here", { timeout: 30_000 });
  const name = test.info().project.name;
  await page.getByRole("textbox", { name: "Message the agent" }).fill(`read basics/bit.md\n${name}`);
  await page.getByRole("textbox", { name: "Message the agent" }).press("Enter");
  const turn = log.locator(".turn").filter({ hasText: name });
  await expect(turn.locator(".from")).toHaveText("from here");
  await expect(turn.locator(".said a[href]")).toHaveText("as the note says", { timeout: 30_000 });

  // Stopped from the drawer: the pane says again how to attach one.
  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(page.getByText("Started for this pane:")).toBeVisible();
  await page.getByRole("button", { name: "stop it" }).click();
  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(log).toBeHidden({ timeout: 15_000 });
  await expect(attach).toBeVisible();
});

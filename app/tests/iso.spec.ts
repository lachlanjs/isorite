// Iso's settings, and a terminal agent's edits waiting in a note. Asking Iso is in Iso's pane (pane.spec.ts):
// asking in the text was taken out in M10.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES, REPLY, ROOT } from "./serve.ts";

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const onDisk = (id: string) => readFileSync(join(NOTES, `${id}.md`), "utf8");
const phone = () => test.info().project.name.startsWith("phone");
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

/** A note of this test's own, with two paragraphs; the page opened on it. */
async function open(page: Page, what: string): Promise<{ id: string; text: string }> {
  const id = `iso/${what}-${test.info().project.name}`;
  const text = `---\ntype: Concept\ntitle: Entropy ${what}\n---\n\nThe average surprise of a source.\n\nIt is largest when every symbol is equally likely.\n`;
  writeFileSync(join(NOTES, `${id}.md`), text, { flag: "w" });
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The average surprise of a source.");
  return { id, text };
}

async function toIso(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
}

test.beforeAll(() => { mkdirSync(join(NOTES, "iso"), { recursive: true }); });

test("settings are in each pane's header: the ground in the Note pane's, and in Iso's a key that goes in and is not shown again", async ({ page }) => {
  await page.goto("#/notes");
  await page.getByRole("button", { name: "Note settings" }).click();
  const note = page.getByRole("dialog", { name: "Note settings" });
  await look(page, "note-settings");
  await note.getByRole("radio", { name: "quartz" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ground", "quartz");
  await note.getByRole("radio", { name: "lapis" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ground", "lapis");
  await note.getByRole("radio", { name: "the system's" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ground", /.+/);
  await page.keyboard.press("Escape");
  await expect(note).toHaveCount(0);

  await toIso(page);
  await page.getByRole("button", { name: "Iso settings" }).click();
  const menu = page.getByRole("dialog", { name: "Iso settings" });
  await expect(menu).toContainText("Asked through scripted.");
  await look(page, "settings");

  const secret = `sk-test-${test.info().project.name}`;
  await menu.getByLabel("Provider key").fill(secret);
  await menu.getByRole("button", { name: "hold it" }).click();
  await expect(menu).toContainText("A key is held on this device.");
  await expect(menu.getByLabel("Provider key")).toHaveValue("");
  expect(await page.content()).not.toContain(secret);
  expect(readFileSync(join(ROOT, "config", "isorite", "config.toml"), "utf8")).toContain(secret);
  await menu.getByRole("button", { name: "forget it" }).click();
  await expect(menu).toContainText("No key is held yet");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("a key is made by signing in at the provider, and comes back to where you were", async ({ page }) => {
  await page.goto("#/notes");
  await toIso(page);
  await page.getByRole("button", { name: "Iso settings" }).click();
  const menu = page.getByRole("dialog", { name: "Iso settings" });
  await menu.getByRole("button", { name: "sign in at scripted for a new key" }).click();
  // The scripted sign-in sends you straight back with a code; the engine exchanges it for the key.
  await expect(menu).toContainText("Signed in at scripted: a key was made for isorite");
  await expect(menu).toContainText("A key is held on this device.");
  await look(page, "settings-signed-in");
  expect(page.url()).not.toContain("code=");
  expect(new URL(page.url()).hash).toBe("#/notes");
  expect(await page.content()).not.toContain("sk-scripted-made");
  expect(readFileSync(join(ROOT, "config", "isorite", "config.toml"), "utf8")).toContain("sk-scripted-made");
  // A code that is not ours, or used twice, is refused, and said so.
  await page.goto("/?code=code-x&state=not-ours#/notes");
  await expect(page.getByRole("dialog", { name: "Settings" })).toContainText("This sign-in was not begun here");
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "forget it" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});

test("a terminal agent's edit to a note waits in it as Iso's changes do, says whose it is, and is kept the same way", async ({ page, baseURL }) => {
  const { id, text } = await open(page, "agent");
  const { token } = await (await page.request.get("api/session")).json() as { token: string };
  const proposed = await page.request.post("api/agent/propose", {
    headers: { Origin: new URL(baseURL!).origin, "x-isorite-token": token },
    data: { agent: "opencode", session: `ses-${test.info().project.name}`, note: `${id}.md`, asked: "say it plainly", edit: { oldString: "The average surprise", newString: "How surprised you are, on average," } },
  });
  expect(proposed.ok()).toBe(true);
  const change = page.locator("[data-change]");
  await expect(change).toHaveCount(1);
  await expect(change.locator(".new")).toHaveText("How surprised you are, on average,");
  await expect(page.locator(".cm-iso-old")).toHaveText("The average surprise");
  await expect(change.locator(".who")).toHaveText("OpenCode");
  await expect(change.locator(".who")).toHaveAttribute("title", "say it plainly");
  await expect(page.getByText("1 change from OpenCode waiting")).toBeVisible();
  expect(onDisk(id)).toBe(text);
  await look(page, "agent-change");
  await change.getByRole("button", { name: "Keep this change" }).click();
  await expect(change).toHaveCount(0);
  expect(onDisk(id)).toBe(text.replace("The average surprise", "How surprised you are, on average,"));
});

// Each pane's settings, and an agent's edits to a note, marked as its own. An agent's session in Iso's pane is in
// acp.spec.ts.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES } from "./serve.ts";
import { setSwitch } from "./switches.ts";

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

test("settings are in each pane's header: the ground in the Note pane's, and in Iso's the base's AGENTS.md", async ({ page }) => {
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
  const agents = menu.getByLabel("AGENTS.md: your instructions for this base");
  await expect(agents).toBeVisible();
  await look(page, "settings");
  const said = `Answer briefly, ${test.info().project.name}.`;
  await agents.fill(said);
  await agents.blur();
  await expect.poll(() => (existsSync(join(NOTES, "AGENTS.md")) ? readFileSync(join(NOTES, "AGENTS.md"), "utf8") : "")).toBe(`${said}\n`);
  await agents.fill("");
  await agents.blur();
  await expect.poll(() => readFileSync(join(NOTES, "AGENTS.md"), "utf8")).toBe("");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("an agent's edit to a note is written at once, its words marked as its own with provenance on (M11)", async ({ page, baseURL }) => {
  const { id, text } = await open(page, "agent");
  const { token } = await (await page.request.get("api/session")).json() as { token: string };
  const written = await page.request.post("api/agent/write", {
    headers: { Origin: new URL(baseURL!).origin, "x-isorite-token": token },
    data: { agent: "opencode", session: `ses-${test.info().project.name}`, note: `${id}.md`, asked: "say it plainly", edit: { oldString: "The average surprise", newString: "How surprised you are, on average," } },
  });
  expect(written.ok()).toBe(true);
  expect(onDisk(id)).toBe(text.replace("The average surprise", "How surprised you are, on average,"));
  await expect(editor(page)).toContainText("How surprised you are, on average, of a source.");
  // Nothing waits; with provenance on the agent's words are marked.
  await expect(page.locator("[data-change]")).toHaveCount(0);
  if (phone()) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Note/ }).click();
  await setSwitch(page, "provenance", true);
  // Mostly the agent's words, so the sentence is marked whole.
  await expect(page.locator(".cm-iso-by-iso")).toHaveText(["How surprised you are, on average, of a source."]);
  await look(page, "agent-change");
});

test("agents may edit the notes unless switched off: kept by the server, over a reload", async ({ page, request }) => {
  await page.goto("./");
  await toIso(page);
  const sw = page.locator('[data-pane="iso"] .sw[data-switch="notes"]');
  await expect(sw).toHaveAttribute("aria-pressed", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => (await (await request.get("api/agents/notes")).json()).may).toBe(false);
  await page.reload();
  await toIso(page);
  await expect(sw).toHaveAttribute("aria-pressed", "false");
  await sw.click();
  await expect.poll(async () => (await (await request.get("api/agents/notes")).json()).may).toBe(true);
});

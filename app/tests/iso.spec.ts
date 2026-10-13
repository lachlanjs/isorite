import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

/** Open the prompt under the first paragraph: Ctrl+Enter on a desktop, the field at the foot on a phone. */
async function prompt(page: Page, asked: string) {
  await editor(page).getByText("The average surprise of a source.").click();
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
  const field = page.getByRole("textbox", { name: "Ask Iso" });
  await expect(field).toBeFocused();
  await field.fill(asked);
  await field.press("Enter");
}

test.beforeAll(() => { mkdirSync(join(NOTES, "iso"), { recursive: true }); });

test("Iso's text arrives between dotted rules, is not in the file until kept, and is still there after a reload", async ({ page }) => {
  const { id, text } = await open(page, "ask");
  await prompt(page, "say what it is measured in");

  const block = page.locator(".between[data-proposal]");
  await expect(block).toBeVisible();
  await expect(block.locator("strong")).toHaveText("bits");
  await expect(block.locator(".katex-display")).toBeVisible();
  await expect(block.getByRole("link", { name: "Surprise" })).toBeVisible();
  // It sits under the paragraph the cursor was in, above the next.
  const order = await page.evaluate(() => [...document.querySelectorAll(".cm-content > *")].map((el) => (el.classList.contains("cm-overlay") ? "ISO" : el.textContent)).filter(Boolean));
  expect(order).toEqual(["The average surprise of a source.", "ISO", "It is largest when every symbol is equally likely."]);
  // The note's file is byte for byte what it was.
  expect(onDisk(id)).toBe(text);
  await look(page, "proposal");

  // The prompt is the other face of the same block.
  await block.getByRole("radio", { name: "prompt" }).click();
  await expect(block).toContainText("say what it is measured in");
  await block.getByRole("radio", { name: "answer" }).click();

  // Closing the browser with it waiting, and coming back: it is there again, and the file is still untouched.
  await page.reload();
  await expect(page.locator(".between[data-proposal] strong")).toHaveText("bits");
  expect(onDisk(id)).toBe(text);

  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("saved");
  expect(onDisk(id)).toBe(text.replace("source.\n\n", () => `source.\n\n${REPLY}\n\n`));
  // Kept, it is ordinary prose of the note.
  await expect(editor(page).locator(".cm-lp-strong")).toHaveText("bits");
  await expect(editor(page).locator(".katex-display")).toBeVisible();
});

test("Iso's text can be edited before it is kept, or removed and leave the note as it was", async ({ page }) => {
  const { id, text } = await open(page, "edit");
  await prompt(page, "say what it is measured in");
  const block = page.locator(".between[data-proposal]");
  await block.getByRole("button", { name: "edit" }).click();
  await block.getByRole("textbox", { name: "Iso's text, to edit" }).fill("In bits, to base 2.");
  await block.getByRole("button", { name: "done" }).click();
  await expect(block).toContainText("In bits, to base 2.");
  expect(onDisk(id)).toBe(text);
  await page.reload(); // the edit is kept across a reload too
  await expect(page.locator(".between[data-proposal]")).toContainText("In bits, to base 2.");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  expect(onDisk(id)).toBe(text.replace("source.\n\n", "source.\n\nIn bits, to base 2.\n\n"));

  await prompt(page, "and again");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "remove" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  expect(onDisk(id)).toBe(text.replace("source.\n\n", "source.\n\nIn bits, to base 2.\n\n"));
  const journal = await (await page.request.get(`api/journal?id=${id}`)).json() as { kind: string; why?: string }[];
  expect(journal.map((e) => e.why ?? e.kind)).toEqual(["start", "proposal", "revise", "keep", "proposal", "discard"]);
});

test("what Iso looks up is told while it works; it can be stopped, and a refusal is said plainly", async ({ page }) => {
  const { id, text } = await open(page, "work");
  await prompt(page, "look it up first");
  await expect(page.locator(".between.working")).toContainText("Read Surprise");
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
  await page.locator(".between[data-proposal]").getByRole("button", { name: "remove" }).click();

  await prompt(page, "be slow about it");
  await expect(page.locator(".between.working")).toContainText("Iso is writing");
  await look(page, "working");
  await page.getByRole("button", { name: "[ stop ]" }).click();
  await expect(page.locator(".between")).toHaveCount(0);

  await prompt(page, "fail this one");
  await expect(page.getByRole("alert")).toContainText("the scripted provider was told to fail");
  await page.getByRole("button", { name: "[ dismiss ]" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  expect(onDisk(id)).toBe(text);
});

test("typing in the note while Iso's text waits does not disturb it, and it is kept where it belongs", async ({ page }) => {
  const { id } = await open(page, "typing");
  await prompt(page, "say what it is measured in");
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
  await editor(page).getByText("It is largest when every symbol is equally likely.").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nA closing line typed meanwhile.");
  await expect(page.getByRole("status")).toHaveText("saved");
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  expect(onDisk(id)).toContain("source.\n\nIt is measured in **bits**");
  expect(onDisk(id)).toContain("equally likely.\n\nA closing line typed meanwhile.");
});

test("settings are behind the logo: the ground, and a key that goes in and is not shown again", async ({ page }) => {
  await page.goto("#/notes");
  await page.getByRole("button", { name: "isorite: settings" }).click();
  const menu = page.getByRole("dialog", { name: "Settings" });
  await expect(menu).toContainText("Asked through scripted.");
  await look(page, "settings");

  await menu.getByRole("radio", { name: "quartz" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ground", "quartz");
  await menu.getByRole("radio", { name: "lapis" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ground", "lapis");
  await menu.getByRole("radio", { name: "the system's" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ground", /.+/);

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

test("a prompt sent twice in a hurry is asked once", async ({ page }) => {
  const { id } = await open(page, "twice");
  await editor(page).getByText("The average surprise of a source.").click();
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
  const field = page.getByRole("textbox", { name: "Ask Iso" });
  await field.fill("say what it is measured in");
  // Two Enters before the page can have heard anything back.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator(".between[data-proposal]")).toHaveCount(1);
  await expect(page.locator(".between")).toHaveCount(1);
  const journal = await (await page.request.get(`api/journal?id=${id}`)).json() as { kind: string }[];
  expect(journal.filter((e) => e.kind === "proposal")).toHaveLength(1);
});

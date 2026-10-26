// Diagrams and code, drawn (M19): a Mermaid block drawn by Pele in the note, kept beneath its source while it is
// edited and saying why it can't be drawn; code coloured by its language, in colour or in ink; and Iso's answer with
// a diagram and code, drawn in its pane with a copy icon on the code.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES } from "./serve.ts";

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const phone = () => test.info().project.name.startsWith("phone");
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

const NOTE = (title: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\nHow it goes:\n\n\`\`\`mermaid\nflowchart LR\n  a[A source] -->|emits| b[A symbol] --> c[Its surprise] --> d[The entropy]\n\`\`\`\n\nIn code:\n\n\`\`\`python\ndef surprise(p):\n    return -log2(p)  # in bits\n\`\`\`\n\nThe end.\n`;

async function open(page: Page, what: string): Promise<string> {
  const id = `drawn/${what}-${test.info().project.name}`;
  writeFileSync(join(NOTES, `${id}.md`), NOTE(`Drawn ${what}`), { flag: "w" });
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("How it goes:");
  return id;
}

test.beforeAll(() => { mkdirSync(join(NOTES, "drawn"), { recursive: true }); });

test("a diagram is drawn in the note, kept beneath its source while edited, and says why when it can't be drawn", async ({ page }) => {
  const id = await open(page, "diagram");
  const diagram = page.locator(".cm-lp-diagram").first();
  await expect(diagram.locator("svg").first()).toBeVisible();
  await expect(diagram).toContainText("Its surprise");
  await expect(diagram.locator(".cm-lp-diagram-src")).toBeHidden();
  // The code beside it is coloured, with its language's name.
  await expect(page.locator(".cm-lp-lang")).toHaveText("python");
  await expect(editor(page).locator(".tok-k").first()).toHaveText("def");
  await expect(editor(page).locator(".tok-c")).toHaveText("# in bits");
  await look(page, "diagram");

  // Clicking it puts the cursor in its source; the drawing stays beneath and follows the typing.
  await diagram.click();
  await expect(page.locator(".cm-lp-diagram.cm-lp-beneath")).toHaveCount(1);
  await expect(editor(page)).toContainText("flowchart LR");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("End");
  await page.keyboard.type(" --> e[Bits]");
  await expect(page.locator(".cm-lp-diagram.cm-lp-beneath")).toContainText("Bits");
  // A mistake: the last drawing stays, with Pele's reason under it.
  await page.keyboard.type(" -->|");
  await expect(page.locator(".cm-lp-diagram.cm-lp-beneath")).toHaveClass(/cm-lp-broken-diagram/);
  await expect(page.locator(".cm-lp-diagram.cm-lp-beneath")).toContainText(/line \d/);
  // The file is only ever what was typed.
  await expect.poll(() => readFileSync(join(NOTES, `${id}.md`), "utf8")).toContain("e[Bits] -->|");
});

test("code is in colour, or in ink by the Note pane's setting", async ({ page }) => {
  await open(page, "ink");
  const def = editor(page).locator(".tok-k").first();
  await expect(def).toHaveText("def");
  const colour = await def.evaluate((e) => getComputedStyle(e).color);
  await page.getByRole("button", { name: "Note settings" }).click();
  const settings = page.getByRole("dialog", { name: "Note settings" });
  await settings.getByRole("radio", { name: "in ink" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-code", "ink");
  await page.keyboard.press("Escape");
  expect(await def.evaluate((e) => getComputedStyle(e).color)).not.toBe(colour);
  expect(await def.evaluate((e) => getComputedStyle(e).fontWeight)).toBe("700");
  await look(page, "code-ink");
  // Kept in this browser, from the first paint.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-code", "ink");
  await page.getByRole("button", { name: "Note settings" }).click();
  await page.getByRole("dialog", { name: "Note settings" }).getByRole("radio", { name: "in colour" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-code", "ink");
});

test("Iso's answer with a diagram and code is drawn in its pane, and the code can be copied", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page, "iso");
  if (phone()) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
  const box = page.getByRole("textbox", { name: "Message Iso" });
  await box.fill(`draw how surprise and entropy stand, ${test.info().project.name}`);
  await box.press("Enter");
  const said = page.locator('[data-pane="iso"] .said').last();
  await expect(said.locator(".diagram svg").first()).toBeVisible();
  await expect(said.locator(".diagram")).toContainText("Entropy");
  await expect(said.locator(".code-lang")).toHaveText("python");
  await expect(said.locator(".tok-k").first()).toHaveText("def");
  await said.locator(".code-block").hover();
  await said.getByRole("button", { name: "Copy the code" }).click();
  await expect(said.locator(".code-copy.done")).toHaveCount(1);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("return -log2(p)");
  await look(page, "iso-drawn");
});

test("a diagram's text is only text: no script, handler or link from a note gets through; Markdown's own marks keep theirs", async ({ page }) => {
  const id = `drawn/hostile-${test.info().project.name}`;
  const hostile = '---\ntype: Concept\ntitle: Hostile\n---\n\nSee [Surprise](/basics/surprise.md "requires").\n\n```mermaid\nflowchart LR\n  a["<img src=x onerror=window.__hit=1>"] --> b["<script>window.__hit=2</script>"]\n  click a "javascript:window.__hit=3"\n```\n';
  writeFileSync(join(NOTES, `${id}.md`), hostile, { flag: "w" });
  await page.goto(`#/n/${id}`);
  const diagram = page.locator(".cm-lp-diagram").first();
  await expect(diagram.locator("svg").first()).toBeVisible();
  await diagram.locator("svg").first().click({ force: true });
  expect(await page.evaluate(() => (window as { __hit?: number }).__hit)).toBeUndefined();
  expect(await diagram.locator("script, img, a[href^='javascript'], [onerror]").count()).toBe(0);
  // The link's title is the note's own Markdown, not code: it isn't coloured as a string.
  expect(await editor(page).locator(".tok-s").count()).toBe(0);
});

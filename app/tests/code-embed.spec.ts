// Code in a note by symbol (M29): `![…](code:src/huffman.py#build)` shows the function in place, coloured, with the
// lines it has now, and still finds it when the code has moved; a symbol that is gone says so.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES, ROOT } from "./serve.ts";

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const name = () => test.info().project.name;

test("code is shown in place by its symbol, found again where it has moved, and a symbol gone is said so", async ({ page }) => {
  const file = `src/embed-${name()}.py`, id = `drawn/code-${name()}`;
  mkdirSync(join(ROOT, "code", "src"), { recursive: true });
  mkdirSync(join(NOTES, "drawn"), { recursive: true });
  writeFileSync(join(ROOT, "code", file), "def build(freqs):\n    heap = list(freqs)\n    return heap\n\n\ndef decode(bits):\n    pass\n");
  writeFileSync(join(NOTES, `${id}.md`), `---\ntype: Concept\ntitle: Code ${name()}\n---\n\nThe build:\n\n![the build](code:${file}#build)\n\nAnd ![gone](code:${file}#vanished) is not there.\n`);
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The build:");
  const embeds = page.locator("[data-code-embed]");
  await expect(embeds.first().locator(".sym")).toHaveText("build");
  await expect(embeds.first().locator(".lines")).toHaveText("lines 1–3");
  await expect(embeds.first()).toContainText("return heap");
  await expect(embeds.first().locator(".tok-k").first()).toHaveText("def");
  await expect(embeds.first()).not.toContainText("def decode");
  await expect(embeds.nth(1)).toContainText("no longer in the file by that name");

  // The code moves down: the same link finds it, on its new lines.
  writeFileSync(join(ROOT, "code", file), "# a header\n# of\n# four\n# lines\n\ndef build(freqs):\n    heap = list(freqs)\n    return heap\n\n\ndef decode(bits):\n    pass\n");
  await page.reload();
  await expect(embeds.first().locator(".lines")).toHaveText("lines 6–8");
  expect((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))).toBe(true);
  await page.screenshot({ path: `test-results/screens/${name()}-code-embed.png` });
});

test("a code link's file is read in full, the lines it names marked", async ({ page }) => {
  const file = `src/reader-${name()}.py`;
  mkdirSync(join(ROOT, "code", "src"), { recursive: true });
  const body = Array.from({ length: 150 }, (_, i) => `# line ${i + 1}`);
  writeFileSync(join(ROOT, "code", file), [...body, "def last(x):", "    return x", ""].join("\n"));
  // Whole, with the symbol marked, and a file longer than the 120 lines shown in place.
  await page.goto(`#/code/${file}?at=${encodeURIComponent("last")}`);
  const reader = page.getByRole("region", { name: `The file ${file}` });
  await expect(reader).toContainText("# line 150");
  await expect(reader.locator('[data-n="152"]')).toContainText("return x");
  await expect(reader.locator(".row.on")).toHaveCount(2);
  await expect(page.getByText("152 lines")).toBeVisible();
  // A line chosen by its number is what the copied link names.
  await reader.getByRole("button", { name: "Line 5", exact: true }).click();
  await expect(page.locator(".link")).toHaveText(`code:${file}#L5`);
  await page.screenshot({ path: `test-results/screens/${name()}-code-reader.png` });
  // From the code shown in place: its file's name opens it.
  mkdirSync(join(NOTES, "drawn"), { recursive: true });
  writeFileSync(join(NOTES, "drawn", `reads-${name()}.md`), `---\ntype: Concept\ntitle: Reads ${name()}\n---\n\n![last](code:${file}#last)\n`);
  await page.goto(`#/n/drawn/reads-${name()}`);
  await page.locator("[data-code-embed] a.file").click();
  await expect(page.getByRole("region", { name: `The file ${file}` })).toBeVisible();
});

test("a name typed after [[ that is no note's is made one, beside this note", async ({ page }) => {
  const id = `drawn/maker-${name()}`;
  mkdirSync(join(NOTES, "drawn"), { recursive: true });
  writeFileSync(join(NOTES, `${id}.md`), `---\ntype: Concept\ntitle: Maker ${name()}\n---\n\nStart.\n`);
  await page.goto(`#/n/${id}`);
  const box = editor(page);
  await expect(box).toContainText("Start.");
  await box.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type(` see [[brand-new-${name()}`);
  const offer = page.getByRole("option", { name: new RegExp(`a new note in drawn`) });
  await expect(offer).toBeVisible();
  await expect(offer).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(200); // the list ignores a key for a moment after it changes
  await page.keyboard.press("Enter");
  await expect(box).toContainText(/Brand new desktop|Brand new phone/);
  await expect.poll(() => existsSync(join(NOTES, "drawn", `brand-new-${name()}.md`))).toBe(true);
});

test("Ctrl and a click on a plain link to a file, or on an embed, opens the code reader", async ({ page }) => {
  const file = `src/ctrl-${name()}.py`;
  mkdirSync(join(ROOT, "code", "src"), { recursive: true });
  mkdirSync(join(NOTES, "drawn"), { recursive: true });
  writeFileSync(join(ROOT, "code", file), "def f():\n    pass\n");
  writeFileSync(join(NOTES, "drawn", `ctrl-${name()}.md`), `---\ntype: Concept\ntitle: Ctrl ${name()}\n---\n\nRead [the file](code:${file}) here.\n`);
  await page.goto(`#/n/drawn/ctrl-${name()}`);
  await expect(editor(page)).toContainText("Read");
  await page.getByText("the file", { exact: true }).click({ modifiers: ["Control"] });
  await expect(page.getByRole("region", { name: `The file ${file}` })).toBeVisible();
});

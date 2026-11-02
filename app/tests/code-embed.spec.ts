// Code in a note by symbol (M29): `![…](code:src/huffman.py#build)` shows the function in place, coloured, with the
// lines it has now, and still finds it when the code has moved; a symbol that is gone says so.

import { mkdirSync, writeFileSync } from "node:fs";
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

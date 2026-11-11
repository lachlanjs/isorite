// Code in the notes (docs/files.md): off the Atlas and the list until the code switch is on, then an item in its
// folder with its own glyph, opened by one click in the Note pane as its source: read only, lines numbered and coloured,
// a long line scrolling in its box. A code link into the repository opens its file in the code reader.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { NOTES } from "./serve.ts";
import { setSwitch } from "./switches.ts";

const FILE = "basics/toss.py";

test("a code file in the base is hidden until the code switch is on, then sits in its folder and opens as text", async ({ page }) => {
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="basics/surprise"]')).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) <= 760) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
  await setSwitch(page, "code", false);
  await expect(page.locator(`[data-note="${FILE}"]`)).toHaveCount(0);
  await setSwitch(page, "code", true);
  const item = page.locator(`[data-note="${FILE}"]`);
  await expect(item).toBeVisible();
  await expect(item).toHaveClass(/file/);
  await expect(item.locator(".glyph")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-code-file-atlas.png` });
  // A code file has no routes to light: one click opens it, its source in the Note pane, lines numbered and coloured.
  await item.click();
  await expect(page).toHaveURL(/#\/n\/basics\/toss\.py/);
  const source = page.locator(`[data-source][data-point="code:/${FILE}"]`);
  await expect(source).toBeVisible();
  await expect(source.locator('.row[data-n="3"]')).toHaveText("3def toss():");
  await expect(source.locator(".tok-k").first()).toHaveText("import");
  expect(await source.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
  await expect(page.locator(".file .kind")).toContainText("code");
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-code-file-page.png` });
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="basics/surprise"]')).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) <= 760) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
  await setSwitch(page, "code", false);
});

test("the list of notes holds a code file only while the code switch is on", async ({ page }) => {
  await page.goto("#/notes");
  await expect(page.locator('.notes section[data-dir="basics"] [data-file="basics/tosses.csv"]')).toBeVisible();
  await expect(page.locator(`[data-file="${FILE}"]`)).toHaveCount(0);
  await page.goto("#/atlas");
  await setSwitch(page, "code", true);
  await page.goto("#/notes");
  await expect(page.locator(`[data-file="${FILE}"]`)).toBeVisible();
  await page.goto("#/atlas");
  await setSwitch(page, "code", false);
});

test("a code file's source is read only, a long line scrolls in its box, not the page, and a selection of it can be pointed to", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const file = `basics/long-${test.info().project.name}.py`;
  writeFileSync(join(NOTES, file), `def long():\n    return "${"a very long string ".repeat(12)}"\n\ndef short():\n    return 1\n`);
  await page.goto(`#/n/${file}`);
  const source = page.locator(`[data-point="code:/${file}"]`);
  await expect(source.locator('.row[data-n="4"]')).toContainText("def short():");
  // Not to be written in, and no wider than the window: the long line runs on inside the box, unwrapped.
  await expect(page.locator('[data-pane="note"] [contenteditable="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await source.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  const row = (await source.locator('.row[data-n="2"]').boundingBox())!, next = (await source.locator('.row[data-n="3"]').boundingBox())!;
  expect(next.y - row.y).toBeLessThan(30);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-code-file-long.png` });
  // A line chosen: its tags copy where it is, by its path in the base, and its words.
  await source.locator('.row[data-n="4"] .code').evaluate((el) => { const r = document.createRange(); r.selectNodeContents(el); getSelection()!.removeAllRanges(); getSelection()!.addRange(r); });
  await expect(page.locator('.tag[data-tag="copy"]')).toBeVisible();
  await page.locator('.tag[data-tag="copy"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(new RegExp(`^/${file.replace(/\./g, "\\.")}, line 4:\n> def short\\(\\):`));
});

test("a code link into the repository, beside its note on the Atlas, opens its file in the code reader", async ({ page }) => {
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="channels/huffman-in-code"]')).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) <= 760) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
  await setSwitch(page, "code", true);
  await expect(page.locator('span.sat.code.broken[data-sat^="channels/huffman-in-code code:src/decode.py"]')).toHaveCount(1);
  const link = page.locator('a.sat.code[data-sat^="channels/huffman-in-code code:src/huffman.py"]');
  await expect(link).toHaveAttribute("aria-label", "build, in the repository");
  await link.click();
  await expect(page).toHaveURL(/#\/code\/src\/huffman\.py/);
  await expect(page.locator('[data-point="code:src/huffman.py"] .row[data-n="1"]')).toContainText("def build(freqs):");
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="channels/huffman-in-code"]')).toBeVisible();
  if ((page.viewportSize()?.width ?? 1280) <= 760) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
  await setSwitch(page, "code", false);
});

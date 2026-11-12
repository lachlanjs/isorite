// A long press is isorite's own (M33): on a note, an island's heading or the Atlas, the browser's menu (copy link, open in a
// new tab, select) is kept off, and the hold chooses no text. A mouse's right click, with nothing held, keeps the browser's
// menu, and the note's own text can still be chosen and its menu opened.

import { expect, test, type Locator, type Page } from "@playwright/test";

/** A menu asked for on `at` by a finger's long press (or a mouse's right click): whether the page kept the browser's own off. */
const kept = (at: Locator, by: "touch" | "mouse") => at.evaluate((el, pointerType) => {
  const r = el.getBoundingClientRect();
  const e = new PointerEvent("contextmenu", { pointerType, bubbles: true, cancelable: true, clientX: r.left + 8, clientY: r.top + r.height / 2 });
  return !el.dispatchEvent(e);
}, by);
const selectable = (at: Locator) => at.evaluate((el) => getComputedStyle(el).userSelect !== "none");

async function phonePane(page: Page, name: "Atlas" | "Note") {
  if ((page.viewportSize()?.width ?? 1280) > 760) return;
  await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect.poll(() => page.locator(`[data-pane="${name.toLowerCase()}"]`).evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
}

test("a long press on a note, an island heading or the Atlas shows isorite's tags, not the browser's menu", async ({ page }) => {
  await page.goto("#/notes");
  const row = page.locator('li[data-row="basics/bit"]'), heading = page.locator("h2.head", { hasText: /^basics/ });
  await expect(row).toBeVisible();
  expect(await kept(row, "touch")).toBe(true);
  expect(await kept(row.locator("a").first(), "touch")).toBe(true);
  expect(await kept(heading, "touch")).toBe(true);
  // Held, the row and the heading choose no text.
  expect(await selectable(row)).toBe(false);
  expect(await selectable(heading)).toBe(false);
  // A right click with a mouse, nothing held: the browser's own menu, as anywhere isorite has none.
  expect(await kept(row, "mouse")).toBe(false);

  await page.goto("#/atlas");
  await phonePane(page, "Atlas");
  const note = page.locator('.atlas [data-note="coding/huffman-codes"]'), island = page.locator('.atlas [data-folder="coding"]');
  await expect(note).toBeVisible();
  expect(await kept(note, "touch")).toBe(true);
  expect(await kept(island, "touch")).toBe(true);
  expect(await selectable(note)).toBe(false);
  expect(await kept(note, "mouse")).toBe(false);

  // A note's own text is still the reader's: chosen as text, its menu the browser's.
  await page.goto("#/n/basics/bit");
  await phonePane(page, "Note");
  const text = page.locator('[data-pane="note"] .cm-content, [data-pane="note"] p').first();
  await expect(text).toBeVisible();
  expect(await selectable(text)).toBe(true);
  expect(await kept(text, "touch")).toBe(false);
});

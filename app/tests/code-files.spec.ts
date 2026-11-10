// Code in the notes (docs/files.md): off the Atlas and the list until the code switch is on, then an item in its
// folder with its own glyph, and open in the Note pane as read-only text.

import { expect, test } from "@playwright/test";
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
  // The first click chooses it, the second opens it.
  await item.click();
  await item.click();
  await expect(page).toHaveURL(/#\/n\/basics\/toss\.py/);
  const source = page.locator("pre[data-source]");
  await expect(source).toContainText("def toss():");
  expect(await source.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/mono/i);
  await expect(page.locator(".file .kind")).toContainText("code");
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-code-file-page.png` });
  await page.goto("#/atlas");
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

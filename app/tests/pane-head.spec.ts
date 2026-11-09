// A pane's header folds what does not fit into a menu at its right, the least needed first.

import { expect, test } from "@playwright/test";

const head = (page: import("@playwright/test").Page, pane: string) => page.locator(`[data-pane="${pane}"] header.phead`);
const more = (page: import("@playwright/test").Page, pane: string) => head(page, pane).getByRole("button", { name: /^More of/ });

test("where the Atlas's header has room, nothing is folded; where it has not, the rest is in a menu that does what the buttons did", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a phone's panes are each the screen's width: see the next test");
  await page.setViewportSize({ width: 2200, height: 800 });
  await page.goto("#/atlas");
  await expect(head(page, "atlas").getByRole("button", { name: "Open questions" })).toBeVisible();
  await expect(more(page, "atlas")).toHaveCount(0);

  // Thinner: the Atlas's switches give way to the menu, from the last.
  await page.setViewportSize({ width: 1000, height: 800 });
  await expect(more(page, "atlas")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-head-folded.png` });
  // The pane's gear and its name stay.
  await expect(head(page, "atlas").getByRole("button", { name: "Atlas settings" })).toBeVisible();
  await more(page, "atlas").click();
  const menu = page.getByRole("menu", { name: /^More of Atlas/ });
  const rows = menu.getByRole("menuitemcheckbox");
  await expect(rows.first()).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-head-menu.png` });
  // Every row is inside the frame, whatever its words.
  const frame = (await menu.boundingBox())!;
  for (const r of await rows.all()) { const b = (await r.boundingBox())!; expect(b.x + b.width, "a row stays in the menu").toBeLessThanOrEqual(frame.x + frame.width + 1); expect(await r.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true); }
  const name = (await rows.first().innerText()).trim();
  const button = head(page, "atlas").locator(`.sw[data-short="${name}"]`);
  const was = await button.getAttribute("aria-pressed");
  await rows.first().click();
  await expect(menu).toHaveCount(0);
  await expect(button).toHaveAttribute("aria-pressed", was === "true" ? "false" : "true");
  // Escape shuts it.
  await more(page, "atlas").click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("the agent's header keeps its sessions and context, and folds the rest, on a phone", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) > 760, "a phone's width");
  await page.goto("#/n/basics/bit");
  await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Agent/ }).click();
  await expect.poll(() => page.locator('[data-pane="iso"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
  const iso = head(page, "iso");
  await expect(iso.getByRole("button", { name: "Context", exact: true })).toBeVisible();
  await expect(iso.getByRole("button", { name: "Sessions" })).toBeVisible();
  await expect(iso.getByRole("button", { name: "Agent settings" })).toBeVisible();
  expect(await iso.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "nothing overflows the header").toBe(true);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-head-agent.png` });
  await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Atlas/ }).click();
  await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
  expect(await head(page, "atlas").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "nor the Atlas's").toBe(true);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-head-atlas.png` });
});

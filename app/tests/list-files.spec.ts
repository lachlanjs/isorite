// The list of notes holds the files beside them that are not notes (an artifact, data), in their folders.

import { expect, test } from "@playwright/test";
import { pressHead } from "./switches.ts";

test("an artifact and a data file are listed in their folder, narrowed by typing, and open", async ({ page }) => {
  await page.goto("#/notes");
  await pressHead(page, "note", "All notes");
  const section = page.locator('.notes section[data-dir="basics"]');
  await expect(section.locator('[data-file="basics/dashboard.html"]')).toBeVisible();
  await expect(section.locator('[data-file="basics/tosses.csv"]')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-list-files.png` });
  // Narrowed by what is typed, as the notes are.
  await page.getByRole("searchbox", { name: "Find a note" }).fill("tosses");
  await expect(section.locator('[data-file="basics/dashboard.html"]')).toHaveCount(0);
  await expect(section.locator('[data-file="basics/tosses.csv"]')).toBeVisible();
  await section.locator('[data-file="basics/tosses.csv"] a').click();
  await expect(page).toHaveURL(/#\/n\/basics\/tosses\.csv/);
});

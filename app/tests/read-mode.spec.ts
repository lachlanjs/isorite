// Read mode (M30): the note as it is read: its title a heading, the text not to be edited, and what edits it out of the way.

import { expect, test } from "@playwright/test";

test("a note can be read, and edited again", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  const editor = page.getByRole("textbox", { name: "The note", exact: true });
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await expect(editor).toHaveAttribute("contenteditable", "true");
  await page.getByRole("button", { name: "read", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "The bit" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "The note", exact: true })).toHaveAttribute("contenteditable", "false");
  await expect(page.getByRole("textbox", { name: "The note", exact: true })).toContainText("One fair coin toss");
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-read.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "read", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "The note", exact: true })).toHaveAttribute("contenteditable", "true");
});

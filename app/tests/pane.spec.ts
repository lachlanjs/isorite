import { expect, test, type Page } from "@playwright/test";

// Iso's pane (M10): a conversation, sent with what you gave Iso, its look-ups told as they happen, kept in the
// study base, and stopped when asked.

const pane = (page: Page) => page.locator('[data-pane="iso"]');
const box = (page: Page) => page.getByRole("textbox", { name: "Message Iso" });
async function toIso(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
}
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

test("a turn in Ask mode: what you gave is shown with it, what Iso reads is told and opens the note, and the conversation is kept", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await page.locator('[data-note="basics/surprise"]').waitFor();
  // A fresh conversation for this test.
  await toIso(page);
  const fresh = pane(page).getByRole("button", { name: "A new conversation" });
  if (await fresh.isEnabled()) await fresh.click();
  // Given a passage from the note open.
  await page.getByRole("textbox", { name: "The note", exact: true }).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "send to Iso" }).click();
  await toIso(page);
  await box(page).fill(`look up what it is measured in, ${test.info().project.name}`);
  await box(page).press("Enter");
  const log = page.getByRole("log", { name: "The conversation with Iso" });
  await expect(log.locator(".turn").last().locator(".asked")).toHaveText(`look up what it is measured in, ${test.info().project.name}`);
  await expect(log.locator(".turn").last().locator(".gave")).toContainText("One fair coin toss");
  await expect(log.locator(".turn").last().locator(".look")).toContainText("Surprise");
  await expect(log.locator(".turn").last().locator(".said")).toContainText("It is measured in bits");
  await expect(log.locator(".turn").last().locator(".said .katex")).toBeVisible();
  await look(page, "iso-turn");

  // Kept: there after a reload.
  await page.reload();
  await toIso(page);
  await expect(log.locator(".turn").last().locator(".said")).toContainText("It is measured in bits");
  // A note it read opens in the Note pane.
  await log.locator(".turn").last().locator(".look").getByRole("button", { name: "Surprise" }).click();
  await expect(page).toHaveURL(/#\/n\/basics\/surprise$/);
});

test("a turn can be stopped, and a refusal is said plainly; Shift+Tab changes the mode", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await expect(pane(page).locator(".mode[aria-pressed=true]")).toHaveText("Ask");
  await box(page).press("Shift+Tab");
  await expect(pane(page).locator(".mode[aria-pressed=true]")).toHaveText("Write");
  await box(page).press("Shift+Tab");
  await box(page).press("Shift+Tab");
  await expect(pane(page).locator(".mode[aria-pressed=true]")).toHaveText("Ask");

  await box(page).fill("slow, please");
  await box(page).press("Enter");
  const log = page.getByRole("log", { name: "The conversation with Iso" });
  await expect(log.locator(".turn").last().locator(".doing")).toBeVisible();
  await pane(page).getByRole("button", { name: "Stop Iso" }).click();
  await expect(log.locator(".turn").last()).toHaveAttribute("data-state", "stopped");

  await box(page).fill("fail now");
  await box(page).press("Enter");
  await expect(log.locator(".turn").last().getByRole("alert")).toContainText("Iso could not answer");
});

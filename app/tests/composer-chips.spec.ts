// What goes with a message is shown in the agent's box (M35): a chip for each note, folder or passage in the tray, to be
// taken out before the message is sent, and faint once the session has been given it.

import { expect, test } from "@playwright/test";
import { attach, box, toIso, type Attached } from "./agent.ts";
import { setSwitch } from "./switches.ts";

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(() => agent.detach());

test("a note given to the agent is a chip in the box: taken out, put back, and faint once it has gone with a message", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a phone has no shift: it is given from the Atlas's hold menu");
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="basics/surprise"]')).toBeVisible();
  await setSwitch(page, "context", true);
  await page.locator('[data-note="basics/surprise"]').click({ modifiers: ["Shift"] });
  await toIso(page);

  const chips = page.getByRole("list", { name: "Going with your message" });
  const chip = chips.getByRole("listitem");
  await expect(chip).toHaveCount(1);
  await expect(chip).toContainText("Surprise");
  await expect(chip).toHaveAttribute("data-kind", "note");
  await expect(chip).not.toHaveClass(/given/);
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no wider than the window").toBe(true);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-chips.png`, fullPage: true });

  // Taken out: the box has no chip, and the tray is empty.
  await chip.getByRole("button", { name: /^Remove Surprise from the message/ }).click();
  await expect(chips).toHaveCount(0);

  // Put back, and sent with a message: the chip stays, faint.
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="basics/surprise"]')).toBeVisible();
  await setSwitch(page, "context", true);
  await page.locator('[data-note="basics/surprise"]').click({ modifiers: ["Shift"] });
  await toIso(page);
  await expect(chip).toHaveCount(1);
  await box(page).fill("say more");
  await box(page).press("Enter");
  await expect(chip).toHaveClass(/given/);
  await expect(chip).toHaveAttribute("title", "Already given to this session");
});

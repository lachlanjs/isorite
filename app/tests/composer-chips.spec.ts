// A note or folder given to the agent stands in the box as a pointer, as a chosen stretch of a note does: pressed, it opens
// the note it points to; taken out with a delete.

import { expect, test } from "@playwright/test";
import { box, toIso } from "./agent.ts";
import { setSwitch } from "./switches.ts";

test("a note given to the agent is a pointer in the box; pressed it opens the note, and shift+click on the Atlas takes it out", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a phone has no shift: it is given from the Atlas's hold menu");
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="basics/surprise"]')).toBeVisible();
  await setSwitch(page, "context", true);
  await page.locator('[data-note="basics/surprise"]').click({ modifiers: ["Shift"] });
  await toIso(page);

  const pt = page.locator("[data-prompt] .pt");
  await expect(pt).toHaveCount(1);
  await expect(pt).toContainText("Surprise");
  await expect(page.getByRole("list", { name: "Going with your message" })).toHaveCount(0);

  // Pressed, it shows the note: opened in the Note pane.
  await pt.click();
  await expect(page).toHaveURL(/#\/n\/basics\/surprise$/);

  // Shift+click again on the Atlas takes it out.
  await page.locator('[data-note="basics/surprise"]').click({ modifiers: ["Shift"] });
  await expect(pt).toHaveCount(0);
  await expect(box(page)).toBeVisible();
});

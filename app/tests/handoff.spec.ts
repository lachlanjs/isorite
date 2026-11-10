// What is chosen can be copied for an agent that isorite does not run (M36): a pointer is in the box with no agent
// attached, and "Copy for your agent" puts a block on the clipboard that names them for the agent's own tools.

import { expect, test } from "@playwright/test";
import { toAgent } from "./agent.ts";
import { setSwitch } from "./switches.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("with no agent attached, a note given is copied as text that names it for the agent to read", async ({ page, browserName }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a phone has no shift: it is given from the Atlas's hold menu");
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium's");
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="basics/surprise"]')).toBeVisible();
  await setSwitch(page, "context", true);
  await page.locator('[data-note="basics/surprise"]').click({ modifiers: ["Shift"] });
  await toAgent(page);

  await expect(page.locator("[data-prompt] .pt")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Message the agent" }).pressSequentially(" Explain this.");
  await page.getByRole("button", { name: "Copy for your agent" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("read_note");
  expect(copied).toContain("/basics/surprise.md");
  expect(copied).toContain("Explain this.");
});

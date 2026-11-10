import { expect, test } from "@playwright/test";
import { toAgent } from "./agent.ts";

// With no agent set up, the Agent pane says how to have one, and no more: one action for isorite's own agent, and one
// quiet line that an agent of your own connects over MCP.

test.skip(Boolean(process.env.ISORITE_PI), "the native agent is chosen with ISORITE_PI: the pane is its own");

test("with no agent, the pane offers isorite's own agent and says an outside agent connects with isorite setup", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const setup = page.getByRole("region", { name: "Set up an agent" });
  await expect(setup).toBeVisible();
  await expect(setup.getByRole("button", { name: "Use isorite's agent" })).toBeVisible();
  await expect(setup).toContainText("connects over MCP");
  await expect(setup.locator("code")).toHaveText("isorite setup");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no wider than the window").toBe(true);
  // The action opens the pane's settings at the provider, where the key is typed.
  await setup.getByRole("button", { name: "Use isorite's agent" }).click();
  await expect(page.getByRole("dialog", { name: "Agent settings" })).toBeVisible();
  await expect(page.locator("#pi-provider")).toBeFocused();
});

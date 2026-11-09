// Saying something while the agent works (M36): Enter adds it for when the agent stops, "Steer now" puts it in after the
// step running now. Over ACP, to an agent that says it takes steering (the scripted one, with SCRIPTED_STEER).

import { expect, test } from "@playwright/test";
import { attach, box, log, toIso, type Attached } from "./agent.ts";

let agent: Attached;
test.beforeAll(async () => { process.env.SCRIPTED_STEER = "1"; agent = await attach(); });
test.afterAll(() => { agent.detach(); delete process.env.SCRIPTED_STEER; });

test("while the agent works, a steer is offered, sent, and shown in the turn", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  await toIso(page);
  await box(page).fill("wait 2500");
  await box(page).press("Enter");
  await expect(page.getByRole("button", { name: "Stop the agent" })).toBeVisible();

  await box(page).fill("Actually, be brief.");
  await expect(page.getByText("Enter adds it for when the agent stops.")).toBeVisible();
  await page.getByRole("button", { name: "Steer now" }).click();

  const said = log(page).locator(".mid[data-mode='steer']");
  await expect(said).toContainText("Actually, be brief.");
  await expect(said).toHaveAttribute("data-state", "sent");
  await expect(box(page).locator(".cm-placeholder")).toBeVisible(); // empty
  await expect(log(page)).toContainText("Steered: Actually, be brief", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no wider than the window").toBe(true);
});

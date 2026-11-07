import { expect, test } from "@playwright/test";
import { attach, box, log as logOf, toIso, type Attached } from "./agent.ts";
import { setSwitch } from "./switches.ts";

// How the agent's session behaves as it grows: where it is scrolled, what is drawn, and what is said when a switch
// refuses what the agent asked.

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(() => agent.detach());

test("scrolled up while the agent works, the session stays where you are, and a button brings you to the newest", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  const log = logOf(page);
  const name = test.info().project.name;
  // Enough in the session to scroll, whatever the window.
  for (const n of [1, 2, 3]) {
    await box(page).fill(`draw\n${name} filler ${n}`);
    await box(page).press("Enter");
    await expect(log.locator(".turn").filter({ hasText: `${name} filler ${n}` }).locator(".said")).toBeVisible();
  }
  await box(page).fill(`wait 1500\ndraw\n${name} second`);
  await box(page).press("Enter");
  await expect(log.locator(".turn").filter({ hasText: `${name} second` }).locator(".doing")).toBeVisible();
  expect(await log.evaluate((el) => el.scrollHeight - el.clientHeight), "the session overflows the pane").toBeGreaterThan(200);
  await log.evaluate((el) => { el.scrollTop = 0; });
  const turn = log.locator(".turn").filter({ hasText: `${name} second` });
  await expect(turn.locator(".said")).toHaveCount(1, { timeout: 10_000 });
  expect(await log.evaluate((el) => el.scrollTop)).toBeLessThan(40);
  const newest = page.getByRole("button", { name: "Newest" });
  await expect(newest).toBeVisible();
  await newest.click();
  await expect.poll(() => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(4);
  await expect(newest).toBeHidden();
});

test("a diagram in an earlier turn stays drawn as later turns come, and the reply ends in view", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  const log = logOf(page);
  const name = test.info().project.name;
  await box(page).fill(`draw\n${name} drawn`);
  await box(page).press("Enter");
  const turn = log.locator(".turn").filter({ hasText: `${name} drawn` });
  await expect(turn.locator(".said .diagram svg")).toBeVisible();
  await box(page).fill(`${name} after`);
  await box(page).press("Enter");
  await expect(log.locator(".turn").filter({ hasText: `${name} after` }).locator(".said")).toBeVisible();
  await expect(turn.locator(".said .diagram svg")).toHaveCount(1);
  await expect.poll(() => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(4);
});

test("a command refused because Run is off says so under the call, and the prompt shows only what was asked", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await setSwitch(page, "run", false);
  const log = logOf(page);
  const name = test.info().project.name;
  await box(page).fill(`permit\n${name} refused`);
  await box(page).press("Enter");
  const turn = log.locator(".turn").filter({ hasText: `${name} refused` });
  await expect(turn.locator(".why")).toHaveText(/running commands is switched off/);
  // The base has a code link that no longer resolves: isorite tells the agent, but not in your words.
  await expect(turn.locator(".asked")).toHaveText(`permit\n${name} refused`);
});

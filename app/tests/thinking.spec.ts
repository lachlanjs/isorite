// What the agent reasoned is in the turn, folded (M36): ACP agents send it as thought chunks.

import { expect, test } from "@playwright/test";
import { attach, box, log, toIso, type Attached } from "./agent.ts";

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(() => agent.detach());

test("an agent's thinking is folded in the turn, ahead of its answer, and opens on a click", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  await toIso(page);
  await box(page).fill("think The note says surprise is rare outcomes.\nread basics/surprise.md");
  await box(page).press("Enter");
  const thought = log(page).locator("details.think");
  await expect(thought).toHaveCount(1);
  // "Thinking…" while it is the last thing in a running turn, "Thought" once the agent has moved on.
  await expect(thought.locator("summary")).toHaveText(/^(Thinking…|Thought)$/);
  await expect(thought.locator("p")).toBeHidden();
  await thought.locator("summary").click();
  await expect(thought.locator("p")).toHaveText("The note says surprise is rare outcomes.");
  await expect(log(page)).toContainText("Done,", { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no wider than the window").toBe(true);
});

import { expect, test } from "@playwright/test";
import { ask, attach, box, toAgent, type Attached } from "./agent.ts";

// `/compact` in the Agent pane: offered by the slash, it summarises the session's earlier turns now, with the words after
// it as the summary's focus. The turn says it was compacted and how much it freed, and the context gauge follows.

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(async () => { await agent.detach(); });

test("/compact is offered by the slash, compacts the session, says how much it freed, and the gauge follows", async ({ page }) => {
  const name = test.info().project.name;
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  // Two long answers, then a short one: the earlier part is worth summarising.
  await expect(await ask(page, `long\nfirst ${name}`, `first ${name}`)).toHaveAttribute("data-state", "done");
  await expect(await ask(page, `long\nsecond ${name}`, `second ${name}`)).toHaveAttribute("data-state", "done");
  await expect(await ask(page, `say short\nthird ${name}`, `third ${name}`)).toHaveAttribute("data-state", "done");
  const gauge = page.getByRole("button", { name: /^Context: .* open the context$/ });
  await expect(gauge).toBeVisible();
  const was = await gauge.getAttribute("aria-label");

  // The slash offers it, and Enter completes it.
  await box(page).click();
  await box(page).fill("/comp");
  const menu = page.getByRole("listbox", { name: /skills/i });
  await expect(menu.getByRole("option")).toHaveCount(1);
  await expect(menu.getByRole("option", { name: /\/compact/ })).toBeVisible();
  await box(page).press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(box(page)).toContainText("/compact");

  const turn = await ask(page, `/compact keep the decisions ${name}`, `/compact keep the decisions ${name}`);
  await expect(turn).toHaveAttribute("data-state", "done");
  const line = turn.locator(".squeeze[data-asked]");
  await expect(line).toHaveAttribute("data-state", "done");
  await expect(line.locator("summary")).toHaveText(/^Compacted [\d.]+k? → [\d.]+k? tokens, [\d.]+k? freed$/);
  // Open, it shows the summary, which kept what was asked.
  await line.locator("summary").click();
  await expect(line).toContainText(`Kept: keep the decisions ${name}`);
  await expect(gauge).not.toHaveAttribute("aria-label", was!);

  // The session carries on.
  await expect(await ask(page, `say carried on ${name}`, `carried on ${name}`)).toHaveAttribute("data-state", "done");
});

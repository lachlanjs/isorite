// A link lit on the Atlas carries one pulse, from end to end: not one for each stretch of the merged lines, which are cut
// wherever the routes part.

import { expect, test } from "@playwright/test";

test("each lit link carries one pulse", async ({ page }) => {
  await page.goto("#/atlas");
  const note = page.locator('[data-note="coding/kraft-inequality"]');
  await expect(note).toBeVisible();
  await note.click();
  const routes = page.locator(".routes");
  await expect(routes).toHaveAttribute("data-requires", /[1-9]/);
  const links = Number(await routes.getAttribute("data-requires")) + Number(await routes.getAttribute("data-builds"));
  await expect(page.locator(".routes path.pulse.core")).toHaveCount(links);

  // Pointed at, not chosen: the same, in blue.
  await page.locator(".atlas").click({ position: { x: 4, y: 4 } });
  await page.locator('[data-note="coding/huffman-codes"]').hover();
  await expect(routes).toHaveAttribute("data-requires", /[1-9]/);
  const all = ["data-requires", "data-builds", "data-uses"].reduce(async (n, a) => (await n) + Number(await routes.getAttribute(a)), Promise.resolve(0));
  await expect(page.locator(".routes path.pulse.core")).toHaveCount(await all);
});

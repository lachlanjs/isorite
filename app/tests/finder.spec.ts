// Ctrl+K on the Atlas: the notes that match are lit as you type, the rest step back; Enter opens one; Escape lets go.

import { expect, test } from "@playwright/test";

test("Ctrl+K finds notes and lights them on the Atlas as you type; hidden ones come last; Enter opens one", async ({ page }) => {
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="coding/huffman-codes"]')).toBeVisible();
  await page.locator(".atlas").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Control+k");
  const box = page.getByRole("searchbox", { name: "Find a note on the map" });
  await expect(box).toBeFocused();
  await box.pressSequentially("huffman");
  const huffman = page.locator('[data-note="coding/huffman-codes"]');
  await expect(huffman).toHaveClass(/\bf-(key|both|sem)\b/);
  await expect(page.locator('[data-note="basics/bit"]')).toHaveClass(/\bdim\b/);
  await expect(page.locator('[data-found="coding/huffman-codes"]')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-atlas-find.png` });

  // A hidden note is listed, after the ones on the map, and not lit.
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  expect((await page.request.post("api/hidden", { headers, data: { ids: ["channels/huffman-in-code"] } })).ok()).toBe(true);
  await expect(page.locator('[data-note="channels/huffman-in-code"]')).toHaveCount(0);
  await expect.poll(async () => (await page.locator("[data-found]").evaluateAll((els) => els.map((e) => e.getAttribute("data-found")))).at(-1)).toBe("channels/huffman-in-code");
  await expect(page.locator('[data-note="channels/huffman-in-code"]')).toHaveCount(0);
  expect((await page.request.post("api/hidden", { headers, data: { ids: [] } })).ok()).toBe(true);

  // Enter opens the one the arrows are on; Escape lets the map go.
  await box.fill("");
  await box.pressSequentially("kraft");
  await expect(page.locator('[data-found="coding/kraft-inequality"]')).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/n\/coding\/kraft-inequality/);
  await expect(box).toHaveCount(0);
  await expect(page.locator(".atlas .dim")).toHaveCount(0);
});

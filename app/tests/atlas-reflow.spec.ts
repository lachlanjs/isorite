// A note deleted or moved on the Atlas: the lines are drawn again at once, as after a reload (they stayed hidden when a
// second load of the map came in while the first was still in its beats).

import { expect, test } from "@playwright/test";

test("after a note is deleted from the Atlas the routes are drawn again without a reload", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a finger holds on a phone for a menu; the tags are for a mouse");
  const p = test.info().project.name, a = `reflow-${p}/a`, c = `reflow-${p}/c`;
  await page.goto("#/atlas");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  const make = async (id: string, title: string, body: string) => expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text: `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n` } })).ok()).toBe(true);
  await make(c, `Reflow C ${p}`, "Plain.");
  await make(a, `Reflow A ${p}`, `Links [[${c}]].`);
  await page.reload();
  const block = page.locator(`[data-note="${a}"]`);
  await expect(block).toBeVisible({ timeout: 15000 });
  const routes = page.locator(".routes path.base");
  expect(await routes.count()).toBeGreaterThan(0);
  const b = (await block.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  const t = (await page.locator('[data-tag="delete"]').boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await expect(block).toHaveCount(0);
  await page.mouse.move(2, 2);
  await expect(page.locator(".routes path.retract")).toHaveCount(0, { timeout: 3000 });
  await expect.poll(() => routes.count(), { timeout: 3000 }).toBeGreaterThan(0);
  const shown = await routes.count();
  await page.reload();
  await expect(page.locator(`[data-note="${c}"]`)).toBeVisible({ timeout: 15000 });
  await expect.poll(() => routes.count()).toBe(shown);
  const cv = (await (await page.request.get(`api/note?id=${c}`)).json()) as { version: string };
  expect((await page.request.post(`api/note/delete?id=${c}`, { headers, data: { base: cv.version } })).ok()).toBe(true);
});

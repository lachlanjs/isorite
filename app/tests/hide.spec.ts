// Hide a note on the Atlas (the grey tag) and it is off the map and the list; hold on open ground, find it by typing, and
// it is back. What is hidden is kept in the base, so another page sees it too.

import { expect, test } from "@playwright/test";

test("a note hidden by the grey tag leaves the Atlas and the list, and is found by typing and shown again", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a finger holds on a phone for a menu; the tags are for a mouse");
  const p = test.info().project.name, id = `basics/hid-${p}`;
  await page.goto("#/atlas");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text: `---\ntype: Concept\ntitle: Hid ${p}\n---\n\nText.\n` } })).ok()).toBe(true);
  await page.reload();
  const block = page.locator(`[data-note="${id}"]`);
  await expect(block).toBeVisible({ timeout: 15000 });
  const b = (await block.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  const tag = page.locator('[data-tag="hide"]');
  await expect(tag).toBeVisible();
  await page.waitForTimeout(400); // out, and so to be pointed at
  const t = (await tag.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 4 });
  await expect(tag).toHaveClass(/\bon\b/);
  await page.mouse.up();
  await expect(block).toHaveCount(0);
  expect(((await (await page.request.get("api/hidden")).json()) as { ids: string[] }).ids).toContain(id);

  // Not in the list either.
  await page.goto("#/notes");
  await expect(page.getByRole("searchbox", { name: "Find a note" })).toBeVisible();
  await expect(page.locator(`.notes li[data-row="${id}"]`)).toHaveCount(0);

  // Found again from open ground: the third tag, then typing.
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="coding/huffman-codes"]')).toBeVisible();
  const box = (await page.locator(".atlas").boundingBox())!;
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  const found = page.locator('.atlas [data-spot="hidden"]');
  await expect(found).toBeVisible();
  await page.waitForTimeout(400);
  const f = (await found.boundingBox())!;
  await page.mouse.move(f.x + f.width / 2, f.y + f.height / 2, { steps: 4 });
  await expect(found).toHaveClass(/\bon\b/);
  await page.mouse.up();
  const finder = page.getByRole("dialog", { name: "Hidden notes and islands" });
  await expect(finder).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${p}-atlas-hidden.png` });
  await page.keyboard.type(`hid ${p}`);
  await page.keyboard.press("Enter");
  await expect(page.locator(`[data-note="${id}"]`)).toBeVisible();
  await expect(finder).toHaveCount(0);
  expect(((await (await page.request.get("api/hidden")).json()) as { ids: string[] }).ids).not.toContain(id);

  // Put the base back as it was.
  const now = (await (await page.request.get(`api/note?id=${id}`)).json()) as { version: string };
  expect((await page.request.post(`api/note/delete?id=${id}`, { headers, data: { base: now.version } })).ok()).toBe(true);
});

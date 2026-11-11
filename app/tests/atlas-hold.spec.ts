// Press and hold a note or a folder on the Atlas (M33): the three tags stand at the point held; let go on gold and it is
// sent to the agent, on blue after a moment it is carried to a folder of the map, on rose it is asked about first.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { NOTES } from "./serve.ts";

test("held on the Atlas, a note shows the tags: gold sends it, rose asks before deleting, blue carries it to a folder", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a finger holds on a phone for a menu; the tags are for a mouse");
  const p = test.info().project.name, id = `basics/held-${p}`;
  await page.goto("#/atlas");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text: `---\ntype: Concept\ntitle: Held ${p}\n---\n\nText.\n` } })).ok()).toBe(true);
  await page.reload();
  const block = page.locator(`[data-note="${id}"]`);
  await expect(block).toBeVisible({ timeout: 15000 });
  const at = async () => { const b = (await block.boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const go = async (tag: string) => {
    const a = await at();
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    const t = page.locator(`[data-tag="${tag}"]`);
    await expect(t).toBeVisible();
    await page.waitForTimeout(400); // the tags take the pointer once they have grown out
    const b = (await t.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  };
  // Gold: sent.
  await go("send");
  await page.mouse.up();
  await expect(page.getByRole("status").filter({ hasText: `Held ${p} is in your message` })).toBeVisible();
  // Rose: asked first.
  await go("delete");
  await page.screenshot({ path: `test-results/screens/${p}-atlas-held-delete.png` });
  await page.mouse.up();
  await expect(page.getByRole("alertdialog")).toContainText(`Delete “Held ${p}”?`);
  await page.getByRole("button", { name: "keep it" }).click();
  expect(existsSync(join(NOTES, `${id}.md`))).toBe(true);
  // Blue: carried to the folder "coding" of the map.
  await go("move");
  await page.waitForTimeout(250);
  const coding = (await page.locator('[data-folder="coding"] .frame-title').boundingBox())!;
  await page.mouse.move(coding.x + 10, coding.y + coding.height + 30, { steps: 8 });
  await page.screenshot({ path: `test-results/screens/${p}-atlas-carried.png` });
  await page.mouse.up();
  await expect.poll(() => existsSync(join(NOTES, "coding", `held-${p}.md`))).toBe(true);
  // Put the base back as it was: the other Atlas specs count what is in it.
  const now = (await (await page.request.get(`api/note?id=coding/held-${p}`)).json()) as { version: string };
  expect((await page.request.post(`api/note/delete?id=coding/held-${p}`, { headers, data: { base: now.version } })).ok()).toBe(true);
});

test("held on a folder, a fifth tag renames it: its name is typed over", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a finger holds on a phone for a menu; the tags are for a mouse");
  const p = test.info().project.name, dir = `hold-${p}`, id = `${dir}/inside`;
  await page.goto("#/atlas");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text: `---\ntype: Concept\ntitle: Inside ${p}\n---\n\nText.\n` } })).ok()).toBe(true);
  await page.reload();
  const title = page.locator(`[data-folder="${dir}"] .frame-title`);
  await expect(title).toBeVisible({ timeout: 15000 });
  const b = (await title.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  const tag = page.locator('[data-tag="rename"]');
  await expect(tag).toBeVisible();
  await page.waitForTimeout(400);
  const t = (await tag.boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 4 });
  await page.mouse.up();
  const field = page.getByRole("textbox", { name: `Rename the island ${dir}` });
  await expect(field).toBeVisible();
  await field.fill(`${dir}-renamed`);
  await field.press("Enter");
  await expect.poll(() => existsSync(join(NOTES, `${dir}-renamed`, "inside.md"))).toBe(true);
  const now = (await (await page.request.get(`api/note?id=${dir}-renamed/inside`)).json()) as { version: string };
  expect((await page.request.post(`api/note/delete?id=${dir}-renamed/inside`, { headers, data: { base: now.version } })).ok()).toBe(true);
});

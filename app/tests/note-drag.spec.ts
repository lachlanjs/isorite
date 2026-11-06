// Press and hold on a note or a folder's heading (M33): pull it to a folder, or hold for the tags (move, delete, send).
// And the empty folder made to move a note into (M31), and deleted (M31).

import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES } from "./serve.ts";

async function seed(page: Page, p: string, notes: Array<[string, string]>) {
  await page.goto("#/notes");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  for (const [id, title] of notes) {
    expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text: `---\ntype: Concept\ntitle: ${title}\n---\n\nText.\n` } })).ok()).toBe(true);
  }
  await page.reload();
}
async function folder(page: Page, name: string) {
  await page.getByRole("button", { name: "new folder" }).click();
  await page.getByRole("textbox", { name: /name, with/ }).fill(name);
  await page.getByRole("button", { name: "make it" }).click();
  await expect.poll(() => existsSync(join(NOTES, name))).toBe(true);
}
async function centre(loc: ReturnType<Page["locator"]>, scroll = true) {
  // In the middle of the view, so the carrying does not scroll the list at its edge.
  if (scroll) await loc.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const b = (await loc.boundingBox())!;
  return { x: b.x + Math.min(b.width / 2, 120), y: b.y + b.height / 2 };
}
/** Hold on `from` until the tags show, then go to the tag named and let go there (or return the page held). */
async function holdThenGo(page: Page, from: ReturnType<Page["locator"]>, tag: string) {
  const a = await centre(from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const t = page.locator(`[data-tag="${tag}"]`);
  await expect(t).toBeVisible();
  const b = (await t.boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  return b;
}

test("a note pulled to an empty folder moves there", async ({ page }) => {
  const p = test.info().project.name;
  await seed(page, p, [[`drag/dragged-${p}`, `Dragged ${p}`]]);
  await folder(page, `drag/to-${p}`);
  const row = page.locator("li", { hasText: `Dragged ${p}` });
  const heading = page.getByRole("heading", { name: `drag/to-${p} New note in drag/to-${p}` });
  await expect(heading).toBeVisible();
  const a = await centre(row);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 10, { steps: 3 });
  const b = await centre(heading, false);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.screenshot({ path: `test-results/screens/${p}-note-carried.png` });
  await page.mouse.up();
  await expect.poll(() => existsSync(join(NOTES, "drag", `to-${p}`, `dragged-${p}.md`))).toBe(true);
  expect(existsSync(join(NOTES, "drag", `dragged-${p}.md`))).toBe(false);
});

test("held, a note shows three tags: the red one asks before deleting, the gold one sends it to Iso", async ({ page }) => {
  const p = test.info().project.name;
  await seed(page, p, [[`held/doomed-${p}`, `Doomed ${p}`], [`held/sent-${p}`, `Sent ${p}`]]);
  // Red: asked first.
  await holdThenGo(page, page.locator("li", { hasText: `Doomed ${p}` }), "delete");
  await page.screenshot({ path: `test-results/screens/${p}-note-held-delete.png` });
  await page.mouse.up();
  await expect(page.getByRole("alertdialog")).toContainText(`Delete “Doomed ${p}”?`);
  await page.getByRole("button", { name: "keep it" }).click();
  expect(existsSync(join(NOTES, "held", `doomed-${p}.md`))).toBe(true);
  await holdThenGo(page, page.locator("li", { hasText: `Doomed ${p}` }), "delete");
  await page.mouse.up();
  await page.getByRole("alertdialog").getByRole("button", { name: "delete", exact: true }).click();
  await expect.poll(() => existsSync(join(NOTES, "held", `doomed-${p}.md`))).toBe(false);
  // Gold: sent.
  await holdThenGo(page, page.locator("li", { hasText: `Sent ${p}` }), "send");
  await page.mouse.up();
  await expect(page.getByRole("status").filter({ hasText: `Sent ${p} is with the agent.` })).toBeVisible();
  expect(existsSync(join(NOTES, "held", `sent-${p}.md`))).toBe(true);
  // Letting go off the tags changes nothing.
  // (Iso's tray now shows the chip too, with or without an agent: the row is the one in the list of notes.)
  await holdThenGo(page, page.locator("li", { hasText: `Sent ${p}` }).filter({ has: page.locator("a.vein-row") }), "send");
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await expect(page.locator("[data-tag]")).toHaveCount(0);
});

test("a folder is held and moved under another, and an empty one is deleted", async ({ page }) => {
  const p = test.info().project.name;
  await seed(page, p, [[`fold-${p}/kept-${p}`, `Kept ${p}`]]);
  await folder(page, `fold-${p}-zone`);
  await folder(page, `gone-${p}`);
  // The folder with a note, pulled by its heading into the empty one.
  const heading = page.getByRole("heading", { name: new RegExp(`^fold-${p} New note`) });
  const target = page.getByRole("heading", { name: new RegExp(`^fold-${p}-zone New note`) });
  const a = await centre(heading);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 20, a.y + 6, { steps: 3 });
  const b = await centre(target, false);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => existsSync(join(NOTES, `fold-${p}-zone`, `fold-${p}`, `kept-${p}.md`))).toBe(true);
  await expect.poll(() => existsSync(join(NOTES, `fold-${p}`, `kept-${p}.md`))).toBe(false);
  // Empty: asked first.
  await page.getByRole("button", { name: `Delete the empty folder gone-${p}` }).click();
  await page.getByRole("button", { name: "keep it" }).click();
  expect(existsSync(join(NOTES, `gone-${p}`))).toBe(true);
  await page.getByRole("button", { name: `Delete the empty folder gone-${p}` }).click();
  await page.getByRole("button", { name: `delete gone-${p}` }).click();
  await expect.poll(() => existsSync(join(NOTES, `gone-${p}`))).toBe(false);
});

test("a folder is renamed from its heading in the list", async ({ page }) => {
  const p = test.info().project.name;
  await seed(page, p, [[`rn-${p}/inside-${p}`, `Inside ${p}`]]);
  await page.getByRole("button", { name: `Rename the folder rn-${p}` }).click();
  const field = page.getByRole("textbox", { name: `Rename the folder rn-${p}` });
  await field.fill(`renamed-${p}`);
  await field.press("Enter");
  await expect.poll(() => existsSync(join(NOTES, `renamed-${p}`, `inside-${p}.md`))).toBe(true);
  await expect.poll(() => existsSync(join(NOTES, `rn-${p}`))).toBe(false);
});

test("a note in a folder is pulled out to the top of the base (M37)", async ({ page }) => {
  const p = test.info().project.name;
  await seed(page, p, [[`out/inner-${p}`, `Inner ${p}`]]);
  // Narrowed to the one note, so the top of the base (offered at the end while one is carried) is in view.
  await page.getByRole("searchbox", { name: "Find a note" }).fill(`Inner ${p}`);
  const row = page.locator("li", { hasText: `Inner ${p}` });
  const a = await centre(row);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y + 10, { steps: 3 });
  const top = page.locator("section[data-dir='']");
  await expect(top).toBeVisible();
  const b = await centre(top.locator("h2"), false);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => existsSync(join(NOTES, `inner-${p}.md`))).toBe(true);
  expect(existsSync(join(NOTES, "out", `inner-${p}.md`))).toBe(false);
});

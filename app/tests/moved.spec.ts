// An old address still opens its note: a note whose folder was moved is found where it is now, through the journal's
// record of moves, and says quietly where it was asked for. A note deleted says so, with the notes of the same name.

import { expect, test, type Page } from "@playwright/test";

async function writer(page: Page) {
  // The list is up before the address is changed again, or the page's own first steps take it back.
  await page.goto("#/notes");
  await expect(page.getByRole("searchbox", { name: "Find a note" })).toBeVisible({ timeout: 15000 });
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  const post = async (path: string, data: unknown) => expect((await page.request.post(path, { headers, data })).ok()).toBe(true);
  return { post };
}

test("a note opened by its address from before its folder moved opens where it is, and says it moved", async ({ page }) => {
  const p = test.info().project.name, from = `moving-${p}`, to = `settled-${p}/moving-${p}`, name = `keyed-state-${p}`;
  const { post } = await writer(page);
  await post(`api/note?id=${from}/${name}`, { text: `---\ntype: Concept\ntitle: Keyed state ${p}\n---\n\nState kept per key.\n` });
  await post("api/folder/move", { from, to });
  await page.goto(`#/n/${from}/${name}`);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`Keyed state ${p}`, { timeout: 15000 });
  await expect(page).toHaveURL(new RegExp(`#/n/${to}/${name}$`));
  await expect(page.locator(".note .moved")).toHaveText(`moved from ${from}/${name}`);
  await page.screenshot({ path: `test-results/screens/${p}-note-moved.png` });
  // Opened again from where it is, it says nothing of it.
  await page.evaluate(() => { location.hash = "#/notes"; });
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
  await page.evaluate((h) => { location.hash = h; }, `#/n/${to}/${name}`);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`Keyed state ${p}`);
  await expect(page.locator(".note .moved")).toHaveCount(0);
});

test("a deleted note's address says it was deleted and offers the note of the same name elsewhere", async ({ page }) => {
  const p = test.info().project.name, name = `same-${p}`;
  const { post } = await writer(page);
  await post(`api/note?id=gone-${p}/${name}`, { text: `---\ntype: Concept\ntitle: Gone ${p}\n---\n\nSoon gone.\n` });
  await post(`api/note?id=kept-${p}/${name}`, { text: `---\ntype: Concept\ntitle: Kept ${p}\n---\n\nStill here.\n` });
  const version = ((await (await page.request.get(`api/note?id=gone-${p}/${name}`)).json()) as { version: string }).version;
  await post(`api/note/delete?id=gone-${p}/${name}`, { base: version });
  await page.goto(`#/n/gone-${p}/${name}`);
  await expect(page.getByText(`There is no note at gone-${p}/${name}.`)).toBeVisible({ timeout: 15000 });
  const gone = page.locator(".gone");
  await expect(gone).toHaveAttribute("data-state", "deleted");
  await expect(gone).toContainText("It was deleted.");
  const other = gone.locator(`a[href$="kept-${p}/${name}"]`);
  await expect(other).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${p}-note-gone.png` });
  await other.click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`Kept ${p}`);
});

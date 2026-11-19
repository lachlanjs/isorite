// A link in a note is a chip whose words are its text, as a pointer is in the box: its kind is the weight of the vein
// along its foot and is said with where it goes when pointed at; a link to the web ends in an arrow out; one to a note
// that is not there is faint, struck through, in a dashed edge. Pressed, a chip opens what it names. The cursor brought
// into one shows its Markdown, to be edited; in read mode the keyboard reaches each chip with Tab, and Enter opens it.

import { expect, test, type Page } from "@playwright/test";

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const chips = (page: Page) => page.locator('[data-pane="note"] .cm-lp-chip');
// The notes each test makes, taken away after it: their links (to the web, to a note not there) and their words would
// otherwise be on the map and in the finder for the specs after, at every project.
const made: string[] = [];

async function make(page: Page, id: string, title: string) {
  await page.goto("#/notes");
  await expect(page.getByRole("searchbox", { name: "Find a note" })).toBeVisible({ timeout: 15000 });
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  const text = `---\ntype: Concept\ntitle: ${title}\n---\n\nIt rests on [Surprise](/basics/surprise.md "requires") and [the bit](/basics/bit.md "see also"), as [Huffman](https://example.org/huffman) says, not [gone](/basics/nowhere.md).\n\nThe end.\n`;
  expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text } })).ok()).toBe(true);
  made.push(id);
}

test.afterEach(async ({ page }) => {
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(test.info().project.use.baseURL!).origin };
  for (const id of made.splice(0)) {
    const got = await page.request.get(`api/note?id=${id}`);
    if (got.ok()) await page.request.post(`api/note/delete?id=${id}`, { headers, data: { base: ((await got.json()) as { version: string }).version } });
  }
});

test("a link is a chip of its text; its kind, the web and a broken link are told apart quietly; pressed, it opens", async ({ page }) => {
  const p = test.info().project.name, id = `chips-${p}/links-${Date.now()}`;
  await make(page, id, `Links ${p}`);
  await page.goto(`#/n/${id}`);
  await expect(chips(page)).toHaveText(["Surprise", "the bit", "Huffman", "gone"]);
  await expect(page.getByText("](/basics/surprise.md")).toHaveCount(0);
  const requires = chips(page).nth(0), also = chips(page).nth(1), web = chips(page).nth(2), gone = chips(page).nth(3);
  await expect(requires).toHaveClass(/\brequires\b/);
  await expect(requires).toHaveAttribute("title", "requires · /basics/surprise.md");
  await expect(also).toHaveClass(/\balso\b/);
  await expect(also).toHaveAttribute("title", "see also · /basics/bit.md");
  await expect(web).toHaveClass(/\bweb\b/);
  await expect(page.locator('[data-pane="note"] .cm-lp-out svg')).toBeVisible();
  await expect(gone).toHaveClass(/\bcm-lp-broken\b/);
  await expect(gone).toHaveAttribute("title", "/basics/nowhere.md: no such note here");
  // Never gold: the agent's alone. The vein of requires is the lattice's blue.
  const colours = await requires.evaluate((el) => { const s = getComputedStyle(el); return [s.color, s.backgroundColor, s.backgroundImage].join(" "); });
  const gold = await page.evaluate(() => { const d = document.createElement("i"); d.style.color = "var(--growth)"; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  expect(colours).not.toContain(gold);
  await page.screenshot({ path: `test-results/screens/${p}-link-chips.png` });

  // The cursor brought into a chip by the keyboard: its Markdown shows, to be edited; taken away, it is a chip again.
  await editor(page).focus();
  await page.keyboard.press("Control+Home");
  for (let k = 0; k < "It rests on ".length; k++) await page.keyboard.press("ArrowRight");
  await expect(editor(page)).toContainText('[Surprise](/basics/surprise.md "requires")');
  await expect(chips(page)).toHaveCount(3);
  await page.keyboard.press("Control+End");
  await expect(chips(page)).toHaveCount(4);

  // Pressed, it opens its note.
  await requires.click();
  await expect(page).toHaveURL(/#\/n\/basics\/surprise$/);
});

test("in read mode each chip is a link the keyboard reaches, and Enter opens it", async ({ page }) => {
  const p = test.info().project.name, id = `chips-${p}/read-${Date.now()}`;
  await make(page, id, `Read links ${p}`);
  await page.goto(`#/n/${id}`);
  await expect(chips(page)).toHaveCount(4);
  await page.locator('button[title="Read mode"]').click();
  const bit = page.locator('[data-pane="note"]').getByRole("link", { name: "the bit" });
  await expect(bit).toBeVisible();
  await bit.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/n\/basics\/bit$/);
});

test("the cursor's link opens with Alt+Enter", async ({ page }) => {
  const p = test.info().project.name, id = `chips-${p}/keys-${Date.now()}`;
  await make(page, id, `Keyed links ${p}`);
  await page.goto(`#/n/${id}`);
  await expect(chips(page)).toHaveCount(4);
  await editor(page).focus();
  await page.keyboard.press("Control+Home");
  for (let k = 0; k < "It rests on [S".length; k++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Alt+Enter");
  await expect(page).toHaveURL(/#\/n\/basics\/surprise$/);
});

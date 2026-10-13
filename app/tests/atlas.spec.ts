import { expect, test, type Page } from "@playwright/test";

const note = (page: Page, id: string) => page.locator(`[data-note="${id}"]`);
const folder = (page: Page, id: string) => page.locator(`[data-folder="${id}"]`);
/** The size of a cell on screen, which is the zoom. */
const cell = (page: Page) => page.locator(".atlas-world").evaluate((el) => parseFloat(getComputedStyle(el).getPropertyValue("--u")));
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}
async function atlas(page: Page) {
  await page.goto("#/atlas");
  await expect(note(page, "coding/huffman-codes")).toBeVisible();
}

test("the map draws both bases: folders, notes where you stand, a study folder and its item", async ({ page }) => {
  await atlas(page);
  await expect(folder(page, "basics")).toBeVisible();
  await expect(folder(page, "coding")).toBeVisible();
  await expect(note(page, "basics/surprise")).toHaveClass(/\bs0\b/);
  await expect(note(page, "coding/source-coding")).toHaveClass(/\bs2\b/); // three right answers: worked through
  await expect(folder(page, "@study/coding")).toContainText("study · coding");
  await expect(page.getByRole("link", { name: "written: Build a prefix code" })).toBeVisible();
  expect(await page.locator(".routes path").count()).toBeGreaterThan(2);
  await expect(page.getByText("click a note to see what it rests on")).toBeVisible();
  await look(page, "atlas");
});

test("choosing a note outlines what it requires, all the way back, and what builds on it; again opens it", async ({ page }) => {
  await atlas(page);
  await note(page, "coding/kraft-inequality").click();
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bat\b/);
  await expect(note(page, "coding/source-coding")).toHaveClass(/\breq\b/);
  await expect(note(page, "basics/surprise")).toHaveClass(/\breq\b/);
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\bbld\b/);
  await expect(note(page, "basics/bit")).toHaveClass(/\bdim\b/);
  await expect(note(page, "@study/coding/a-prefix-code")).toHaveClass(/\bdim\b/); // it builds on Huffman codes, not on this
  // Lines are drawn for one step each way only; the note two steps back is outlined, fainter.
  await expect(page.locator(".routes path.lit.requires")).toHaveCount(1);
  await expect(page.locator(".routes path.lit.builds")).toHaveCount(1);
  await expect(note(page, "coding/source-coding")).not.toHaveClass(/\bfar\b/);
  await expect(note(page, "basics/surprise")).toHaveClass(/\bfar\b/);
  await expect(folder(page, "basics")).toContainText("1 required here");
  await look(page, "atlas-chosen");

  await page.keyboard.press("Escape");
  await expect(note(page, "basics/bit")).not.toHaveClass(/\bdim\b/);
  await expect(page.locator(".routes path.lit")).toHaveCount(0);

  await note(page, "coding/kraft-inequality").click();
  await note(page, "coding/kraft-inequality").click();
  await expect(page).toHaveURL(/#\/n\/coding\/kraft-inequality$/);
  await expect(page.getByLabel("Title")).toHaveValue("Kraft inequality");
});

test("the chain is walked a step at a time, the way kept; the whole of it is drawn when asked for", async ({ page }) => {
  await atlas(page);
  const lines = page.locator(".routes path.lit.requires");
  await note(page, "coding/huffman-codes").click();
  await expect(lines).toHaveCount(1);
  // Its weaker links, one step: "uses" is a plain line to a note outlined, "see also" an outline alone. Here
  // the note it sees also is one it requires three steps back, and that comes first.
  await expect(note(page, "basics/bit")).toHaveClass(/\buse\b/);
  await expect(page.locator(".routes path.lit.uses")).toHaveCount(1);
  await expect(note(page, "basics/surprise")).toHaveClass(/\breq\b/);

  // Pointing at another note changes nothing while one is chosen.
  await note(page, "basics/bit").hover();
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\bat\b/);

  // Two steps back at once: the way there is walked and stays lit, and the note's own step is drawn.
  await note(page, "coding/source-coding").click();
  await expect(note(page, "coding/source-coding")).toHaveClass(/\bat\b/);
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\breq\b/);
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\breq\b/);
  await expect(lines).toHaveCount(3);
  await expect(page.locator(".routes path.lit.builds")).toHaveCount(0); // what builds on it is the way walked
  await expect(page.getByText("2 steps back")).toBeVisible();
  await look(page, "atlas-walked");

  // A note already walked is returned to.
  await note(page, "coding/kraft-inequality").click();
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bat\b/);
  await expect(page.getByText("1 step back")).toBeVisible();
  await expect(lines).toHaveCount(2);

  await page.keyboard.press("Escape");
  await note(page, "coding/huffman-codes").click();
  await page.getByRole("button", { name: "[ whole chain ]" }).click();
  await expect(lines).toHaveCount(3);
  await look(page, "atlas-whole-chain");
  await page.getByRole("button", { name: "[ one step ]" }).click();
  await expect(lines).toHaveCount(1);
});

test("a study item lights the note it tests and what that requires", async ({ page }) => {
  await atlas(page);
  await note(page, "@study/coding/a-prefix-code").click();
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\breq\b/);
  await expect(note(page, "basics/surprise")).toHaveClass(/\breq\b/);
});

test("a folder is zoomed to, open ground steps out, and the map is dragged and zoomed by hand", async ({ page }) => {
  await atlas(page);
  const whole = await cell(page), box = (await page.locator(".atlas").boundingBox())!;
  await folder(page, "coding").getByRole("button", { name: "coding", exact: true }).click();
  await expect.poll(() => cell(page)).toBeGreaterThan(whole);
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect.poll(() => cell(page)).toBeCloseTo(whole, 3);

  // A drag moves the map and chooses nothing, even when it ends on a note.
  const before = (await note(page, "basics/bit").boundingBox())!;
  await page.mouse.move(before.x + 5, before.y + 5);
  await page.mouse.down();
  await page.mouse.move(before.x + 45, before.y + 25, { steps: 4 });
  await page.mouse.up();
  const after = (await note(page, "basics/bit").boundingBox())!;
  expect(Math.round(after.x - before.x)).toBe(40);
  expect(Math.round(after.y - before.y)).toBe(20);
  await page.mouse.move(box.x + 4, box.y + 4); // away from it: pointing lights a note too
  await expect(note(page, "basics/bit")).not.toHaveClass(/\bat\b/);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  await page.mouse.wheel(0, -400);
  await expect.poll(() => cell(page)).toBeGreaterThan(whole);
  // Far out, a folder is one block that says what it holds.
  await page.mouse.wheel(0, 3000);
  await expect(folder(page, "coding")).toContainText("3 notes");
  await expect(note(page, "coding/huffman-codes")).toHaveCount(0);
});

test("a note made while the map is open appears on it", async ({ page }) => {
  await atlas(page);
  const id = `channels/rate-${test.info().project.name}`;
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const made = await page.request.post(`api/note?id=${id}`, { headers: { "x-isorite-token": token, origin: new URL(page.url()).origin }, data: { text: "---\ntype: Concept\ntitle: Rate\n---\n\nIt rests on [the bit](/basics/bit.md \"requires\").\n" } });
  expect(made.ok()).toBe(true);
  await expect(note(page, id)).toBeVisible();
});

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES } from "./serve.ts";

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const onDisk = (id: string) => readFileSync(join(NOTES, `${id}.md`), "utf8");
const phone = () => test.info().project.name.startsWith("phone");
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

/** Ask Iso under the first paragraph, on the empty line after it (Ctrl+Enter in a paragraph asks the paragraph
 *  itself), and wait for its text. */
async function ask(page: Page, asked: string) {
  await editor(page).getByText("It is largest").click({ position: { x: 2, y: 4 } });
  await page.keyboard.press("ArrowUp");
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
  const field = page.getByRole("textbox", { name: "Ask Iso" });
  await field.fill(asked);
  await field.press("Enter");
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
}

test.beforeAll(() => { mkdirSync(join(NOTES, "iso"), { recursive: true }); });

test("the timeline: marks only, pointing marks what each changed, a version shown and stepped through, restored as a new entry", async ({ page }) => {
  const id = `iso/timeline-${test.info().project.name}`;
  const text = "---\ntype: Concept\ntitle: Entropy on a timeline\n---\n\nThe average surprise of a source.\n\nIt is largest when every symbol is equally likely.\n";
  writeFileSync(join(NOTES, `${id}.md`), text);
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The average surprise of a source.");

  // Four moments: found as it was, your edit, Iso's text kept, Iso's text removed.
  await editor(page).getByText("It is largest").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" It is zero for a certain outcome.");
  await expect(page.getByRole("status")).toHaveText("saved");
  await ask(page, "say what it is measured in");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  await ask(page, "and again");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "remove" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  const edited = onDisk(id);

  // Closed until opened, by its button alone; open, it stays open over a reload.
  const button = page.getByRole("button", { name: "timeline", exact: true });
  await expect(page.locator(".timeline")).toHaveCount(0);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  const marks = page.locator(".timeline .moment");
  await expect(marks).toHaveCount(4);
  await expect(page.locator(".timeline")).not.toContainText(/\w/); // marks, no words
  await expect(marks.nth(0).locator("i.sq.empty")).toHaveCount(1);
  await expect(marks.nth(1).locator("i.sq:not(.empty)")).toHaveCount(1);
  await expect(marks.nth(2).locator("i.dia:not(.open)")).toHaveCount(1);
  await expect(marks.nth(3).locator("i.dia.open")).toHaveCount(1);
  await expect(marks.nth(2)).toHaveAccessibleName(/Iso · “say what it is measured in” · kept/);

  // With nothing pointed at, Iso's kept text is marked; pointing at your edit marks its line, in lattice, and
  // pointing at one of Iso's shows what was asked beside it.
  await expect(page.locator(".cm-line.cm-touched-iso")).not.toHaveCount(0);
  await marks.nth(1).hover();
  await expect(page.locator(".cm-line.cm-touched-you")).toHaveCount(1);
  await expect(page.locator(".cm-line.cm-touched-you")).toContainText("It is zero for a certain outcome.");
  await marks.nth(2).hover();
  await expect(page.locator(".timeline .asked")).toHaveText("“say what it is measured in”");
  await look(page, "timeline-pointed");

  // The note as it was when found: read only, the live note hidden; → steps to your edit, and back.
  await marks.nth(0).click();
  const was = page.getByRole("textbox", { name: "The note as it was" });
  await expect(was).toBeVisible();
  await expect(was).not.toContainText("It is zero");
  await expect(editor(page)).toBeHidden();
  await expect(page.locator(".atbar")).toContainText("found as it was");
  await look(page, "timeline-version");
  await page.locator(".atbar").click(); // away from any field, for the keys
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("textbox", { name: "The note as it was" })).toContainText("It is zero for a certain outcome.");
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("textbox", { name: "The note as it was" })).not.toContainText("It is zero");

  // The removed text is shown with the moment that offered it, and what was asked above.
  await marks.nth(3).click();
  await expect(page.locator(".version .asked")).toHaveText("and again");
  await expect(page.locator(".version .offered")).toBeVisible();

  // Restored to when it was found: the file is as it was, the restore is an entry, and the live note is back.
  await marks.nth(0).click();
  await page.getByRole("button", { name: "restore to here" }).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).not.toContainText("It is zero");
  expect(onDisk(id)).toBe(text);
  await expect(marks).toHaveCount(5);
  const journal = await (await page.request.get(`api/journal?id=${id}`)).json() as { why?: string; to?: string }[];
  expect(journal.at(-1)).toMatchObject({ why: "restore" });

  // And undone the same way: restored to the edits, from the moment before the restore.
  await marks.nth(3).click();
  await page.getByRole("button", { name: "restore to here" }).click();
  await expect(editor(page)).toContainText("It is zero for a certain outcome.");
  expect(onDisk(id)).toBe(edited);

  // Back to now leaves a version without changing anything; closing the timeline takes the marks away.
  await marks.nth(1).click();
  await page.getByRole("button", { name: "back to now" }).click();
  await expect(editor(page)).toBeVisible();
  await button.click();
  await expect(page.locator(".timeline")).toHaveCount(0);
  await expect(page.locator(".cm-line.cm-touched-iso")).toHaveCount(0);
});

test("the Atlas's timeline: this session's moments as marks; pointing outlines the note touched, choosing opens it at that moment", async ({ page }) => {
  test.skip(phone(), "the session's timeline on a phone's Atlas is still open on the boards");
  const id = `iso/on-the-map-${test.info().project.name}`;
  writeFileSync(join(NOTES, `${id}.md`), "---\ntype: Concept\ntitle: On the map\n---\n\nThe average surprise of a source.\n");
  await page.goto(`#/n/${id}`);
  await editor(page).getByText("The average surprise").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Measured in bits.");
  await expect(page.getByRole("status")).toHaveText("saved");

  await page.goto("#/atlas");
  await page.getByRole("button", { name: "this session's timeline", exact: true }).click();
  const marks = page.getByRole("list", { name: "This session's timeline" }).locator(".moment");
  await expect(marks.last()).toHaveAccessibleName(/you edited/);
  await marks.last().hover();
  await expect(page.locator(`[data-note="${id}"]`)).toHaveClass(/\bmo-you\b/);
  await expect(page.locator(".timeline .asked")).toHaveText("On the map");
  await look(page, "atlas-timeline");
  await marks.last().click();
  await expect(page).toHaveURL(new RegExp(`#/n/${id.replace(/\//g, "\\/")}\\?at=`));
  await expect(page.locator(".atbar")).toContainText("you edited");
  await expect(page.getByRole("textbox", { name: "The note as it was" })).toContainText("Measured in bits.");
});

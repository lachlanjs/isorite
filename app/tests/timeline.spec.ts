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

/** Iso changes the note in Write mode, from its pane ("edit <id>" makes the test provider change "Plain text.").
 *  The note's lens is put back to normal after, and Iso's mode to Ask. */
async function isoEdits(page: Page, id: string) {
  if (phone()) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
  const pane = page.locator('[data-pane="iso"]');
  await pane.getByRole("button", { name: "Write", exact: true }).click();
  const box = page.getByRole("textbox", { name: "Message Iso" });
  await box.fill(`edit ${id}`);
  await box.press("Enter");
  await expect(page.getByRole("log", { name: "The conversation with Iso" }).locator(".turn").last()).toHaveAttribute("data-state", "done");
  await pane.getByRole("button", { name: "Ask", exact: true }).click();
  if (phone()) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Note/ }).click();
  await page.locator('[data-pane="note"] .lens[data-lens="normal"]').click();
}

test.beforeAll(() => { mkdirSync(join(NOTES, "iso"), { recursive: true }); });

test("the timeline: marks only, pointing marks what each changed, a version shown and stepped through, restored as a new entry", async ({ page }) => {
  const id = `iso/timeline-${test.info().project.name}`;
  const text = "---\ntype: Concept\ntitle: Entropy on a timeline\n---\n\nThe average surprise of a source.\n\nIt is largest when every symbol is equally likely.\n\nPlain text.\n";
  writeFileSync(join(NOTES, `${id}.md`), text);
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The average surprise of a source.");

  // Three moments: found as it was, your edit, Iso's change in Write mode.
  await editor(page).getByText("It is largest").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" It is zero for a certain outcome.");
  await expect(page.getByRole("status")).toHaveText("saved");
  await isoEdits(page, id);
  await expect(editor(page)).toContainText("Plain text, and Iso's words.");
  const edited = onDisk(id);

  // Closed until opened, by its button alone; open, it stays open over a reload.
  const button = page.getByRole("button", { name: "timeline", exact: true });
  await expect(page.locator('[data-pane="note"] .timeline')).toHaveCount(0);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  const marks = page.locator('[data-pane="note"] .timeline .moment');
  await expect(marks).toHaveCount(3);
  await expect(page.locator('[data-pane="note"] .timeline')).not.toContainText(/\w/); // marks, no words
  await expect(marks.nth(0).locator("i.sq.empty")).toHaveCount(1);
  await expect(marks.nth(1).locator("i.sq:not(.empty)")).toHaveCount(1);
  await expect(marks.nth(2).locator("i.dia")).toHaveCount(1);
  await expect(marks.nth(2)).toHaveAccessibleName(new RegExp(`Iso · “edit ${id}” · edited`));

  // With nothing pointed at, Iso's latest change is marked; pointing at your edit marks its line, in lattice, and
  // pointing at Iso's shows what was asked beside it.
  await expect(page.locator(".cm-line.cm-touched-iso")).toHaveCount(1);
  await marks.nth(1).hover();
  await expect(page.locator(".cm-line.cm-touched-you")).toHaveCount(1);
  await expect(page.locator(".cm-line.cm-touched-you")).toContainText("It is zero for a certain outcome.");
  await marks.nth(2).hover();
  await expect(page.locator('[data-pane="note"] .timeline .asked')).toHaveText(`“edit ${id}”`);
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

  // Restored to when it was found: the file is as it was, the restore is an entry, and the live note is back.
  await page.getByRole("button", { name: "restore to here" }).click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).not.toContainText("It is zero");
  expect(onDisk(id)).toBe(text);
  await expect(marks).toHaveCount(4);
  const journal = await (await page.request.get(`api/journal?id=${id}`)).json() as { why?: string; to?: string }[];
  expect(journal.at(-1)).toMatchObject({ why: "restore" });

  // And undone the same way: restored to Iso's change, from the moment before the restore.
  await marks.nth(2).click();
  await page.getByRole("button", { name: "restore to here" }).click();
  await expect(editor(page)).toContainText("Plain text, and Iso's words.");
  expect(onDisk(id)).toBe(edited);

  // Back to now leaves a version without changing anything; closing the timeline takes the marks away.
  await marks.nth(1).click();
  await page.getByRole("button", { name: "back to now" }).click();
  await expect(editor(page)).toBeVisible();
  await button.click();
  await expect(page.locator('[data-pane="note"] .timeline')).toHaveCount(0);
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
  await expect(page.locator('[data-pane="atlas"]')).toHaveClass(/\bfocus\b/);
  await page.getByRole("button", { name: "this session's timeline", exact: true }).click();
  const marks = page.getByRole("list", { name: "This session's timeline" }).locator(".moment");
  await expect(marks.last()).toHaveAccessibleName(/you edited/);
  await marks.last().hover();
  await expect(page.locator(`[data-note="${id}"]`)).toHaveClass(/\bmo-you\b/);
  await expect(page.locator('[data-pane="atlas"] .timeline .asked')).toHaveText("On the map");
  await look(page, "atlas-timeline");
  await marks.last().click();
  await expect(page).toHaveURL(new RegExp(`#/n/${id.replace(/\//g, "\\/")}\\?at=`));
  await expect(page.locator(".atbar")).toContainText("you edited");
  await expect(page.getByRole("textbox", { name: "The note as it was" })).toContainText("Measured in bits.");
});

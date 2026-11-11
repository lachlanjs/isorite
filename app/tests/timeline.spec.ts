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

/** An agent changes the note through isorite's MCP ("Plain text." made its words), as the pane's agent does. */
async function agentEdits(page: Page, id: string) {
  const { token } = await (await page.request.get("api/session")).json() as { token: string };
  const written = await page.request.post("api/agent/write", {
    headers: { Origin: new URL(page.url()).origin, "x-isorite-token": token },
    data: { agent: "opencode", session: `ses-${test.info().project.name}`, note: `${id}.md`, asked: `edit ${id}`, edit: { oldString: "Plain text.", newString: "Plain text, and the agent's words." } },
  });
  expect(written.ok()).toBe(true);
}

test.beforeAll(() => { mkdirSync(join(NOTES, "agent"), { recursive: true }); });

test("the timeline: marks only, pointing marks what each changed, a version shown and stepped through, restored as a new entry", async ({ page }) => {
  const id = `agent/timeline-${test.info().project.name}`;
  const text = "---\ntype: Concept\ntitle: Entropy on a timeline\n---\n\nThe average surprise of a source.\n\nIt is largest when every symbol is equally likely.\n\nPlain text.\n";
  writeFileSync(join(NOTES, `${id}.md`), text);
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The average surprise of a source.");

  // Three moments: found as it was, your edit, the agent's change.
  await editor(page).getByText("It is largest").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" It is zero for a certain outcome.");
  await expect(page.getByRole("status")).toHaveText("saved");
  await agentEdits(page, id);
  await expect(editor(page)).toContainText("Plain text, and the agent's words.");
  const edited = onDisk(id);

  // Closed until opened, by its switch in the Note pane's header; open, it stays open over a reload.
  const button = page.locator('.sw[data-switch="timeline"]');
  await expect(page.locator('[data-pane="note"] .timeline')).toHaveCount(0);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  const marks = page.locator('[data-pane="note"] .timeline .moment');
  await expect(marks).toHaveCount(3);
  // As strata (M24, T): a layer each, the newest on top, no words; an agent's gold, yours blue, what was found hatched,
  // each as thick as its change.
  await expect(page.locator('[data-pane="note"] .timeline')).not.toContainText(/\w/);
  await expect(marks.nth(0)).toHaveClass(/\bagent\b/);
  await expect(marks.nth(1)).toHaveClass(/\byou\b/);
  await expect(marks.nth(2)).toHaveClass(/\bexternal\b/);
  await expect(marks.nth(0)).toHaveAccessibleName(new RegExp(`OpenCode · “edit ${id}” · edited`));
  expect((await marks.nth(2).boundingBox())!.height).toBeGreaterThan((await marks.nth(1).boundingBox())!.height);

  // With nothing pointed at, the agent's latest change is marked; pointing at your edit marks its line, in lattice, and
  // pointing at the agent's shows what was asked beside it.
  await expect(page.locator(".cm-line.cm-touched-agent")).toHaveCount(1);
  await marks.nth(1).hover();
  await expect(page.locator(".cm-line.cm-touched-you")).toHaveCount(1);
  await expect(page.locator(".cm-line.cm-touched-you")).toContainText("It is zero for a certain outcome.");
  // Yours says whose, when and how large.
  await expect(page.locator('[data-pane="note"] .timeline .asked')).toHaveText(/^you edited · just now · \+1 −1$/);
  await marks.nth(0).hover();
  await expect(page.locator('[data-pane="note"] .timeline .asked')).toHaveText(`“edit ${id}”`);
  await look(page, "timeline-pointed");

  // The note as it was when found: read only, the live note hidden; → steps to your edit, and back.
  await marks.nth(2).click();
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

  // And undone the same way: restored to the agent's change, from the moment before the restore.
  await marks.nth(1).click();
  await page.getByRole("button", { name: "restore to here" }).click();
  await expect(editor(page)).toContainText("Plain text, and the agent's words.");
  expect(onDisk(id)).toBe(edited);

  // Back to now leaves a version without changing anything; closing the timeline takes the marks away.
  await marks.nth(3).click();
  await page.getByRole("button", { name: "back to now" }).click();
  await expect(editor(page)).toBeVisible();
  await button.click();
  await expect(page.locator('[data-pane="note"] .timeline')).toHaveCount(0);
  await expect(page.locator(".cm-line.cm-touched-agent")).toHaveCount(0);
});

test("the Atlas's timeline: this session's moments as marks; pointing outlines the note touched, choosing opens it at that moment", async ({ page }) => {
  test.skip(phone(), "the session's timeline on a phone's Atlas is still open on the boards");
  const id = `agent/on-the-map-${test.info().project.name}`;
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

/** The mean colour of a part of the screen, as drawn (the editor's layers are under and over the text). */
async function meanColour(page: Page, r: { x: number; y: number; width: number; height: number }): Promise<[number, number, number]> {
  const png = (await page.screenshot({ clip: r })).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) sum[k]! += d[i + k]!;
    const n = d.length / 4;
    return [sum[0]! / n, sum[1]! / n, sum[2]! / n] as [number, number, number];
  }, png);
}

test("with the timeline on, a selection over the lines a moment changed shows over their ground, and its tags work, in the note and in a version", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const id = `agent/chosen-${test.info().project.name}`;
  writeFileSync(join(NOTES, `${id}.md`), "---\ntype: Concept\ntitle: Chosen on a timeline\n---\n\nThe average surprise of a source.\n\nPlain text.\n");
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("Plain text.");
  await agentEdits(page, id);
  await expect(editor(page)).toContainText("Plain text, and the agent's words.");
  const button = page.locator('.sw[data-switch="timeline"]');
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  const touched = page.locator(".cm-line.cm-touched-agent");
  await expect(touched).toHaveCount(1);

  // The ground is under the line, not its background, which would hide the selection drawn behind the text.
  expect(await touched.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  expect(await touched.evaluate((el) => getComputedStyle(el, "::before").backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");

  // The first half of the agent's line chosen: it is coloured as chosen, unlike the half left.
  await touched.getByText("Plain text").click();
  await page.keyboard.press("Home");
  for (let i = 0; i < 16; i++) await page.keyboard.press("Shift+ArrowRight");
  const sel = page.locator(".cm-selectionBackground");
  await expect(sel).toHaveCount(1);
  const s = (await sel.boundingBox())!, line = (await touched.boundingBox())!;
  expect(line.x + line.width - (s.x + s.width)).toBeGreaterThan(s.width);
  const chosen = await meanColour(page, { x: s.x + 1, y: s.y + 1, width: s.width - 2, height: s.height - 2 });
  const rest = await meanColour(page, { x: s.x + s.width + 4, y: s.y + 1, width: s.width - 2, height: s.height - 2 });
  expect(Math.abs(chosen[2] - rest[2]) + Math.abs(chosen[0] - rest[0]), "the selection shows over the moment's ground").toBeGreaterThan(20);
  await look(page, "timeline-selection");

  // Its tags: copied, it is where it is and the words.
  await expect(page.locator('.tag[data-tag="agent"]')).toBeVisible();
  await page.locator('.tag[data-tag="copy"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`/${id}.md, line 8:\n> Plain text, and`);

  // In the note as it was, its words can be chosen and pointed to too; Shift and an arrow change the choice, not the moment.
  await page.locator('[data-pane="note"] .timeline .moment').last().click();
  const was = page.getByRole("textbox", { name: "The note as it was" });
  await expect(was).toContainText("Plain text.");
  await was.getByText("The average surprise").click({ clickCount: 3 });
  await page.keyboard.press("Shift+ArrowLeft");
  await expect(page.locator(".atbar")).toContainText("found as it was");
  await expect(page.locator('.tag[data-tag="copy"]')).toBeVisible();
  await expect(page.locator('.tag[data-tag="delete"]')).toHaveCount(0);
  await page.locator('.tag[data-tag="copy"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`/${id}.md, line 6:\n> The average surprise of a source.`);
  await page.getByRole("button", { name: "back to now" }).click();
  await button.click();
});

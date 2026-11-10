import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES } from "./serve.ts";

type Entry = { kind: string; why?: string; who: string; text?: string };

/** The Note pane: the Atlas stands beside it with links of its own (M10). */
const notePane = (page: Page) => page.locator('[data-pane="note"]');
const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const saved = (page: Page) => expect(page.getByRole("status")).toHaveText("saved");
const file = async (page: Page, id: string) => ((await (await page.request.get(`api/note?id=${id}`)).json()) as { text: string }).text;
const journal = async (page: Page, id: string) => (await (await page.request.get(`api/journal?id=${id}`)).json()) as Entry[];
/** A screenshot to be looked at, and a check that nothing runs off the side of the page. */
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

test("a note with maths and a typed link is written, saved, and there when reopened", async ({ page }) => {
  const name = test.info().project.name, id = `basics/entropy-${name}`;
  await page.goto("");
  await expect(notePane(page).getByRole("link", { name: "Surprise" })).toBeVisible();
  await look(page, "notes");

  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByPlaceholder("Entropy").fill(`Entropy ${name}`);
  await page.getByLabel("folder", { exact: true }).fill("basics");
  await expect(page.getByText(`${id}.md`)).toBeVisible();
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`Entropy ${name}`);
  await editor(page).click();
  await page.keyboard.type("The average surprise of a source.\n\n$$\nH = -\\sum_x p(x) \\log p(x)\n$$\n\nIt rests on [[Surpr");
  await page.getByRole("option", { name: /Surprise/ }).click();
  // The link's kind, set on the link without touching its Markdown: Alt-1 is "requires".
  await page.keyboard.press("Alt+1");
  await page.keyboard.type(" and inline $p(x)$ too.\n\nA second paragraph, to see the space between two.\n\n```python\ndef entropy(p):\nreturn -sum(q * log2(q) for q in p)\n```");
  await saved(page);
  expect(await file(page, id)).toContain('[Surprise](/basics/surprise.md "requires")');

  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`Entropy ${name}`);
  await expect(page.locator(".cm-lp-maths .katex-display")).toBeVisible();
  await expect(page.locator(".cm-lp-imaths .katex")).toBeVisible();
  await expect(page.locator(".cm-lp-link")).toHaveText("Surprise");
  await expect(page.getByText("](/basics/surprise.md")).toHaveCount(0); // the markup is hidden away from the cursor
  await look(page, "note");

  // The journal: the note began as yours, and every later entry is an edit of yours that replays to the file.
  const entries = await journal(page, id);
  expect(entries[0]).toMatchObject({ kind: "change", why: "start", who: "you" });
  expect(entries.length).toBeGreaterThan(1);
  expect(entries.slice(1).every((e) => e.kind === "change" && e.why === "edit" && e.who === "you")).toBe(true);

  // The page's title says where you are; the notes, from the Note pane's header, lead back here.
  await expect(page).toHaveTitle(`Entropy ${name} · isorite`);
  await notePane(page).getByRole("button", { name: "All notes" }).click();
  await notePane(page).getByRole("link", { name: `Entropy ${name}` }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`Entropy ${name}`);
});

test("the list narrows as you type, by title and by what the notes say", async ({ page }) => {
  await page.goto("");
  const find = page.getByRole("searchbox", { name: "Find a note" });
  await find.fill("bit");
  await expect(notePane(page).getByRole("link", { name: /The bit/ })).toBeVisible();
  await expect(notePane(page).getByRole("link", { name: /^Surprise/ })).toHaveCount(0);
  await find.fill("coin toss");
  await expect(page.getByText("Matches in text")).toBeVisible();
  await expect(notePane(page).getByRole("link", { name: /The bit/ })).toBeVisible();
  await find.fill("zzzz");
  await expect(page.getByText("No note matches.")).toBeVisible();
});

test("the label is always there under the title, and changes only its own lines of the file (M23)", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await expect(page.locator(".cm-lp-table table")).toBeVisible(); // a table is drawn as one
  const before = await file(page, "basics/bit");
  await expect(page.getByRole("button", { name: "tag units: remove" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "concept" })).toHaveAttribute("aria-checked", "true");
  const said = `Said on ${test.info().project.name}.`;
  await page.getByLabel("description").fill(said);
  await saved(page);
  const after = await file(page, "basics/bit");
  expect(after).toContain(`description: ${said}`);
  expect(after).toContain("# kept as written\ntags: [units]"); // the comment and the other fields are as they were
  expect(after.split("---\n").at(-1)).toBe(before.split("---\n").at(-1)); // and so is the body
  await look(page, "label");

  // The source is the file itself, with no label over it.
  await page.getByRole("button", { name: "source" }).click();
  await expect(page.getByRole("textbox", { name: "The note's file" })).toContainText("# kept as written");
  await expect(page.getByLabel("description")).toHaveCount(0);
  await page.getByRole("button", { name: "source" }).click();
  await expect(page.getByLabel("description")).toHaveValue(said);
});

test("a paragraph changed elsewhere while you write in it is offered as a choice, and nothing is overwritten", async ({ page }) => {
  const name = test.info().project.name, id = `channels/capacity-${name}`;
  const made = await page.request.get("api/session").then((r) => r.json()) as { token: string };
  const mine = `---\ntype: Concept\ntitle: Capacity ${name}\n---\n\nThe most a channel carries.\n`;
  await page.request.post(`api/note?id=${id}`, { data: { text: mine }, headers: { "x-isorite-token": made.token, Origin: new URL(test.info().project.use.baseURL!).origin } });
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The most a channel carries.");

  // The same paragraph as the one typed in below: no merge.
  const theirs = mine.replace("The most a channel carries.", "The most a channel carries. Written in another editor.");
  writeFileSync(join(NOTES, `${id}.md`), theirs);
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Typed here meanwhile.");
  await expect(notePane(page).getByRole("alert")).toContainText("changed somewhere else");
  expect(await file(page, id)).toBe(theirs);
  await look(page, "choice");

  await page.getByRole("button", { name: "take theirs" }).click();
  await expect(editor(page)).toContainText("Written in another editor.");
  await expect(editor(page)).not.toContainText("Typed here meanwhile.");
  await saved(page);
  // Their change is in the journal as made elsewhere.
  expect((await journal(page, id)).map((e) => e.who)).toEqual(["you", "external"]);

  // And the other way: keep what was written here.
  writeFileSync(join(NOTES, `${id}.md`), mine);
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Mine stays.");
  await page.getByRole("button", { name: "keep mine" }).click();
  await saved(page);
  expect(await file(page, id)).toContain("Mine stays.");
});

test("changed elsewhere in another paragraph while you write: both are kept, and nothing is asked", async ({ page }) => {
  const name = test.info().project.name, id = `channels/merged-${name}`;
  const made = await page.request.get("api/session").then((r) => r.json()) as { token: string };
  const base = `---\ntype: Concept\ntitle: Merged ${name}\n---\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n`;
  await page.request.post(`api/note?id=${id}`, { data: { text: base }, headers: { "x-isorite-token": made.token, Origin: new URL(test.info().project.use.baseURL!).origin } });
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("Third paragraph.");

  await editor(page).getByText("First paragraph.").click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Typed here.");
  writeFileSync(join(NOTES, `${id}.md`), base.replace("Third paragraph.", "Third paragraph, changed elsewhere."));
  // Theirs comes into the editor with what was typed here, and the two are saved together.
  await expect(editor(page)).toContainText("Third paragraph, changed elsewhere.");
  await saved(page);
  await expect(notePane(page).getByRole("alert")).toHaveCount(0);
  expect(await file(page, id)).toBe(base.replace("First paragraph.", "First paragraph. Typed here.").replace("Third paragraph.", "Third paragraph, changed elsewhere."));
  await expect(editor(page)).toContainText("First paragraph. Typed here.");
});

test("a click on a formula, inline, displayed in a sentence or on its own lines, puts the cursor at its start", async ({ page }) => {
  const name = test.info().project.name, id = `basics/formulas-${name}`;
  const made = await page.request.get("api/session").then((r) => r.json()) as { token: string };
  const text = `---\ntype: Concept\ntitle: Formulas ${name}\n---\n\nInline $x^2$ here.\n\nShown so $$\\sum_i a_i$$ holds.\n\n$$\n\\int_0^1 f\n$$\n\nThe end.\n`;
  await page.request.post(`api/note?id=${id}`, { data: { text }, headers: { "x-isorite-token": made.token, Origin: new URL(test.info().project.use.baseURL!).origin } });
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The end.");
  const formulas = notePane(page).locator(".cm-lp-imaths, .cm-lp-maths");
  await expect(formulas).toHaveCount(3);
  let want = text;
  for (const [k, source] of [[0, "$x^2$"], [1, "$$\\sum_i a_i$$"], [2, "$$\n\\int_0^1 f\n$$"]] as const) {
    // Away from the cursor, each is drawn; clicked, its source is there to edit, the cursor before it.
    await editor(page).getByText("The end.").click();
    await expect(formulas).toHaveCount(3);
    await formulas.nth(k).click();
    await page.keyboard.type("Q");
    want = want.replace(source, () => `Q${source}`); // a function: in a replacement string, $$ is one $
    await saved(page);
    expect(await file(page, id)).toBe(want);
  }
});

test("what is typed and not yet saved survives the tab closing", async ({ page, context }) => {
  const name = test.info().project.name;
  await page.goto("#/n/basics/surprise");
  await editor(page).click();
  await page.keyboard.press("Control+End");
  // The server stops answering saves; the page is closed before any gets through.
  await context.route("**/api/note?*", (route) => (route.request().method() === "PUT" ? route.abort() : route.continue()));
  await page.keyboard.type(`Kept for ${name}.`);
  await expect(page.getByRole("status")).toContainText("not saved");
  await page.close();
  await context.unroute("**/api/note?*");
  const again = await context.newPage();
  await again.goto("#/n/basics/surprise");
  await expect(editor(again)).toContainText(`Kept for ${name}.`);
  await saved(again);
  expect(await file(again, "basics/surprise")).toContain(`Kept for ${name}.`);
});

test("a passage chosen in a note is pointed to in the agent's box (Ctrl+[); the notes open over the note and close when one is chosen", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  await editor(page).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+End");
  if ((page.viewportSize()?.width ?? 1280) > 760) {
    await page.keyboard.press("Control+[");
    await expect(page.locator(".pt:not(.pt-ghost)")).toHaveCount(1);
  }

  await page.getByRole("button", { name: "All notes" }).click();
  await expect(page.getByRole("searchbox", { name: "Find a note" })).toBeVisible();
  await notePane(page).getByRole("link", { name: "The bit" }).click();
  await expect(page).toHaveURL(/#\/n\/basics\/bit$/);
  await expect(page.getByRole("searchbox", { name: "Find a note" })).toHaveCount(0);
});

test("the atlas pane, and a note that is not there", async ({ page }) => {
  await page.goto("#/atlas");
  await expect(page.getByRole("application", { name: "The atlas: the map of the base" })).toBeVisible();
  // An old link to the Atlas brings its pane forward (M10).
  await expect(page.getByRole("region", { name: "Atlas" })).toHaveClass(/focus/);
  await look(page, "atlas");
  await page.goto("#/n/no/such-note");
  await expect(page.getByText("There is no note at")).toBeVisible();
});

test("Back and Forward in the Note pane follow the notes opened, one after another (M37)", async ({ page }) => {
  const p = test.info().project.name;
  await page.goto("#/notes");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  for (const n of ["one", "two"]) {
    expect((await page.request.post(`api/note?id=trail/${n}-${p}`, { headers, data: { text: `---\ntype: Concept\ntitle: Trail ${n} ${p}\n---\n\nText.\n` } })).ok()).toBe(true);
  }
  await page.reload();
  const back = page.getByRole("button", { name: "Back to the note before" }), forward = page.getByRole("button", { name: "Forward to the note after" });
  await page.getByRole("link", { name: new RegExp(`Trail one ${p}`) }).first().click();
  await expect(page).toHaveURL(new RegExp(`trail/one-${p}`));
  await page.getByRole("button", { name: "All notes" }).click();
  await page.getByRole("link", { name: new RegExp(`Trail two ${p}`) }).first().click();
  await expect(page).toHaveURL(new RegExp(`trail/two-${p}`));
  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();
  await back.click();
  await expect(page).toHaveURL(new RegExp(`trail/one-${p}`));
  await expect(forward).toBeEnabled();
  await forward.click();
  await expect(page).toHaveURL(new RegExp(`trail/two-${p}`));
});

test("with the cursor in a table, a bar inserts and deletes its rows and columns (M37)", async ({ page }) => {
  const name = test.info().project.name, id = `tables/grid-${name}`;
  await page.goto("#/notes");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  const text = `---\ntype: Concept\ntitle: Grid ${name}\n---\n\nBefore.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\nAfter.\n`;
  expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text } })).ok()).toBe(true);
  await page.reload();
  await page.getByRole("link", { name: new RegExp(`Grid ${name}`) }).first().click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(`Grid ${name}`);
  await page.locator(".cm-lp-block table").first().click();
  const bar = page.getByRole("toolbar", { name: "Table" });
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Insert a column to the right" }).click();
  await bar.getByRole("button", { name: "Insert a row below" }).click();
  await saved(page);
  expect(await file(page, id)).toContain("| a |  | b |\n| --- | --- | --- |\n|  |  |  |\n| 1 |  | 2 |");
});

// Pointers: a selection offers two tags; Ctrl+[ puts a pointer to it in the agent's box (glowing, ">---<"), Ctrl+]
// copies where it is and the words. A pointer moves in the box, lights its note on hover, and on send becomes where it
// is from and the words themselves.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ROOT } from "./serve.ts";
import { pressHead } from "./switches.ts";
import { attach, box, log, toAgent, type Attached } from "./agent.ts";

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(async () => { await agent.detach(); });
test.beforeEach(({ }, info) => { test.skip((info.project.use.viewport?.width ?? 1280) <= 760, "a pointer is taken with keys, and moved and pointed at with a mouse"); });

/** What the agent was sent in the last turn: the prompt with its footnotes (where each pointer is, and its words). */
const sent = async (page: Page): Promise<string> => ((await (await page.request.get("api/terminal")).json()) as { turns: { asked: string }[] }).turns.at(-1)?.asked ?? "";
const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const pointers = (page: Page) => page.locator("[data-prompt] .pt:not(.pt-ghost)");
/** The first line of the note's text chosen, and the line of the file it is on. */
async function choose(page: Page, id: string, word: string, soft = false): Promise<number> {
  // In the app, by its note list (an address typed in is a new page, and the box is empty).
  if (soft) {
    await pressHead(page, "note", "All notes");
    await page.locator(`[data-pane="note"] a[href$="#/n/${id}"]`).click();
  } else await page.goto(`#/n/${id}`);
  return select(page, id, word);
}
/** The first line holding `word` chosen in the note open, and its number in the file. */
async function select(page: Page, id: string, word: string): Promise<number> {
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
  await page.keyboard.press("Control+Home");
  // Down to the line that has the word, then the line.
  const file = ((await (await page.request.get(`api/note?id=${id}`)).json()) as { text: string }).text.split("\n");
  const at = file.findIndex((l) => l.includes(word));
  expect(at).toBeGreaterThan(0);
  for (let i = 0; i < 40 && !(await editor(page).evaluate((el, w) => (getSelection()?.anchorNode?.parentElement?.closest(".cm-line")?.textContent ?? "").includes(w), word)); i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  return at + 1;
}

test("a selection offers two tags; Ctrl+[ puts a pointer in the box, which is sent as where it is from and the words", async ({ page }) => {
  const line = await choose(page, "basics/surprise", "An outcome of probability");
  await expect(page.locator('.tag[data-tag="agent"]')).toBeVisible();
  await expect(page.locator('.tag[data-tag="copy"]')).toBeVisible();
  // The two tags stand clear of each other.
  const [a, b] = [(await page.locator('.tag[data-tag="agent"]').boundingBox())!, (await page.locator('.tag[data-tag="copy"]').boundingBox())!];
  expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, "the tags do not overlap").toBe(true);
  // A tag's name, said when it is pointed at, stands clear of the other tag.
  for (const [which, other] of [["agent", "copy"], ["copy", "agent"]] as const) {
    await page.locator(`.tag[data-tag="${which}"]`).hover();
    const l = (await page.locator(`.tag[data-tag="${which}"] .lbl`).boundingBox())!, o = (await page.locator(`.tag[data-tag="${other}"]`).boundingBox())!;
    await expect(page.locator(`.tag[data-tag="${which}"] .lbl`)).toHaveCSS("opacity", "1");
    expect(l.x + l.width <= o.x || o.x + o.width <= l.x || l.y + l.height <= o.y || o.y + o.height <= l.y, `the name of ${which} does not cover ${other}`).toBe(true);
  }
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-pointer-tags.png` });
  await page.keyboard.press("Control+[");
  await expect(pointers(page)).toHaveCount(1);
  await expect(page.locator(".tag")).toHaveCount(0);
  await page.keyboard.type("is that so?");
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-pointer-box.png` });
  await page.keyboard.press("ControlOrMeta+Enter");
  // The agent is sent where it is and the words.
  await expect.poll(() => sent(page)).toContain(`/basics/surprise.md L${line}`);
  expect(await sent(page)).toContain("An outcome of probability");
  await expect(pointers(page)).toHaveCount(0);
  // The turn shows what they wrote, with the pointer as the same chip it was in the box, where it stood; where it is
  // and its words are its tooltip, not the turn's text.
  const asked = log(page).locator(".asked").last();
  await expect(asked.locator(".pt")).toHaveText(`Surprise · ${line}`);
  await expect(asked.locator(".pt")).toHaveAttribute("title", new RegExp(`^/basics/surprise\\.md L${line}\\n[^]*An outcome of probability`));
  await expect(asked).toContainText("is that so?");
  await expect(asked).not.toContainText("surprise.md");
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-pointer-turn.png` });
});

test("a third tag deletes the words chosen in a note; the words bloom as they go, and the keys show they were taken", async ({ page }) => {
  const p = test.info().project.name, id = `basics/del-${p}`;
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(test.info().project.use.baseURL ?? "http://localhost:4799/").origin };
  expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text: `---\ntype: Concept\ntitle: Del ${p}\n---\n\nKeep this line.\n\nRemove this line.\n\nAnd this one stays.\n` } })).ok()).toBe(true);
  await page.goto(`#/n/${id}`);
  await select(page, id, "Remove this line");
  await expect(page.locator('.tag[data-tag="delete"]')).toBeVisible();
  // The three stand clear of one another.
  const boxes = await Promise.all(["agent", "copy", "delete"].map(async (w) => (await page.locator(`.tag[data-tag="${w}"]`).boundingBox())!));
  for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, "the tags do not overlap").toBe(true);
  await page.screenshot({ path: `test-results/screens/${p}-selection-three-tags.png` });
  // Copying blooms the words (the flash is an element of its own, gone when it ends).
  await page.keyboard.press("Control+]");
  await expect(page.locator("body > div[aria-hidden]").first()).toBeAttached();
  await select(page, id, "Remove this line");
  await page.locator('.tag[data-tag="delete"]').click();
  await expect(editor(page)).not.toContainText("Remove this line");
  await expect(editor(page)).toContainText("Keep this line.");
  await expect(page.locator(".tag")).toHaveCount(0);
  // Undone like any change.
  await page.keyboard.press("Control+z");
  await expect(editor(page)).toContainText("Remove this line");
  const now = (await (await page.request.get(`api/note?id=${id}`)).json()) as { version: string };
  expect((await page.request.post(`api/note/delete?id=${id}`, { headers, data: { base: now.version } })).ok()).toBe(true);
});

test("pointers from two notes stand in one question, in the order they are in the box", async ({ page }) => {
  await choose(page, "basics/surprise", "An outcome of probability");
  await page.keyboard.press("Control+[");
  await page.keyboard.type("What does ");
  // The box keeps what was written while another note is chosen.
  await choose(page, "basics/bit", "One fair coin toss", true);
  await page.keyboard.press("Control+[");
  await expect(pointers(page)).toHaveCount(2);
  await page.keyboard.type("have to do with the other?");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(log(page).locator(".asked").last().locator(".pt")).toHaveText([/^Surprise · \d+$/, /^The bit · \d+$/]);
  await expect.poll(() => sent(page)).toMatch(/\[\^1\][^]*\[\^2\]/);
  const text = await sent(page);
  for (const w of ["/basics/surprise.md", "/basics/bit.md", "One fair coin toss"]) expect(text).toContain(w);
});

test("Ctrl+] copies where it is and the words", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const line = await choose(page, "basics/surprise", "An outcome of probability");
  await page.keyboard.press("Control+]");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain(`/basics/surprise.md, line ${line}:\n> An outcome of probability`);
  await expect(page.locator('.tag[data-tag="copy"] .lbl')).toContainText("copied");
});

test("Ctrl+Shift+Arrow chooses a word at a time, across a pointer", async ({ page }) => {
  await choose(page, "basics/surprise", "An outcome of probability");
  await page.keyboard.press("Control+[");
  await page.keyboard.type("two three");
  await page.keyboard.press("Home");
  await page.keyboard.type("one ");
  await page.keyboard.press("End");
  // Not stopped at the pointer: three words and the pointer are chosen in as many presses as there are things to cross.
  for (let i = 0; i < 4; i++) await page.keyboard.press("Control+Shift+ArrowLeft");
  await page.keyboard.type("X");
  await expect(box(page)).toHaveText("X");
  await expect(pointers(page)).toHaveCount(0);
  // And to the right, from the start.
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Home");
  for (let i = 0; i < 4; i++) await page.keyboard.press("Control+Shift+ArrowRight");
  await page.keyboard.type("Y");
  await expect(box(page)).toHaveText("Y");
});

test("Ctrl+[ with nothing chosen is the editor's own (it indents)", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  await editor(page).click();
  await page.keyboard.press("Control+[");
  await expect(pointers(page)).toHaveCount(0);
});

test("the tag is picked up and let go in the box where the words need it; a pointer in the box is moved by hand", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  await box(page).fill("Explain  in one line.");
  await select(page, "basics/surprise", "An outcome of probability");
  const tag = page.locator('.tag[data-tag="agent"]');
  await expect(tag).toBeVisible();
  await page.waitForTimeout(450);
  const t = (await tag.boundingBox())!, b = (await box(page).boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 60, b.y + 14, { steps: 6 });
  await expect(page.locator(".held")).toHaveCount(1);
  await page.mouse.up();
  await expect(pointers(page)).toHaveCount(1);
  await expect(page.locator(".held")).toHaveCount(0);
  const around = () => box(page).evaluate((el) => { const pt = el.querySelector(".pt")!, r = document.createRange(); r.setStart(el.querySelector(".cm-line")!, 0); r.setEndBefore(pt); return { before: r.toString().length, total: (el.textContent ?? "").length - (pt.textContent ?? "").length }; });
  const put = await around();
  expect(put.before, "inside the sentence, not at its start").toBeGreaterThan(0);
  expect(put.total - put.before, "nor at its end").toBeGreaterThan(8);
  // Moved by hand to the end.
  const p = (await pointers(page).boundingBox())!, end = (await box(page).boundingBox())!;
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width - 20, end.y + 14, { steps: 8 });
  await page.mouse.up();
  const moved = await around();
  expect(moved.total - moved.before, "at the end").toBeLessThanOrEqual(1);
});

test("pointed at in the box, a pointer marks its words in the note when it is open", async ({ page }) => {
  await choose(page, "basics/surprise", "An outcome of probability");
  await page.keyboard.press("Control+[");
  await page.keyboard.press("ArrowRight"); // the selection is the note's no more
  await expect(page.locator(".cm-pointer-range")).toHaveCount(0);
  await pointers(page).hover();
  await expect(page.locator(".cm-pointer-range").first()).toContainText("An outcome of probability");
  await pointers(page).dispatchEvent("pointerleave");
  await expect(page.locator(".cm-pointer-range")).toHaveCount(0);
});

test("a line of a file of the repository is pointed to by its path and line; the agent's own words too", async ({ page }) => {
  const file = `src/pointed-${test.info().project.name}.py`;
  mkdirSync(join(ROOT, "code", "src"), { recursive: true });
  writeFileSync(join(ROOT, "code", file), "def build(freqs):\n    heap = list(freqs)\n    return heap\n");
  await page.goto(`#/code/${file}`);
  const row = page.locator('[data-n="2"]');
  await expect(row).toContainText("heap = list(freqs)");
  await row.selectText();
  await expect(page.locator('.tag[data-tag="agent"]')).toBeVisible();
  await page.keyboard.press("Control+[");
  await expect(pointers(page)).toHaveCount(1);
  await page.keyboard.type("is this needed?");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect.poll(() => sent(page)).toContain(`${file} L2`);
  expect(await sent(page)).toContain("heap = list(freqs)");
  await expect(log(page).locator(".asked").last().locator(".pt")).toHaveAttribute("title", new RegExp(`^${file.replace(/[.]/g, "\\.")} L2`));

  // The agent's answer, chosen: a pointer with no file.
  await page.locator('[data-pane="agent"] .said').last().selectText();
  await expect(page.locator('.tag[data-tag="agent"]')).toBeVisible();
  await page.keyboard.press("Control+[");
  await expect(pointers(page)).toHaveCount(1);
  await page.keyboard.type("say that again");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect.poll(() => sent(page)).toContain("the agent's earlier answer");
  await expect(log(page).locator(".asked").last().locator(".pt")).toHaveText("the answer");
});

test("text chosen in the box with a pointer in it marks the pointer too, so it is clear what a delete would take", async ({ page }) => {
  await choose(page, "basics/surprise", "An outcome of probability");
  await page.keyboard.press("Control+[");
  await page.keyboard.type("is this right?");
  await expect(pointers(page)).toHaveCount(1);
  await expect(page.locator(".pt-selected")).toHaveCount(0);
  await page.keyboard.press("Shift+Home");
  await expect(page.locator(".pt-selected")).toHaveCount(1);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-pointer-selected.png` });
  await page.keyboard.press("Backspace");
  await expect(pointers(page)).toHaveCount(0);
});

test("the box has a cursor you can see, in the text's colour", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await box(page).click();
  const cursor = page.locator('[data-pane="agent"] .cm-cursor').first();
  await expect(cursor).toBeAttached();
  const c = await cursor.evaluate((el) => getComputedStyle(el).borderLeftColor);
  const text = await box(page).evaluate((el) => getComputedStyle(el).color);
  expect(c, "not the default black").toBe(text);
});

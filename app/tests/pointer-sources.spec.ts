// Where a pointer came from, shown when it is pressed: in the box before it is sent and in the turn after. A note's lines
// open lit (where its words are now, if they moved; said to have changed, if they are gone; in the note's new place, if
// it moved); a passage of the conversation is scrolled to and lit. By the keyboard too.

import { expect, test, type Page } from "@playwright/test";
import { attach, ask, box, log, submit, toAgent, type Attached } from "./agent.ts";

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(async () => { await agent.detach(); });

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const lit = (page: Page) => page.locator('[data-pane="note"] .cm-revealed');

async function writer(page: Page) {
  await page.goto("#/notes");
  await expect(page.getByRole("searchbox", { name: "Find a note" })).toBeVisible({ timeout: 15000 });
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  const version = async (id: string) => { const r = await page.request.get(`api/note?id=${id}`); return r.ok() ? ((await r.json()) as { version: string }).version : undefined; };
  return {
    write: async (id: string, text: string) => {
      const base = await version(id);
      expect((await (base ? page.request.put(`api/note?id=${id}`, { headers, data: { text, base } }) : page.request.post(`api/note?id=${id}`, { headers, data: { text } }))).ok()).toBe(true);
    },
    move: async (id: string, to: string) => { expect((await page.request.post(`api/note/move?id=${id}`, { headers, data: { to, base: await version(id) } })).ok()).toBe(true); },
  };
}
const file = (p: string, middle: string) => `---\ntype: Concept\ntitle: Src ${p}\n---\n\n${middle}The passage pointed at, ${p}.\n\nThe end.\n`;
/** What the passage held by the conversation reads as, while it is lit. */
const litInSession = (page: Page) => page.evaluate(() => { const h = CSS.highlights.get("revealed"); return h ? [...h].map((r) => r.toString()).join("") : ""; });

test("a pointer in a sent turn opens its note at its lines, follows them when they move, says when they changed, and finds a note that moved", async ({ page }) => {
  const p = test.info().project.name, id = `pointed-${p}/source-${Date.now()}`;
  const { write, move } = await writer(page);
  await write(id, file(p, "Line one.\n\n"));
  await toAgent(page);
  await ask(page, `Where is the source of [^1]?\n\n[^1]: /${id}.md L8\n    > The passage pointed at, ${p}.`, "Where is the source of");
  const chip = log(page).locator(".asked").last().locator(".pt");
  await expect(chip).toHaveText(/ · 8$/);
  await expect(chip).toHaveRole("button");

  await chip.click();
  await expect(page).toHaveURL(new RegExp(`#/n/${id}$`));
  await expect(lit(page)).toContainText(`The passage pointed at, ${p}.`);
  await expect(page.locator(".cm-revealed-said")).toHaveCount(0);
  await page.screenshot({ path: `test-results/screens/${p}-pointer-revealed.png` });

  // Lines put in above it: lit where it is now.
  await write(id, file(p, "Line one.\n\nA line more.\n\nAnd another.\n\n"));
  await page.evaluate(() => { location.hash = "#/notes"; });
  await toAgent(page);
  await chip.click();
  await expect(lit(page)).toContainText(`The passage pointed at, ${p}.`);
  // By the keyboard: Enter on the chip.
  await page.evaluate(() => { location.hash = "#/notes"; });
  await toAgent(page);
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(lit(page)).toContainText(`The passage pointed at, ${p}.`);

  // Its words changed: the lines they were on, said to have changed.
  await write(id, `---\ntype: Concept\ntitle: Src ${p}\n---\n\nLine one.\n\nWritten over since.\n\nThe end.\n`);
  await page.evaluate(() => { location.hash = "#/notes"; });
  await toAgent(page);
  await chip.click();
  await expect(page.locator(".cm-revealed-said")).toHaveText("changed since it was pointed to");
  await expect(lit(page)).toContainText("Written over since.");
  await page.screenshot({ path: `test-results/screens/${p}-pointer-changed.png` });

  // The note moved: it opens where it is now, its lines lit.
  await write(id, file(p, "Line one.\n\n"));
  const to = `pointed-${p}/moved-${Date.now()}`;
  await move(id, to);
  await page.evaluate(() => { location.hash = "#/notes"; });
  await toAgent(page);
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`#/n/${to}$`));
  await expect(lit(page)).toContainText(`The passage pointed at, ${p}.`);
});

test("a pointer to the agent's earlier answer scrolls the session to it and lights its words", async ({ page }) => {
  const p = test.info().project.name;
  await page.goto("#/notes");
  await toAgent(page);
  await ask(page, `say The quarry of ${p} keeps its granite.\\nNothing else is said.`, `quarry of ${p}`);
  // A few turns after it, so it is scrolled away from.
  for (let k = 0; k < 3; k++) await ask(page, `say Filler ${k} for ${p}.\\n\\n${"More words to fill the session. ".repeat(12)}`, `Filler ${k} for ${p}`);
  await ask(page, `Which granite is [^1]?\n\n[^1]: the agent's earlier answer\n    > quarry of ${p} keeps its granite`, "Which granite is");
  const chip = log(page).locator(".asked").last().locator(".pt");
  await expect(chip).toHaveText("the answer");
  await chip.click();
  await expect.poll(() => litInSession(page)).toBe(`quarry of ${p} keeps its granite`);
  await expect(log(page).locator(".said", { hasText: `The quarry of ${p}` })).toBeInViewport();
  await page.screenshot({ path: `test-results/screens/${p}-pointer-passage.png` });
});

test("a pointer in the box, pressed or with Enter, shows where it came from before it is sent", async ({ page }) => {
  const p = test.info().project.name, id = `pointed-${p}/boxed-${Date.now()}`;
  const { write } = await writer(page);
  await write(id, file(p, "First of all.\n\n"));
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toBeVisible();
  // The passage chosen by the keyboard, and put in the box.
  await editor(page).click();
  await page.keyboard.press("Control+Home");
  for (let i = 0; i < 6 && !(await editor(page).evaluate((el, w) => (getSelection()?.anchorNode?.parentElement?.closest(".cm-line")?.textContent ?? "").includes(w), "The passage pointed at")); i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.keyboard.press("Control+[");
  const chip = page.locator("[data-prompt] .pt:not(.pt-ghost)");
  await expect(chip).toHaveCount(1);
  await expect(chip).toHaveRole("button");
  // Pressed where it stands (the note is open: its lines are lit all the same).
  await toAgent(page);
  await chip.click();
  await expect(page).toHaveURL(new RegExp(`#/n/${id}$`));
  await expect(lit(page)).toContainText(`The passage pointed at, ${p}.`);
  // The cursor put somewhere lets the light go; Enter on the chip brings it back.
  await editor(page).click();
  await expect(lit(page)).toHaveCount(0);
  await toAgent(page);
  await chip.focus();
  await page.keyboard.press("Enter");
  await expect(lit(page)).toContainText(`The passage pointed at, ${p}.`);
  // Sent, it is the chip in the turn.
  await toAgent(page);
  await box(page).press("End");
  await page.keyboard.type(" this");
  await submit(page);
  await expect(log(page).locator(".asked").last().locator(".pt")).toHaveText(/^Src .* · 8$/);
});

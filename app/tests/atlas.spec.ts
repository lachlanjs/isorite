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
  await expect(page.locator(".routes")).toHaveAttribute("data-requires", "1");
  await expect(page.locator(".routes")).toHaveAttribute("data-builds", "1");
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

test("the chain is walked a step at a time, the way kept", async ({ page }) => {
  await atlas(page);
  // Links are counted on the layer: where their lines overlap they are drawn as one.
  const lines = page.locator(".routes");
  await note(page, "coding/huffman-codes").click();
  await expect(lines).toHaveAttribute("data-requires", "1");
  // Its weaker links, one step: "uses" is a plain line to a note outlined, "see also" an outline alone. Here
  // the note it sees also is one it requires three steps back, and that comes first.
  await expect(note(page, "basics/bit")).toHaveClass(/\buse\b/);
  await expect(page.locator(".routes")).toHaveAttribute("data-uses", "1");
  await expect(note(page, "basics/surprise")).toHaveClass(/\breq\b/);

  // Pointing at another note changes nothing while one is chosen.
  await note(page, "basics/bit").hover();
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\bat\b/);

  // Two steps back at once: the way there is walked and stays lit, and the note's own step is drawn.
  await note(page, "coding/source-coding").click();
  await expect(note(page, "coding/source-coding")).toHaveClass(/\bat\b/);
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\breq\b/);
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\breq\b/);
  await expect(lines).toHaveAttribute("data-requires", "3");
  await expect(page.locator(".routes")).toHaveAttribute("data-builds", "0"); // what builds on it is the way walked
  await expect(page.getByText("2 steps back")).toBeVisible();
  await look(page, "atlas-walked");

  // A note already walked is returned to.
  await note(page, "coding/kraft-inequality").click();
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bat\b/);
  await expect(page.getByText("1 step back")).toBeVisible();
  await expect(lines).toHaveAttribute("data-requires", "2");

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
  // Open ground: a corner of the map outside the folder zoomed to, and on nothing (the base grows as the tests run,
  // so where the folder lies changes).
  const open = await page.evaluate(({ x, y, w, h }) => {
    const inside = document.querySelector('[data-folder="coding"]')!.getBoundingClientRect();
    for (const [px, py] of [[x + 4, y + 4], [x + w - 4, y + 4], [x + 4, y + h - 4], [x + w - 4, y + h - 4]] as const) {
      const out = px < inside.left || px > inside.right || py < inside.top || py > inside.bottom;
      const on = document.elementFromPoint(px, py);
      if (out && on && !on.closest("[data-folder], [data-note], button, a")) return { px, py };
    }
    return null;
  }, { x: box.x, y: box.y, w: box.width, h: box.height });
  expect(open, "a corner of open ground").not.toBeNull();
  await page.mouse.click(open!.px, open!.py);
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

/** Press and keep still, as long as starts a note for Iso. */
async function hold(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(page.locator(".atlas .grasp")).toBeVisible();
  await page.waitForURL(/#\/draft\//);
  await page.mouse.up();
}
const notesOnDisk = async (page: Page) => ((await (await page.request.get("api/notes")).json()) as { notes: unknown[] }).notes.length;

test("holding on open ground starts a blank note for Iso, on a note one that links it; the base is not touched", async ({ page }) => {
  await atlas(page);
  const before = await notesOnDisk(page), box = (await page.locator(".atlas").boundingBox())!;
  await expect(page.getByText("hold on open ground to start a note for Iso")).toBeAttached();

  // A press that moves is a drag, however long it lasts.
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 20, { steps: 3 });
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page).toHaveURL(/#\/atlas$/);

  await hold(page, box.x + 6, box.y + 6);
  await expect(page.getByText("for Iso · not in your base yet")).toBeVisible();
  await expect(page.getByText("no notes yet")).toBeVisible();
  await page.getByRole("button", { name: "[ discard ]" }).click();

  await atlas(page);
  const on = (await note(page, "coding/kraft-inequality").boundingBox())!;
  await hold(page, on.x + on.width / 2, on.y + on.height / 2);
  await expect(page.locator(".deck .chip")).toHaveText(["Kraft inequality"]);
  expect(await notesOnDisk(page)).toBe(before);
  await page.getByRole("button", { name: "[ discard ]" }).click();
});

test("notes are picked on the map for a note for Iso: numbered in order, sized in the dock, and taken away again", async ({ page }) => {
  await atlas(page);
  const box = (await page.locator(".atlas").boundingBox())!;
  await hold(page, box.x + 6, box.y + 6);
  await page.getByLabel("Title").fill("Codes, in my words");
  await page.locator(".cm-content").click();
  await page.keyboard.type("A code is short where the source is likely.");
  await page.getByRole("button", { name: "[ + pick on the atlas ]" }).click();
  await expect(page).toHaveURL(/#\/atlas\?pick=/);

  const dock = page.getByRole("region", { name: "Notes linked to the note for Iso" });
  await expect(dock).toContainText("Codes, in my words");
  await expect(dock).toContainText("0 linked");
  await expect(page.getByText("click a note to link it")).toBeAttached();
  await note(page, "coding/huffman-codes").click();
  await note(page, "basics/surprise").click();
  await expect(note(page, "coding/huffman-codes").locator(".num")).toHaveText("1");
  await expect(note(page, "basics/surprise").locator(".num")).toHaveText("2");
  await expect(dock).toContainText(/2 linked · \d+ tokens/);
  await look(page, "atlas-pick");
  // A click here links; it neither chooses the note nor opens it.
  await expect(page).toHaveURL(/#\/atlas\?pick=/);
  await expect(note(page, "coding/huffman-codes")).not.toHaveClass(/\bat\b/);

  await note(page, "coding/huffman-codes").click();
  await expect(note(page, "coding/huffman-codes").locator(".num")).toHaveCount(0);
  await expect(note(page, "basics/surprise").locator(".num")).toHaveText("1");
  await note(page, "coding/kraft-inequality").click();
  await expect(dock).toContainText("2 linked");

  await dock.getByRole("link", { name: "back to it" }).click();
  await expect(page.locator(".deck .chip")).toHaveText(["Surprise", "Kraft inequality"]);
  await expect(page.locator(".cm-content")).toContainText("A code is short where the source is likely.");
  await page.getByRole("button", { name: "[ discard ]" }).click();
});

/** A note for Iso, written from the notes page and linked to Huffman codes, then sent. */
async function sendForIso(page: Page, title: string, asked: string) {
  await page.goto("#/notes");
  await page.getByRole("button", { name: "new note for Iso" }).click();
  await page.getByLabel("Title").fill(title);
  await page.getByRole("textbox", { name: "The note", exact: true }).click();
  await page.keyboard.type(`${asked}, resting on [[Huff`);
  await page.getByRole("option", { name: /Huffman codes/ }).click();
  await expect(page.locator(".deck .chip")).toHaveText("Huffman codes");
  await page.getByRole("button", { name: "send to Iso" }).click();
}

test("a note for Iso is watched on the map: its block, blue lines to what it links, what Iso reads; stopped, its path stays until let go", async ({ page }) => {
  const title = `Watched ${test.info().project.name}`;
  await sendForIso(page, title, "look slowly at codes");
  await page.waitForURL(/#\/atlas$/);
  await expect(page.getByRole("link", { name: `${title}: your note for Iso` })).toBeVisible();
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\blinked\b/);
  await expect(page.locator(".routes path.sent")).toHaveCount(1);
  // The scripted provider reads Surprise, then writes slowly: the note it rests on is filled gold.
  await expect(note(page, "basics/surprise")).toHaveClass(/\bp-used\b/);
  await expect(page.locator(".asker .doing")).toContainText("Iso is");
  await expect(page.getByText("your note opens when Iso is done")).toBeAttached();
  await look(page, "atlas-think");

  await page.getByRole("button", { name: "[ stop ]" }).click();
  await expect(page.getByText(/Iso was stopped/)).toBeAttached();
  await expect(page.locator(".asker .doing")).toHaveCount(0);
  await expect(note(page, "basics/surprise")).toHaveClass(/\bp-(link|key|sem)\b/); // reached, no longer being read
  await expect(page).toHaveURL(/#\/atlas$/); // stopped: nothing to open
  const box = (await page.locator(".atlas").boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(page.getByRole("link", { name: `${title}: your note for Iso` })).toHaveCount(0);
  await expect(note(page, "basics/surprise")).not.toHaveClass(/\bp-/);
});

test("a note for Iso opens again with its answer when Iso is done", async ({ page }) => {
  await sendForIso(page, `Answered ${test.info().project.name}`, "look at codes");
  await page.waitForURL(/#\/draft\//);
  await expect(page.locator(".between .said strong")).toHaveText("bits");
  await page.getByRole("button", { name: "discard" }).last().click();
});

test("lines from notes to their folder's wall are drawn at rest when asked for (key l)", async ({ page }) => {
  await atlas(page);
  const lines = () => page.locator(".routes path.base").count();
  const before = await lines();
  await page.locator(".atlas").focus();
  await page.keyboard.press("l");
  await expect.poll(lines).toBeGreaterThan(before);
  await page.keyboard.press("l");
  await expect.poll(lines).toBe(before);
});

test("on a phone, ↑ out steps out of the folder the screen is in", async ({ page }) => {
  test.skip(!test.info().project.name.startsWith("phone"), "the phone's header");
  await atlas(page);
  const whole = await cell(page);
  await expect(page.getByRole("button", { name: "↑ out" })).toHaveCount(0);
  await folder(page, "coding").getByRole("button", { name: "coding", exact: true }).click();
  await expect.poll(() => cell(page)).toBeGreaterThan(whole);
  await expect(page.locator(".bar .where")).toHaveText("coding");
  await page.getByRole("button", { name: "↑ out" }).click();
  await expect.poll(() => cell(page)).toBeCloseTo(whole, 3);
});

test("the grid is fine, coarse or coarser (key c), and the map draws on each", async ({ page }) => {
  await atlas(page);
  const grain = () => page.evaluate(() => localStorage.getItem("isorite.atlas.grain"));
  for (const next of ["coarse", "coarser", "fine"]) {
    await page.locator(".atlas").focus();
    await page.keyboard.press("c");
    await expect.poll(grain).toBe(next);
    await expect(note(page, "coding/huffman-codes")).toBeVisible();
    await expect(page.locator(".routes path.base").first()).toBeAttached();
  }
});

test("a terminal agent's look-ups are drawn as Iso's are: what it searched, what it reached along a link, what it reads; its turn ends idle", async ({ page, request, baseURL }) => {
  await atlas(page);
  // As isorite term's plugin asks: from the server's origin, with the token it hands out.
  const { token } = await (await request.get("api/session")).json() as { token: string };
  const headers = { Origin: new URL(baseURL!).origin, "x-isorite-token": token };
  const session = `ses-${test.info().project.name}`;
  const status = (busy: boolean) => request.post("api/agent/status", { headers, data: { agent: "opencode", session, busy } });
  const lookup = (tool: string, args: object) => request.post("api/agent/look", { headers, data: { agent: "opencode", session, tool, args } });

  expect((await status(true)).ok()).toBe(true);
  expect((await lookup("search_notes", { query: "kraft" })).ok()).toBe(true);
  await lookup("read_note", { id: "coding/kraft-inequality" });
  await lookup("read_note", { id: "/coding/source-coding.md" }); // the note it rests on, along its link
  await expect(page.getByText("OpenCode is reading Source coding in the terminal")).toBeAttached();
  await expect(note(page, "coding/source-coding")).toHaveClass(/\bp-used\b/);
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bp-key\b/);
  await expect(page.locator(".routes path.iso")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "[ stop ]" })).toHaveCount(0); // the browser cannot stop the terminal's agent
  await look(page, "atlas-agent");

  await status(false);
  await expect(page.getByText(/OpenCode's turn is done/)).toBeAttached();
  await expect(note(page, "coding/source-coding")).toHaveClass(/\bp-link\b/);
  const box = (await page.locator(".atlas").boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(note(page, "coding/source-coding")).not.toHaveClass(/\bp-/);
});

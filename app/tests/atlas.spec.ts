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
  // On a phone the Atlas's pane slides into view (M10): wait until it has.
  if ((page.viewportSize()?.width ?? 1280) <= 760) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
}

/** The Atlas's lens (M10). */
const lens = (page: Page, l: "normal" | "iso" | "understand") => page.locator(`[data-pane="atlas"] .lens[data-lens="${l}"]`).click();

/** Iso's pane in its Context view: what you gave Iso, listed. On a phone, back to where you were after. */
async function showContext(page: Page, back?: "Note" | "Atlas") {
  const phone = (page.viewportSize()?.width ?? 1280) <= 760, nav = page.getByRole("navigation", { name: "Panes" });
  if (phone) await nav.getByRole("button", { name: /^Iso/ }).click();
  const ctx = page.locator('[data-pane="iso"]').getByRole("button", { name: "Context", exact: true });
  if ((await ctx.getAttribute("aria-pressed")) !== "true") await ctx.click();
  if (phone && back) {
    await nav.getByRole("button", { name: new RegExp(`^${back}`) }).click();
    // The row has scrolled back to the pane before anything is pressed in it.
    await expect.poll(async () => (await page.locator(`[data-pane="${back.toLowerCase()}"]`).boundingBox())?.x).toBe(0);
  }
  return page.getByRole("list", { name: "What you gave Iso" });
}

test("the map draws the base; its Understand lens draws where you stand, and the study folders and their items", async ({ page }) => {
  await atlas(page);
  await expect(folder(page, "basics")).toBeVisible();
  await expect(folder(page, "coding")).toBeVisible();
  await expect(note(page, "basics/surprise")).not.toHaveClass(/\bs[023]\b/);
  await expect(folder(page, "@study/coding")).toHaveCount(0);
  await lens(page, "understand");
  await expect(note(page, "basics/surprise")).toHaveClass(/\bs0\b/);
  await expect(note(page, "coding/source-coding")).toHaveClass(/\bs2\b/); // three right answers: worked through
  await expect(folder(page, "@study/coding")).toContainText("study · coding");
  await expect(page.getByRole("link", { name: "written: Build a prefix code" })).toBeVisible();
  await expect.poll(() => page.locator(".routes path.base, .routes path.study").count()).toBeGreaterThan(2);
  await look(page, "atlas");
  await lens(page, "normal");
});

test("choosing a note outlines what it requires, all the way back, and what builds on it; again opens it", async ({ page }) => {
  await atlas(page);
  await note(page, "coding/kraft-inequality").click();
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bat\b/);
  await expect(note(page, "coding/source-coding")).toHaveClass(/\breq\b/);
  await expect(note(page, "basics/surprise")).toHaveClass(/\breq\b/);
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\bbld\b/);
  await expect(note(page, "basics/bit")).toHaveClass(/\bdim\b/);
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
  await lens(page, "understand");
  await note(page, "@study/coding/a-prefix-code").click();
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\breq\b/);
  await expect(note(page, "basics/surprise")).toHaveClass(/\breq\b/);
  await lens(page, "normal");
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

  // A drag from open ground moves the map and chooses nothing. (One from a note picks the note up: V8, below.)
  const before = (await note(page, "basics/bit").boundingBox())!;
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + 25, { steps: 4 });
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

/** Press and keep still until the hold is taken, then let go: a name is asked for there. */
async function hold(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(page.locator(".atlas .grasp")).toBeVisible();
  await page.waitForTimeout(800);
  await page.mouse.up();
}
const asked = (page: Page, what: "note" | "folder") => page.getByLabel(what === "note" ? "the new note's title" : "the new folder's name");
const session = async (page: Page) => ({ "x-isorite-token": ((await (await page.request.get("api/session")).json()) as { token: string }).token, origin: new URL(page.url()).origin });

test("holding makes an untitled note in the folder held in, its title chosen to type over; holding, then dragging, an untitled folder with its first note; a press that moves is a drag", async ({ page }) => {
  await atlas(page);
  const name = test.info().project.name, box = (await page.locator(".atlas").boundingBox())!;
  const title = page.getByLabel("Title");
  const made: string[] = [];

  // A press that moves is a drag, however long it lasts.
  const before = page.url();
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 20, { steps: 3 });
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.locator(".atlas .grasp")).toHaveCount(0);
  expect(page.url()).toBe(before);

  // Held still inside basics: an untitled note there, opened with its title chosen; typing names it.
  const basics = (await folder(page, "basics").boundingBox())!;
  await hold(page, basics.x + 8, basics.y + basics.height - 8);
  await expect(page).toHaveURL(/#\/n\/basics\/untitled-note(-\d+)?$/);
  made.push(decodeURIComponent(page.url().split("#/n/")[1]!));
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(/^Untitled note( \d+)?$/);
  await page.keyboard.type(`Held ${name}`);
  await expect(title).toHaveValue(`Held ${name}`);
  await look(page, "atlas-hold-note");

  // Held, then dragged on open ground: an untitled folder, made with its first note, which opens.
  await atlas(page);
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.move(box.x + 90, box.y + 70, { steps: 6 });
  await expect(page.locator(".atlas .grasp.folder")).toBeVisible();
  await look(page, "atlas-hold-folder");
  await page.mouse.up();
  await expect(page).toHaveURL(/#\/n\/untitled-folder(-\d+)?\/untitled-note$/);
  made.push(decodeURIComponent(page.url().split("#/n/")[1]!));
  await expect(title).toHaveValue("Untitled note");

  // Gone again, so the rest of the tests find the base as they expect.
  const headers = await session(page);
  for (const id of made) {
    await expect.poll(async () => (await page.request.get(`api/note?id=${id}`)).ok()).toBe(true);
    const { version } = (await (await page.request.get(`api/note?id=${id}`)).json()) as { version: string };
    expect((await page.request.post(`api/note/delete?id=${id}`, { headers, data: { base: version } })).ok()).toBe(true);
  }
});

test("a new layout comes in three beats: the lines retract, the notes move with no line drawn, then the lines draw out", async ({ page }) => {
  await atlas(page);
  await expect(page.locator(".routes path.base").first()).toBeAttached();
  // Into the Understand lens the study folders join the map, so it is laid out again.
  const seen: string[] = [];
  await page.exposeFunction("beatSeen", (b: string) => { if (seen.at(-1) !== b) seen.push(b); });
  await page.evaluate(() => {
    const look = () => {
      const r = document.querySelector(".routes");
      const b = r?.querySelector("path.retract") ? "retract" : r?.querySelector("path.draw") ? "draw" : r?.querySelector("path") ? "rest" : "none";
      (window as unknown as { beatSeen: (b: string) => void }).beatSeen(b);
      requestAnimationFrame(look);
    };
    look();
  });
  await lens(page, "understand");
  await expect.poll(() => seen.join(" ")).toContain("retract none draw rest");
  await lens(page, "normal");
});

test("held with a finger, a note offers to go to Iso or to open (Q16)", async ({ page }) => {
  await atlas(page);
  const huffman = (await note(page, "coding/huffman-codes").boundingBox())!;
  const at = { pointerId: 9, pointerType: "touch", isPrimary: true, button: 0, clientX: huffman.x + 10, clientY: huffman.y + 6 };
  await note(page, "coding/huffman-codes").dispatchEvent("pointerdown", at);
  await page.waitForTimeout(800);
  await page.locator(".atlas").dispatchEvent("pointerup", at);
  const offer = page.getByRole("menu", { name: "Huffman codes" });
  await expect(offer.getByRole("menuitem")).toHaveText(["◆Give to Iso", "▣Open"]);
  await look(page, "atlas-offer");
  await offer.getByRole("menuitem", { name: "Give to Iso" }).click();
  await expect(offer).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Huffman codes is in Iso's context" })).toBeVisible();
});

test("a drag from a note never moves the map; a drag from open ground does", async ({ page }) => {
  await atlas(page);
  const world = page.locator(".atlas-world");
  const at = async () => (await world.getAttribute("style"))?.match(/translate\(([^)]*)\)/)?.[1];
  const still = await at();
  const huffman = (await note(page, "coding/huffman-codes").boundingBox())!;
  await page.mouse.move(huffman.x + 10, huffman.y + 6);
  await page.mouse.down();
  await page.mouse.move(huffman.x + 80, huffman.y + 60, { steps: 6 });
  await expect(page.locator(".carried")).toHaveText("▣ Huffman codes");
  await page.mouse.up();
  await expect(page.locator(".carried")).toHaveCount(0);
  expect(await at()).toBe(still);
  // Open ground pans.
  const box = (await page.locator(".atlas").boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height - 40, { steps: 4 });
  await page.mouse.up();
  expect(await at()).not.toBe(still);
});

test("a note held on the Atlas, or dragged out of it onto Iso's pane, is given to Iso; a drag inside moves the map", async ({ page }) => {
  await atlas(page);
  const tray = await showContext(page, "Atlas");
  // Held still on a note: it goes into Iso's context, listed in Iso's Context view, and the map says so.
  const huffman = (await note(page, "coding/huffman-codes").boundingBox())!;
  await page.mouse.move(huffman.x + 10, huffman.y + 6);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(page.getByRole("status").filter({ hasText: "Huffman codes is in Iso's context" })).toBeVisible();
  await expect(tray.getByRole("listitem")).toHaveText([/^▣ Huffman codes \d+/]);
  await page.mouse.move(huffman.x - 60, huffman.y + 120); // off it, so it is not lit by pointing
  await expect(note(page, "coding/huffman-codes")).not.toHaveClass(/\bat\b/); // held, not chosen
  if ((page.viewportSize()?.width ?? 1280) <= 760) return; // carrying is a mouse's: a phone holds
  // Dragged out of the Atlas and let go over Iso's pane.
  const surprise = (await note(page, "basics/surprise").boundingBox())!, iso = (await page.locator('[data-pane="iso"]').boundingBox())!;
  await page.mouse.move(surprise.x + 10, surprise.y + 6);
  await page.mouse.down();
  await page.mouse.move(surprise.x + 40, surprise.y + 20, { steps: 4 });
  await page.mouse.move(iso.x + 80, iso.y + 200, { steps: 8 });
  await expect(page.locator(".carried")).toHaveText("▣ Surprise");
  await page.mouse.up();
  await expect(tray.getByRole("listitem")).toHaveText([/^▣ Huffman codes \d+/, /^▣ Surprise \d+/]);
  // Taken out again.
  await tray.getByRole("button", { name: "Take Huffman codes out of Iso's context" }).click();
  await expect(tray.getByRole("listitem")).toHaveText([/^▣ Surprise \d+/]);
});

test("notes are picked on the map for a request: numbered in order, sized in the dock, and taken away again", async ({ page }) => {
  // Only an exercise is asked for this way now (no note for Iso is started from the app): one made by the Api.
  await atlas(page);
  const made = (await (await page.request.post("api/drafts", { headers: await session(page), data: {} })).json()) as { id: string };
  await page.goto(`#/draft/${made.id.slice("@draft/".length)}`);
  await page.getByLabel("Title").fill("Codes, in my words");
  await page.locator(".cm-content").click();
  await page.keyboard.type("A code is short where the source is likely.");
  await page.getByRole("button", { name: "[ + pick on the atlas ]" }).click();
  await expect(page).toHaveURL(/\?pick=/);

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
  await expect(page).toHaveURL(/\?pick=/);
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
  await expect(page.locator('[data-pane="atlas"] .where')).toHaveText("coding");
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

import { expect, test, type Page } from "@playwright/test";
import { setSwitch } from "./switches.ts";

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


/** the Agent pane in its Context view: what you gave the agent, listed. On a phone, back to where you were after. */
async function showContext(page: Page, back?: "Note" | "Atlas") {
  const phone = (page.viewportSize()?.width ?? 1280) <= 760, nav = page.getByRole("navigation", { name: "Panes" });
  if (phone) await nav.getByRole("button", { name: /^Agent/ }).click();
  const ctx = page.locator('[data-pane="agent"]').getByRole("button", { name: "Context", exact: true });
  if ((await ctx.getAttribute("aria-pressed")) !== "true") await ctx.click();
  if (phone && back) {
    await nav.getByRole("button", { name: new RegExp(`^${back}`) }).click();
    // The row has scrolled back to the pane before anything is pressed in it.
    await expect.poll(async () => (await page.locator(`[data-pane="${back.toLowerCase()}"]`).boundingBox())?.x).toBe(0);
  }
  return page.getByRole("list", { name: "What you gave the agent" });
}

test("the map draws the base: its folders, its notes, and the routes between them", async ({ page }) => {
  await atlas(page);
  await expect(folder(page, "basics")).toBeVisible();
  await expect(folder(page, "coding")).toBeVisible();
  await expect(note(page, "basics/surprise")).toBeVisible();
  await expect.poll(() => page.locator(".routes path.base").count()).toBeGreaterThan(2);
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
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Kraft inequality");
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
  await expect(page.getByTitle("2 steps back")).toHaveText("−2");
  await look(page, "atlas-walked");

  // A note already walked is returned to.
  await note(page, "coding/kraft-inequality").click();
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bat\b/);
  await expect(page.getByTitle("1 step back")).toHaveText("−1");
  await expect(lines).toHaveAttribute("data-requires", "2");

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
/** Held on open ground until the two tags stand out, then let go on the one named (or on neither). */
async function hold(page: Page, x: number, y: number, which: "note" | "folder" | null = "note") {
  await page.mouse.move(x, y);
  await page.mouse.down();
  const note = page.locator('.atlas [data-spot="note"]'), folderTag = page.locator('.atlas [data-spot="folder"]');
  await expect(note).toBeVisible();
  await expect(folderTag).toBeVisible();
  await page.waitForTimeout(400); // out, and so to be pointed at
  if (which) {
    const b = (await (which === "note" ? note : folderTag).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
    await expect(page.locator(`.atlas [data-spot="${which}"]`)).toHaveClass(/\bon\b/);
  } else await page.mouse.move(x + 3, y + 3);
  await page.mouse.up();
}
const asked = (page: Page, what: "note" | "folder") => page.getByLabel(what === "note" ? "the new note's title" : "the new island's name");
const session = async (page: Page) => ({ "x-isorite-token": ((await (await page.request.get("api/session")).json()) as { token: string }).token, origin: new URL(page.url()).origin });

test("holding on open ground offers a new note or a new folder: let go on one and it is made, its title chosen to type over; let go elsewhere, nothing; a press that moves is a drag", async ({ page }) => {
  await atlas(page);
  const name = test.info().project.name, box = (await page.locator(".atlas").boundingBox())!;
  const title = page.getByLabel("Title", { exact: true });
  const made: string[] = [];

  // A press that moves is a drag, however long it lasts.
  const before = page.url();
  await page.mouse.move(box.x + 6, box.y + 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 20, { steps: 3 });
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page.locator(".atlas [data-spot]")).toHaveCount(0);
  expect(page.url()).toBe(before);

  // Held still inside basics: an untitled note there, opened with its title chosen; typing names it.
  const basics = (await folder(page, "basics").boundingBox())!;
  await hold(page, basics.x + 8, basics.y + basics.height - 8);
  await expect(page).toHaveURL(/#\/n\/basics\/untitled-note(-\d+)?$/);
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(/^Untitled note( \d+)?$/);
  await page.keyboard.type(`Held ${name}`);
  await expect(title).toHaveValue(`Held ${name}`);
  await look(page, "atlas-hold-note");
  // Its first title names its file too.
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`#/n/basics/held-${name}$`));
  made.push(`basics/held-${name}`);

  // Held on open ground and let go on neither tag: nothing is made.
  await atlas(page);
  const here = page.url();
  await hold(page, box.x + 10, box.y + 10, null);
  await expect(page.locator(".atlas [data-spot]")).toHaveCount(0);
  expect(page.url()).toBe(here);

  // Held on open ground and let go on the folder tag: an untitled folder, made with its first note, which opens.
  await atlas(page);
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await expect(page.locator('.atlas [data-spot="folder"]')).toBeVisible();
  await page.waitForTimeout(400);
  await look(page, "atlas-hold-tags");
  // In a corner of the map, as here, the two stand clear of each other and of its edges.
  const [a, b] = [(await page.locator('.atlas [data-spot="note"]').boundingBox())!, (await page.locator('.atlas [data-spot="folder"]').boundingBox())!];
  expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, "the tags do not overlap").toBe(true);
  expect(Math.min(a.x, b.x) >= box.x - 1 && Math.min(a.y, b.y) >= box.y - 1, "inside the map").toBe(true);
  await page.mouse.up();
  await hold(page, box.x + 10, box.y + 10, "folder");
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
  // A note joins the base, linked to another, so the map is laid out again.
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
  const headers = await session(page), id = "coding/three-beats";
  expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text: "---\ntype: Concept\ntitle: Beats\n---\n\nIt rests on [the bit](/basics/bit.md \"requires\").\n" } })).ok()).toBe(true);
  await expect.poll(() => seen.join(" ")).toContain("retract none draw rest");
  // Gone again, so the rest of the tests find the base as they expect.
  const { version } = (await (await page.request.get(`api/note?id=${id}`)).json()) as { version: string };
  expect((await page.request.post(`api/note/delete?id=${id}`, { headers, data: { base: version } })).ok()).toBe(true);
});

test("held with a finger, a note shows the tags; let go on none, it offers to go to the agent or to open (Q16, M33)", async ({ page }) => {
  await atlas(page);
  const huffman = (await note(page, "coding/huffman-codes").boundingBox())!;
  const at = { pointerId: 9, pointerType: "touch", isPrimary: true, button: 0, clientX: huffman.x + 10, clientY: huffman.y + 6 };
  await note(page, "coding/huffman-codes").dispatchEvent("pointerdown", at);
  await expect(page.locator(".petal")).toHaveCount(4);
  await page.locator(".atlas").dispatchEvent("pointerup", at);
  await expect(page.locator(".petal")).toHaveCount(0);
  const offer = page.getByRole("menu", { name: "Huffman codes" });
  await expect(offer.getByRole("menuitem")).toHaveText(["◆Put in the message", "▣Open"]);
  await look(page, "atlas-offer");
  await offer.getByRole("menuitem", { name: "Put in the message" }).click();
  await expect(offer).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Huffman codes is in your message" })).toBeVisible();
});

test("held with a finger and let go on the gold tag, a note goes to the agent (M33)", async ({ page }) => {
  await atlas(page);
  const huffman = (await note(page, "coding/huffman-codes").boundingBox())!;
  const at = { pointerId: 9, pointerType: "touch", isPrimary: true, button: 0, clientX: huffman.x + 10, clientY: huffman.y + 6 };
  await note(page, "coding/huffman-codes").dispatchEvent("pointerdown", at);
  const send = page.locator('.petal[data-tag="send"]');
  await expect(send).toBeVisible();
  await page.waitForTimeout(400); // out, and so to be pointed at
  const b = (await send.boundingBox())!, on = { ...at, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2 };
  await page.locator(".atlas").dispatchEvent("pointermove", on);
  await expect(send).toHaveClass(/\bon\b/);
  await page.locator(".atlas").dispatchEvent("pointerup", on);
  await expect(page.getByRole("status").filter({ hasText: "Huffman codes is in your message" })).toBeVisible();
  await expect(page.getByRole("menu", { name: "Huffman codes" })).toHaveCount(0);
});

test("with the agent's context shown, a click still opens a note; shift+click gives it to the agent and takes it back (M14)", async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1280) <= 760, "a phone has no shift: its hold menu gives and takes back");
  await atlas(page);
  await setSwitch(page, "context", true);
  await note(page, "coding/huffman-codes").click({ modifiers: ["Shift"] });
  await expect(page.getByRole("status").filter({ hasText: "Huffman codes is in your message" })).toBeVisible();
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\bgiven\b/);
  await expect(note(page, "coding/huffman-codes")).toHaveAttribute("title", /shift\+click takes it back/);
  await expect(page.getByText("tap to give or take back")).toHaveCount(0);
  await note(page, "coding/huffman-codes").click({ modifiers: ["Shift"] });
  await expect(page.getByRole("status").filter({ hasText: "Huffman codes is out of your message" })).toBeVisible();
  await expect(note(page, "coding/huffman-codes")).not.toHaveClass(/\bgiven\b/);
  const basics = folder(page, "basics"), closed = (await basics.evaluate((el) => el.tagName)) === "BUTTON";
  await (closed ? basics : basics.locator("button.frame-title")).click({ modifiers: ["Shift"] });
  await expect(page.getByRole("status").filter({ hasText: /basics is in your message/i })).toBeVisible();
  await note(page, "coding/kraft-inequality").click();
  await note(page, "coding/kraft-inequality").click();
  await expect(page).toHaveURL(/#\/n\/coding\/kraft-inequality$/);
});

test("held with a finger, a note already given offers to take it back (M14)", async ({ page }) => {
  await atlas(page);
  const huffman = (await note(page, "coding/huffman-codes").boundingBox())!;
  const at = { pointerId: 9, pointerType: "touch", isPrimary: true, button: 0, clientX: huffman.x + 10, clientY: huffman.y + 6 };
  const hold = async () => {
    await note(page, "coding/huffman-codes").dispatchEvent("pointerdown", at);
    await expect(page.locator(".petal")).toHaveCount(4);
    await page.locator(".atlas").dispatchEvent("pointerup", at);
  };
  await hold();
  await page.getByRole("menu", { name: "Huffman codes" }).getByRole("menuitem", { name: "Put in the message" }).click();
  await hold();
  const offer = page.getByRole("menu", { name: "Huffman codes" });
  await expect(offer.getByRole("menuitem").first()).toHaveText("◇Take out of the message");
  await offer.getByRole("menuitem", { name: "Take out of the message" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Huffman codes is out of your message" })).toBeVisible();
});

test("a drag from a note never moves the map; a drag from open ground does", async ({ page }) => {
  await atlas(page);
  const world = page.locator(".atlas-world");
  const at = async () => (await world.getAttribute("style"))?.match(/translate\(([^)]*)\)/)?.[1];
  // At rest, on whole pixels.
  await expect(world).not.toHaveClass(/\bmoving\b/);
  const still = await at();
  const huffman = (await note(page, "coding/huffman-codes").boundingBox())!;
  await page.mouse.move(huffman.x + 10, huffman.y + 6);
  await page.mouse.down();
  await page.mouse.move(huffman.x + 80, huffman.y + 60, { steps: 6 });
  await expect(page.locator(".carried")).toHaveText("▣ Huffman codes");
  await page.mouse.up();
  await expect(page.locator(".carried")).toHaveCount(0);
  await expect(world).not.toHaveClass(/\bmoving\b/);
  expect(await at()).toBe(still);
  // Open ground pans.
  const box = (await page.locator(".atlas").boundingBox())!;
  await page.mouse.move(box.x + 6, box.y + box.height - 6);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + box.height - 40, { steps: 4 });
  await page.mouse.up();
  expect(await at()).not.toBe(still);
});

test("a note held on the Atlas, or dragged out of it onto the Agent pane, is given to the agent; a drag inside moves the map", async ({ page }) => {
  await atlas(page);
  await showContext(page, "Atlas");
  const tray = page.locator("[data-prompt] .pt");
  // Held still on a note, four tags appear (M33); let go on the gold one and it goes into the agent's context, listed in the agent's
  // Context view, and the map says so.
  const huffman = (await note(page, "coding/huffman-codes").boundingBox())!;
  await page.mouse.move(huffman.x + 10, huffman.y + 6);
  await page.mouse.down();
  const send = page.locator('[data-tag="send"]');
  await expect(send).toBeVisible();
  await page.waitForTimeout(400); // the tags take the pointer once they have grown out
  const tag = (await send.boundingBox())!;
  await page.mouse.move(tag.x + tag.width / 2, tag.y + tag.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole("status").filter({ hasText: "Huffman codes is in your message" })).toBeVisible();
  await expect(tray).toHaveText(["Huffman codes"]);
  await page.mouse.move(huffman.x - 60, huffman.y + 120); // off it, so it is not lit by pointing
  await expect(note(page, "coding/huffman-codes")).not.toHaveClass(/\bat\b/); // held, not chosen
  if ((page.viewportSize()?.width ?? 1280) <= 760) return; // carrying is a mouse's: a phone holds
  // Dragged out of the Atlas and let go over the Agent pane.
  const surprise = (await note(page, "basics/surprise").boundingBox())!, box = (await page.locator('[data-pane="agent"]').boundingBox())!;
  await page.mouse.move(surprise.x + 10, surprise.y + 6);
  await page.mouse.down();
  await page.mouse.move(surprise.x + 40, surprise.y + 20, { steps: 4 });
  await page.mouse.move(box.x + 80, box.y + 200, { steps: 8 });
  await expect(page.locator(".carried")).toHaveText("▣ Surprise");
  await page.mouse.up();
  await expect(tray).toHaveText(["Huffman codes", "Surprise"]);
  // Taken out again: shift+click on it in the Atlas.
  await note(page, "coding/huffman-codes").click({ modifiers: ["Shift"] });
  await expect(tray).toHaveText(["Surprise"]);
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

test("an agent's look-ups through isorite's MCP are drawn on the Atlas: what it searched, what it reached along a link, what it reads; its turn ends idle", async ({ page, request, baseURL }) => {
  await atlas(page);
  // Drawn with the agent's context on, the diamond in the Atlas's header (M12).
  await setSwitch(page, "context", true);
  // As a harness's plugin asks: from the server's origin, with the token it hands out.
  const { token } = await (await request.get("api/session")).json() as { token: string };
  const headers = { Origin: new URL(baseURL!).origin, "x-isorite-token": token };
  const session = `ses-${test.info().project.name}`;
  const status = (busy: boolean) => request.post("api/agent/status", { headers, data: { agent: "opencode", session, busy } });
  const lookup = (tool: string, args: object) => request.post("api/agent/look", { headers, data: { agent: "opencode", session, tool, args } });

  expect((await status(true)).ok()).toBe(true);
  expect((await lookup("search_notes", { query: "kraft" })).ok()).toBe(true);
  await lookup("read_note", { id: "coding/kraft-inequality" });
  await lookup("read_note", { id: "/coding/source-coding.md" }); // the note it rests on, along its link
  await expect(page.getByTitle("OpenCode, in its own terminal")).toHaveText(/Source coding/);
  await expect(note(page, "coding/source-coding")).toHaveClass(/\bp-used\b/);
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bp-key\b/);
  await expect(page.locator(".routes path.agent")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "[ stop ]" })).toHaveCount(0); // the browser cannot stop the terminal's agent
  await look(page, "atlas-agent");

  await status(false);
  await expect(page.getByTitle("OpenCode, in its own terminal")).toHaveText("done");
  await expect(note(page, "coding/source-coding")).toHaveClass(/\bp-link\b/);
  const box = (await page.locator(".atlas").boundingBox())!;
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(note(page, "coding/source-coding")).not.toHaveClass(/\bp-/);
});

test("the kinds by their switches (M12): links out of the base beside their note, a broken code link marked; questions off the map and back", async ({ page }) => {
  const name = `${test.info().project.name}-${Date.now().toString(36)}`, q = `coding/why-${name}`;
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  const headers = { "x-isorite-token": token, Origin: new URL(test.info().project.use.baseURL!).origin };
  await page.request.post(`api/note?id=${q}`, { data: { text: `---\ntype: Question\ntitle: Why ${name}?\nabout: [coding/source-coding]\n---\n` }, headers });
  try {
    await atlas(page);
    await expect(note(page, q)).toBeVisible();
    await expect(note(page, q).locator(".notch")).toBeVisible();
    await expect(note(page, q)).toHaveAttribute("aria-label", `Question: Why ${name}?`);
    // Links out of the base, beside their note: code, one of them not in the repository; then the web.
    await setSwitch(page, "code", true);
    await expect(page.locator(".sat.code")).toHaveCount(2);
    await expect(page.locator(".sat.code.broken")).toHaveAttribute("aria-label", "decode, not in the repository");
    await setSwitch(page, "web", true);
    await expect(page.locator(".sat.web")).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Huffman_coding");
    await look(page, "atlas-kinds");
    await setSwitch(page, "web", false);
    await setSwitch(page, "code", false);
    // Links to the global base and pictures are drawn whatever these switches say, and other specs seed them.
    await expect(page.locator(".sat.web, .sat.code")).toHaveCount(0);
    // Questions switched off leave the map, and come back.
    await setSwitch(page, "questions", false);
    await expect(note(page, q)).toHaveCount(0);
    await expect(note(page, "coding/source-coding")).toBeVisible();
    await setSwitch(page, "questions", true);
    await expect(note(page, q)).toBeVisible();
  } finally {
    // Whatever happens above, the question is taken away: it would grow every folder for the specs after.
    const got = await page.request.get(`api/note?id=${q}`);
    if (got.ok()) {
      const { version } = (await got.json()) as { version: string };
      await page.request.post(`api/note/delete?id=${q}`, { data: { base: version }, headers });
    }
  }
});

test("the wheel zooms smoothly: the map goes to the zoom the wheel asks for over several frames, about the pointer", async ({ page }) => {
  test.skip(test.info().project.name.startsWith("phone"), "a wheel is a desktop's");
  await atlas(page);
  const before = await cell(page), box = (await page.locator(".atlas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  // Part of the way first, then all of it: e^(400 × 0.0015) ≈ 1.82 times.
  const soon = await cell(page);
  expect(soon).toBeLessThan(before * 1.8);
  await expect.poll(() => cell(page)).toBeCloseTo(before * Math.exp(0.6), 1);
  // The title is drawn at the screen's own pixels (M24), at one of its sizes on screen, larger zoomed in.
  const px = () => note(page, "coding/huffman-codes").locator(".t").evaluate((el) => Math.round(parseFloat(getComputedStyle(el).fontSize) * el.getBoundingClientRect().height / (el as HTMLElement).offsetHeight * 10) / 10);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => cell(page)).toBeCloseTo(before * Math.exp(1.2), 1);
  const near = await px();
  expect([10, 11, 13, 15, 18, 22]).toContain(near);
  await page.mouse.wheel(0, 300);
  await expect.poll(() => cell(page)).toBeCloseTo(before * Math.exp(0.75), 1);
  const far = await px();
  expect([10, 11, 13, 15, 18, 22]).toContain(far);
  expect(far).toBeLessThanOrEqual(near);
});

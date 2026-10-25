import { expect, test, type Page } from "@playwright/test";
import { setSwitch } from "./switches.ts";

// The tutorial on the built site, with the engine in the page and no server: each of its parts walked from the list
// of parts to its end, by doing what each step asks, at a desktop's width and a phone's.

const phone = () => test.info().project.name.includes("phone");
// Served by isorite --tutorial (playwright.local.config.ts), beside the terminal's tour, not as the tutorial's site.
const local = () => test.info().project.name.startsWith("local");
const card = (page: Page) => page.getByRole("dialog", { name: "The tutorial" });
const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const visible = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
async function at(page: Page, title: string) {
  await expect(card(page).locator("h2")).toHaveText(title, { timeout: 15_000 });
}
/** On a phone, the card folded to its title, out of the way of what is under it (it opens again at the next step). */
async function fold(page: Page) {
  const f = card(page).locator("h2 .fold");
  if (phone() && (await f.getAttribute("aria-expanded")) === "true") await f.click();
}
async function next(page: Page) {
  const f = card(page).locator("h2 .fold");
  if (phone() && (await f.getAttribute("aria-expanded")) === "false") await f.click();
  await card(page).getByRole("button", { name: /^next/ }).click();
}
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png` });
}
/** Select the whole of the editor's line that begins with `start`. */
async function line(page: Page, start: string | RegExp) {
  await page.locator(".cm-line").filter({ hasText: start }).last().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
}
/** From the list of sections, the one named. */
async function section(page: Page, key: string) {
  await page.goto("./");
  await card(page).getByRole("button", { name: new RegExp(`^${key}:`) }).click({ timeout: 20_000 });
}
/** The last step's "done": back to the list, every objective of the section met when `all` says how many. */
async function finish(page: Page, key: string, all?: number) {
  // A last step whose objective is met goes on to the list by itself; "done" is pressed only if it is still there.
  // Exactly: the section's own button in the list ends "… done" too, and pressing it would begin the section again.
  const done = card(page).getByRole("button", { name: "done", exact: true });
  const listed = card(page).getByRole("button", { name: new RegExp(`^${key}: .*${all ? `, ${all} of ${all} done` : ""}`) });
  await expect(done.or(listed)).toBeVisible();
  if (await done.isVisible()) await done.click({ timeout: 2000 }).catch(() => undefined);
  await expect(listed).toBeVisible({ timeout: 15_000 });
}

let failures: string[] = [];
test.beforeEach(({ page }) => { failures = []; page.on("pageerror", (e) => failures.push(String(e))); });
test.afterEach(() => { expect(failures).toEqual([]); });

test("L1: the three panes and a layout tried, the Atlas and its folders, a note opened in the Note pane, Markdown, a link and its kind seen on the Atlas, the timeline, the notes, details, and a note made by holding, named, moved and deleted", async ({ page }) => {
  test.setTimeout(180_000);
  const LEAP = '[data-note="integrators/leapfrog"]';
  await section(page, "L1");
  await at(page, "Three panes");
  await look(page, "L1-01-panes");
  if (phone()) await tab(page, "Atlas");
  else {
    await page.getByRole("button", { name: "Note settings" }).click();
    const set = page.getByRole("dialog", { name: "Note settings" });
    await set.getByRole("button", { name: "The note beside the Atlas over Iso" }).click();
    await set.getByRole("button", { name: "Three columns" }).click();
    await page.keyboard.press("Escape");
  }
  await at(page, "This is the Atlas");
  // Into the integrators bubble (open ground inside it), and back out.
  const folder = page.locator('[data-folder="integrators"]').first(), box = (await folder.boundingBox())!;
  await folder.click({ position: { x: 6, y: box.height - 6 } });
  await page.waitForTimeout(900);
  await look(page, "L1-02-inside");
  if (phone()) await page.getByRole("button", { name: "↑ out" }).click();
  else { const a = (await page.locator(".atlas").boundingBox())!; await page.mouse.click(a.x + 8, a.y + a.height - 8); }
  await at(page, "What a note rests on");
  // A wrong move first: another note chosen is named, and the step waits.
  await page.locator('[data-note="physics/units"]').click();
  await expect(card(page).locator(".mistake")).toContainText("Choose Leapfrog");
  await look(page, "L1-03-wrong");
  await page.locator(LEAP).click();
  await at(page, "Open it");
  await page.locator(LEAP).click();
  await at(page, "A note is Markdown");
  await look(page, "L1-05-note");
  await page.locator(".cm-line").filter({ hasText: "It is second order" }).click();
  await page.keyboard.press("Home");
  if (phone()) { await page.keyboard.type("**"); await page.keyboard.press("Control+ArrowRight"); await page.keyboard.type("**"); }
  else { await page.keyboard.press("Shift+Control+ArrowRight"); await page.keyboard.press("Control+b"); }
  await at(page, "Link a note");
  await page.locator(".cm-line").filter({ hasText: "because it is" }).last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" See [[ener");
  await page.getByRole("option", { name: /Energy and its conservation/ }).click();
  await at(page, "The link, on the Atlas");
  if (!phone()) { await expect(page.locator("path.grown")).toHaveCount(1, { timeout: 5_000 }); await page.waitForTimeout(600); }
  await look(page, "L1-07-link");
  await next(page);
  await at(page, "Its kind");
  await page.locator(".cm-line").filter({ hasText: "See Energy" }).getByText("Energy and its conservation").click();
  if (phone()) {
    await page.getByRole("button", { name: /^This link: .*Change it/ }).click();
    await page.getByRole("menuitemradio", { name: /^Requires/ }).click();
  } else await page.keyboard.press("Alt+1");
  await at(page, "The kind, on the Atlas");
  // Alt+1 was the link's, not the panes': the layout is as it was.
  if (!phone()) await expect(page.locator(".panes")).toHaveAttribute("data-layout", "cols");
  await page.waitForTimeout(800);
  await look(page, "L1-09-kind");
  await next(page);
  await at(page, "Every change is kept");
  await setSwitch(page, "timeline", true);
  await page.locator(".timeline .moment").first().click();
  await expect(page.locator(".atbar")).toBeVisible();
  await page.waitForTimeout(600); // the step looks four times a second: long enough to have seen the note as it was
  await look(page, "L1-10-timeline");
  await page.getByRole("button", { name: "back to now" }).click();
  await at(page, "Follow the link");
  if (phone()) { await page.locator('[data-note="physics/energy-conservation"]').click(); await page.locator('[data-note="physics/energy-conservation"]').click(); }
  else await editor(page).getByText("Energy and its conservation").first().click({ modifiers: ["ControlOrMeta"] });
  await at(page, "All the notes");
  await page.locator('[data-pane="note"]').getByRole("button", { name: "All notes" }).click();
  await page.getByRole("searchbox", { name: "Find a note" }).fill("soft");
  await look(page, "L1-12-notes");
  await page.locator('[data-pane="note"]').getByRole("link", { name: "Softening" }).click();
  await at(page, "Its details");
  if (await page.locator(".details").count() === 0) await visible(page, "details").click();
  await page.getByLabel("tags").fill("numerics");
  await page.getByLabel("tags").press("Enter");
  await at(page, "A new note, where you hold");
  // On a phone the card is folded to its title, out of the Atlas's way.
  if (phone()) { await expect.poll(async () => Math.round((await page.locator('[data-pane="atlas"]').boundingBox())?.x ?? -1)).toBe(0); await fold(page); }
  const empty = await emptyIn(page, "physics");
  await holdAt(page, empty.x, empty.y);
  await expect(page.getByLabel("Title")).toBeFocused();
  await look(page, "L1-14-untitled");
  await page.keyboard.type("Plummer sphere");
  await page.keyboard.press("Enter");
  await at(page, "Move it");
  await expect(page).toHaveURL(/#\/n\/physics\/plummer-sphere/);
  if (await page.locator(".details").count() === 0) await visible(page, "details").click();
  await page.getByLabel("folder: change it to move the note").fill("galaxies");
  await page.getByRole("option", { name: /galaxies.*new folder/ }).click();
  await at(page, "Delete it");
  await expect(page).toHaveURL(/#\/n\/galaxies\/plummer-sphere/);
  await page.locator(".details").getByRole("button", { name: "delete", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "delete this note" })).toContainText("No note links to it.");
  await page.getByRole("alertdialog").getByRole("button", { name: "delete", exact: true }).click();
  await at(page, "That is the base");
  await finish(page, "L1", 17);
});

/** A place inside a folder on the Atlas with no note on it, at least 12px from any, scanned from the bottom left. */
async function emptyIn(page: Page, folder: string): Promise<{ x: number; y: number }> {
  const at = await page.locator(`[data-folder="${folder}"]`).first().evaluate((el) => {
    const r = el.getBoundingClientRect(), free = (x: number, y: number) => [[0, 0], [12, 0], [-12, 0], [0, 12], [0, -12]]
      .every(([dx, dy]) => { const hit = document.elementFromPoint(x + dx!, y + dy!); return hit && el.contains(hit) && !hit.closest("[data-note]"); });
    for (let y = r.bottom - 10; y > r.top + 20; y -= 4) for (let x = r.left + 10; x < r.right - 10; x += 4) if (free(x, y)) return { x, y };
    return null;
  });
  expect(at, `an empty place in ${folder}`).not.toBeNull();
  return at!;
}
/** Hold still on the map until a new note is marked, and let go: an untitled note is made there, and opens. */
async function holdAt(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await expect(page).toHaveURL(/untitled-note/);
}
const iso = (page: Page) => page.locator('[data-pane="iso"]');
const box = (page: Page) => page.getByRole("textbox", { name: "Message Iso" });
/** On a phone, the pane's tab at the foot, and the row of panes settled on it. */
async function tab(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect.poll(async () => Math.round((await page.locator(`[data-pane="${name.toLowerCase()}"]`).boundingBox())?.x ?? -1)).toBe(0);
}
/** Send what is in Iso's box: Enter, or on a phone the arrow in its corner. */
async function send(page: Page) {
  if (phone()) await iso(page).getByRole("button", { name: "Send" }).click();
  else await box(page).press("Enter");
}
const log = (page: Page) => page.getByRole("log", { name: "The conversation with Iso" });

test("L2: asked with the notes switch off and watched on the Atlas, a note and a passage given, what is sent chosen, written with it on, marked, undone and written again", async ({ page }) => {
  test.setTimeout(150_000);
  await section(page, "L2");
  await at(page, "Ask Iso");
  if (phone()) await tab(page, "Iso");
  await expect(box(page)).toHaveValue("how is a body inserted, and what does each node keep?");
  await send(page);
  await at(page, "Give Iso a note, and a passage");
  await expect(log(page).locator(".turn").last().locator(".said")).toContainText("An empty leaf");
  await look(page, "L2-02-answer");
  // A note held on the Atlas: a mouse gives it.
  if (phone()) await tab(page, "Atlas");
  await fold(page);
  const bh = (await page.locator('[data-note="algorithms/barnes-hut"]').boundingBox())!;
  await page.mouse.move(bh.x + 10, bh.y + 6);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  if (phone()) await tab(page, "Note");
  await line(page, /^How is a body inserted/);
  await page.getByRole("button", { name: "send to Iso" }).click();
  await at(page, "What Iso is sent");
  if (phone()) await tab(page, "Iso");
  await iso(page).getByRole("button", { name: "Context", exact: true }).click();
  const given = page.getByRole("list", { name: "What you gave Iso" });
  await expect(given.getByRole("listitem")).toHaveCount(2);
  await page.waitForTimeout(400);
  await look(page, "L2-04-context");
  await iso(page).getByRole("switch", { name: /^Send: how is a body inserted/ }).click();
  await given.getByRole("button", { name: /^Take “.*” from The quadtree/ }).click();
  await at(page, "Let it write");
  await iso(page).getByRole("button", { name: "Context", exact: true }).click();
  await setSwitch(page, "notes", true);
  await expect(box(page)).toHaveValue("answer my TODO");
  await send(page);
  await at(page, "Its words, marked");
  await expect(log(page).locator(".turn").last().locator(".change")).toContainText("Barnes–Hut");
  await fold(page);
  if (phone()) await tab(page, "Note");
  await setSwitch(page, "provenance", true);
  await expect(page.locator(".cm-iso-by-iso").first()).toBeVisible();
  await look(page, "L2-06-marked");
  await next(page);
  await at(page, "Undo, and again");
  if (phone()) await tab(page, "Iso");
  await fold(page);
  await log(page).locator(".turn").last().getByRole("button", { name: "Undo this turn's changes" }).click();
  await expect(log(page).locator(".turn").last().locator(".undone")).toContainText("put back");
  await box(page).fill("answer my TODO");
  await send(page);
  await at(page, "Iso, in short");
  await setSwitch(page, "notes", false);
  await finish(page, "L2", 8);
});

test("E1 (earlier): from the goal back along the chain, a question asked, an octree written by Iso with the notes switch on, opened and linked in", async ({ page }) => {
  test.setTimeout(150_000);
  await section(page, "E1");
  await at(page, "The goal");
  await next(page);
  await at(page, "What it rests on");
  await page.locator('[data-note="simulation/two-galaxies-colliding"]').click();
  await at(page, "How much faster?");
  if (phone()) await tab(page, "Iso");
  await expect(box(page)).toHaveValue("how much faster is Barnes–Hut at N = 5000?");
  await send(page);
  await at(page, "Checked against your notes");
  await expect(log(page).locator(".turn").last().locator(".said")).toContainText("About ten times fewer interactions");
  await next(page);
  await at(page, "Plan the octree");
  await setSwitch(page, "notes", true);
  await expect(box(page)).toHaveValue(/^write a note in algorithms on the octree/);
  await send(page);
  await at(page, "Its note");
  await fold(page);
  await log(page).locator(".turn").last().locator(".change").getByRole("button", { name: /octree/i }).click();
  await at(page, "Link it in");
  if (phone()) await tab(page, "Note");
  await page.locator(".cm-line").filter({ hasText: /^Rests on/ }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Next, the [[oct");
  await page.getByRole("option", { name: /The octree/ }).click();
  await setSwitch(page, "notes", false);
  await finish(page, "E1");
});

test("L3: whose words and every change seen, a question opened from its note and found on the Atlas, links out switched on, Iso given a note and asking back, your answers put together and inserted, Iso's reading opened, the question resolved", async ({ page }) => {
  test.skip(local(), "the geometry notes are the tutorial site's; the server beside the terminal serves the N-body base");
  test.setTimeout(240_000);
  await section(page, "L3");
  await at(page, "Whose words");
  if (phone()) await tab(page, "Note");
  await setSwitch(page, "provenance", true);
  await at(page, "Every change is kept");
  await expect(page.locator(".cm-iso-by-iso").first()).toBeVisible();
  await look(page, "L3-01-provenance");
  await setSwitch(page, "timeline", true);
  await at(page, "A question in a note");
  // The editor draws what is in view: on a phone the embed is scrolled to.
  await expect.poll(async () => {
    if (await page.locator(".cm-lp-embed").count()) return true;
    await page.locator('[data-pane="note"] .pbody').first().evaluate((e) => { e.scrollTop += 300; });
    return false;
  }).toBe(true);
  await page.locator(".cm-lp-embed").click();
  await at(page, "Questions on the Atlas");
  if (phone()) await tab(page, "Atlas");
  await fold(page);
  await expect(page.locator('[data-note="global/where-is-compactness-used"] .notch')).toBeVisible();
  await page.locator('[data-note="global/where-is-compactness-used"]').click();
  await at(page, "Links out of the base");
  await setSwitch(page, "web", true);
  await setSwitch(page, "code", true);
  await expect(page.locator(".sat.code.broken")).toHaveAttribute("aria-label", "geodesics.jl, not in the repository");
  await expect(page.locator(".sat.code:not(.broken)")).toHaveCount(1);
  await look(page, "L3-05-links-out");
  await at(page, "Give Iso the note");
  const gb = (await page.locator('[data-note="global/gauss-bonnet"]').boundingBox())!;
  await page.mouse.move(gb.x + 10, gb.y + 6);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await at(page, "Iso asks you back");
  if (phone()) await tab(page, "Iso");
  await expect(box(page)).toHaveValue("where is compactness used in the proof?");
  await send(page);
  await at(page, "Your answers, put together");
  await expect(log(page).locator(".turn").last().locator(".said")).toContainText("What does that sum need");
  await expect(log(page).locator(".turn").last().locator("[data-question]")).toBeVisible();
  await look(page, "L3-07-asked-back");
  await expect(box(page)).toHaveValue(/answers on compactness/);
  await send(page);
  await at(page, "Inserted as yours");
  const offer = log(page).locator("[data-offer]");
  await expect(offer).toContainText("Compact:");
  await fold(page);
  await offer.getByRole("button", { name: /^Insert into/ }).click();
  await at(page, "How Iso reads you");
  if (phone()) await tab(page, "Note");
  const sprig = page.locator('[data-pane="note"]').getByRole("button", { name: "Understanding note", exact: true });
  if ((await sprig.getAttribute("aria-pressed")) !== "true") await sprig.click();
  await expect(page.locator('[data-pane="note"] .reading')).toContainText("you solved the torus", { timeout: 15_000 });
  await look(page, "L3-10-reading");
  await at(page, "Resolve it");
  await sprig.click();
  await page.locator('[data-pane="note"]').getByRole("button", { name: "Resolved", exact: true }).click();
  await at(page, "Questions and problems, in short");
  await finish(page, "L3", 12);
});

test("L4 (earlier): the terminal outlined, and the way to its replay", async ({ page }) => {
  test.skip(local(), "beside the terminal, part E is the terminal's");
  await section(page, "L4");
  for (const title of ["isorite in the terminal", "It looks before it codes", "Watched from here", "Its changes to notes wait", "From here to there"]) {
    await at(page, title);
    await next(page);
  }
  await at(page, "Its tour, replayed");
  await expect(card(page).getByRole("link", { name: "isorite in the terminal: its tour, replayed" })).toHaveAttribute("href", "#/terminal");
  await finish(page, "L4");
});

test("L4 (earlier), beside the terminal: the page follows the agent", async ({ page }) => {
  test.skip(!local(), "only beside the terminal");
  await section(page, "L4");
  await at(page, "The terminal beside this page");
  await next(page);
  // Waiting on the agent in the terminal, which is not here.
  await at(page, "Watched from here");
  await card(page).getByRole("button", { name: "skip" }).click();
  await at(page, "Its changes to notes wait here too");
  await next(page);
  await at(page, "On your own notes");
  await finish(page, "L4");
});

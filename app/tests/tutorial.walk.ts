import { expect, test, type Page } from "@playwright/test";

// The tutorial on the built site, with the engine in the page and no server: each of its parts walked from the list
// of parts to its end, by doing what each step asks, at a desktop's width and a phone's.

const phone = () => test.info().project.name.includes("phone");
// Served by isorite --tutorial (playwright.local.config.ts), beside the terminal's tour, not as the tutorial's site.
const local = () => test.info().project.name.startsWith("local");
const card = (page: Page) => page.getByRole("dialog", { name: "The tutorial" });
const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const prompt = (page: Page) => page.getByRole("textbox", { name: "Ask Iso" });
const visible = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
async function at(page: Page, title: string) {
  await expect(card(page).locator("h2")).toHaveText(title, { timeout: 15_000 });
}
const next = (page: Page) => card(page).getByRole("button", { name: /^next/ }).click();
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png` });
}
/** Select the whole of the editor's line that begins with `start`. */
async function line(page: Page, start: string | RegExp) {
  await page.locator(".cm-line").filter({ hasText: start }).last().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
}
/** The cursor at the end of the line that has `text`, then Iso's prompt opened there. */
async function ask(page: Page, text: string) {
  await editor(page).getByText(text).click();
  await page.keyboard.press("End");
  await askHere(page);
}
async function askHere(page: Page) {
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
}
/** Press and keep still, as long as starts a note for Iso. */
async function hold(page: Page, x: number, y: number) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForURL(/#\/draft\//);
  await page.mouse.up();
}
const middle = async (page: Page, selector: string) => { const b = (await page.locator(selector).boundingBox())!; return [b.x + b.width / 2, b.y + b.height / 2] as const; };

/** From the list of sections, the one named. */
async function section(page: Page, key: string) {
  await page.goto("./");
  await card(page).getByRole("button", { name: new RegExp(`^${key}:`) }).click({ timeout: 20_000 });
}
/** The last step's "done": back to the list, every objective of the section met when `all` says how many. */
async function finish(page: Page, key: string, all?: number) {
  await card(page).getByRole("button", { name: "done" }).click();
  await expect(card(page).getByRole("button", { name: new RegExp(`^${key}: .*${all ? `, ${all} of ${all} done` : ""}`) })).toBeVisible();
}

let failures: string[] = [];
test.beforeEach(({ page }) => { failures = []; page.on("pageerror", (e) => failures.push(String(e))); });
test.afterEach(() => { expect(failures).toEqual([]); });

test("L1: the Atlas and its folders, a note opened beside it, Markdown, a link and its kind seen on the Atlas, the timeline, details, and a note made, moved and deleted", async ({ page }) => {
  test.setTimeout(180_000);
  const LEAP = '[data-note="integrators/leapfrog"]';
  await section(page, "L1");
  await at(page, "This is the Atlas");
  await look(page, "L1-01-atlas");
  // Into the integrators bubble (open ground inside it), and back out.
  const folder = page.locator('[data-folder="integrators"]').first(), box = (await folder.boundingBox())!;
  await folder.click({ position: { x: 6, y: box.height - 6 } });
  await page.waitForTimeout(900);
  await look(page, "L1-01-inside");
  if (phone()) await page.getByRole("button", { name: "↑ out" }).click();
  else { const a = (await page.locator(".atlas").boundingBox())!; await page.mouse.click(a.x + 8, a.y + a.height - 8); }
  await at(page, "What a note rests on");
  // A wrong move first: another note chosen is named, and the step waits.
  await page.locator('[data-note="physics/units"]').click();
  await expect(card(page).locator(".mistake")).toContainText("Choose Leapfrog");
  await look(page, "L1-02-wrong");
  await page.locator(LEAP).click();
  await at(page, "Open it");
  await look(page, "L1-03-lit");
  await page.locator(LEAP).click();
  await at(page, "A note is Markdown");
  if (!phone()) await expect(page.locator(".switch")).toHaveAttribute("data-shown", "both");
  await look(page, "L1-03-beside");
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
  await look(page, "L1-06-link");
  await next(page);
  await at(page, "Its kind");
  await page.locator(".cm-line").filter({ hasText: "See Energy" }).getByText("Energy and its conservation").click();
  if (phone()) {
    await page.getByRole("button", { name: /^This link: .*Change it/ }).click();
    await page.getByRole("menuitemradio", { name: /^Requires/ }).click();
  } else await page.keyboard.press("Alt+1");
  await at(page, "The kind, on the Atlas");
  await page.waitForTimeout(800);
  await look(page, "L1-08-kind");
  await next(page);
  await at(page, "Every change is kept");
  await visible(page, "timeline").click();
  await page.locator(".timeline .moment").first().click();
  await expect(page.locator(".atbar")).toBeVisible();
  await page.waitForTimeout(600); // the step looks four times a second: long enough to have seen the note as it was
  await look(page, "L1-09-timeline");
  await page.getByRole("button", { name: "back to now" }).click();
  await at(page, "Follow the link");
  if (phone()) { await page.locator('[data-note="physics/energy-conservation"]').click(); await page.locator('[data-note="physics/energy-conservation"]').click(); }
  else await editor(page).getByText("Energy and its conservation").first().click({ modifiers: ["ControlOrMeta"] });
  await at(page, "Its details");
  if (await page.locator(".details").count() === 0) await visible(page, "details").click();
  await page.getByLabel("tags").fill("energy");
  await page.getByLabel("tags").press("Enter");
  await at(page, "A new note, in a new folder");
  // Made in the wrong folder, redone, then made where the step asks.
  await page.locator('[data-tour="new-note"]').click();
  await page.getByPlaceholder("Entropy").fill("Plummer sphere");
  await page.getByLabel("folder", { exact: true }).fill("physics");
  await page.getByRole("button", { name: "make it" }).click();
  await expect(card(page).locator(".mistake")).toContainText("It went into physics");
  await look(page, "L1-12-wrong");
  await card(page).getByRole("button", { name: "redo" }).click();
  await expect(page.locator('[data-tour="new-note"]')).toBeVisible();
  await expect(card(page).locator(".mistake")).toHaveCount(0);
  await page.locator('[data-tour="new-note"]').click();
  await page.getByPlaceholder("Entropy").fill("Plummer sphere");
  await page.getByLabel("folder", { exact: true }).fill("galax");
  await expect(page.getByRole("option", { name: /galax.*new folder/ })).toBeVisible();
  await look(page, "L1-12-folder");
  await page.getByLabel("folder", { exact: true }).fill("galaxies");
  await page.getByRole("button", { name: "make it" }).click();
  await at(page, "Move it");
  await expect(page).toHaveURL(/#\/n\/galaxies\/plummer-sphere/);
  if (await page.locator(".details").count() === 0) await visible(page, "details").click();
  await page.getByLabel("folder: change it to move the note").fill("sim");
  await page.getByRole("option", { name: /^simulation/ }).click();
  await at(page, "Delete it");
  await expect(page).toHaveURL(/#\/n\/simulation\/plummer-sphere/);
  await page.locator(".details").getByRole("button", { name: "delete", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "delete this note" })).toContainText("No note links to it.");
  await page.getByRole("alertdialog").getByRole("button", { name: "delete", exact: true }).click();
  await at(page, "That is the base");
  await finish(page, "L1", 15);
});

test("L2 (earlier): Iso asked in place and kept, a TODO rewritten, what Iso is sent, the timeline, and a note for Iso kept", async ({ page }) => {
  test.setTimeout(150_000);
  await section(page, "L2");
  await at(page, "Ask Iso in place");
  await ask(page, "I don't have this straight yet.");
  await expect(prompt(page)).toHaveValue("how is a body inserted, and what does each node keep?");
  await prompt(page).press("Enter");
  await at(page, "Keep it, or not");
  await expect(page.locator(".between[data-proposal]")).toContainText("An empty leaf");
  await look(page, "B2-asked");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await at(page, "Rewrite a selection");
  await line(page, /^TODO/);
  await askHere(page);
  await expect(page.getByRole("radio", { name: "rewrite a selection" })).toHaveAttribute("aria-checked", "true");
  await expect(prompt(page)).toHaveValue("answer my TODO");
  await prompt(page).press("Enter");
  await at(page, "Keep the change");
  await page.getByRole("button", { name: "[ keep all ]" }).click();
  await at(page, "What Iso is sent");
  await expect(editor(page)).toContainText("each body visits");
  await page.locator(".bar .count .tokens").click();
  await at(page, "Every change is kept");
  await page.getByRole("button", { name: "Close the breakdown" }).click();
  await visible(page, "timeline").click();
  await at(page, "The note as it was");
  await page.locator(".timeline .moment").first().click();
  await at(page, "Step through it");
  await look(page, "B8-timeline");
  await page.getByRole("button", { name: "back to now" }).click();
  await at(page, "A note for Iso");
  await expect(page.locator("[data-note]").first()).toBeVisible();
  const box = (await page.locator(".atlas").boundingBox())!;
  await hold(page, box.x + 6, box.y + 6);
  await at(page, "Send it");
  await expect(page.getByText("In the cluster run, two bodies pass very close")).toBeVisible();
  await page.getByRole("button", { name: "send to Iso" }).click();
  await at(page, "Keep it as a note");
  await look(page, "B12-path");
  await page.getByLabel("Folder").fill("physics");
  await page.getByRole("button", { name: "keep as a note" }).click();
  await at(page, "Iso, in short");
  await finish(page, "L2");
});

test("E1 (earlier): from the goal back along the chain, a question in a note, an octree planned with Iso, kept and linked in", async ({ page }) => {
  test.setTimeout(150_000);
  await section(page, "E1");
  await at(page, "The goal");
  await next(page);
  await at(page, "What it rests on");
  await page.locator('[data-note="simulation/two-galaxies-colliding"]').click();
  await at(page, "How much faster?");
  await look(page, "C2-chain");
  await ask(page, "rather than trust the exponents.");
  await expect(prompt(page)).toHaveValue("how much faster is Barnes–Hut at N = 5000?");
  await prompt(page).press("Enter");
  await at(page, "Keep what is useful");
  await expect(page.locator(".between[data-proposal]")).toContainText("About ten times fewer interactions");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await at(page, "Plan the octree");
  const [x, y] = await middle(page, '[data-note="algorithms/barnes-hut"]');
  await hold(page, x, y);
  await at(page, "Ask it");
  await expect(page.locator(".deck .chip")).toHaveText(["Barnes–Hut"]);
  await page.getByLabel("Title").fill("The octree");
  await page.locator(".cm-content").click();
  await page.keyboard.type("How does the quadtree become an octree for 3D, and what changes in Barnes–Hut?");
  await page.getByRole("button", { name: "send to Iso" }).click();
  await at(page, "Keep it in algorithms");
  await page.getByLabel("Folder").fill("algorithms");
  await page.getByRole("button", { name: "keep as a note" }).click();
  await at(page, "Link it in");
  await page.locator(".cm-line").filter({ hasText: /^Rests on/ }).click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Next, the [[oct");
  await page.getByRole("option", { name: /The octree/ }).click();
  await at(page, "Hand it on");
  await expect(page).toHaveURL(/#\/n\/algorithms\/the-octree/);
  await finish(page, "E1");
});

test("L3 (earlier): the two bases, the squares, the study list, an exercise marked wrong then right, and one asked for", async ({ page }) => {
  test.setTimeout(150_000);
  await section(page, "L3");
  await at(page, "Two bases");
  await next(page);
  await at(page, "What you understand");
  await expect(page.locator(".margin .pip.lv")).toHaveCount(5);
  await next(page);
  await at(page, "What to study next");
  await look(page, "D3-study");
  await next(page);
  await at(page, "An exercise");
  await line(page, /^At 20 ns/);
  await page.getByRole("button", { name: "mark as answer" }).click();
  await page.getByRole("button", { name: "send for marking" }).click();
  await at(page, "Wrong, and where");
  await expect(page.locator(".cm-iso-wrong")).toHaveCount(2);
  await look(page, "D5-wrong");
  await line(page, /^At 20 ns/);
  await page.keyboard.type("At 20 ns a pair, a step takes 0.04 s.");
  await line(page, /^At 20 ns/);
  await page.getByRole("button", { name: "mark as answer" }).click();
  await page.getByRole("button", { name: "mark it again" }).click();
  await at(page, "The squares moved");
  await expect(page.locator(".bar .pip.lv")).toHaveCount(1);
  await next(page);
  await at(page, "And on the map");
  await expect(page.locator('[data-note="algorithms/direct-summation"]')).toHaveClass(/\bs1\b/);
  await next(page);
  await at(page, "Ask for an exercise");
  await page.locator(".margin").getByRole("button", { name: "[ + an exercise ]" }).click();
  await page.getByRole("button", { name: "send to Iso" }).click();
  await page.getByRole("button", { name: "keep the exercise" }).click();
  await at(page, "Keep coming back");
  await finish(page, "L3");
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

test("L4 (earlier), beside the terminal: the page follows the agent, and a note is sent to it", async ({ page }) => {
  test.skip(!local(), "only beside the terminal");
  await section(page, "L4");
  await at(page, "The terminal beside this page");
  await next(page);
  // Waiting on the agent in the terminal, which is not here.
  await at(page, "Watched from here");
  await card(page).getByRole("button", { name: "skip" }).click();
  await at(page, "Its changes to notes wait here too");
  await next(page);
  await at(page, "From here to there");
  await page.locator('[data-tour="send"]').click();
  await page.getByLabel("What you want of it").fill("use this in the loop");
  await page.getByRole("group", { name: "Send to the terminal's agent" }).getByRole("button", { name: "send to agent" }).click();
  await at(page, "On your own notes");
  await finish(page, "L4");
});

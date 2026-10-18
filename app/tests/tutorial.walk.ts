import { expect, test, type Page } from "@playwright/test";

// The tutorial on the built site, with the engine in the page and no server: each of its parts walked from the list
// of parts to its end, by doing what each step asks, at a desktop's width and a phone's.

const phone = () => test.info().project.name.includes("phone");
const card = (page: Page) => page.getByRole("dialog", { name: "The tutorial" });
const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const prompt = (page: Page) => page.getByRole("textbox", { name: "Ask Iso" });
const visible = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true }).first();
async function at(page: Page, title: string) {
  await expect(card(page).locator("h2")).toHaveText(title, { timeout: 15_000 });
}
const next = (page: Page) => card(page).getByRole("button", { name: "next", exact: true }).click();
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

/** From the list of parts, the one named. */
async function part(page: Page, name: string) {
  await page.goto("./");
  await expect(card(page).locator("h2")).toHaveText("isorite, on a small project", { timeout: 20_000 });
  await card(page).getByRole("button", { name: new RegExp(`^part ${name}`) }).click();
}
/** The last step's "done": back to the list, the part ticked. */
async function finish(page: Page, name: string) {
  await card(page).getByRole("button", { name: "done" }).click();
  await expect(card(page).getByRole("button", { name: new RegExp(`^part ${name}: .*, done$`) })).toBeVisible();
}

let failures: string[] = [];
test.beforeEach(({ page }) => { failures = []; page.on("pageerror", (e) => failures.push(String(e))); });
test.afterEach(() => { expect(failures).toEqual([]); });

test("A: the Atlas, a note opened, its Markdown and links, its frontmatter, and a note made, moved and deleted", async ({ page }) => {
  test.setTimeout(120_000);
  await part(page, "A");
  await at(page, "This is the Atlas");
  await expect(page.locator('[data-note="physics/newtons-law-of-gravitation"]')).toBeVisible();
  await look(page, "A1-atlas");
  await next(page);
  await at(page, "What a note rests on");
  await page.locator('[data-note="integrators/leapfrog"]').click();
  await at(page, "Open it");
  await page.locator('[data-note="integrators/leapfrog"]').click();
  await at(page, "A note is Markdown");
  await expect(editor(page)).toContainText("One force calculation per step");
  await next(page);
  await at(page, "Links, and their kind");
  await next(page);
  await at(page, "Follow a link");
  if (phone()) {
    await page.locator('[data-note="integrators/symplectic-integrators"]').click();
    await page.locator('[data-note="integrators/symplectic-integrators"]').click();
  } else await editor(page).getByText("symplectic", { exact: true }).click({ modifiers: ["ControlOrMeta"] });
  await at(page, "Its frontmatter");
  await visible(page, "details").click();
  await at(page, "A new note, in a new folder");
  await page.locator('[data-tour="new-note"]').click();
  await page.getByPlaceholder("Entropy").fill("Plummer sphere");
  await page.getByPlaceholder("none: the top of the base").fill("galaxies");
  await page.getByRole("button", { name: "make it" }).click();
  await at(page, "Move it");
  await expect(page).toHaveURL(/#\/n\/galaxies\/plummer-sphere/);
  const path = page.getByLabel("path: change it to move the note");
  await path.fill("simulation/plummer-sphere");
  await path.press("Enter");
  await at(page, "Delete it");
  await expect(page).toHaveURL(/#\/n\/simulation\/plummer-sphere/);
  await page.locator(".details").getByRole("button", { name: "delete", exact: true }).click();
  await expect(page.getByRole("alertdialog", { name: "delete this note" })).toContainText("No note links to it.");
  await look(page, "A9-delete");
  await page.getByRole("alertdialog").getByRole("button", { name: "delete", exact: true }).click();
  await at(page, "That is the base");
  await expect(page).toHaveURL(/#\/notes/);
  await finish(page, "A");
});

test("B: Iso asked in place and kept, a TODO rewritten, what Iso is sent, the timeline, and a note for Iso kept", async ({ page }) => {
  test.setTimeout(150_000);
  await part(page, "B");
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
  await finish(page, "B");
});

test("C: from the goal back along the chain, a question in a note, an octree planned with Iso, kept and linked in", async ({ page }) => {
  test.setTimeout(150_000);
  await part(page, "C");
  await at(page, "The goal");
  await next(page);
  await at(page, "What it rests on");
  await page.locator('[data-note="simulation/two-galaxies-colliding"]').click();
  await page.getByRole("button", { name: "[ whole chain ]" }).click();
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
  await finish(page, "C");
});

test("D: the two bases, the squares, the study list, an exercise marked wrong then right, and one asked for", async ({ page }) => {
  test.setTimeout(150_000);
  await part(page, "D");
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
  await finish(page, "D");
});

test("E: the terminal outlined, and the way to its replay", async ({ page }) => {
  await part(page, "E");
  for (const title of ["isorite in the terminal", "It looks before it codes", "Watched from here", "Its changes to notes wait", "From here to there"]) {
    await at(page, title);
    await next(page);
  }
  await at(page, "Its tour, replayed");
  await expect(card(page).getByRole("link", { name: "isorite in the terminal: its tour, replayed" })).toHaveAttribute("href", "#/terminal");
  await finish(page, "E");
});

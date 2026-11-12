import { expect, test, type Page } from "@playwright/test";

// The guide on the public site (M16): it opens on Start here with the Atlas beside it; a problem marked solved is
// ticked where it is embedded and on the Atlas, and kept over a reload until you start again; the finder answers
// with a link to a note.

const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/site-${test.info().project.name}-${name}.png`, fullPage: true });
}
async function start(page: Page) {
  await page.goto("./");
  await expect(title(page)).toHaveValue("Start here", { timeout: 15_000 });
}
const title = (page: Page) => page.locator('[data-pane="note"]').getByRole("textbox", { name: "Title" });
/** The embed of Solve this one in Start here, scrolled to: the editor draws only the lines near the screen. */
async function embed(page: Page) {
  const at = page.locator('[data-pane="note"] .cm-lp-embed', { hasText: "Solve this one" });
  for (let k = 0; k < 12 && !(await at.isVisible()); k++) {
    await page.locator('[data-pane="note"] .cm-content').hover();
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(100);
  }
  return at;
}
const solveThisOne = (page: Page) => page.locator('[data-pane="atlas"] [data-note="general/solve-this-one"]');

test("it opens on Start here, with the problems embedded and the Atlas of the guide beside it", async ({ page }) => {
  await start(page);
  await expect(page).toHaveURL(/#\/n\/general\/start-here$/);
  await expect(await embed(page)).toBeVisible();
  await expect(solveThisOne(page)).toBeAttached();
  await expect(page.locator('[data-pane="atlas"] [data-folder="agents"]')).toBeAttached();
  await shot(page, "start");
});

test("a problem marked solved is ticked on the Atlas, kept over a reload, and gone when the guide starts again", async ({ page }) => {
  await start(page);
  await (await embed(page)).click();
  await expect(page).toHaveURL(/#\/n\/general\/solve-this-one$/);
  await page.locator('[data-pane="note"]').getByRole("button", { name: "◇ unsolved" }).click();
  await expect(solveThisOne(page)).toHaveClass(/\bdone\b/);
  await page.reload();
  await expect(solveThisOne(page)).toHaveClass(/\bdone\b/, { timeout: 15_000 });
  // Start again, from the Note pane's settings: asked once more.
  await page.locator('[data-pane="note"] [data-settings="note"]').click();
  await page.getByRole("button", { name: "Reset this base" }).click();
  await page.getByRole("button", { name: "Reset? Your changes go" }).click();
  await expect(title(page)).toHaveValue("Start here", { timeout: 15_000 });
  await expect(solveThisOne(page)).not.toHaveClass(/\bdone\b/);
});

test("the finder answers what is asked with the notes that match, and says it is no model", async ({ page }) => {
  await start(page);
  if (phone(page)) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Agent/ }).click();
  const box = page.getByRole("textbox", { name: "Message the agent" });
  await box.fill("what is the Atlas?");
  // Ctrl+Enter sends on a desktop (Enter is a new line); on a phone, the Send button.
  if (phone(page)) await page.locator('[data-pane="agent"]').getByRole("button", { name: "Send", exact: true }).click();
  else await box.press("ControlOrMeta+Enter");
  const said = page.locator('[data-pane="agent"] .said').last();
  await expect(said).toContainText("not a model", { timeout: 15_000 });
  await expect(said.locator("a", { hasText: "The Atlas" })).toBeVisible();
  await shot(page, "finder");
  await said.locator("a", { hasText: "The Atlas" }).click();
  await expect(page).toHaveURL(/#\/n\/atlas\/the-atlas$/);
});

test("Diagrams and code is drawn on the site, Pele and Python loaded from the site's own build", async ({ page }) => {
  await page.goto("./#/n/editing/diagrams-and-code");
  await expect(title(page)).toHaveValue("Diagrams and code", { timeout: 15_000 });
  const note = page.locator('[data-pane="note"]');
  await expect(note.locator(".cm-lp-diagram svg").first()).toBeVisible();
  await expect(note.locator(".tok-k").first()).toHaveText("def");
  await shot(page, "diagrams");
});

test("an address from before the notes were put in islands opens the note it was, and is put right", async ({ page }) => {
  await page.goto("./#/n/atlas/the-switches");
  await expect(title(page)).toHaveValue("The switches", { timeout: 15_000 });
  await expect(page).toHaveURL(/#\/n\/general\/the-switches$/);
  await page.goto("./#/n/agent/agent-writes-marked");
  await expect(title(page)).toHaveValue("Every change is kept", { timeout: 15_000 });
  await page.goto("./#/n/start-here");
  await expect(title(page)).toHaveValue("Start here", { timeout: 15_000 });
});

test("the Tour lens lists the steps of the guide as actions, the first of them Find your way", async ({ page }) => {
  await start(page);
  if (phone(page)) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Atlas/ }).click();
  const picker = page.locator("[data-lens-picker]");
  await expect(picker.locator("option")).toContainText(["Islands", "Tour"]);
  await picker.selectOption("tour");
  await expect(page.locator('[data-folder=":find-your-way"]')).toContainText("Find your way");
  await expect(page.locator('[data-folder=":be-taught"]')).toContainText("Be taught");
  await shot(page, "tour");
});

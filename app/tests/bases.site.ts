import { expect, test, type Page } from "@playwright/test";

// The site's bases: the Tutorial (the guide) beside the Global, Skills and Code examples, switched as the app's switcher
// does it. An address names the base and the note (`#/b/code/n/<id>`); one without a base is the Tutorial's, as it was.

const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;
const title = (page: Page) => page.locator('[data-pane="note"]').getByRole("textbox", { name: "Title" });
/** The switcher: the base's name in the header of the first pane (on a phone, of the pane on screen). */
const switcher = (page: Page) => page.locator(phone(page) ? '[data-pane="note"]' : ".pane.first").locator("button.base");
async function atlas(page: Page) {
  if (phone(page)) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Atlas/ }).click();
  await expect(page.locator('[data-pane="atlas"] [data-note]').first()).toBeVisible({ timeout: 15_000 });
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/site-${test.info().project.name}-${name}.png`, fullPage: true });
}

test("the switcher lists the four bases, the special two first; an old address opens the Tutorial", async ({ page }) => {
  await page.goto("./#/n/atlas/the-atlas");
  await expect(title(page)).toHaveValue("The Atlas", { timeout: 15_000 });
  await expect(switcher(page)).toHaveText("Tutorial");
  await switcher(page).click();
  const list = page.getByRole("dialog", { name: "Knowledge bases" });
  await expect(list.getByRole("link")).toHaveText(["Global", "Skills", "Tutorial", "Code"]);
  await expect(list.getByRole("link", { name: "Tutorial" })).toHaveAttribute("aria-current", "page");
  // Nothing to rename or lend: the set is the site's.
  await expect(list.getByRole("button")).toHaveCount(0);
  await shot(page, "switcher");
});

test("choosing Code opens that base: its notes, its code shown from the first, its address with the base in it", async ({ page }) => {
  await page.goto("./");
  await expect(title(page)).toHaveValue("Start here", { timeout: 15_000 });
  await switcher(page).click();
  await page.getByRole("dialog", { name: "Knowledge bases" }).getByRole("link", { name: "Code" }).click();
  await expect(title(page)).toHaveValue("Overview", { timeout: 15_000 });
  await expect(page).toHaveURL(/#\/b\/code\/n\/notes\/overview$/);
  await expect(switcher(page)).toHaveText("Code");
  await atlas(page);
  await expect(page.locator('[data-pane="atlas"] [data-note="src/main.ts"]')).toBeVisible();
  // The address keeps the base as notes are opened, and a reload stays in it.
  await page.goto("./#/b/code/n/notes/store");
  await expect(title(page)).toHaveValue("The store", { timeout: 15_000 });
  await page.reload();
  await expect(switcher(page)).toHaveText("Code", { timeout: 15_000 });
  await shot(page, "code");
});

test("a lens is picked on the Code base: A request draws its steps as islands", async ({ page }) => {
  await page.goto("./#/b/code/atlas");
  await atlas(page);
  const picker = page.locator("[data-lens-picker]");
  await expect(picker).toBeVisible();
  await expect(picker.locator("option")).toContainText(["Islands", "A request", "By area"]);
  await picker.selectOption("a-request");
  await expect(page.locator('[data-folder=":typed"]')).toContainText("1. Typed");
  await expect(page.locator('[data-folder=":printed"]')).toContainText("5. Printed");
  await shot(page, "code-lens");
  await picker.selectOption("by-area");
  await expect(page.locator('[data-folder=":storage"]')).toContainText("Storage");
  await expect(page.locator('[data-folder=":commands"]')).toContainText("Commands");
});

test("a note's link to the global base is a mark on the Atlas that opens the Global base at that note", async ({ page }) => {
  await page.goto("./#/n/bases/the-global-base");
  await expect(title(page)).toHaveValue("The global base", { timeout: 15_000 });
  await atlas(page);
  const mark = page.locator('.sat.global[data-sat="bases/the-global-base global:conventions/naming.md"]');
  await expect(mark).toHaveAttribute("aria-label", "the naming convention, in the global base");
  await mark.click();
  await expect(page).toHaveURL(/#\/b\/global\/n\/conventions\/naming$/);
  await expect(title(page)).toHaveValue("Naming", { timeout: 15_000 });
  await expect(switcher(page)).toHaveText("Global");
  await shot(page, "global");
});

test("the Code base links to the global base too", async ({ page }) => {
  await page.goto("./#/b/code/n/notes/overview");
  await atlas(page);
  const mark = page.locator('.sat.global[data-sat="notes/overview global:conventions/naming.md"]');
  await expect(mark).toBeVisible();
  await mark.click();
  await expect(page).toHaveURL(/#\/b\/global\/n\/conventions\/naming$/);
  await expect(title(page)).toHaveValue("Naming", { timeout: 15_000 });
});

test("the Skills base holds its skills as islands, their scripts shown, the built-in skill beside them", async ({ page }) => {
  await page.goto("./#/b/skills/atlas");
  await atlas(page);
  await expect(page.locator('[data-note="commit-message/SKILL"]')).toBeVisible();
  await expect(page.locator('[data-note="commit-message/scripts/staged-summary.sh"]')).toBeVisible();
  await expect(page.locator('[data-note="explain-like-a-reviewer/SKILL"]')).toBeVisible();
  await expect(page.locator('[data-note="built-in/socratic-tutor/SKILL"]')).toBeVisible();
  await shot(page, "skills");
  // Switching from here goes to the Global base's own first note.
  await switcher(page).click();
  await page.getByRole("dialog", { name: "Knowledge bases" }).getByRole("link", { name: "Global" }).click();
  await expect(title(page)).toHaveValue("Naming", { timeout: 15_000 });
  await expect(page).toHaveURL(/#\/b\/global\/n\/conventions\/naming$/);
});

test("choosing the Tutorial from another base opens the guide at Start here, its address as it always was", async ({ page }) => {
  await page.goto("./#/b/code/n/notes/store");
  await expect(title(page)).toHaveValue("The store", { timeout: 15_000 });
  await switcher(page).click();
  await page.getByRole("dialog", { name: "Knowledge bases" }).getByRole("link", { name: "Tutorial" }).click();
  await expect(title(page)).toHaveValue("Start here", { timeout: 15_000 });
  await expect(page).toHaveURL(/#\/n\/general\/start-here$/);
  await expect(switcher(page)).toHaveText("Tutorial");
});

test("the finder's first reply, asked in the Code base, links to the Tutorial's note on your own agent, which opens", async ({ page }) => {
  await page.goto("./#/b/code/n/notes/overview");
  await expect(title(page)).toHaveValue("Overview", { timeout: 15_000 });
  if (phone(page)) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Agent/ }).click();
  const box = page.getByRole("textbox", { name: "Message the agent" });
  await box.fill("how are tasks stored?");
  // Ctrl+Enter sends on a desktop (Enter is a new line); on a phone, the Send button.
  if (phone(page)) await page.locator('[data-pane="agent"]').getByRole("button", { name: "Send", exact: true }).click();
  else await box.press("ControlOrMeta+Enter");
  const said = page.locator('[data-pane="agent"] .said').last();
  await expect(said).toContainText("not a model", { timeout: 15_000 });
  await said.locator("a", { hasText: "Your own agent" }).click();
  await expect(title(page)).toHaveValue("Your own agent", { timeout: 15_000 });
  await expect(page).toHaveURL(/#\/n\/agents\/your-own-agent$/);
  await expect(switcher(page)).toHaveText("Tutorial");
});

test("Reset resets only the base that is open: a note solved in the Tutorial stays solved while the Code base is reset", async ({ page }) => {
  await page.goto("./#/n/general/solve-this-one");
  await expect(title(page)).toHaveValue("Solve this one", { timeout: 15_000 });
  await page.locator('[data-pane="note"]').getByRole("button", { name: "◇ unsolved" }).click();
  await expect(page.locator('[data-pane="note"]').getByRole("button", { name: "◆ solved" })).toBeVisible();
  // Reset the Code base from its own page.
  await page.goto("./#/b/code/n/notes/overview");
  await expect(title(page)).toHaveValue("Overview", { timeout: 15_000 });
  await page.locator('[data-pane="note"] [data-settings="note"]').click();
  await page.getByRole("button", { name: "Reset this base" }).click();
  await page.getByRole("button", { name: "Reset? Your changes go" }).click();
  await expect(switcher(page)).toHaveText("Code", { timeout: 15_000 });
  await expect(page).toHaveURL(/#\/b\/code/);
  // The Tutorial kept its solved problem; reset it, so the next run starts clean.
  await page.goto("./#/n/general/solve-this-one");
  await expect(title(page)).toHaveValue("Solve this one", { timeout: 15_000 });
  await expect(page.locator('[data-pane="note"]').getByRole("button", { name: "◆ solved" })).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-pane="note"]').getByRole("button", { name: "◆ solved" }).click();
});

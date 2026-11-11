// The global base and the skills base (docs/format.md): pinned above the person's own bases in the switcher, always
// there. A link from a note of any base, global:<id>.md, is drawn as a mark on the Atlas and opens the global note;
// the skills base shows a skill's SKILL.md as a note and its script as an item, shown from the first. The test server
// keeps both in its own data folder (XDG_DATA_HOME), never the real one.

import { expect, test, type Page } from "@playwright/test";

const phone = () => test.info().project.name.startsWith("phone");
const switcher = (page: Page) => page.locator(phone() ? '[data-pane="note"]' : ".pane.first").locator("button.base");
const headers = async (page: Page) => {
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  return { "x-isorite-token": token, origin: new URL(test.info().project.use.baseURL!).origin };
};
async function atlas(page: Page, url: string): Promise<void> {
  await page.goto(url);
  if (phone()) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
}

test("the switcher pins the global base and the skills base above the person's own, and each opens its own notes", async ({ page }) => {
  await page.goto("#/notes");
  await switcher(page).click();
  const list = page.getByRole("dialog", { name: "Knowledge bases" });
  await expect(list.getByRole("link").nth(0)).toHaveText("Global");
  await expect(list.getByRole("link").nth(1)).toHaveText("Skills");
  // Always lent, and not renamed: they have neither of the switches an ordinary base has.
  await expect(list.getByRole("listitem").filter({ hasText: "Global" }).getByRole("button")).toHaveCount(0);
  await expect(list.getByRole("listitem").filter({ hasText: "memory" }).getByRole("button")).toHaveCount(2);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-special-bases-switcher.png` });
  await list.getByRole("link", { name: "Global" }).click();
  await expect(page).toHaveURL(/\?base=global(#.*)?$/);
  await expect(switcher(page)).toHaveText("Global");
  await page.goto("/?base=global#/notes");
  await expect(page.getByRole("link", { name: "Naming conventions" }).first()).toBeVisible();
  await page.goto("/?base=skills#/notes");
  await expect(switcher(page)).toHaveText("Skills");
});

test("a link from a note to the global base is a mark on the Atlas and opens the global note; the note's own page does as well", async ({ page }, info) => {
  const id = `basics/global-link-${info.project.name}`;
  const made = await page.request.post(`api/note?id=${id}`, { data: { text: `---\ntype: Concept\ntitle: Links to global ${info.project.name}\n---\n\nSee [naming](global:conventions/naming.md "see also") and [gone](global:conventions/nothing.md).\n` }, headers: await headers(page) });
  expect(made.ok()).toBe(true);
  await atlas(page, "#/atlas");
  await expect(page.locator(`.sat.global[data-sat^="${id} "]`)).toHaveCount(2);
  const good = page.locator(`.sat.global[data-sat="${id} global:conventions/naming.md"]`);
  await expect(good).toHaveAttribute("aria-label", "naming, in the global base");
  await expect(page.locator(`.sat.global[data-sat="${id} global:conventions/nothing.md"]`)).toHaveClass(/broken/);
  await page.screenshot({ path: `test-results/screens/${info.project.name}-global-satellite.png` });
  await good.click();
  await expect(page).toHaveURL(/\?base=global#\/n\/conventions\/naming$/);
  await expect(page.getByText("Name a thing for what it does")).toBeVisible();
  await expect(switcher(page)).toHaveText("Global");
  // In the note itself, Ctrl or Cmd and a click follows the link the same way.
  await page.goto(`#/n/${id}`);
  const link = page.locator(".cm-lp-link").filter({ hasText: "naming" });
  await expect(link).toBeVisible();
  await link.click({ modifiers: ["ControlOrMeta"] });
  await expect(page).toHaveURL(/\?base=global#\/n\/conventions\/naming$/);
});

test("the skills base shows a skill as an island: SKILL.md a note named for its frontmatter, its script an item shown from the first, the built-in skills beside them", async ({ page }) => {
  await atlas(page, "/?base=skills#/atlas");
  await expect(page.locator('[data-note="release-notes/SKILL"]')).toBeVisible();
  // The code switch was not touched, and the script is there.
  const script = page.locator('[data-note="release-notes/collect.sh"]');
  await expect(script).toBeVisible();
  await expect(script).toHaveClass(/file/);
  await expect(page.locator('[data-note="built-in/socratic-tutor/SKILL"]')).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-skills-base.png` });
  await page.goto("/?base=skills#/notes");
  const row = page.locator('.notes li[data-row="release-notes/SKILL"]');
  await expect(row).toContainText("release-notes");
  await expect(row).toContainText("Write release notes from the merged pull requests.");
  await expect(page.locator('[data-file="release-notes/collect.sh"]')).toBeVisible();
  // The script opens as text.
  await page.goto("/?base=skills#/n/release-notes/collect.sh");
  await expect(page.locator("[data-source]")).toContainText("gh pr list");
});

test("a new skill is made from the Atlas's New island, with a SKILL.md to fill in; a built-in skill is read only", async ({ page, request }, info) => {
  const name = `made-${info.project.name}`;
  await page.goto("/?base=skills#/notes");
  await page.getByRole("button", { name: "New island" }).click();
  await page.getByRole("textbox", { name: "The new island's path" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page.locator(`.notes li[data-row="${name}/SKILL"]`)).toBeVisible();
  const text = ((await (await request.get(`b/skills/api/note?id=${encodeURIComponent(`${name}/SKILL`)}`)).json()) as { text: string }).text;
  expect(text).toContain(`name: ${name}`);
  expect(text).toContain("description:");
  // A built-in skill refuses a change.
  const source = (await (await request.get("b/skills/api/note?id=built-in%2Fsocratic-tutor%2FSKILL")).json()) as { text: string; version: string };
  const refused = await request.put("b/skills/api/note?id=built-in%2Fsocratic-tutor%2FSKILL", { data: { base: source.version, text: `${source.text}\nmore\n` }, headers: await headers(page) });
  expect(refused.status()).toBe(403);
  // Taken away again, as the skills are the agent's too.
  const mine = (await (await request.get(`b/skills/api/note?id=${encodeURIComponent(`${name}/SKILL`)}`)).json()) as { version: string };
  await request.post(`b/skills/api/note/delete?id=${encodeURIComponent(`${name}/SKILL`)}`, { data: { base: mine.version }, headers: await headers(page) });
});

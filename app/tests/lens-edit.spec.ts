// Lenses changed in the app (docs/lenses.md), with no TOML typed: made, titled, renamed and deleted from the Atlas's
// settings; islands added, nested, renamed, moved and removed there, with their rules in a plain field; notes put in an
// island and taken out from a note's menu, or carried to an island on the Atlas; what a lens hides kept to that lens and
// shown again; and the finder narrowed to the lens, an island of it, or every note. Each test makes its own lens, named
// for its project, and takes it away.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { STUDY } from "./serve.ts";

const lensFile = (name: string) => join(STUDY, "lenses", `${name}.toml`);
const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;

/** The Atlas in view, with its notes drawn. */
async function atlas(page: Page): Promise<void> {
  await page.goto("#/atlas");
  await expect(page.locator('[data-note="coding/huffman-codes"], [data-note="basics/surprise"]').first()).toBeVisible({ timeout: 15000 });
  if (phone(page)) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
}
async function settings(page: Page): Promise<void> {
  const gear = page.locator('[data-pane="atlas"] [data-settings="atlas"]');
  if ((await gear.getAttribute("aria-expanded")) !== "true") await gear.click();
  await expect(page.getByRole("dialog", { name: "Atlas settings" })).toBeVisible();
}
async function headers(page: Page): Promise<Record<string, string>> {
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  return { "x-isorite-token": token, origin: new URL(page.url()).origin };
}
/** A field that keeps itself when left: typed into, and Enter. */
async function type(page: Page, label: string, text: string): Promise<void> {
  const f = page.getByLabel(label, { exact: true });
  await f.fill(text);
  await f.press("Enter");
}
/** A row's menu in the list of notes. */
async function rowMenu(page: Page, id: string): Promise<void> {
  const row = page.locator(`.notes li[data-row="${id}"]`);
  await row.hover();
  await row.locator(".more").click();
}

test("a lens is made, its islands added, nested, renamed, moved, ruled and removed, notes put in and taken out, and the lens renamed and deleted, all from the app", async ({ page }) => {
  const p = test.info().project.name, name = `edit-${p}`, renamed = `renamed-${p}`;
  try {
    await atlas(page);
    await settings(page);
    // A new lens: named from its title, and shown at once; every note is in Elsewhere.
    await type(page, "new lens", `Edit ${p}`);
    await expect(page.locator("[data-lens-picker]")).toHaveValue(name);
    expect(existsSync(lensFile(name))).toBe(true);
    await expect(page.locator('[data-folder=":"]')).toBeVisible();

    // Islands: one with a rule, one after it moved before it, one inside the first, and one renamed.
    await type(page, "A new island", "Start");
    await expect(page.locator('[data-island-edit="Start"]')).toBeVisible();
    await type(page, "Rules of Start", "path:/coding/**");
    await expect(page.locator('[data-island-edit="Start"] .n')).toHaveText("3");
    await expect(page.locator('[data-folder=":Start"]')).toBeVisible();
    await type(page, "A new island", "Later");
    await page.getByRole("button", { name: "Move Later up" }).click();
    await expect.poll(() => page.locator("[data-island-edit]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.islandEdit))).toEqual(["Later", "Start"]);
    await page.getByRole("button", { name: "An island in Start" }).click();
    await type(page, "A new island in Start", "Inner");
    await expect(page.locator('[data-island-edit="Start > Inner"]')).toBeVisible();
    await type(page, "Island Later", "Afterwards");
    await expect(page.locator('[data-island-edit="Afterwards"]')).toBeVisible();
    await type(page, "The lens's title", `Edited ${p}`);
    await expect(page.locator(`[data-lens-picker] option[value="${name}"]`)).toHaveText(`Edited ${p}`);
    await page.screenshot({ path: `test-results/screens/${p}-lens-settings.png` });
    const text = readFileSync(lensFile(name), "utf8");
    expect(text).toContain(`title = "Edited ${p}"`);
    expect(text).toContain('match = ["path:/coding/**"]');
    expect(text).toContain("[[islands.islands]]");
    expect(text.indexOf('name = "Afterwards"')).toBeLessThan(text.indexOf('name = "Start"'));
    await page.getByRole("button", { name: "Remove the island Afterwards" }).click();
    await page.getByRole("button", { name: "remove", exact: true }).click();
    await expect(page.locator('[data-island-edit="Afterwards"]')).toHaveCount(0);
    await page.keyboard.press("Escape");

    // From a note's menu in the list: put in an island, and taken out again; one the island's rule holds is left out by a rule.
    await page.goto("#/notes");
    await expect(page.locator('section[data-island=":Start"]')).toBeVisible();
    await rowMenu(page, "basics/surprise");
    await page.getByRole("button", { name: "Add to island…" }).click();
    await page.getByRole("group", { name: `Islands of Edited ${p}` }).getByRole("button", { name: "Inner" }).click();
    await expect(page.locator('section[data-island=":Start/Inner"] [data-row="basics/surprise"]')).toBeVisible();
    await rowMenu(page, "basics/surprise");
    await page.getByRole("button", { name: "Take out of Inner" }).click();
    await expect(page.locator('section[data-island=":"] [data-row="basics/surprise"]')).toBeVisible();
    await rowMenu(page, "coding/huffman-codes");
    await page.getByRole("button", { name: "Take out of Start" }).click();
    await expect(page.locator('section[data-island=":"] [data-row="coding/huffman-codes"]')).toBeVisible();
    expect(readFileSync(lensFile(name), "utf8")).toContain('"-path:/coding/huffman-codes.md"');

    // The lens's file renamed, then the lens deleted: the map is the folders again.
    await atlas(page);
    await settings(page);
    await type(page, "The lens's file name", renamed);
    await expect(page.locator("[data-lens-picker]")).toHaveValue(renamed);
    expect(existsSync(lensFile(renamed)) && !existsSync(lensFile(name))).toBe(true);
    await page.getByRole("button", { name: "Delete this lens…" }).click();
    await page.getByRole("button", { name: "delete", exact: true }).click();
    await expect.poll(() => existsSync(lensFile(renamed))).toBe(false);
    await expect(page.locator('[data-folder="basics"]')).toBeVisible();
  } finally {
    rmSync(lensFile(name), { force: true });
    rmSync(lensFile(renamed), { force: true });
  }
});

test("hidden in a lens is hidden there alone, said so, kept as the lens's own list, and shown again from its settings", async ({ page }) => {
  const p = test.info().project.name, name = `hide-${p}`, id = "basics/surprise";
  mkdirSync(join(STUDY, "lenses"), { recursive: true });
  writeFileSync(lensFile(name), `title = "Hide ${p}"\n\n[[islands]]\nname = "Basics"\nmatch = ["path:/basics/**"]\n`);
  try {
    await atlas(page);
    await page.locator("[data-lens-picker]").selectOption(name);
    const block = page.locator(`[data-note="${id}"]`);
    await expect(block).toBeVisible();
    if (phone(page)) {
      // A finger holds for a menu on a phone: hidden as the agent or another page would.
      expect((await page.request.post("api/lens/edit", { headers: await headers(page), data: { name, change: { action: "hide", ids: [id] } } })).ok()).toBe(true);
    } else {
      // The grey tag hides it in this lens, and says which.
      const b = (await block.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      const tag = page.locator('[data-tag="hide"]');
      await expect(tag).toBeVisible();
      await page.waitForTimeout(400);
      const t = (await tag.boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 4 });
      await page.mouse.up();
      await expect(page.locator(`.hid[data-hid="${id}"]`)).toContainText(`is hidden in Hide ${p}`);
      await page.screenshot({ path: `test-results/screens/${p}-lens-hidden.png` });
    }
    await expect(block).toHaveCount(0);
    expect(((await (await page.request.get(`api/hidden?lens=${name}`)).json()) as { ids: string[]; own: boolean })).toEqual({ ids: [id], own: true });
    expect(((await (await page.request.get("api/hidden")).json()) as { ids: string[] }).ids).not.toContain(id);

    // The folders still show it.
    await page.locator("[data-lens-picker]").selectOption("folders");
    await expect(block).toBeVisible();
    await page.locator("[data-lens-picker]").selectOption(name);
    await expect(block).toHaveCount(0);

    // The lens's settings say the list is its own, show it again, and give the base's back.
    await settings(page);
    await expect(page.locator("[data-hidden-own]")).toHaveText("its own: 1");
    await page.getByRole("button", { name: `Show Surprise in Hide ${p}` }).click();
    await expect(block).toBeVisible();
    await expect(page.locator("[data-hidden-own]")).toHaveText("its own: 0");
    await page.getByRole("button", { name: "as the base" }).click();
    await expect(page.locator("[data-hidden-own]")).toHaveText("as the base: 0");
    expect(readFileSync(lensFile(name), "utf8")).not.toContain("hidden");
  } finally {
    rmSync(lensFile(name), { force: true });
  }
});

test("hidden in every lens from the notice: the base's list, and a lens with its own", async ({ page }) => {
  test.skip(phone(page), "a finger holds on a phone for a menu; the tags are for a mouse");
  const p = test.info().project.name, name = `every-${p}`, other = `every-own-${p}`, id = "basics/bit";
  mkdirSync(join(STUDY, "lenses"), { recursive: true });
  writeFileSync(lensFile(name), `title = "Every ${p}"\n\n[[islands]]\nname = "Basics"\nmatch = ["path:/basics/**"]\n`);
  writeFileSync(lensFile(other), `title = "Own ${p}"\nhidden = []\n\n[[islands]]\nname = "Basics"\nmatch = ["path:/basics/**"]\n`);
  const h = { value: {} as Record<string, string> };
  try {
    await atlas(page);
    h.value = await headers(page);
    await page.locator("[data-lens-picker]").selectOption(name);
    const block = page.locator(`[data-note="${id}"]`);
    await expect(block).toBeVisible();
    const b = (await block.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    const tag = page.locator('[data-tag="hide"]');
    await expect(tag).toBeVisible();
    await page.waitForTimeout(400);
    const t = (await tag.boundingBox())!;
    await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 4 });
    await page.mouse.up();
    await page.locator(`.hid[data-hid="${id}"]`).getByRole("button", { name: "in every lens" }).click();
    await expect.poll(async () => ((await (await page.request.get("api/hidden")).json()) as { ids: string[] }).ids).toContain(id);
    await expect.poll(async () => ((await (await page.request.get(`api/hidden?lens=${other}`)).json()) as { ids: string[] }).ids).toContain(id);
    await page.locator("[data-lens-picker]").selectOption("folders");
    await expect(page.locator('[data-note="basics/surprise"]')).toBeVisible();
    await expect(block).toHaveCount(0);
  } finally {
    const now = ((await (await page.request.get("api/hidden")).json()) as { ids: string[] }).ids;
    await page.request.post("api/hidden", { headers: h.value, data: { ids: now.filter((x) => x !== id) } });
    rmSync(lensFile(name), { force: true });
    rmSync(lensFile(other), { force: true });
  }
});

test("a note carried on a lens's map to another island is moved there, and to Elsewhere is taken out", async ({ page }) => {
  test.skip(phone(page), "a finger holds on a phone for a menu; the tags are for a mouse");
  const p = test.info().project.name, name = `carry-${p}`;
  mkdirSync(join(STUDY, "lenses"), { recursive: true });
  writeFileSync(lensFile(name), `title = "Carry ${p}"\n\n[[islands]]\nname = "From"\nnotes = ["/basics/surprise.md", "/coding/source-coding.md"]\n\n[[islands]]\nname = "To"\nnotes = ["/basics/bit.md", "/coding/kraft-inequality.md"]\n`);
  try {
    await atlas(page);
    await page.locator("[data-lens-picker]").selectOption(name);
    const carry = async (id: string, to: string) => {
      const block = page.locator(`[data-note="${id}"]`);
      await expect(block).toBeVisible();
      const b = (await block.boundingBox())!;
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.mouse.down();
      const tag = page.locator('[data-tag="move"]');
      await expect(tag).toBeVisible();
      await page.waitForTimeout(400);
      const t = (await tag.boundingBox())!;
      await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 4 });
      await page.waitForTimeout(250);
      const f = (await page.locator(`[data-folder="${to}"]`).boundingBox())!;
      await page.mouse.move(f.x + f.width / 2, f.y + f.height - 6, { steps: 8 });
      await expect(page.locator(`[data-folder="${to}"]`)).toHaveAttribute("data-g", "over");
      await page.mouse.up();
    };
    await carry("basics/surprise", ":To");
    await expect.poll(() => readFileSync(lensFile(name), "utf8")).toContain('notes = ["/coding/source-coding.md"]');
    expect(readFileSync(lensFile(name), "utf8")).toContain('notes = ["/basics/bit.md", "/coding/kraft-inequality.md", "/basics/surprise.md"]');
    await page.goto("#/notes");
    await expect(page.locator('section[data-island=":To"] [data-row="basics/surprise"]')).toBeVisible();
    await atlas(page);
    await carry("coding/source-coding", ":");
    await expect.poll(() => readFileSync(lensFile(name), "utf8")).not.toContain("source-coding");
  } finally {
    rmSync(lensFile(name), { force: true });
  }
});

test("the finder looks in the lens, an island of it, or every note; it says where each is at home, and what the lens hides comes last", async ({ page }) => {
  const p = test.info().project.name, name = `find-${p}`;
  mkdirSync(join(STUDY, "lenses"), { recursive: true });
  writeFileSync(lensFile(name), `title = "Find ${p}"\nhidden = ["coding/kraft-inequality"]\n\n[[islands]]\nname = "Codes"\nmatch = ["path:/coding/**"]\n\n[[islands]]\nname = "Units"\nnotes = ["/basics/bit.md"]\n`);
  try {
    await atlas(page);
    await page.locator("[data-lens-picker]").selectOption(name);
    await expect(page.locator('[data-folder=":Codes"]')).toBeVisible();
    await page.locator(".atlas").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("Control+k");
    const box = page.getByRole("searchbox", { name: "Find a note on the map" });
    await expect(box).toBeFocused();
    const found = () => page.locator("[data-found]").evaluateAll((els) => els.map((e) => e.getAttribute("data-found")));
    // In the lens: what its islands show, each with its island; not Elsewhere's, not what it hides.
    await box.pressSequentially("huffman");
    await expect(page.locator('[data-found="coding/huffman-codes"]')).toBeVisible();
    await expect(page.locator('[data-found="coding/huffman-codes"] [data-in]')).toHaveText("Codes");
    await expect.poll(found).not.toContain("channels/huffman-in-code");
    await page.screenshot({ path: `test-results/screens/${p}-lens-find.png` });
    // One island of it.
    const within = page.locator("[data-find-within]");
    await within.selectOption("Units");
    await expect.poll(found).toEqual([]);
    await box.fill("");
    await box.pressSequentially("coin");
    await expect.poll(found).toEqual(["basics/bit"]);
    // Every note: Elsewhere's too, and what the lens hides, last and marked, after a note it outscores (the one whose link
    // names it). A word no other note has: the finder shows twelve, and other specs leave notes in the shared base.
    await within.selectOption(":all");
    await box.fill("");
    await box.pressSequentially("kraft");
    await expect(page.locator('[data-found="coding/kraft-inequality"]')).toBeVisible();
    await expect.poll(found).toContain("coding/huffman-codes");
    await expect.poll(async () => (await found()).at(-1)).toBe("coding/kraft-inequality");
    await expect(page.locator('li.hidden [data-found="coding/kraft-inequality"]')).toBeVisible();
    await box.fill("");
    await box.pressSequentially("huffman");
    await expect(page.locator('[data-found="channels/huffman-in-code"]')).toBeVisible();
  } finally {
    rmSync(lensFile(name), { force: true });
  }
});

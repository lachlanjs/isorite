// Lenses (docs/lenses.md): a lens file in .isorite/lenses/ puts a picker in the Atlas header; its islands are drawn
// in place of the folders, a note held by a second island is a ghost, the rest are in Elsewhere, and the note list
// follows the order of the file. The test writes its own lens (named for its project) over the base's notes, and takes it away.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { STUDY } from "./serve.ts";

test("a lens is picked: its islands are drawn, a note held twice is a ghost, the list follows the file's order, and Folders brings the folders back", async ({ page }, info) => {
  const name = `path-${info.project.name}`, file = join(STUDY, "lenses", `${name}.toml`);
  mkdirSync(join(STUDY, "lenses"), { recursive: true });
  writeFileSync(file, `title = "Path ${info.project.name}"

[[islands]]
name = "first"
title = "Step one"
notes = ["/coding/source-coding.md", "/basics/surprise.md"]

[[islands]]
name = "second"
title = "Step two"
notes = ["/coding/kraft-inequality.md"]
match = ["path:/coding/**"]
`);
  try {
    await page.goto("#/atlas");
    await expect(page.locator('[data-note="coding/huffman-codes"]')).toBeVisible();
    if ((page.viewportSize()?.width ?? 1280) <= 760) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
    // The folders are the default; the picker is there because the base has a lens.
    const picker = page.locator("[data-lens-picker]");
    await expect(picker).toBeVisible();
    await expect(picker).toHaveValue("folders");
    await expect(page.locator('[data-folder="basics"]')).toBeVisible();

    await picker.selectOption(name);
    await expect(page.locator('[data-folder=":first"]')).toBeVisible();
    await expect(page.locator('[data-folder=":first"]')).toContainText("Step one");
    await expect(page.locator('[data-folder=":second"]')).toContainText("Step two");
    await expect(page.locator('[data-folder="basics"]')).toHaveCount(0);
    // Elsewhere holds what no island does (the folders' notes are not lost).
    await expect(page.locator('[data-folder=":"]')).toContainText("Elsewhere");
    await expect(page.locator('[data-note="channels/huffman-in-code"]')).toBeVisible();
    // A note is drawn once, at its home; the island that also holds it has a ghost.
    await expect(page.locator('[data-note="coding/source-coding"]')).toHaveCount(1);
    const ghost = page.locator('[data-ghost="ghost:coding/source-coding::second"]');
    await expect(ghost).toBeVisible();
    await expect(ghost).toHaveClass(/ghost/);
    await expect(page.locator(".routes path.ghostline")).toHaveCount(0);
    await page.locator('[data-note="coding/source-coding"]').click();
    await expect(page.locator(".routes path.ghostline")).toHaveCount(1);
    await page.screenshot({ path: `test-results/screens/${info.project.name}-lens-atlas.png` });
    await page.keyboard.press("Escape");

    // The list follows the file: the islands in order, the notes of each in the order it lists them.
    await page.goto("#/notes");
    await expect(page.locator('section[data-island=":first"]')).toBeVisible();
    expect(await page.locator("[data-island] h2").allTextContents()).toEqual(expect.arrayContaining(["Step one", "Step two", "Elsewhere"]));
    const rows = (island: string) => page.locator(`section[data-island="${island}"] [data-row]`).evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.row));
    expect(await rows(":first")).toEqual(["coding/source-coding", "basics/surprise"]);
    expect(await rows(":second")).toEqual(["coding/kraft-inequality", "coding/huffman-codes"]);
    const order = await page.locator("[data-island]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.island));
    expect(order.slice(0, 2)).toEqual([":first", ":second"]);
    expect(order.at(-1)).toBe(":");
    await page.screenshot({ path: `test-results/screens/${info.project.name}-lens-list.png` });

    // Back to the folders.
    await page.goto("#/atlas");
    await page.locator("[data-lens-picker]").selectOption("folders");
    await expect(page.locator('[data-folder="basics"]')).toBeVisible();
    await expect(page.locator('[data-folder=":first"]')).toHaveCount(0);
  } finally {
    rmSync(file, { force: true });
  }
});

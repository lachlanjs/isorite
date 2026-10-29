import { expect, test, type Page } from "@playwright/test";

// The Atlas follows the note (M17): the note open is marked on the map, off screen a pip points to it, the note
// chosen follows the links you take, a link under the mouse in the Note pane or Iso's is lit on the map, and the
// note under the mouse on the map marks its links in the note.

const note = (page: Page, id: string) => page.locator(`[data-pane="atlas"] [data-note="${id}"]`);
const link = (page: Page, text: string) => page.locator('[data-pane="note"] .cm-lp-link', { hasText: text }).first();
const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
}
async function open(page: Page, id: string) {
  await page.goto(`#/n/${id}`);
  await expect(page.locator('[data-pane="note"] .cm-content')).toBeVisible();
  await expect(note(page, id)).toBeAttached();
}

test("the note open is marked on the map, and nothing else is dimmed by it", async ({ page }) => {
  await open(page, "coding/huffman-codes");
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\bhere\b/);
  await expect(note(page, "coding/huffman-codes")).toHaveAttribute("aria-current", "page");
  await expect(page.locator('[data-pane="atlas"] .n.dim')).toHaveCount(0);
  await expect(page.locator('[data-pane="atlas"] .n.here')).toHaveCount(1);
  await look(page, "follow-here");
});

test("following a link in the note moves the mark, and the note chosen with it", async ({ page }) => {
  test.skip(phone(page), "one pane at a time: choosing on the map and following in the note are apart");
  await open(page, "coding/huffman-codes");
  // Chosen on the map: lit, with what it rests on.
  await note(page, "coding/huffman-codes").click();
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\bat\b/);
  await link(page, "this").click({ modifiers: ["ControlOrMeta"] });
  await expect(page).toHaveURL(/#\/n\/coding\/kraft-inequality$/);
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bhere\b/);
  await expect(note(page, "coding/huffman-codes")).not.toHaveClass(/\bhere\b/);
  // The choice walked back along the link, and the way walked stays lit.
  await expect(note(page, "coding/kraft-inequality")).toHaveClass(/\bat\b/);
  await expect(note(page, "coding/huffman-codes")).toHaveClass(/\breq\b/);
});

test("a note opened with nothing chosen does not light the map", async ({ page }) => {
  await open(page, "coding/kraft-inequality");
  await expect(page.locator('[data-pane="atlas"] .n.at')).toHaveCount(0);
});

test("off the screen, a pip points to the note open, and brings it into view", async ({ page }) => {
  test.skip(phone(page), "the Atlas is a swipe away on a phone; the pip is the same");
  await open(page, "coding/huffman-codes");
  const atlas = page.locator('[data-pane="atlas"] .atlas');
  await atlas.focus();
  for (let k = 0; k < 6; k++) await page.keyboard.press("+");
  for (let k = 0; k < 30; k++) await page.keyboard.press("ArrowLeft");
  const pip = page.locator('[data-pane="atlas"] [data-pip="here"]');
  await expect(pip).toBeVisible();
  await expect(pip).toHaveAttribute("aria-label", "Bring Huffman codes into view");
  await look(page, "follow-pip");
  await pip.click();
  await expect(pip).toHaveCount(0);
  await expect(note(page, "coding/huffman-codes")).toBeInViewport();
});

test("a link under the mouse in the note is outlined on the map, with the link lit, until the mouse leaves it", async ({ page }) => {
  test.skip(phone(page), "no mouse on a phone");
  await open(page, "coding/huffman-codes");
  await link(page, "bits").hover();
  await expect(note(page, "basics/bit")).toHaveClass(/\bmo-you\b/);
  await expect(page.locator('[data-pane="atlas"] .routes path.lit.uses')).toHaveCount(1);
  await expect(page.locator('[data-pane="atlas"] .n.dim')).toHaveCount(0);
  await look(page, "follow-hover");
  await page.locator('[data-pane="note"] h1, [data-pane="note"] .titlerow').first().hover();
  await expect(note(page, "basics/bit")).not.toHaveClass(/\bmo-you\b/);
  await expect(page.locator('[data-pane="atlas"] .routes path.lit')).toHaveCount(0);
});

test("a note under the mouse on the map marks its links in the note", async ({ page }) => {
  test.skip(phone(page), "no mouse on a phone");
  await open(page, "coding/huffman-codes");
  await note(page, "basics/bit").hover();
  await expect(page.locator('[data-pane="note"] .cm-pointed')).toHaveText("bits");
  await page.mouse.move(2, 2);
  await expect(page.locator('[data-pane="note"] .cm-pointed')).toHaveCount(0);
});

test("a note named in Iso's answer, under the mouse, is outlined on the map", async ({ page }) => {
  test.skip(phone(page), "no mouse on a phone");
  await open(page, "coding/huffman-codes");
  const box = page.getByRole("textbox", { name: "Message Iso" });
  await box.fill(`what is it measured in, ${test.info().project.name}`);
  await box.press("Enter");
  const said = page.locator('[data-pane="iso"] .said a', { hasText: "Surprise" }).last();
  await expect(said).toBeVisible();
  await said.hover();
  await expect(note(page, "basics/surprise")).toHaveClass(/\bmo-you\b/);
  // The phrase and the part it cites are lit together (M24, G), whichever is pointed at.
  const part = page.locator('[data-pane="iso"] .turn').last().locator(".part", { hasText: "Surprise" });
  await expect(part).toHaveClass(/\blit\b/);
  await page.mouse.move(2, 2);
  await expect(part).not.toHaveClass(/\blit\b/);
  await part.hover();
  await expect(said).toHaveClass(/\blit\b/);
  await page.mouse.move(2, 2);
  await expect(note(page, "basics/surprise")).not.toHaveClass(/\bmo-you\b/);
});

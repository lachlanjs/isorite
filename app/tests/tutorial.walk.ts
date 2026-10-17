import { expect, test, type Page } from "@playwright/test";

const card = (page: Page) => page.getByRole("dialog", { name: "The tutorial" });
const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
async function at(page: Page, title: string) {
  await expect(card(page).locator("h2")).toHaveText(title, { timeout: 15_000 });
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

test("the tutorial walks through every part of isorite on the example base, with no server behind it", async ({ page }) => {
  test.setTimeout(180_000);
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(String(e)));
  await page.goto("./");

  // The Atlas, a note chosen and opened.
  await at(page, "This is the Atlas");
  await expect(page.locator("[data-note]")).not.toHaveCount(0);
  await expect(card(page).locator(".seg i")).toHaveCount(7);
  await look(page, "1-atlas");
  await card(page).getByRole("button", { name: "next" }).click();
  await at(page, "What a note rests on");
  await page.locator('[data-note="dmft/self-consistency-condition"]').click();
  await at(page, "Open it");
  await page.locator('[data-note="dmft/self-consistency-condition"]').click();

  // Iso in a note: the waiting answer kept; asked anew; a rewrite; the count opened.
  await at(page, "Iso writes in your note");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await at(page, "Ask Iso anywhere");
  await editor(page).getByText("Which one should I use?").click();
  await page.keyboard.press("End");
  await page.keyboard.press("Control+Enter");
  const prompt = page.getByRole("textbox", { name: "Ask Iso" });
  await expect(prompt).toHaveValue("what does each solver cost, and where does it fail?");
  await prompt.press("Enter");
  await at(page, "Keep, edit or remove");
  await expect(page.locator(".between[data-proposal]")).toContainText("Continuous-time quantum Monte Carlo");
  await look(page, "2-asked");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await at(page, "Rewrite a passage");
  await line(page, /^TODO/);
  await page.keyboard.press("Control+Enter");
  await expect(prompt).toHaveValue("answer my TODO");
  await prompt.press("Enter");
  await at(page, "Keep the change");
  await page.getByRole("button", { name: "[ keep all ]" }).click();
  await at(page, "What Iso is sent, and what it costs");
  await expect(editor(page)).toContainText("coexistence region ends");
  await page.locator(".bar .count .tokens").click();

  // A note for Iso: held on the map, yesterday's sent, its path, kept as a note.
  await at(page, "Hold to start a note");
  await page.getByRole("button", { name: "Close the breakdown" }).click();
  await expect(page.locator("[data-note]").first()).toBeVisible();
  await page.mouse.move(120, 700);
  await page.mouse.down();
  await page.waitForTimeout(900);
  await page.mouse.up();
  await at(page, "A note for Iso, waiting");
  await page.getByRole("button", { name: "send to Iso" }).click();
  await at(page, "Keep it as a note");
  await expect(page.locator(".between, .draft")).not.toHaveCount(0);
  await look(page, "4-note-for-iso");
  await page.getByLabel("Folder").fill("dmft");
  await page.getByRole("button", { name: "keep as a note" }).click();

  // The timeline: opened, the first moment shown, back to now.
  await at(page, "Every change is kept");
  await page.getByRole("button", { name: "timeline", exact: true }).click();
  await at(page, "The note as it was");
  await page.locator(".timeline .moment").first().click();
  await at(page, "Step through it");
  await look(page, "3-timeline");
  await page.getByRole("button", { name: "back to now" }).click();

  // An exercise: marked wrong, corrected, marked right; the squares and the map.
  await at(page, "An exercise is a note too");
  await line(page, /^So/);
  await page.getByRole("button", { name: "mark as answer" }).click();
  await page.getByRole("button", { name: "send for marking" }).click();
  await at(page, "Wrong, and where");
  await expect(page.locator(".cm-iso-wrong")).toHaveCount(1);
  await line(page, /^So/);
  await page.keyboard.type("So $\\Delta = t^2 G$.");
  await line(page, /^So/);
  await page.getByRole("button", { name: "mark as answer" }).click();
  await page.getByRole("button", { name: "mark it again" }).click();
  await at(page, "The squares moved");
  await expect(page.locator(".bar .pip.lv")).toHaveCount(1);
  await card(page).getByRole("button", { name: "next" }).click();
  await at(page, "And on the map");
  await expect(page.locator('[data-note="dmft/self-consistency-condition"]')).toHaveClass(/\bs1\b/);
  await card(page).getByRole("button", { name: "next" }).click();

  // Study, and an exercise asked for from a note's margin.
  await at(page, "Study");
  await card(page).getByRole("button", { name: "next" }).click();
  await at(page, "Ask for an exercise");
  await page.locator(".margin").getByRole("button", { name: "[ + an exercise ]" }).click();
  await page.getByRole("button", { name: "send to Iso" }).click();
  await page.getByRole("button", { name: "keep the exercise" }).click();

  // The keys, and the end.
  await at(page, "A few keys");
  await card(page).getByRole("button", { name: "next" }).click();
  await at(page, "That is isorite, so far");
  await card(page).getByRole("button", { name: "done" }).click();
  await expect(card(page)).toHaveCount(0);
  expect(failures).toEqual([]);
});

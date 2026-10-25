import { expect, test, type Page } from "@playwright/test";
import { setSwitch } from "./switches.ts";

// Iso's pane (M10): a conversation, sent with what you gave Iso, its look-ups told as they happen, kept in
// .isorite/, and stopped when asked.

const pane = (page: Page) => page.locator('[data-pane="iso"]');
const box = (page: Page) => page.getByRole("textbox", { name: "Message Iso" });
async function toIso(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
}
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

/** Iso's pane in its Context view: what you gave Iso, listed. On a phone, back to where you were after. */
async function showContext(page: Page, back?: "Note" | "Atlas") {
  const phone = (page.viewportSize()?.width ?? 1280) <= 760, nav = page.getByRole("navigation", { name: "Panes" });
  if (phone) await nav.getByRole("button", { name: /^Iso/ }).click();
  const ctx = page.locator('[data-pane="iso"]').getByRole("button", { name: "Context", exact: true });
  if ((await ctx.getAttribute("aria-pressed")) !== "true") await ctx.click();
  if (phone && back) {
    await nav.getByRole("button", { name: new RegExp(`^${back}`) }).click();
    // The row has scrolled back to the pane before anything is pressed in it.
    await expect.poll(async () => (await page.locator(`[data-pane="${back.toLowerCase()}"]`).boundingBox())?.x).toBe(0);
  }
  return page.getByRole("list", { name: "What you gave Iso" });
}

test("a turn in Ask mode: what you gave is shown with it, what Iso reads is told and opens the note, and the conversation is kept", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await page.locator('[data-note="basics/surprise"]').waitFor();
  // A fresh conversation for this test.
  await toIso(page);
  const fresh = pane(page).getByRole("button", { name: "A new conversation" });
  if (await fresh.isEnabled()) await fresh.click();
  // Given a passage from the note open.
  await page.getByRole("textbox", { name: "The note", exact: true }).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "send to Iso" }).click();
  await toIso(page);
  await box(page).fill(`look up what it is measured in, ${test.info().project.name}`);
  await box(page).press("Enter");
  const log = page.getByRole("log", { name: "The conversation with Iso" });
  await expect(log.locator(".turn").last().locator(".asked")).toHaveText(`look up what it is measured in, ${test.info().project.name}`);
  await expect(log.locator(".turn").last().locator(".gave")).toContainText("One fair coin toss");
  await expect(log.locator(".turn").last().locator(".look")).toContainText("Surprise");
  await expect(log.locator(".turn").last().locator(".said")).toContainText("It is measured in bits");
  await expect(log.locator(".turn").last().locator(".said .katex")).toBeVisible();
  await look(page, "iso-turn");

  // Kept: there after a reload.
  await page.reload();
  await toIso(page);
  await expect(log.locator(".turn").last().locator(".said")).toContainText("It is measured in bits");
  // A note it read opens in the Note pane.
  await log.locator(".turn").last().locator(".look").getByRole("button", { name: "Surprise" }).click();
  await expect(page).toHaveURL(/#\/n\/basics\/surprise$/);
});

test("a turn can be stopped, and a refusal is said plainly; the quill in Iso's header says whether it may edit the notes", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  const quill = pane(page).locator('.sw[data-switch="notes"]');
  await expect(quill).toHaveAttribute("aria-pressed", "false");
  await expect(quill).toHaveAttribute("title", "Iso may edit the notes (Alt+N)");
  await quill.click();
  await expect(quill).toHaveAttribute("aria-pressed", "true");
  await quill.click();
  await expect(quill).toHaveAttribute("aria-pressed", "false");
  // No terminal is attached here: the project's files and commands are not offered.
  await expect(pane(page).locator('.sw[data-switch="run"]')).toHaveCount(0);

  await box(page).fill("slow, please");
  await box(page).press("Enter");
  const log = page.getByRole("log", { name: "The conversation with Iso" });
  await expect(log.locator(".turn").last().locator(".doing")).toBeVisible();
  await pane(page).getByRole("button", { name: "Stop Iso" }).click();
  await expect(log.locator(".turn").last()).toHaveAttribute("data-state", "stopped");

  await box(page).fill("fail now");
  await box(page).press("Enter");
  await expect(log.locator(".turn").last().getByRole("alert")).toContainText("Iso could not answer");
});

test("with the notes switch on, Iso's change goes into the note, is marked as Iso's with provenance on and on the Atlas with Iso's context on, and the turn is undone", async ({ page }) => {
  const name = test.info().project.name, id = `basics/write-${name}`;
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  const headers = { "x-isorite-token": token, Origin: new URL(test.info().project.use.baseURL!).origin };
  await page.request.post(`api/note?id=${id}`, { data: { text: `---\ntype: Concept\ntitle: Write ${name}\n---\n\nPlain text. The rest of this line is yours, and stays as it was.\n` }, headers });
  await page.goto(`#/n/${id}`);
  await expect(page.getByRole("textbox", { name: "The note", exact: true })).toContainText("Plain text. The rest");
  await toIso(page);
  await setSwitch(page, "notes", true);
  if (!test.info().project.name.startsWith("phone")) await setSwitch(page, "context", true);
  await box(page).fill(`edit ${id}`);
  await box(page).press("Enter");
  const turn = page.getByRole("log", { name: "The conversation with Iso" }).locator(".turn").last();
  await expect(turn.locator(".change")).toContainText(`changed Write ${name} +1 −1`);
  await expect(turn).toHaveAttribute("data-state", "done");
  const file = async () => ((await (await page.request.get(`api/note?id=${id}`)).json()) as { text: string }).text;
  expect(await file()).toContain("Plain text, and Iso's words.");
  // With Iso's context on, the Atlas shows the note as changed by Iso.
  if (test.info().project.name.startsWith("phone")) { await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Atlas/ }).click(); await setSwitch(page, "context", true); }
  await expect(page.locator(`[data-note="${id}"]`)).toHaveClass(/\bchanged\b/);
  await look(page, "iso-write");

  // Opened from the change, the note has provenance on: Iso's words are marked; yours are not. (A passage mostly
  // Iso's would be Iso's whole.)
  if (test.info().project.name.startsWith("phone")) await toIso(page);
  await turn.locator(".change").getByRole("button").click();
  await expect(page.locator('.sw[data-switch="provenance"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".cm-iso-by-iso")).toHaveText([", and Iso's words"]);
  await look(page, "note-provenance");

  // Undone: the note as it was.
  await toIso(page);
  await turn.getByRole("button", { name: "Undo this turn's changes" }).click();
  await expect(turn.locator(".undone")).toContainText(`Write ${name} put back`);
  await expect.poll(file).toContain("\nPlain text. The rest");
  await setSwitch(page, "notes", false);
});

test("with the notes switch on, moving a note is asked first, and not allowed it stays", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await setSwitch(page, "notes", true);
  await box(page).fill(`move basics/bit to units/bit-${test.info().project.name}`);
  await box(page).press("Enter");
  const asks = pane(page).getByRole("group", { name: "Iso asks before it does this" });
  await expect(asks).toContainText(`Iso wants to move The bit to units/bit-${test.info().project.name}.`);
  await asks.getByRole("button", { name: "Don't allow" }).click();
  await expect(asks).toContainText("Not allowed.");
  expect((await page.request.get("api/note?id=basics/bit")).ok()).toBe(true);
  await setSwitch(page, "notes", false);
});

test("with a note's Understanding note open, it goes with what you ask; Iso's reading is written in it, beside your scratchpad", async ({ page }) => {
  const name = test.info().project.name, id = `channels/understand-${name}`;
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  await page.request.post(`api/note?id=${id}`, { data: { text: `---\ntype: Concept\ntitle: Rate ${name}\n---\n\nBits a use.\n` }, headers: { "x-isorite-token": token, Origin: new URL(test.info().project.use.baseURL!).origin } });
  await page.goto(`#/n/${id}`);
  await expect(page.getByRole("textbox", { name: "The note", exact: true })).toContainText("Bits a use.");
  // The sprig in the Note pane's header shows the note's Understanding note in its place.
  const note = page.locator('[data-pane="note"]');
  await note.getByRole("button", { name: "Understanding note", exact: true }).click();
  await expect(note.locator(".u")).toBeVisible();
  await toIso(page);
  const tray = await showContext(page);
  await expect(tray.getByRole("listitem")).toHaveText([new RegExp(`^◇ Understanding · Rate ${name} \\d+`)]);
  await pane(page).getByRole("button", { name: "Context", exact: true }).click();
  await box(page).fill(`understand ${id}`);
  await box(page).press("Enter");
  const turn = page.getByRole("log", { name: "The conversation with Iso" }).locator(".turn").last();
  await expect(turn).toHaveAttribute("data-state", "done");

  // Iso's reading, and your scratchpad, kept.
  if (test.info().project.name.startsWith("phone")) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Note/ }).click();
  await expect(note.locator(".reading")).toHaveText("You can say what it measures, and why.");
  // The scratchpad is the note editor (V9): Markdown as you type.
  await note.getByLabel("Scratchpad").fill(`Mine, **${name}**.`);
  await expect(note.locator(".u h2 .state")).toHaveText("saved", { timeout: 8000 });
  await page.screenshot({ path: `test-results/screens/${name}-understanding.png`, fullPage: true });
  await page.reload();
  await expect(page.locator('[data-pane="note"]').getByLabel("Scratchpad")).toContainText(`Mine, ${name}.`);
  await expect(page.locator('[data-pane="note"] .pad .cm-lp-strong').first()).toContainText(name);
  await page.locator('[data-pane="note"]').getByRole("button", { name: "Understanding note", exact: true }).click();
});

test("the count under Iso's box opens the Context view: what the next turn is sent, part by part; an earlier turn can be left out", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  // The last conversation comes up as the page opens (earlier tests made one); a new one is begun.
  await expect(page.getByRole("log", { name: "The conversation with Iso" }).locator(".turn").first()).toBeVisible();
  await pane(page).getByRole("button", { name: "A new conversation" }).click();
  await expect(page.getByRole("log", { name: "The conversation with Iso" }).locator(".turn")).toHaveCount(0);
  await box(page).fill("what is a bit?");
  await box(page).press("Enter");
  await expect(page.getByRole("log", { name: "The conversation with Iso" }).locator(".turn").last()).toHaveAttribute("data-state", "done");
  await pane(page).getByRole("button", { name: /tokens$/ }).click();
  const parts = pane(page).getByRole("region", { name: "What Iso is sent" });
  await expect(page.getByRole("log", { name: "The conversation with Iso" })).toHaveCount(0);
  await expect(parts.locator(".part").first()).toContainText("instructions and tools");
  await expect(parts).toContainText("earlier in this conversation1 turn");
  await look(page, "iso-context");
  const sw = parts.getByRole("switch", { name: "Send: what is a bit?" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(parts).toContainText("earlier in this conversation");
  await expect(parts.locator(".part").nth(1)).not.toContainText("1 turn");
});

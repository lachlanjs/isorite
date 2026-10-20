import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES, REPLY, ROOT } from "./serve.ts";

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const onDisk = (id: string) => readFileSync(join(NOTES, `${id}.md`), "utf8");
const phone = () => test.info().project.name.startsWith("phone");
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

/** A note of this test's own, with two paragraphs; the page opened on it. */
async function open(page: Page, what: string): Promise<{ id: string; text: string }> {
  const id = `iso/${what}-${test.info().project.name}`;
  const text = `---\ntype: Concept\ntitle: Entropy ${what}\n---\n\nThe average surprise of a source.\n\nIt is largest when every symbol is equally likely.\n`;
  writeFileSync(join(NOTES, `${id}.md`), text, { flag: "w" });
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The average surprise of a source.");
  return { id, text };
}

/** Open the prompt under the first paragraph: on the empty line after it (Ctrl+Enter in a paragraph asks the
 *  paragraph itself), by Ctrl+Enter on a desktop, the field at the foot on a phone. */
async function prompt(page: Page, asked: string) {
  await editor(page).getByText("It is largest when every symbol is equally likely.").click({ position: { x: 2, y: 4 } });
  await page.keyboard.press("ArrowUp");
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
  const field = page.getByRole("textbox", { name: "Ask Iso" });
  await expect(field).toBeFocused();
  await field.fill(asked);
  await field.press("Enter");
}

test.beforeAll(() => { mkdirSync(join(NOTES, "iso"), { recursive: true }); });

test("Iso's text arrives between dotted rules, is not in the file until kept, and is still there after a reload", async ({ page }) => {
  const { id, text } = await open(page, "ask");
  await prompt(page, "say what it is measured in");

  const block = page.locator(".between[data-proposal]");
  await expect(block).toBeVisible();
  await expect(block.locator("strong")).toHaveText("bits");
  await expect(block.locator(".katex-display")).toBeVisible();
  await expect(block.getByRole("link", { name: "Surprise" })).toBeVisible();
  // It sits under the paragraph the cursor was in, above the next.
  const order = await page.evaluate(() => [...document.querySelectorAll(".cm-content > *")].map((el) => (el.classList.contains("cm-overlay") ? "ISO" : el.textContent)).filter(Boolean));
  expect(order).toEqual(["The average surprise of a source.", "ISO", "It is largest when every symbol is equally likely."]);
  // The note's file is byte for byte what it was.
  expect(onDisk(id)).toBe(text);
  await look(page, "proposal");

  // Closing the browser with it waiting, and coming back: it is there again, and the file is still untouched.
  await page.reload();
  await expect(page.locator(".between[data-proposal] strong")).toHaveText("bits");
  expect(onDisk(id)).toBe(text);

  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("saved");
  expect(onDisk(id)).toBe(text.replace("source.\n\n", () => `source.\n\n${REPLY}\n\n`));
  // Kept, it is ordinary prose of the note.
  await expect(editor(page).locator(".cm-lp-strong")).toHaveText("bits");
  await expect(editor(page).locator(".katex-display")).toBeVisible();
});

test("a question written in the note is asked as it stands: Iso's answer comes under it, and the question stays yours", async ({ page }) => {
  const { id, text } = await open(page, "in-text");
  // The cursor in a paragraph, and Ctrl+Enter (on a phone, ask Iso here): the paragraph is what is asked, with no prompt.
  await editor(page).getByText("The average surprise of a source.").click();
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
  await expect(page.getByRole("textbox", { name: "Ask Iso" })).toHaveCount(0);
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
  const order = await page.evaluate(() => [...document.querySelectorAll(".cm-content > *")].map((el) => (el.classList.contains("cm-overlay") ? "ISO" : el.textContent)).filter(Boolean));
  expect(order).toEqual(["The average surprise of a source.", "ISO", "It is largest when every symbol is equally likely."]);
  expect(onDisk(id)).toBe(text);
  const journal = await (await page.request.get(`api/journal?id=${id}`)).json() as { kind: string; asked?: string }[];
  expect(journal.find((e) => e.kind === "proposal")?.asked).toBe("The average surprise of a source.");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "remove" }).click();
});

test("Iso's text can be edited before it is kept, or removed and leave the note as it was", async ({ page }) => {
  const { id, text } = await open(page, "edit");
  await prompt(page, "say what it is measured in");
  const block = page.locator(".between[data-proposal]");
  await block.getByRole("button", { name: "edit" }).click();
  await block.getByRole("textbox", { name: "Iso's text, to edit" }).fill("In bits, to base 2.");
  await block.getByRole("button", { name: "done" }).click();
  await expect(block).toContainText("In bits, to base 2.");
  expect(onDisk(id)).toBe(text);
  await page.reload(); // the edit is kept across a reload too
  await expect(page.locator(".between[data-proposal]")).toContainText("In bits, to base 2.");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  expect(onDisk(id)).toBe(text.replace("source.\n\n", "source.\n\nIn bits, to base 2.\n\n"));

  await prompt(page, "and again");
  await page.locator(".between[data-proposal]").getByRole("button", { name: "remove" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  expect(onDisk(id)).toBe(text.replace("source.\n\n", "source.\n\nIn bits, to base 2.\n\n"));
  const journal = await (await page.request.get(`api/journal?id=${id}`)).json() as { kind: string; why?: string }[];
  expect(journal.map((e) => e.why ?? e.kind)).toEqual(["start", "proposal", "revise", "keep", "proposal", "discard"]);
});

test("what Iso looks up is told while it works; it can be stopped, and a refusal is said plainly", async ({ page }) => {
  const { id, text } = await open(page, "work");
  await prompt(page, "look it up first");
  await expect(page.locator(".between.working")).toContainText("Read Surprise");
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
  await page.locator(".between[data-proposal]").getByRole("button", { name: "remove" }).click();

  await prompt(page, "be slow about it");
  await expect(page.locator(".between.working")).toContainText("Iso is writing");
  await look(page, "working");
  await page.getByRole("button", { name: "stop", exact: true }).click();
  await expect(page.locator(".between")).toHaveCount(0);

  await prompt(page, "fail this one");
  await expect(page.getByRole("alert")).toContainText("the scripted provider was told to fail");
  await page.getByRole("button", { name: "dismiss" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  expect(onDisk(id)).toBe(text);
});

test("typing in the note while Iso's text waits does not disturb it, and it is kept where it belongs", async ({ page }) => {
  const { id } = await open(page, "typing");
  await prompt(page, "say what it is measured in");
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
  await editor(page).getByText("It is largest when every symbol is equally likely.").click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("\nA closing line typed meanwhile.");
  await expect(page.getByRole("status")).toHaveText("saved");
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
  await page.locator(".between[data-proposal]").getByRole("button", { name: "keep" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  expect(onDisk(id)).toContain("source.\n\nIt is measured in **bits**");
  expect(onDisk(id)).toContain("equally likely.\n\nA closing line typed meanwhile.");
});

test("settings are behind the logo: the ground, and a key that goes in and is not shown again", async ({ page }) => {
  await page.goto("#/notes");
  await page.getByRole("button", { name: "isorite: settings" }).click();
  const menu = page.getByRole("dialog", { name: "Settings" });
  await expect(menu).toContainText("Asked through scripted.");
  await look(page, "settings");

  await menu.getByRole("radio", { name: "quartz" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ground", "quartz");
  await menu.getByRole("radio", { name: "lapis" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-ground", "lapis");
  await menu.getByRole("radio", { name: "the system's" }).click();
  await expect(page.locator("html")).not.toHaveAttribute("data-ground", /.+/);

  const secret = `sk-test-${test.info().project.name}`;
  await menu.getByLabel("Provider key").fill(secret);
  await menu.getByRole("button", { name: "hold it" }).click();
  await expect(menu).toContainText("A key is held on this device.");
  await expect(menu.getByLabel("Provider key")).toHaveValue("");
  expect(await page.content()).not.toContain(secret);
  expect(readFileSync(join(ROOT, "config", "isorite", "config.toml"), "utf8")).toContain(secret);
  await menu.getByRole("button", { name: "forget it" }).click();
  await expect(menu).toContainText("No key is held yet");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("a key is made by signing in at the provider, and comes back to where you were", async ({ page }) => {
  await page.goto("#/atlas");
  await page.getByRole("button", { name: "isorite: settings" }).click();
  const menu = page.getByRole("dialog", { name: "Settings" });
  await menu.getByRole("button", { name: "sign in at scripted for a new key" }).click();
  // The scripted sign-in sends you straight back with a code; the engine exchanges it for the key.
  await expect(menu).toContainText("Signed in at scripted: a key was made for isorite");
  await expect(menu).toContainText("A key is held on this device.");
  await look(page, "settings-signed-in");
  expect(page.url()).not.toContain("code=");
  expect(new URL(page.url()).hash).toBe("#/atlas");
  expect(await page.content()).not.toContain("sk-scripted-made");
  expect(readFileSync(join(ROOT, "config", "isorite", "config.toml"), "utf8")).toContain("sk-scripted-made");
  // A code that is not ours, or used twice, is refused, and said so.
  await page.goto("/?code=code-x&state=not-ours#/notes");
  await expect(page.getByRole("dialog", { name: "Settings" })).toContainText("This sign-in was not begun here");
  await page.getByRole("dialog", { name: "Settings" }).getByRole("button", { name: "forget it" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toHaveCount(0);
});

test("a prompt sent twice in a hurry is asked once", async ({ page }) => {
  const { id } = await open(page, "twice");
  await editor(page).getByText("It is largest when every symbol is equally likely.").click({ position: { x: 2, y: 4 } });
  await page.keyboard.press("ArrowUp");
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
  const field = page.getByRole("textbox", { name: "Ask Iso" });
  await field.fill("say what it is measured in");
  // Two Enters before the page can have heard anything back.
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(page.locator(".between[data-proposal]")).toHaveCount(1);
  await expect(page.locator(".between")).toHaveCount(1);
  const journal = await (await page.request.get(`api/journal?id=${id}`)).json() as { kind: string }[];
  expect(journal.filter((e) => e.kind === "proposal")).toHaveLength(1);
});

/** Select a word and ask: with text selected, the prompt is for a rewrite of it, and more can be chosen. */
async function choosing(page: Page, first: string) {
  await word(page, first);
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
  await expect(page.getByText("rewriting 1 passage")).toBeVisible();
}
/** Select one word of the note by double-clicking it. */
const word = (page: Page, text: string) => page.evaluate((w) => {
  const walker = document.createTreeWalker(document.querySelector(".cm-content")!, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const at = n.textContent!.indexOf(w);
    if (at < 0 || (n.parentElement as HTMLElement).closest(".cm-overlay, .cm-iso-change")) continue;
    const range = document.createRange();
    range.setStart(n, at); range.setEnd(n, at + w.length);
    const r = range.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }
  throw new Error(`"${w}" is not in the note`);
}, text).then(({ x, y }) => page.mouse.dblclick(x, y));

test("several passages are chosen anywhere in the note and rewritten; each change is kept or removed on its own", async ({ page }) => {
  const { id, text } = await open(page, "regions");
  // Passages in two different paragraphs, each a word inside a sentence.
  await choosing(page, "surprise");
  await expect(page.locator(".cm-iso-picked")).toHaveText(["surprise"]);
  await word(page, "largest");
  await expect(page.locator(".cm-iso-picked")).toHaveText(["surprise", "largest"]);
  await expect(page.getByText(/rewriting 2 passages/)).toBeVisible();
  // One chosen by mistake is dropped by clicking it, and chosen again.
  await page.locator(".cm-iso-picked", { hasText: "largest" }).click();
  await expect(page.getByText(/rewriting 1 passage/)).toBeVisible();
  await word(page, "largest");
  await expect(page.getByText(/rewriting 2 passages/)).toBeVisible();
  await look(page, "choosing");

  const field = page.getByRole("textbox", { name: "Ask Iso" });
  await field.fill("say these another way");
  await field.press("Enter");

  // Each change is set in the text after the passage it would replace, which is struck through.
  const changes = page.locator("[data-change]");
  await expect(changes).toHaveCount(2);
  await expect(changes.nth(0).locator(".new")).toHaveText("rewritten 1");
  await expect(changes.nth(1).locator(".new")).toHaveText("rewritten 2");
  await expect(page.locator(".cm-iso-old")).toHaveText(["surprise", "largest"]);
  // What Iso says of them is in its usual place, kept or removed as usual. What it wrote outside its marks is not shown.
  const said = page.locator(".between[data-proposal]");
  await expect(said.locator(".said")).toHaveText("I rewrote what you chose, plainly.");
  await expect(page.getByText("Here is the rewrite.")).toHaveCount(0);
  await expect(page.getByText("2 changes from Iso waiting")).toBeVisible();
  expect(onDisk(id)).toBe(text);
  await look(page, "changes");

  // Keep the first: that word changes in the file, and nothing else.
  await changes.nth(0).getByRole("button", { name: "Keep this change" }).click();
  await expect(changes).toHaveCount(1);
  expect(onDisk(id)).toBe(text.replace("average surprise", "average rewritten 1"));
  // Remove the second: the note keeps its own word.
  await changes.nth(0).getByRole("button", { name: "Remove this change" }).click();
  await expect(changes).toHaveCount(0);
  await expect(page.locator(".cm-iso-old")).toHaveCount(0);
  expect(onDisk(id)).toBe(text.replace("average surprise", "average rewritten 1"));
  // Iso's word on it is still there, and is removed like any text of its.
  await said.getByRole("button", { name: "remove" }).click();
  await expect(page.locator(".between")).toHaveCount(0);
  const journal = await (await page.request.get(`api/journal?id=${id}`)).json() as { kind: string; why?: string; region?: number; form?: string }[];
  expect(journal.map((e) => [e.why ?? e.form ?? e.kind, e.region])).toEqual([["start", undefined], ["rewrite", undefined], ["insert", undefined], ["keep", 0], ["discard", 1], ["discard", undefined]]);
});

test("text selected before asking is the first passage; changes wait across a reload and are kept all at once", async ({ page }) => {
  const { id, text } = await open(page, "regions-all");
  await editor(page).getByText("The average surprise of a source.").click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  if (phone()) await page.getByRole("button", { name: "ask Iso here" }).click();
  else await page.keyboard.press("Control+Enter");
  await expect(page.getByText(/rewriting 1 passage/)).toBeVisible();
  await expect(page.locator(".cm-iso-picked")).toHaveText("The average surprise of a source.");
  await word(page, "symbol");
  const field = page.getByRole("textbox", { name: "Ask Iso" });
  await field.fill("another way, and be quiet about it");
  await field.press("Enter");
  await expect(page.locator("[data-change]")).toHaveCount(2);
  await expect(page.locator(".between")).toHaveCount(0); // it said nothing, so there is no block
  await page.reload();
  await expect(page.locator("[data-change]")).toHaveCount(2);
  expect(onDisk(id)).toBe(text);
  await page.getByRole("button", { name: "keep all" }).click();
  await expect(page.locator("[data-change]")).toHaveCount(0);
  expect(onDisk(id)).toBe(text.replace("The average surprise of a source.", "rewritten 1").replace("symbol", "rewritten 2"));
});

test("a change whose passage you have edited since is told of at the foot, and the rest are removed at once", async ({ page }) => {
  const { id, text } = await open(page, "regions-lost");
  await choosing(page, "surprise");
  await word(page, "largest");
  await page.getByRole("textbox", { name: "Ask Iso" }).fill("another way, quiet");
  await page.getByRole("textbox", { name: "Ask Iso" }).press("Enter");
  await expect(page.locator("[data-change]")).toHaveCount(2);
  // The second passage is typed over.
  await word(page, "largest");
  await page.keyboard.type("greatest");
  await expect(page.getByRole("status").filter({ hasText: "saved" })).toBeVisible();
  await expect(page.locator("[data-change]")).toHaveCount(1);
  await expect(page.getByText("One change Iso offered is for text that is no longer in the note as it was")).toBeVisible();
  await page.getByRole("button", { name: "remove all" }).click();
  await expect(page.locator("[data-change]")).toHaveCount(0);
  await expect(page.locator(".between")).toHaveCount(0);
  await expect.poll(() => onDisk(id)).toBe(text.replace("largest", "greatest"));
});

test("the header counts what Iso would be sent and what the session has cost; the count opens the panel, where parts are switched off and the tier is chosen", async ({ page }) => {
  await open(page, "count");
  const count = page.getByRole("button", { name: /^Context: / });
  await expect(count).toBeVisible();
  const spent = async () => Number((await page.getByLabel(/This session has cost/).getAttribute("aria-label"))!.replace(/[^0-9.]/g, ""));
  const before = await spent();
  await prompt(page, "say what it is measured in");
  await expect(page.locator(".between[data-proposal]")).toBeVisible();
  // The scripted provider charges $0.0123 a call.
  // The scripted provider charges $0.0123 a call; past ten cents the header shows whole cents.
  await expect.poll(async () => (await spent()) - before).toBeGreaterThan(0.004);
  expect((await spent()) - before).toBeLessThan(0.021);

  await count.click();
  const box = page.getByRole("dialog", { name: "Context" });
  for (const part of ["instructions and tools", "study record", "this note", "notes this one links to", "earlier in this session"]) await expect(box).toContainText(part);
  await expect(box).toContainText("Entropy count");
  await expect(box).toContainText("none: it links to no other note");
  // The earlier exchange, by the note and what was asked, with its switch.
  // (The test server's session holds every test's exchanges; a note written straight to disk may be named by its path.)
  const mine = (on: string) => new RegExp(`^(Entropy count|iso/count-${test.info().project.name}): say what it is measured in: ${on}$`);
  const exchange = box.getByRole("switch", { name: mine("sent") });
  await expect(exchange).toHaveAttribute("aria-checked", "true");
  // The parts and the pieces sum to the count.
  const tokens = (t: string) => (t.endsWith("k") ? Number(t.slice(0, -1)) * 1000 : Number(t));
  const sum = async () => (await box.locator(".part .n, .head .total").allTextContents()).map(tokens).reduce((a, b) => a + b, 0);
  const total = tokens((await count.textContent())!);
  expect(Math.abs((await sum()) - total)).toBeLessThanOrEqual(300); // each is rounded to a tenth of a thousand
  await look(page, "context");

  // Switched off, the exchange is not counted, and the count says so.
  await exchange.click();
  await expect(box.getByRole("switch", { name: mine("not sent") })).toHaveAttribute("aria-checked", "false");
  // (That the count falls is the engine's test: here the count is rounded, and other tests share the session.)
  await expect(box.locator(".item.off")).toHaveCount(1);
  // The tier is chosen here, once for every note.
  await box.getByRole("radio", { name: "max" }).click();
  await expect(box.getByRole("radio", { name: "max" })).toHaveAttribute("aria-checked", "true");
  await box.getByRole("radio", { name: "mid" }).click();

  await box.getByRole("button", { name: "clear the conversation" }).click();
  await expect(box).toContainText("nothing asked yet");
  await page.keyboard.press("Escape");
  await expect(box).toHaveCount(0);
  await expect(page.locator(".between[data-proposal]")).toBeVisible(); // clearing took nothing out of the note
});

test("a terminal agent's edit to a note waits in it as Iso's changes do, says whose it is, and is kept the same way", async ({ page, baseURL }) => {
  const { id, text } = await open(page, "agent");
  const { token } = await (await page.request.get("api/session")).json() as { token: string };
  const proposed = await page.request.post("api/agent/propose", {
    headers: { Origin: new URL(baseURL!).origin, "x-isorite-token": token },
    data: { agent: "opencode", session: `ses-${test.info().project.name}`, note: `${id}.md`, asked: "say it plainly", edit: { oldString: "The average surprise", newString: "How surprised you are, on average," } },
  });
  expect(proposed.ok()).toBe(true);
  const change = page.locator("[data-change]");
  await expect(change).toHaveCount(1);
  await expect(change.locator(".new")).toHaveText("How surprised you are, on average,");
  await expect(page.locator(".cm-iso-old")).toHaveText("The average surprise");
  await expect(change.locator(".who")).toHaveText("OpenCode");
  await expect(change.locator(".who")).toHaveAttribute("title", "say it plainly");
  await expect(page.getByText("1 change from OpenCode waiting")).toBeVisible();
  expect(onDisk(id)).toBe(text);
  await look(page, "agent-change");
  await change.getByRole("button", { name: "Keep this change" }).click();
  await expect(change).toHaveCount(0);
  expect(onDisk(id)).toBe(text.replace("The average surprise", "How surprised you are, on average,"));
});

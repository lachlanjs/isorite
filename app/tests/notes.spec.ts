import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES } from "./serve.ts";

type Entry = { kind: string; why?: string; who: string; text?: string };

/** The Note pane: the Atlas stands beside it with links of its own (M10). */
const notePane = (page: Page) => page.locator('[data-pane="note"]');
const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const saved = (page: Page) => expect(page.getByRole("status")).toHaveText("saved");
const file = async (page: Page, id: string) => ((await (await page.request.get(`api/note?id=${id}`)).json()) as { text: string }).text;
const journal = async (page: Page, id: string) => (await (await page.request.get(`api/journal?id=${id}`)).json()) as Entry[];
/** A screenshot to be looked at, and a check that nothing runs off the side of the page. */
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

test("a note with maths and a typed link is written, saved, and there when reopened", async ({ page }) => {
  const name = test.info().project.name, id = `basics/entropy-${name}`;
  await page.goto("");
  await expect(notePane(page).getByRole("link", { name: "Surprise" })).toBeVisible();
  await look(page, "notes");

  await page.getByRole("button", { name: "new note", exact: true }).click();
  await page.getByPlaceholder("Entropy").fill(`Entropy ${name}`);
  await page.getByLabel("folder").fill("basics");
  await expect(page.getByText(`${id}.md`)).toBeVisible();
  await page.getByRole("button", { name: "make it" }).click();

  await expect(page.getByLabel("Title")).toHaveValue(`Entropy ${name}`);
  await editor(page).click();
  await page.keyboard.type("The average surprise of a source.\n\n$$\nH = -\\sum_x p(x) \\log p(x)\n$$\n\nIt rests on [[Surpr");
  await page.getByRole("option", { name: /Surprise/ }).click();
  // The link's kind, set on the link without touching its Markdown: Alt-1 is "requires".
  await page.keyboard.press("Alt+1");
  await page.keyboard.type(" and inline $p(x)$ too.\n\nA second paragraph, to see the space between two.\n\n```python\ndef entropy(p):\nreturn -sum(q * log2(q) for q in p)\n```");
  await saved(page);
  expect(await file(page, id)).toContain('[Surprise](/basics/surprise.md "requires")');

  await page.reload();
  await expect(page.getByLabel("Title")).toHaveValue(`Entropy ${name}`);
  await expect(page.locator(".cm-lp-maths .katex-display")).toBeVisible();
  await expect(page.locator(".cm-lp-imaths .katex")).toBeVisible();
  await expect(page.locator(".cm-lp-link")).toHaveText("Surprise");
  await expect(page.getByText("](/basics/surprise.md")).toHaveCount(0); // the markup is hidden away from the cursor
  await look(page, "note");

  // The journal: the note began as yours, and every later entry is an edit of yours that replays to the file.
  const entries = await journal(page, id);
  expect(entries[0]).toMatchObject({ kind: "change", why: "start", who: "you" });
  expect(entries.length).toBeGreaterThan(1);
  expect(entries.slice(1).every((e) => e.kind === "change" && e.why === "edit" && e.who === "you")).toBe(true);

  // The header says where you are; the link in the list leads back here.
  await expect(page.locator("header .path")).toHaveText(`information-theory/Entropy ${name}`);
  // The base's name opens the list (V2), in the Note pane.
  await page.locator("header .path").getByRole("link", { name: "information-theory", exact: true }).click();
  await notePane(page).getByRole("link", { name: `Entropy ${name}` }).click();
  await expect(page.getByLabel("Title")).toHaveValue(`Entropy ${name}`);
});

test("the list narrows as you type, by title and by what the notes say", async ({ page }) => {
  await page.goto("");
  const find = page.getByRole("searchbox", { name: "Find a note" });
  await find.fill("bit");
  await expect(notePane(page).getByRole("link", { name: /The bit/ })).toBeVisible();
  await expect(notePane(page).getByRole("link", { name: /^Surprise/ })).toHaveCount(0);
  await find.fill("coin toss");
  await expect(page.getByText("in the text")).toBeVisible();
  await expect(notePane(page).getByRole("link", { name: /The bit/ })).toBeVisible();
  await find.fill("zzzz");
  await expect(page.getByText("No note matches.")).toBeVisible();
});

test("the details are hidden until asked for, and change only their own lines of the file", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await expect(page.locator(".cm-lp-table table")).toBeVisible(); // a table is drawn as one
  const before = await file(page, "basics/bit");
  await page.evaluate(() => localStorage.removeItem("isorite.details"));
  await expect(page.getByLabel("description")).toHaveCount(0);
  await page.getByRole("button", { name: "details" }).click();
  await expect(page.getByLabel("tags")).toHaveValue("units");
  const said = `Said on ${test.info().project.name}.`;
  await page.getByLabel("description").fill(said);
  await saved(page);
  const after = await file(page, "basics/bit");
  expect(after).toContain(`description: ${said}`);
  expect(after).toContain("# kept as written\ntags: [units]"); // the comment and the other fields are as they were
  expect(after.split("---\n").at(-1)).toBe(before.split("---\n").at(-1)); // and so is the body
  await look(page, "details");

  // The source is the file itself.
  await page.getByRole("button", { name: "source" }).click();
  await expect(page.getByRole("textbox", { name: "The note's file" })).toContainText("# kept as written");
  await page.getByRole("button", { name: "details" }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "source" }).click();
  await page.getByRole("button", { name: "details" }).click();
  await expect(page.getByLabel("description")).toHaveCount(0);
});

test("a note changed elsewhere while you write is offered as a choice, and nothing is overwritten", async ({ page }) => {
  const name = test.info().project.name, id = `channels/capacity-${name}`;
  const made = await page.request.get("api/session").then((r) => r.json()) as { token: string };
  const mine = `---\ntype: Concept\ntitle: Capacity ${name}\n---\n\nThe most a channel carries.\n`;
  await page.request.post(`api/note?id=${id}`, { data: { text: mine }, headers: { "x-isorite-token": made.token, Origin: new URL(test.info().project.use.baseURL!).origin } });
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The most a channel carries.");

  const theirs = mine + "\nWritten in another editor.\n";
  writeFileSync(join(NOTES, `${id}.md`), theirs);
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Typed here meanwhile.");
  await expect(notePane(page).getByRole("alert")).toContainText("changed somewhere else");
  expect(await file(page, id)).toBe(theirs);
  await look(page, "choice");

  await page.getByRole("button", { name: "take theirs" }).click();
  await expect(editor(page)).toContainText("Written in another editor.");
  await expect(editor(page)).not.toContainText("Typed here meanwhile.");
  await saved(page);
  // Their change is in the journal as made elsewhere.
  expect((await journal(page, id)).map((e) => e.who)).toEqual(["you", "external"]);

  // And the other way: keep what was written here.
  writeFileSync(join(NOTES, `${id}.md`), mine);
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("Mine stays.");
  await page.getByRole("button", { name: "keep mine" }).click();
  await saved(page);
  expect(await file(page, id)).toContain("Mine stays.");
});

test("what is typed and not yet saved survives the tab closing", async ({ page, context }) => {
  const name = test.info().project.name;
  await page.goto("#/n/basics/surprise");
  await editor(page).click();
  await page.keyboard.press("Control+End");
  // The server stops answering saves; the page is closed before any gets through.
  await context.route("**/api/note?*", (route) => (route.request().method() === "PUT" ? route.abort() : route.continue()));
  await page.keyboard.type(`Kept for ${name}.`);
  await expect(page.getByRole("status")).toContainText("not saved");
  await page.close();
  await context.unroute("**/api/note?*");
  const again = await context.newPage();
  await again.goto("#/n/basics/surprise");
  await expect(editor(again)).toContainText(`Kept for ${name}.`);
  await saved(again);
  expect(await file(again, "basics/surprise")).toContain(`Kept for ${name}.`);
});

test("a passage chosen in a note is sent to Iso; the notes open over the note and close when one is chosen", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  await editor(page).click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "send to Iso" }).click();
  await expect(page.getByRole("list", { name: "What Iso is sent" }).getByRole("listitem")).toHaveText([/^“An outcome of probability/]);
  await expect(page.getByRole("button", { name: "send to Iso" })).toHaveCount(0);

  await page.getByRole("button", { name: "All notes" }).click();
  await expect(page.getByRole("searchbox", { name: "Find a note" })).toBeVisible();
  await notePane(page).getByRole("link", { name: "The bit" }).click();
  await expect(page).toHaveURL(/#\/n\/basics\/bit$/);
  await expect(page.getByRole("searchbox", { name: "Find a note" })).toHaveCount(0);
});

test("the parts, the atlas pane and study page, and a note that is not there", async ({ page }) => {
  await page.goto("#/parts");
  await expect(page.getByRole("button", { name: "keep" })).toBeVisible();
  await look(page, "parts");
  await page.goto("#/atlas");
  await expect(page.getByRole("application", { name: "The atlas: the map of the base" })).toBeVisible();
  // An old link to the Atlas brings its pane forward (M10).
  await expect(page.getByRole("region", { name: "Atlas" })).toHaveClass(/focus/);
  await look(page, "atlas");
  await page.goto("#/study");
  await expect(page.getByText("study · next for you")).toBeVisible();
  await page.goto("#/n/no/such-note");
  await expect(page.getByText("There is no note at")).toBeVisible();
});

test("a note is sent to the terminal's agent with what you want of it; it says when an agent has it, and when none does", async ({ page, baseURL }) => {
  await page.goto("#/n/basics/surprise");
  await expect(page.getByRole("textbox", { name: "The note", exact: true })).toContainText("carries");
  const origin = new URL(baseURL!).origin;
  // A terminal agent, as isorite term's plugin is: it hears what is sent and says it has it.
  const abort = new AbortController(), heard: { id: string; note: string; passage?: string; said: string }[] = [];
  const { token } = await (await page.request.get("api/session")).json() as { token: string };
  const agent = (async () => {
    const response = await fetch(`${origin}/api/events`, { signal: abort.signal });
    let buffer = "";
    for await (const chunk of response.body!) {
      buffer += new TextDecoder().decode(chunk as Uint8Array);
      for (let end; (end = buffer.indexOf("\n\n")) >= 0; buffer = buffer.slice(end + 2)) {
        const block = buffer.slice(0, end);
        if (!block.startsWith("event: agent-sent")) continue;
        const sent = JSON.parse(block.match(/^data: (.*)$/m)![1]!) as { id: string; note: string; said: string };
        heard.push(sent);
        await fetch(`${origin}/api/agent/received`, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: origin }, body: JSON.stringify({ id: sent.id, agent: "opencode" }) });
      }
    }
  })().catch(() => undefined);

  await page.getByRole("button", { name: "send to agent" }).click();
  const form = page.getByRole("group", { name: "Send to the terminal's agent" });
  await expect(form.getByText("this note")).toBeVisible();
  await form.getByRole("textbox", { name: "What you want of it" }).fill("check this against my note");
  await form.getByRole("button", { name: "send to agent" }).click();
  await expect(form.getByText("OpenCode has it, in the terminal")).toBeVisible();
  expect(heard.at(-1)).toMatchObject({ note: "basics/surprise", said: "check this against my note" });
  expect(heard.at(-1)!.passage).toBeUndefined();
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-send-to-agent.png`, fullPage: true });

  // A passage chosen in the note is sent instead of the whole of it.
  // Double-clicked where the word itself is, not the middle of its line, which is maths.
  const at = await page.evaluate(() => {
    const walker = document.createTreeWalker(document.querySelector(".cm-content")!, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const k = n.textContent!.indexOf("carries");
      if (k < 0) continue;
      const range = document.createRange();
      range.setStart(n, k); range.setEnd(n, k + "carries".length);
      const r = range.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }
    throw new Error("no carries");
  });
  await page.mouse.dblclick(at.x, at.y);
  await expect(form.getByText("the passage you chose")).toBeVisible();
  await form.getByRole("button", { name: "send to agent" }).click();
  await expect.poll(() => heard.at(-1)?.passage).toBe("carries");

  // With no agent listening, that is said.
  abort.abort();
  await agent;
  await form.getByRole("button", { name: "send to agent" }).click();
  await expect(form.getByText("no terminal agent took it: is isorite term running?")).toBeVisible({ timeout: 8000 });
});

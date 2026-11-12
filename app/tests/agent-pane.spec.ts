import { expect, test, type Page } from "@playwright/test";
import { ask, attach, box, log as logOf, toAgent, type Attached } from "./agent.ts";

// How the agent's session behaves and looks, with the scripted model: where it is scrolled as it grows, a tool call as a
// row, a run of look-ups as one, a turn that changed notes and its bar (review, undo), a turn stopped, a failure said
// with the one thing to do, a refused command with its switch, and Up bringing back what was sent.

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(async () => { await agent.detach(); });

const name = () => test.info().project.name;
const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;
async function shot(page: Page, what: string) { await page.screenshot({ path: `test-results/screens/${name()}-${what}.png` }); }
async function api(page: Page) {
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  return { "x-isorite-token": token, origin: new URL(test.info().project.use.baseURL!).origin };
}
async function make(page: Page, id: string, text: string) {
  expect((await page.request.post(`api/note?id=${id}`, { data: { text }, headers: await api(page) })).ok()).toBe(true);
}
const read = async (page: Page, id: string) => ((await (await page.request.get(`api/note?id=${id}`)).json()) as { text: string; version: string });
async function remove(page: Page, id: string) {
  await page.request.post(`api/note/delete?id=${id}`, { data: { base: (await read(page, id)).version }, headers: await api(page) });
}

test("scrolled up while the agent works, the session stays where you are, and a button brings you to the newest", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const log = logOf(page);
  // Enough in the session to scroll, whatever the window.
  for (const n of [1, 2, 3]) {
    const t = await ask(page, `draw\n${name()} filler ${n}`, `${name()} filler ${n}`);
    await expect(t).toHaveAttribute("data-state", "done");
  }
  const turn = await ask(page, `wait 1500\ndraw\n${name()} second`, `${name()} second`);
  await expect(turn.locator(".doing")).toBeVisible();
  expect(await log.evaluate((el) => el.scrollHeight - el.clientHeight), "the session overflows the pane").toBeGreaterThan(200);
  await log.evaluate((el) => { el.scrollTop = 0; });
  await expect(turn.locator(".said")).toHaveCount(1, { timeout: 10_000 });
  expect(await log.evaluate((el) => el.scrollTop)).toBeLessThan(40);
  const newest = page.getByRole("button", { name: "Newest" });
  await expect(newest).toBeVisible();
  await newest.click();
  await expect.poll(() => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(4);
  await expect(newest).toBeHidden();
});

test("at the end while a reply streams in, the session follows it to its end; scrolled up, it stays where you are", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const log = logOf(page);
  const from = () => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);
  // A reply long enough to overflow any window, written as it comes (a written \n is a line).
  const lines = Array.from({ length: 120 }, (_, i) => `Line ${i + 1} of a long reply.`).join("\\n");
  const turn = await ask(page, `say ${lines}\n${name()} follows`, `${name()} follows`);
  await expect(turn).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  await expect(turn.locator(".said")).toContainText("Line 120 of a long reply.");
  expect(await log.evaluate((el) => el.scrollHeight - el.clientHeight), "the reply overflows the pane").toBeGreaterThan(400);
  await expect.poll(from).toBeLessThan(4);
  await expect(page.getByRole("button", { name: "Newest" })).toBeHidden();
  // Scrolled up while the next one comes: it stays.
  const next = await ask(page, `wait 1200\nsay ${lines}\n${name()} stays`, `${name()} stays`);
  await expect(next.locator(".doing")).toBeVisible();
  await log.evaluate((el) => { el.scrollTop = 0; });
  await expect(next).toHaveAttribute("data-state", "done", { timeout: 15_000 });
  expect(await log.evaluate((el) => el.scrollTop)).toBeLessThan(40);
  await expect(page.getByRole("button", { name: "Newest" })).toBeVisible();
});

test("a diagram in an earlier turn stays drawn as later turns come, and the reply ends in view", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const log = logOf(page);
  const turn = await ask(page, `draw\n${name()} drawn`, `${name()} drawn`);
  await expect(turn.locator(".said .diagram svg")).toBeVisible();
  await expect(turn).toHaveAttribute("data-state", "done");
  const after = await ask(page, `${name()} after`, `${name()} after`);
  await expect(after.locator(".said")).toBeVisible();
  await expect(turn.locator(".said .diagram svg")).toHaveCount(1);
  await expect.poll(() => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)).toBeLessThan(4);
});

test("each tool call is one row: a run of look-ups folds into one, an edit says its lines, and its note opens", async ({ page }) => {
  const id = `channels/rows-${name()}`;
  await make(page, id, `---\ntype: Concept\ntitle: Rows ${name()}\n---\n\nFirst line.\n`);
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const turn = await ask(page, `read basics/bit\nread basics/surprise\nsearch coin toss\nedit ${id} First line. => First line, and a second.\n${name()} rows`, `${name()} rows`);
  await expect(turn).toHaveAttribute("data-state", "done");
  // The three look-ups: one row, said in a few words, opened to each.
  const run = turn.locator("details.run");
  await expect(run).toHaveCount(1);
  await expect(run.locator("> summary")).toContainText("Read 2 notes · searched once");
  await run.locator("> summary").click();
  await expect(run.locator(".tool")).toHaveCount(3);
  await expect(run.locator(".tool").first().getByRole("button", { name: "The bit" })).toBeVisible();
  // The edit: its glyph, its note, its lines and how long it took, on one row.
  const edit = turn.locator('.tool[data-kind="edit"]');
  await expect(edit.locator(".row")).toContainText(`Rows ${name()}`);
  await expect(edit.locator(".n")).toHaveText("+1 −1");
  await expect(edit.locator(".ms")).toHaveText(/^(<0\.1|\d+(\.\d)?)s$/);
  // The step and the time it took are said under the turn, and what it did.
  await expect(turn.locator(".foot.end")).toContainText(/\ds · read 2 · changed 1/);
  await shot(page, "agent-rows");
  await edit.getByRole("button", { name: `Rows ${name()}` }).click();
  await expect(page).toHaveURL(new RegExp(`#/n/${id}$`));
  await remove(page, id);
});

test("a turn that changed a note has a bar: Review opens it, Undo turn puts it back as it was", async ({ page }) => {
  const id = `channels/undo-${name()}`, made = `channels/made-${name()}`;
  const before = `---\ntype: Concept\ntitle: Undo ${name()}\n---\n\nAs it was.\n`;
  await make(page, id, before);
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const turn = await ask(page, `edit ${id} As it was. => As the agent left it.\nwrite ${made} Made ${name()}\n${name()} changes`, `${name()} changes`);
  await expect(turn).toHaveAttribute("data-state", "done");
  expect((await read(page, id)).text).toContain("As the agent left it.");
  const bar = turn.getByRole("group", { name: "Notes this turn changed" });
  await expect(bar).toContainText("2 notes changed");
  await shot(page, "agent-changed");
  await bar.getByRole("button", { name: "Review" }).click();
  await expect(page).toHaveURL(new RegExp(`#/n/${id}$`));
  await toAgent(page);
  await bar.getByRole("button", { name: "Undo turn" }).click();
  await expect(bar).toContainText("Undone");
  await expect.poll(async () => (await read(page, id)).text).toBe(before);
  // The note the turn made is gone.
  await expect.poll(async () => (await page.request.get(`api/note?id=${made}`)).status()).toBe(404);
  await remove(page, id);
});

test("Escape stops a turn at work: it says it stopped, and how long it ran", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const turn = await ask(page, `wait 8000\n${name()} stop me`, `${name()} stop me`);
  const doing = turn.locator(".doing");
  await expect(doing).toBeVisible();
  await expect(doing.locator(".time")).toHaveText(/^\d+(\.\d)?s$/);
  await expect(page.getByRole("button", { name: "Stop the agent" })).toBeVisible();
  await shot(page, "agent-working");
  await box(page).press("Escape");
  await expect(turn).toHaveAttribute("data-state", "stopped");
  await expect(turn.locator(".foot.end")).toContainText("Stopped");
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
});

test("Up in an empty box brings back what was last sent", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const turn = await ask(page, `say Fine.\n${name()} recalled`, `${name()} recalled`);
  await expect(turn).toHaveAttribute("data-state", "done");
  await expect(box(page).locator(".cm-placeholder")).toBeVisible();
  await box(page).press("ArrowUp");
  await expect(box(page)).toContainText(`${name()} recalled`);
  // Not with something in the box: there Up moves in it.
  await box(page).fill("mine");
  await box(page).press("ArrowUp");
  await expect(box(page)).toHaveText("mine");
});

test("a failure is said in a few words with the one thing to do: Retry after a rate limit, the settings for a missing key", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const limited = await ask(page, `fail 429 Too Many Requests: rate limit exceeded\n${name()} limited`, `${name()} limited`);
  await expect(limited).toHaveAttribute("data-state", "failed");
  await expect(limited.getByRole("alert")).toContainText("Rate limited by the provider.");
  await expect(limited.getByRole("alert").getByRole("button", { name: "Retry" })).toBeVisible();
  // The raw message is not printed as the agent's words.
  await expect(limited.locator(".said")).toHaveCount(0);
  const keyless = await ask(page, `fail No API key for provider: openrouter\n${name()} keyless`, `${name()} keyless`);
  await expect(keyless.getByRole("alert")).toContainText("No key for this model.");
  await shot(page, "agent-failed");
  await keyless.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("dialog", { name: "Agent settings" })).toBeVisible();
  await expect(page.locator("#pi-provider")).toBeFocused();
  await page.keyboard.press("Escape");
  // Retry asks again, as it was asked.
  await limited.getByRole("button", { name: "Retry" }).click();
  await expect(logOf(page).locator(".turn").filter({ hasText: `${name()} limited` })).toHaveCount(2);
});

test("a command refused because Run is off says so under the call, with the switch; the prompt shows only what was asked", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const run = page.locator('[data-pane="agent"] [data-reach="run"]');
  if ((await run.getAttribute("aria-pressed")) === "true") await run.click();
  await expect(run).toHaveAttribute("aria-pressed", "false");
  const turn = await ask(page, `run ls\n${name()} refused`, `${name()} refused`);
  await expect(turn.locator(".why")).toHaveText(/Blocked: commands are off/);
  // The base has a code link that no longer resolves: isorite tells the agent, but not in your words.
  await expect(turn.locator(".asked")).toHaveText(`run ls\n${name()} refused`);
  await turn.locator(".why").getByRole("button", { name: "Turn on" }).click();
  await expect(run).toHaveAttribute("aria-pressed", "true");
  await run.click();
  await expect(run).toHaveAttribute("aria-pressed", "false");
});

test("the composer's footer holds the agent, what it may do and how full its context is; the header holds none of them", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const pane = page.locator('[data-pane="agent"]');
  await expect(pane.getByRole("button", { name: /^Agent: / })).toBeVisible();
  for (const k of ["notes", "files", "run"]) await expect(pane.locator(`.composer [data-reach="${k}"]`)).toBeVisible();
  await expect(pane.locator("header .sw")).toHaveCount(0);
  await ask(page, `say Counted.\n${name()} counted`, `${name()} counted`);
  await expect(pane.locator(".composer .gauge")).toContainText("%");
  // The agent's menu: settings, a new session, the sessions.
  await pane.getByRole("button", { name: /^Agent: / }).click();
  const menu = page.getByRole("menu", { name: "Agent" });
  await expect(menu.getByRole("menuitem")).toHaveText(["Model and key…", "New session", "Sessions"]);
  await shot(page, "agent-menu");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no wider than the window").toBe(true);
  if (phone(page)) return;
});

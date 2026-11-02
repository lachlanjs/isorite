import { expect, test } from "@playwright/test";
import { attach, box, log as logOf, toIso, type Attached } from "./agent.ts";
import { setSwitch } from "./switches.ts";

// An agent's session over ACP in Iso's pane (M25): `isorite acp` between a front end (this test, as Toad would be)
// and a scripted ACP agent (no model), against the test server's base. Asked in the front end or in the pane; the
// files it reads with its own tools are the base's notes; what it asks back through isorite's MCP is kept here.

let agent: Attached, session = "";
const ask = (method: string, params: object) => agent.ask(method, params);
test.beforeAll(async () => { agent = await attach(); session = agent.session; });
test.afterAll(() => agent.detach());

test("an ACP agent's session in the pane: asked in the front end, the notes it read with its own tools, a question back kept, a command allowed here", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await setSwitch(page, "run", true);
  const log = logOf(page);
  await expect(log).toBeVisible();
  const name = test.info().project.name;

  // Asked in the front end: it reads a note's file and asks a question back through isorite's MCP.
  const asked = `read basics/bit.md\nask basics/bit\n${name}`;
  void ask("session/prompt", { sessionId: session, prompt: [{ type: "text", text: asked }] });
  const turn = log.locator(".turn").filter({ hasText: name });
  await expect(turn.locator(".from")).toHaveText("in its front end");
  await expect(turn.locator(".said a[href]")).toHaveText("as the note says");
  // Once the turn is over, the note it read with its own tools is a part under the reply, lit with the phrase citing it.
  const part = turn.getByRole("group", { name: "What Scripted drew on" }).getByRole("button", { name: /The bit/ });
  await expect(part).toBeVisible();
  if (!page.viewportSize() || page.viewportSize()!.width > 760) {
    // Hovered again until it takes: the box's settings arrive as the session opens, and may move the part under the pointer.
    await expect(async () => {
      await part.hover();
      await expect(turn.locator(".said a.vein.lit")).toHaveCount(1, { timeout: 1000 });
    }).toPass({ timeout: 10_000 });
  }
  const question = turn.locator(".asks");
  await expect(question).toContainText("Why does it drift?");
  // Until kept, the question stands on the Atlas, dotted, where it would go.
  await expect(page.locator('[aria-label="Asked back, not kept: Why does it drift?"]')).toHaveCount(1);
  await page.screenshot({ path: `test-results/screens/${name}-acp-turn.png`, fullPage: true });
  await question.getByRole("button", { name: /^Keep/ }).click();
  await expect(question.getByRole("button", { name: "Why does it drift?" })).toBeVisible();
  await expect(page.locator('[aria-label="Asked back, not kept: Why does it drift?"]')).toHaveCount(0);

  // Asked from here: the agent asks before a command, allowed here.
  await box(page).fill("permit");
  await box(page).press("Enter");
  const asks = log.getByRole("group", { name: "The agent asks before it does this" });
  await expect(asks).toContainText("Scripted wants to run ls");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await asks.getByRole("button", { name: "Allow once" }).click();
  await expect(asks).toHaveCount(0);
  const ran = log.locator(".turn").last();
  await expect(ran.locator(".from")).toHaveText("from here");
  await expect(ran.locator(".said")).toContainText("Done");
});

test("the agent's sessions in the drawer: a new one from here, the Context view as far as isorite sees, and back", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  const log = logOf(page);
  await expect(log.locator(".turn").first()).toBeVisible();
  const name = test.info().project.name;

  // A new session, asked from here: the front end is shown nothing of it.
  await page.getByRole("button", { name: "A new session" }).click();
  await expect(log.locator(".turn")).toHaveCount(0);
  await box(page).fill(`read basics/bit.md\nfresh ${name}`);
  await box(page).press("Enter");
  const turn = log.locator(".turn").filter({ hasText: `fresh ${name}` });
  await expect(turn.locator(".said")).toContainText("Done");
  await expect(turn.locator(".from")).toHaveText("from here");

  // What it fills, as the agent says, in layers: isorite's, the notes, the rest, the room.
  await page.getByRole("button", { name: "Context", exact: true }).click();
  const column = page.getByRole("region", { name: "What the agent has in hand" }).getByRole("img");
  await expect(column).toHaveAttribute("aria-label", /isorite's .*notes .*room/);
  await expect(page.getByRole("list", { name: "The notes in the session" })).toContainText("The bit");
  await page.screenshot({ path: `test-results/screens/${name}-acp-context.png`, fullPage: true });

  // The drawer: both sessions, live; the first chosen is shown again.
  await page.getByRole("button", { name: "Sessions" }).click();
  const drawer = page.getByRole("list", { name: "The agents' sessions" });
  await expect(drawer.getByRole("listitem").filter({ hasText: `fresh ${name}` })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/screens/${name}-acp-drawer.png`, fullPage: true });
  await drawer.getByRole("listitem").filter({ hasText: name }).filter({ hasText: "· live" }).filter({ hasNotText: "fresh" }).getByRole("button").click();
  await expect(log.locator(".turn").filter({ hasText: `fresh ${name}` })).toHaveCount(0);
  await expect(log.locator(".turn").first()).toBeVisible();
});

test("the agent's slash commands, mode and model in the pane (M27): offered while typing, set from the box's settings, the header says which agent", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toIso(page);
  await expect(logOf(page)).toBeVisible();

  // Slash commands: typed, offered; arrows and Tab complete one; it goes to the agent as the prompt.
  await box(page).fill("/");
  const menu = page.getByRole("listbox", { name: "Slash commands" });
  await expect(menu.getByRole("option")).toHaveText([/compact/, /plan/]);
  await box(page).fill("/pl");
  await expect(menu.getByRole("option")).toHaveCount(1);
  await box(page).press("Tab");
  await expect(box(page)).toHaveValue("/plan ");
  await expect(menu).toHaveCount(0);
  await box(page).fill("");

  // What the agent lets you set: its mode and its model, from the box's settings; the agent's answer stands.
  const mode = page.getByRole("combobox", { name: "Mode", exact: true }), model = page.getByRole("combobox", { name: "Model", exact: true });
  await expect(mode).toHaveValue("ask");
  await expect(model).toHaveValue("fast");
  await mode.selectOption("plan");
  await model.selectOption("deep");
  await expect(mode).toHaveValue("plan");
  await expect(model).toHaveValue("deep");
  await mode.selectOption("ask");
  await model.selectOption("fast");
  await expect(model).toHaveValue("fast");

  // The header names the agent, and its chip opens the choice of another.
  await page.getByRole("button", { name: "Change agent" }).click();
  await expect(page.getByRole("region", { name: "Choose your agent" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sessions" }).click();
});

import { expect, test, type Page } from "@playwright/test";
import { ask, attach, box, log as logOf, submit, toAgent, type Attached } from "./agent.ts";

// The Agent pane's box and what is around it, with the scripted model: Enter is a new line and Ctrl+Enter (or the Send
// button) sends; the box asks a phone's keyboard for capitals; its top edge makes it taller, kept in the browser; while
// the draft holds maths or code a strip shows it rendered, and what was sent is rendered as the agent's replies are;
// the session's cost stands by its context; and each session in the drawer says when it began.

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(async () => { await agent.detach(); });

const name = () => test.info().project.name;
const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;
const pane = (page: Page) => page.locator('[data-pane="agent"]');
const sendButton = (page: Page) => pane(page).getByRole("button", { name: "Send", exact: true });

test("Enter is a new line; Ctrl+Enter sends on a desktop, and the Send button sends everywhere", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const turns = logOf(page).locator(".turn");
  const before = await turns.count();
  await box(page).click();
  await page.keyboard.type(`say Two lines.`);
  await page.keyboard.press("Enter");
  await page.keyboard.type(`${name()} two lines`);
  await expect(box(page).locator(".cm-line")).toHaveCount(2);
  await expect(turns).toHaveCount(before);
  await expect(sendButton(page)).toBeVisible();
  await expect(sendButton(page)).toBeEnabled();
  if (!phone(page)) await expect(sendButton(page)).toHaveAttribute("title", /Ctrl\+↵|⌘↵/);
  await submit(page);
  const turn = turns.filter({ hasText: `${name()} two lines` });
  await expect(turn).toHaveCount(1);
  await expect(turn).toHaveAttribute("data-state", "done");
  await expect(box(page).locator(".cm-placeholder")).toBeVisible();
  // The button, on a desktop too.
  if (!phone(page)) {
    await box(page).fill(`say By the button.\n${name()} by the button`);
    await sendButton(page).click();
    await expect(turns.filter({ hasText: `${name()} by the button` })).toHaveCount(1);
  }
});

test("the box asks a phone's keyboard for capitals at each sentence, and corrects only on a touch screen", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  await expect(box(page)).toHaveAttribute("autocapitalize", "sentences");
  const coarse = await page.evaluate(() => matchMedia("(pointer: coarse)").matches);
  await expect(box(page)).toHaveAttribute("autocorrect", coarse ? "on" : "off");
});

test("the box's top edge makes it taller and shorter, by drag or by the arrows, within the pane, and is remembered", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  await page.evaluate(() => { try { localStorage.removeItem("isorite.composer-height"); } catch { /* none */ } });
  await page.reload();
  await toAgent(page);
  const scroller = pane(page).locator(".cm-scroller");
  const grip = pane(page).getByRole("separator", { name: "Height of the message box" });
  const h = () => scroller.evaluate((el) => el.getBoundingClientRect().height);
  const was = await h();
  // On a phone the pane slides in: hovered, the handle has stopped where it will be.
  await grip.hover();
  const g = (await grip.boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2 - 100, { steps: 5 });
  await page.mouse.up();
  await expect.poll(h).toBeGreaterThan(was + 80);
  const tall = await h();
  await page.screenshot({ path: `test-results/screens/${name()}-composer-tall.png` });
  // The keys: Down is shorter, Up taller.
  await grip.focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(h).toBeLessThan(tall - 16);
  const kept = await h();
  // Kept in this browser.
  await page.reload();
  await toAgent(page);
  await expect.poll(h).toBeGreaterThan(kept - 2);
  expect(await h()).toBeLessThan(kept + 2);
  // Never more than the pane can spare: the session keeps its room.
  await grip.hover();
  const g2 = (await grip.boundingBox())!;
  await page.mouse.move(g2.x + g2.width / 2, g2.y + g2.height / 2);
  await page.mouse.down();
  await page.mouse.move(g2.x + g2.width / 2, 0, { steps: 5 });
  await page.mouse.up();
  const room = await pane(page).evaluate((el) => el.getBoundingClientRect().height);
  expect(await h()).toBeLessThanOrEqual(room * 0.6 + 2);
  // Home lets it size itself again.
  await grip.focus();
  await page.keyboard.press("Home");
  await expect.poll(h).toBeLessThan(was + 2);
  expect(await page.evaluate(() => localStorage.getItem("isorite.composer-height"))).toBeNull();
});

test("while the draft holds maths or a code fence a strip shows it rendered; what was sent is rendered, and no HTML is taken", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const preview = pane(page).getByRole("region", { name: "The message, rendered" });
  await box(page).fill("plain words, and $5 or $6 for it");
  await expect(preview).toHaveCount(0);
  await box(page).fill("the area is $\\pi r^2$");
  await expect(preview.locator(".katex")).toBeVisible();
  await box(page).fill("\\[ E = mc^2 \\]");
  await expect(preview.locator(".katex")).toBeVisible();
  await box(page).fill("```python\nprint(1)\n```");
  await expect(preview.locator(".code-block")).toBeVisible();
  await page.screenshot({ path: `test-results/screens/${name()}-composer-preview.png` });
  await box(page).fill("");
  await expect(preview).toHaveCount(0);
  // Sent, it reads as a reply does: maths, code; what looks like HTML is shown as typed.
  const turn = await ask(page, `say Read.\n${name()} rendered $x^2$ and \`inline\` <b>bold</b>`, `${name()} rendered`);
  const asked = turn.locator(".asked");
  await expect(asked.locator(".katex")).toHaveCount(1);
  await expect(asked.locator("code")).toHaveText("inline");
  await expect(asked.locator("b")).toHaveCount(0);
  await expect(asked).toContainText("<b>bold</b>");
});

test("the session's cost stands beside its context where the model has a price, and not where it has none", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  const gauge = pane(page).locator(".composer .gauge");
  await expect(await ask(page, `say Priced.\n${name()} priced`, `${name()} priced`)).toHaveAttribute("data-state", "done");
  await expect(gauge.getByTestId("agent-cost")).toHaveText(/^\$\d+\.\d{2,3}$/);
  // The scripted model without sight is free: tokens, and no cost.
  await attach(true);
  try {
    await page.reload();
    await toAgent(page);
    await expect(await ask(page, `say Free.\n${name()} free`, `${name()} free`)).toHaveAttribute("data-state", "done");
    await expect(gauge).toContainText("%");
    await expect(gauge.getByTestId("agent-cost")).toHaveCount(0);
  } finally { await attach(); }
});

test("each session in the drawer says when it began, beside its title", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  await expect(await ask(page, `say Dated.\n${name()} dated`, `${name()} dated`)).toHaveAttribute("data-state", "done");
  await pane(page).getByRole("button", { name: /^Agent: / }).click();
  await page.getByRole("menu", { name: "Agent" }).getByRole("menuitem", { name: "Sessions" }).click();
  const row = page.getByRole("list", { name: "The agents' sessions" }).getByRole("listitem").filter({ hasText: `${name()} dated` }).first();
  await expect(row.getByTestId("session-began")).toHaveText(/^\d{1,2} [A-Z][a-z]{2,3}( \d{4})?, \d\d:\d\d$/);
  await page.screenshot({ path: `test-results/screens/${name()}-sessions-began.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no wider than the window").toBe(true);
});

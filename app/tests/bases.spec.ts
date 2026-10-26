// Several bases on one server (M20): the switcher before the first pane's name, each base's page the app's with ?base=<name>, the
// lent switch; the agent's memory lent to the project's agent, which looks and writes there, drawn on the memory's
// own Atlas; and Iso reading the memory from the project, its step a link into that base's page.

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { setSwitch } from "./switches.ts";

const phone = () => test.info().project.name.startsWith("phone");
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}
/** The switcher: the base's name in the header of the first pane (on a phone, of the pane on screen). */
const switcher = (page: Page) => page.locator(phone() ? '[data-pane="note"]' : ".pane.first").locator("button.base");

async function asAgent(request: APIRequestContext, baseURL: string) {
  const { token } = await (await request.get("api/session")).json() as { token: string };
  const headers = { Origin: new URL(baseURL).origin, "x-isorite-token": token };
  const session = `ses-bases-${test.info().project.name}`;
  return {
    status: (busy: boolean) => request.post("api/agent/status", { headers, data: { agent: "opencode", session, busy } }),
    tool: (tool: string, args: object, asked = "") => request.post("api/agent/look", { headers, data: { agent: "opencode", session, tool, args, asked } }),
  };
}

test("the switcher lists the bases; choosing one opens its page, with its own notes", async ({ page }) => {
  await page.goto("#/notes");
  await expect(switcher(page)).toHaveText("information-theory");
  await switcher(page).click();
  const list = page.getByRole("dialog", { name: "Knowledge bases" });
  await expect(list.getByRole("link")).toHaveText(["memory", "elsewhere", "information-theory"]);
  await expect(list.getByRole("link", { name: "information-theory" })).toHaveAttribute("aria-current", "page");
  await expect(list.getByRole("button", { name: "Lent to every session" }).first()).toHaveAttribute("aria-pressed", "true");
  await look(page, "bases-open");
  await list.getByRole("link", { name: "memory" }).click();
  await expect(page).toHaveURL(/\?base=memory(#.*)?$/);
  await expect(switcher(page)).toHaveText("memory");
  await page.goto("/?base=memory#/notes");
  await expect(page.getByRole("link", { name: "OpenCode's config" }).first()).toBeVisible();
  await expect(switcher(page)).toHaveText("memory");
  await look(page, "bases-memory");
});

test("the lent switch is kept, from this machine", async ({ page, request }) => {
  await page.goto("#/notes");
  await switcher(page).click();
  const lend = page.getByRole("dialog", { name: "Knowledge bases" }).getByRole("listitem").filter({ hasText: "elsewhere" }).getByRole("button", { name: "Lent to every session" });
  await expect(lend).toHaveAttribute("aria-pressed", "false");
  await lend.click();
  await expect(lend).toHaveAttribute("aria-pressed", "true");
  expect(((await (await request.get("api/agent/base")).json()) as { lent: string[] }).lent).toEqual(["memory", "elsewhere"]);
  await lend.click();
  await expect(lend).toHaveAttribute("aria-pressed", "false");
});

test("the project's agent looks and writes in its memory; the memory's own page shows it, as the agent's", async ({ page, request, baseURL }) => {
  const agent = await asAgent(request, baseURL!);
  const id = `you/likes-${test.info().project.name}`;
  await page.goto(`/?base=memory#/atlas`);
  await expect(page.locator('[data-note="tools/opencode"]')).toBeVisible();
  if (phone()) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
  // An agent's path is drawn with Iso's context on (M12).
  await setSwitch(page, "context", true);
  await agent.status(true);
  const brief = await (await agent.tool("brief_base", {})).json() as { text: string };
  expect(brief.text).toContain("- memory: What you keep across projects.");
  expect((await agent.tool("read_note", { id: "memory:tools/opencode" })).ok()).toBe(true);
  // Drawn on the memory's Atlas, where it read.
  await expect(page.locator('[data-note="tools/opencode"]')).toHaveClass(/\bp-used\b/);
  await expect(page.getByText("OpenCode is reading OpenCode's config in the terminal")).toBeAttached();
  const wrote = await agent.tool("write_note", { base: "memory", note: id, content: "---\ntype: Concept\ntitle: Short answers\n---\n\nThey like short answers.\n" }, "remember that I like short answers");
  expect(wrote.ok()).toBe(true);
  await agent.status(false);
  await expect(page.locator(`[data-note="${id}"]`)).toBeVisible();
  await look(page, "bases-memory-learnt");
  // Entered under the agent's name, with what was asked.
  const journal = await (await request.get(`b/memory/api/journal?id=${encodeURIComponent(id)}`)).json() as { by?: string; who?: string; asked?: string }[];
  expect(JSON.stringify(journal)).toContain("agent:opencode");
  expect(JSON.stringify(journal)).toContain("remember that I like short answers");
});

test("Iso in the project reads the memory; its step opens that note in the memory's page", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  if (phone()) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
  const box = page.getByRole("textbox", { name: "Message Iso" });
  await box.fill(`recall where its config is, ${test.info().project.name}`);
  await box.press("Enter");
  const step = page.locator('[data-pane="iso"] a.away').last();
  await expect(step).toContainText("memory: tools/opencode");
  await expect(step).toHaveAttribute("href", /\?base=memory#\/n\/tools\/opencode$/);
  await expect(step).toHaveAttribute("target", "_blank");
  await expect(page.locator('[data-pane="iso"] .said').last()).toContainText("bits");
  await look(page, "bases-iso-recall");
});

import { expect, test, type Page } from "@playwright/test";
import { ask, attach, box, toAgent, type Attached } from "./agent.ts";

// The agent's skills: the built-in one is listed in the agent's settings with a switch, a leading slash in the box offers
// the skills that are on (keys and all), and a skill switched off is no longer offered. A message that begins with the
// skill's name is sent as typed.

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(async () => { await agent.detach(); });

const NAME = "socratic-tutor";
async function api(page: Page) {
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  return { "x-isorite-token": token, origin: new URL(test.info().project.use.baseURL!).origin };
}
/** Put the skill back on, whatever a test did (the base is shared with the others). */
async function on(page: Page) { await page.request.post("api/pi/skills", { data: { name: NAME, enabled: true }, headers: await api(page) }); }
const listed = async (page: Page) => ((await (await page.request.get("api/pi/skills")).json()) as { skills: { name: string; enabled: boolean; source: string; error?: string }[] }).skills;

test("a leading slash offers the skills that are on, and Enter completes one", async ({ page }) => {
  await on(page);
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  await box(page).click();
  await box(page).fill("/");
  const menu = page.getByRole("listbox", { name: "Skills" });
  await expect(menu).toBeVisible();
  // The pane's own command, the built-in skill and the person's own (the skills base's release-notes, which the test
  // server seeds).
  await expect(menu.getByRole("option")).toHaveCount(3);
  await expect(menu.getByRole("option", { name: /\/compact/ })).toBeVisible();
  await expect(menu.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await expect(menu.getByRole("option", { name: new RegExp(`/${NAME}`) })).toBeVisible();
  // Narrowed as it is typed; nothing that does not match.
  await box(page).fill("/zz");
  await expect(menu).toHaveCount(0);
  await box(page).fill("/soc");
  await expect(menu.getByRole("option")).toHaveCount(1);
  // Escape puts it away, and the box keeps what was typed.
  await box(page).press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(box(page)).toContainText("/soc");
  await box(page).fill("/so");
  await expect(menu).toBeVisible();
  await box(page).press("Enter");
  await expect(menu).toHaveCount(0);
  await expect(box(page)).toContainText(`/${NAME}`);
  expect((await box(page).textContent())?.endsWith(" ") || (await box(page).textContent())?.endsWith(" ")).toBe(true);
  // A slash in the middle of a message offers nothing.
  await box(page).fill("what is /so");
  await expect(menu).toHaveCount(0);
  // Sent with a request, the turn is what was typed.
  const text = `/${NAME} teach me ${test.info().project.name}`;
  const turn = await ask(page, text, `teach me ${test.info().project.name}`);
  await expect(turn).toHaveAttribute("data-state", "done");
  await expect(turn).toContainText(text);
});

test("the settings list the skill with where it is from, and its switch takes it out of the offer", async ({ page }) => {
  await on(page);
  await page.goto("#/n/basics/bit");
  await toAgent(page);
  await page.getByRole("button", { name: /^Agent:/ }).click();
  await page.getByRole("menuitem", { name: "Model and key…" }).click();
  const dialog = page.getByRole("dialog", { name: "Agent settings" });
  const row = dialog.locator(`[data-skill="${NAME}"]`);
  await expect(row).toBeVisible();
  await expect(row).toContainText("built in");
  await expect(row).toContainText("Socratic tutoring");
  const sw = row.getByRole("switch", { name: `Skill ${NAME}` });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  try {
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", "false");
    expect((await listed(page)).find((s) => s.name === NAME)?.enabled).toBe(false);
    // Kept in the base: a reload has it still off.
    await page.reload();
    await toAgent(page);
    await box(page).click();
    await box(page).fill("/");
    await expect(page.getByRole("listbox", { name: "Skills" }).getByRole("option", { name: new RegExp(`/${NAME}`) })).toHaveCount(0);
    // And the other way.
    await page.getByRole("button", { name: /^Agent:/ }).click();
    await page.getByRole("menuitem", { name: "Model and key…" }).click();
    const again = page.getByRole("dialog", { name: "Agent settings" }).locator(`[data-skill="${NAME}"]`).getByRole("switch");
    await expect(again).toHaveAttribute("aria-checked", "false");
    await again.click();
    await expect(again).toHaveAttribute("aria-checked", "true");
    expect((await listed(page)).find((s) => s.name === NAME)?.enabled).toBe(true);
  } finally { await on(page); }
});

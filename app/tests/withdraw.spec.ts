// Taking a chip out of the tray tells the server (M36, step 10), so an agent whose history isorite keeps stops being sent
// what was given with it. Here with the scripted ACP agent, which keeps its own history: the request is made, nothing
// is withdrawn, and the pane carries on. What a withdrawal does to the model's requests is in pi-withdraw.test.ts.

import { expect, test } from "@playwright/test";
import { attach, box, toIso, type Attached } from "./agent.ts";

let agent: Attached;
test.beforeAll(async () => { agent = await attach(); });
test.afterAll(() => agent.detach());

test("removing a chip that was given asks the server to withdraw it; an agent that cannot is not disturbed", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  const editor = page.getByRole("textbox", { name: "The note", exact: true });
  await editor.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "add to Iso's message" }).click();
  await toIso(page);
  const tray = page.getByRole("list", { name: "Going with your message" });
  await expect(tray.getByRole("listitem")).toHaveCount(1);
  await box(page).fill("hello");
  await box(page).press("Enter");
  await expect(page.getByRole("log").first()).toContainText("hello");

  const sent = page.waitForRequest((r) => r.url().endsWith("/api/terminal/withdraw") && r.method() === "POST");
  await tray.getByRole("button", { name: /^Remove the passage/ }).click();
  const body = (await sent).postDataJSON() as { given: { kind: string } };
  expect(body.given.kind).toBe("passage");
  await expect(tray.getByRole("listitem")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

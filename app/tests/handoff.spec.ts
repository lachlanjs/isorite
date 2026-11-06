// What is chosen can be copied for an agent that isorite does not run (M36): the tray's chips show with no agent
// attached, and "Copy for your agent" puts a block on the clipboard that names them for the agent's own tools.

import { expect, test } from "@playwright/test";
import { toIso } from "./agent.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("with no agent attached, a chosen passage is copied as text that names its note for the agent to read", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium's");
  await page.goto("#/n/basics/surprise");
  const editor = page.getByRole("textbox", { name: "The note", exact: true });
  await editor.click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "add to the agent's message" }).click();
  await toIso(page);

  await expect(page.getByRole("list", { name: "Going with your message" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("textbox", { name: "Message the agent" }).fill("Explain this.");
  await page.getByRole("button", { name: "Copy for your agent" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("read_note");
  expect(copied).toContain("(basics/surprise)");
  expect(copied).toMatch(/> An outcome of probability/);
  expect(copied.endsWith("Explain this.")).toBe(true);
});

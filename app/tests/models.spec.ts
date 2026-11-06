// The native agent's model and keys in Iso's settings (M36, step 8): a key is kept where only its owner can read it,
// is said to be set and never shown again, and goes when it is removed.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { DATA, NOTES } from "./serve.ts";

const KEY = "sk-or-v1-BROWSERSECRET0123456789";
const file = join(DATA, "credentials.json");

async function toIso(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Agent/ }).click();
}

test("a key entered in the settings is kept owner-only, said to be set and never shown, and removed on request", async ({ page }) => {
  await page.goto("#/");
  await toIso(page);
  await page.getByRole("button", { name: "Agent settings" }).click();
  const menu = page.getByRole("dialog", { name: "Agent settings" });
  await expect(menu.getByText("Model for isorite's own agent")).toBeVisible();
  await menu.getByLabel("Provider", { exact: true }).selectOption("openrouter");
  await expect(menu.getByTestId("pi-key-state")).toHaveText("No key is set.");
  await menu.getByLabel("Key for this provider").fill(KEY);
  await menu.getByRole("button", { name: "Keep key" }).click();
  await expect(menu.getByText("Key kept.")).toBeVisible();
  await expect(menu.getByTestId("pi-key-state")).toHaveText("A key is saved.");
  // The box is emptied, and the key is nowhere on the page.
  await expect(menu.getByLabel("Key for this provider")).toHaveValue("");
  expect(await page.content()).not.toContain("BROWSERSECRET");
  expect(statSync(file).mode & 0o777).toBe(0o600);
  expect(readFileSync(file, "utf8")).toContain(KEY);
  // It is not in the base.
  expect(existsSync(join(NOTES, "credentials.json"))).toBe(false);
  // A model pi does not have is refused with a reason.
  await menu.getByLabel("Model", { exact: true }).fill("no/such-model");
  await menu.getByRole("button", { name: "Use this model" }).click();
  await expect(menu.getByRole("alert")).toContainText("no model");
  await menu.getByRole("button", { name: "Remove key" }).click();
  await expect(menu.getByTestId("pi-key-state")).toHaveText("No key is set.");
  expect(readFileSync(file, "utf8")).not.toContain("BROWSERSECRET");
});

test("the tiers: project files are read-only and the shell is off by default, the shell's warning says it is not confined, and a change is kept", async ({ page }) => {
  await page.goto("#/");
  await toIso(page);
  await page.getByRole("button", { name: "Agent settings" }).click();
  const menu = page.getByRole("dialog", { name: "Agent settings" });
  await expect(menu.getByRole("radio", { name: "Read files" })).toBeChecked();
  await expect(menu.getByRole("checkbox", { name: "Run shell commands" })).not.toBeChecked();
  await expect(menu.getByText("A shell is not confined.")).toBeVisible();
  await expect(menu.getByText(/container or a disposable virtual machine/)).toBeVisible();
  await menu.getByRole("radio", { name: "Read and write files" }).check();
  await expect(menu.getByText("Saved.")).toBeVisible();
  await page.reload();
  await toIso(page);
  await page.getByRole("button", { name: "Agent settings" }).click();
  await expect(page.getByRole("dialog", { name: "Agent settings" }).getByRole("radio", { name: "Read and write files" })).toBeChecked();
  expect(JSON.parse(readFileSync(file, "utf8")).reach).toEqual({ files: "write", shell: false });
  await page.getByRole("dialog", { name: "Agent settings" }).getByRole("radio", { name: "Read files" }).check();
  await expect(page.getByRole("dialog", { name: "Agent settings" }).getByText("Saved.")).toBeVisible();
});

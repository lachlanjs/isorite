// The provider's setup in Iso's settings (M18): a gateway set up, checked as isorite doctor checks it, kept and in
// use at once; its secrets held and never shown again. The base's configuration is put back as it was after.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { ROOT } from "./serve.ts";

const CONFIG = join(ROOT, "config", "isorite", "config.toml");
let was = "";

async function settings(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) <= 760) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Iso/ }).click();
  await page.getByRole("button", { name: "Iso settings" }).click();
  return page.getByRole("dialog", { name: "Iso settings" });
}

test.beforeEach(() => { was = readFileSync(CONFIG, "utf8"); });
// As it was, and taken into use again: forgetting a key that isn't held reads the configuration again.
test.afterEach(async ({ page, baseURL }) => {
  writeFileSync(CONFIG, was);
  const { token } = await (await page.request.get("api/session")).json() as { token: string };
  await page.request.put("api/settings/key", { headers: { Origin: new URL(baseURL!).origin, "x-isorite-token": token }, data: { key: null } });
});

test("a gateway is set up, checked, kept and in use at once; its secret header is held, not shown", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  const menu = await settings(page);
  await expect(menu).toContainText("Asked through scripted.");
  await expect(menu.getByRole("radio", { name: "a gateway of your own" })).toBeChecked();

  // Another address for it, and a name.
  await menu.getByLabel("The gateway's address").fill("http://localhost:4798/v1");
  await menu.getByLabel("Its name").fill("relayed");
  await menu.getByText("what else it asks for").click();
  await menu.getByRole("button", { name: "add a header" }).click();
  await menu.getByLabel("header name").fill("Authorization");
  await menu.getByLabel("header value").fill("Bearer sk-header-secret");

  // The tiers from the provider's own list.
  await menu.getByLabel("mid").focus();
  await expect(menu.locator("#setup-models option")).toHaveCount(4);
  await menu.getByLabel("mid").fill("scripted-other");

  // Checked before it is kept: nothing is written.
  await menu.getByRole("button", { name: "check", exact: true }).click();
  const checks = menu.getByRole("list", { name: "The check" });
  await expect(checks).toContainText("reached");
  await expect(checks).toContainText("reply from scripted-other");
  await expect(checks.locator("li.ok")).toHaveCount(5);
  await expect(checks.locator("li.fail")).toHaveCount(0);
  expect(readFileSync(CONFIG, "utf8")).not.toContain("relayed");
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-setup-checked.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no wider than the window").toBe(true);

  await menu.getByRole("button", { name: "keep", exact: true }).click();
  await expect(menu).toContainText("Asked through relayed.");
  const kept = readFileSync(CONFIG, "utf8");
  expect(kept).toContain('url = "http://localhost:4798/v1"');
  expect(kept).toContain("sk-header-secret");
  expect(kept).toContain('mid = "scripted-other"');
  expect(readFileSync(`${CONFIG}.bak`, "utf8")).toContain('name = "scripted"');

  // Shown again, the secret is held: it is not in the page.
  await page.reload();
  const again = await settings(page);
  await again.getByText("what else it asks for").click();
  await expect(again.getByLabel("header value")).toHaveAttribute("placeholder", "held");
  await expect(again.getByLabel("header value")).toHaveValue("");
  expect(await page.content()).not.toContain("sk-header-secret");
  await page.keyboard.press("Escape");

  // In use at once: Iso is asked through it, with no restart.
  const box = page.getByRole("textbox", { name: "Message Iso" });
  await box.fill(`what is it measured in, through the gateway, ${test.info().project.name}`);
  await box.press("Enter");
  await expect(page.locator('[data-pane="iso"] .said').last()).toContainText("measured in");
});

test("the key's prefix: Bearer in Authorization unless said, and kept as key_prefix for another header (M21)", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  const menu = await settings(page);
  await menu.getByText("what else it asks for").click();
  const header = menu.getByLabel("The header the key goes in"), prefix = menu.getByLabel("What goes before the key");
  await header.fill("");
  await expect(prefix).toHaveAttribute("placeholder", "Bearer");
  await expect(prefix).toHaveAttribute("title", /Sent: Authorization: Bearer <the key>/);
  await header.fill("X-Gateway-Auth");
  await expect(prefix).toHaveAttribute("placeholder", "no prefix");
  await prefix.fill("Bearer");
  await expect(prefix).toHaveAttribute("title", /Sent: X-Gateway-Auth: Bearer <the key>/);
  await menu.getByRole("button", { name: "keep", exact: true }).click();
  await expect.poll(() => readFileSync(CONFIG, "utf8")).toContain('key_prefix = "Bearer "');
  expect(readFileSync(CONFIG, "utf8")).toContain('key_header = "X-Gateway-Auth"');
});

test("the setup is shown, and not changed, from a tailnet's name", async ({ page }) => {
  const { token } = await (await page.request.get("api/session")).json() as { token: string };
  const view = await (await page.request.get("api/settings/provider")).json() as { local: boolean; setup: object };
  expect(view.local).toBe(true);
  const far = await page.request.put("api/settings/provider", { headers: { Host: "box.tail1.ts.net", Origin: "http://box.tail1.ts.net", "x-isorite-token": token }, data: { ...view.setup, name: "far" } });
  expect(far.status()).toBe(403);
  expect(readFileSync(CONFIG, "utf8")).not.toContain("far");
});

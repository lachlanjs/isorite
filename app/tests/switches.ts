// The panes' switches (M12), as a test sets them: each one pressed only if it is not already as wanted.

import { expect, type Page } from "@playwright/test";

export type Switch = "provenance" | "timeline" | "questions" | "problems" | "web" | "code" | "context" | "notes" | "files" | "run";

export async function setSwitch(page: Page, key: Switch, on: boolean): Promise<void> {
  // What the agent may reach is in the Agent pane's composer, not a header.
  if (key === "notes" || key === "files" || key === "run") {
    const reach = page.locator(`[data-pane="agent"] [data-reach="${key}"]`);
    if ((await reach.getAttribute("aria-pressed")) !== String(on)) await reach.click();
    return;
  }
  const button = page.locator(`.sw[data-switch="${key}"]`);
  if ((await button.getAttribute("aria-pressed")) === String(on)) return;
  if (await button.isVisible()) { await button.click(); return; }
  // Folded into the header's menu, where the pane is too narrow to hold it.
  const label = (await button.getAttribute("data-short"))!;
  await button.locator("xpath=ancestor::section[@data-pane]").getByRole("button", { name: /^More of/ }).click();
  await page.getByRole("menu", { name: /^More of/ }).getByRole("menuitemcheckbox", { name: label, exact: true }).click();
}

/** A button of a pane's header, pressed where it is, or from the menu its header folds it into where there is no room. */
export async function pressHead(page: Page, pane: "note" | "atlas" | "agent", name: string): Promise<void> {
  const head = page.locator(`[data-pane="${pane}"] header.phead`), button = head.locator(`button[aria-label="${name}"]`);
  // The header is drawn first (the button, or the menu it folds into): isVisible alone does not wait for that.
  await expect(button.or(head.getByRole("button", { name: /^More of/ }))).toBeVisible();
  if (await button.isVisible()) { await button.click(); return; }
  await head.getByRole("button", { name: /^More of/ }).click();
  await page.getByRole("menu", { name: /^More of/ }).getByRole("menuitem", { name, exact: true }).click();
}

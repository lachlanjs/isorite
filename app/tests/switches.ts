// The panes' switches (M12), as a test sets them: each one pressed only if it is not already as wanted.

import type { Page } from "@playwright/test";

export type Switch = "provenance" | "timeline" | "context" | "notes" | "files" | "run";

export async function setSwitch(page: Page, key: Switch, on: boolean): Promise<void> {
  const button = page.locator(`.sw[data-switch="${key}"]`);
  if ((await button.getAttribute("aria-pressed")) !== String(on)) await button.click();
}

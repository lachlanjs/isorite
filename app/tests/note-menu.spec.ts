// A note from the list (M29): moved to a folder (a new one made by naming it) or deleted, asked first with who links to it.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { NOTES } from "./serve.ts";

const note = (title: string, body = "Text.\n") => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}`;

test("a note is moved to a new folder, and deleted after asking who links to it", async ({ page }) => {
  const p = test.info().project.name;
  await page.goto("#/notes");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  for (const [slug, title, body] of [["mover", `Mover ${p}`, "Text.\n"], ["doomed", `Doomed ${p}`, "Text.\n"], ["fan", `Fan ${p}`, `It rests on [the doomed](/menu/doomed-${p}.md "requires").\n`]] as const) {
    expect((await page.request.post(`api/note?id=menu/${slug}-${p}`, { headers, data: { text: note(title, body) } })).ok()).toBe(true);
  }
  await page.reload();
  await page.getByRole("searchbox", { name: "Find a note" }).fill(p);

  // Move.
  await page.getByRole("button", { name: `Do something with Mover ${p}` }).click();
  await page.screenshot({ path: `test-results/screens/${p}-note-menu.png` });
  await page.getByRole("button", { name: "Move to an island…" }).click();
  const field = page.getByRole("combobox", { name: `Island to move Mover ${p} to` });
  await field.fill(`moved-${p}`);
  await expect(page.getByRole("group", { name: `Mover ${p}` }).getByText("new island")).toBeVisible();
  await page.getByRole("button", { name: "move", exact: true }).click();
  await expect.poll(() => existsSync(join(NOTES, `moved-${p}`, `mover-${p}.md`))).toBe(true);
  expect(existsSync(join(NOTES, "menu", `mover-${p}.md`))).toBe(false);

  // Delete: asked first, naming the note that links to it.
  await page.getByRole("button", { name: `Do something with Doomed ${p}` }).click();
  await page.getByRole("button", { name: "Delete…" }).click();
  await expect(page.getByText(`One note links to it (Fan ${p})`)).toBeVisible();
  await page.getByRole("button", { name: "keep it" }).click();
  expect(existsSync(join(NOTES, "menu", `doomed-${p}.md`))).toBe(true);
  await page.getByRole("button", { name: `Do something with Doomed ${p}` }).click();
  await page.getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "delete", exact: true }).click();
  await expect.poll(() => existsSync(join(NOTES, "menu", `doomed-${p}.md`))).toBe(false);
  expect((await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))).toBe(true);
});

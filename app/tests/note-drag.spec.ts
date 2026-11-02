// A note dragged to a folder (M31), and a folder made empty to drag it to.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { NOTES } from "./serve.ts";

test("an empty folder is made, and a note dragged into it moves", async ({ page }) => {
  const p = test.info().project.name;
  await page.goto("#/notes");
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(page.url()).origin };
  const text = `---\ntype: Concept\ntitle: Dragged ${p}\n---\n\nText.\n`;
  expect((await page.request.post(`api/note?id=drag/dragged-${p}`, { headers, data: { text } })).ok()).toBe(true);
  await page.reload();

  await page.getByRole("button", { name: "new folder" }).click();
  await page.getByRole("textbox", { name: /name, with/ }).fill(`drag-to-${p}/inner`);
  await page.getByRole("button", { name: "make it" }).click();
  await expect.poll(() => existsSync(join(NOTES, `drag-to-${p}`, "inner"))).toBe(true);
  const heading = page.getByRole("heading", { name: `drag-to-${p}/inner New note in drag-to-${p}/inner` });
  await expect(heading).toBeVisible();

  // The browser's own drag is awkward to drive in a list that scrolls, so the events are sent, as it sends them.
  await page.evaluate(({ title, folder }) => {
    const li = [...document.querySelectorAll("li[draggable=true]")].find((e) => e.textContent?.includes(title))!;
    const target = [...document.querySelectorAll("section h2 .label")].find((e) => e.textContent === folder)!;
    const data = new DataTransfer();
    const fire = (el: Element, type: string) => el.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
    fire(li, "dragstart");
    fire(target, "dragenter");
    fire(target, "dragover");
    fire(target, "drop");
    fire(li, "dragend");
  }, { title: `Dragged ${p}`, folder: `drag-to-${p}/inner` });
  await expect.poll(() => existsSync(join(NOTES, `drag-to-${p}`, "inner", `dragged-${p}.md`))).toBe(true);
  expect(existsSync(join(NOTES, "drag", `dragged-${p}.md`))).toBe(false);
  await expect(heading).toBeVisible();
});

// The native agent's several sessions in the drawer (M36, step 11). Needs the server started with the native agent
// (ISORITE_PI=openrouter/anthropic/claude-haiku-5.5, no key is used): skipped otherwise. Sessions kept before are seeded
// in the agent's data folder; the drawer lists them, switches between them, forks one and forgets one.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { storeDir } from "../../packages/server/src/pi/store.ts";
import { NOTES, ROOT } from "./serve.ts";
import { toIso } from "./agent.ts";

test.skip(!process.env.ISORITE_PI, "the native agent is chosen with ISORITE_PI");

const A = "aaaaaaaa-0000-0000-0000-000000000001", B = "bbbbbbbb-0000-0000-0000-000000000002";
const record = (session: string, title: string, last: string) => ({ version: 1, session, title, at: last, last, cost: 0.01, used: 100, given: [], messages: [], turns: [{ id: session, asked: title, from: "here", items: [{ kind: "text", text: `Answer to ${title}` }], state: "done", at: last }] });

test.beforeAll(() => {
  const dir = storeDir(NOTES, { XDG_DATA_HOME: join(ROOT, "data") });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${A}.json`), JSON.stringify(record(A, "About entropy", "2026-11-06T01:00:00.000Z")));
  writeFileSync(join(dir, `${B}.json`), JSON.stringify(record(B, "About Huffman codes", "2026-11-06T02:00:00.000Z")));
});

test("the drawer lists the kept sessions, switches between them, forks one and forgets one", async ({ page }) => {
  await page.goto("#/n/basics/surprise");
  await toIso(page);
  await page.getByRole("button", { name: "Sessions" }).click();
  const drawer = page.getByRole("list", { name: "The agents' sessions" });
  await expect(drawer.getByRole("listitem").filter({ hasText: "About entropy" })).toBeVisible();
  await expect(drawer.getByRole("listitem").filter({ hasText: "About Huffman codes" })).toBeVisible();

  await drawer.getByRole("listitem").filter({ hasText: "About entropy" }).getByRole("button").first().click();
  await expect(page.getByRole("log", { name: "The agent's session" })).toContainText("Answer to About entropy");
  await expect(page.getByRole("log", { name: "The agent's session" })).not.toContainText("About Huffman");

  await page.getByRole("button", { name: "Sessions" }).click();
  await drawer.getByRole("listitem").filter({ hasText: "About Huffman codes" }).getByRole("button", { name: /^Fork/ }).click({ force: true });
  await expect(page.getByRole("log", { name: "The agent's session" })).toContainText("Answer to About Huffman codes");
  await page.getByRole("button", { name: "Sessions" }).click();
  await expect(drawer.getByRole("listitem").filter({ hasText: "About Huffman codes (fork)" })).toBeVisible();

  await drawer.getByRole("listitem").filter({ hasText: /^.*About entropy/ }).getByRole("button", { name: /^Remove the kept copy/ }).click({ force: true });
  await drawer.getByRole("button", { name: "remove", exact: true }).click();
  await expect(drawer.getByRole("listitem").filter({ hasText: "About entropy" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

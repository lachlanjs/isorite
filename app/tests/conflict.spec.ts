// A note git left in conflict (markers in its text) is marked in the list and on the Atlas, and says so when opened.

import { expect, test } from "@playwright/test";

test("a note with merge markers is marked everywhere, and says so when opened", async ({ page }) => {
  const p = test.info().project.name, id = `basics/torn-${p}`;
  const token = ((await (await page.request.get("api/session")).json()) as { token: string }).token;
  const headers = { "x-isorite-token": token, origin: new URL(test.info().project.use.baseURL ?? "http://localhost:4799/").origin };
  const text = `---\ntype: Concept\ntitle: Torn ${p}\n---\n\nBefore.\n\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> origin/main\n\nAfter.\n`;
  expect((await page.request.post(`api/note?id=${id}`, { headers, data: { text } })).ok()).toBe(true);
  try {
    await page.goto("#/atlas");
    await page.reload();
    await expect(page.locator(`[data-note="${id}"]`)).toHaveClass(/\bconflicted\b/);
    await page.screenshot({ path: `test-results/screens/${p}-conflict-atlas.png` });
    await page.goto(`#/n/${id}`);
    await expect(page.getByRole("alert").filter({ hasText: "merge conflict" })).toBeVisible();
    await page.screenshot({ path: `test-results/screens/${p}-conflict-note.png` });
    // Settled, it is a note again.
    const now = (await (await page.request.get(`api/note?id=${id}`)).json()) as { version: string };
    expect((await page.request.put(`api/note?id=${id}`, { headers, data: { text: text.replace(/<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> origin\/main\n/, "ours\n"), base: now.version } })).ok()).toBe(true);
    await page.evaluate(() => location.reload());
    await expect(page.getByRole("alert").filter({ hasText: "merge conflict" })).toHaveCount(0);
  } finally {
    const now = (await (await page.request.get(`api/note?id=${id}`)).json()) as { version: string };
    await page.request.post(`api/note/delete?id=${id}`, { headers, data: { base: now.version } });
  }
});

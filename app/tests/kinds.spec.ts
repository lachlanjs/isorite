import { expect, test, type Page } from "@playwright/test";

// Open questions and problems (M12): a question embedded in a note is a callout there and opens; its title row
// resolves it, yours alone; the note it is about lists it at its foot; a problem is made from the note's settings.

const phone = () => test.info().project.name.startsWith("phone");
async function make(page: Page, id: string, text: string) {
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  const res = await page.request.post(`api/note?id=${id}`, { data: { text }, headers: { "x-isorite-token": token, Origin: new URL(test.info().project.use.baseURL!).origin } });
  expect(res.ok()).toBe(true);
}
async function remove(page: Page, id: string) {
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  const { version } = (await (await page.request.get(`api/note?id=${id}`)).json()) as { version: string };
  await page.request.post(`api/note/delete?id=${id}`, { data: { base: version }, headers: { "x-isorite-token": token, Origin: new URL(test.info().project.use.baseURL!).origin } });
}

test("a question embedded in a note is a callout that opens it; resolved from its title row, it turns green; the note lists it", async ({ page }) => {
  // Named afresh each run: the test server's base is kept between runs.
  const name = `${test.info().project.name}-${Date.now().toString(36)}`, q = `channels/why-${name}`, n = `channels/rate-${name}`;
  await make(page, q, `---\ntype: Question\ntitle: Why is capacity a maximum, ${name}?\n---\n\nOver which inputs?\n`);
  await make(page, n, `---\ntype: Concept\ntitle: Capacity ${name}\n---\n\nThe most a channel carries.\n\n[[!why-${name}]]\n`);
  await page.goto(`#/n/${n}`);
  const callout = page.locator(".cm-lp-embed");
  await expect(callout).toHaveText(`Why is capacity a maximum, ${name}?`);
  await expect(callout).toHaveClass(/cm-lp-embed-question/);
  // Its foot lists the question attached to it.
  await expect(page.locator(".attached a")).toHaveText([`Why is capacity a maximum, ${name}?`]);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-question-callout.png`, fullPage: true });
  await callout.click();
  await expect(page).toHaveURL(new RegExp(`#/n/${q}$`));
  // The question's title row: its glyph, and the ✓ that resolves it.
  await expect(page.locator(".titlerow > .glyph.question")).toBeVisible();
  await expect(page.locator(".about a")).toHaveText([`Capacity ${name}`]);
  const tick = page.getByRole("button", { name: "Resolved", exact: true });
  await expect(tick).toHaveAttribute("aria-pressed", "false");
  await tick.click();
  await expect(tick).toHaveAttribute("aria-pressed", "true");
  const file = ((await (await page.request.get(`api/note?id=${q}`)).json()) as { text: string }).text;
  expect(file).toMatch(/\nresolved: \d{4}-\d{2}-\d{2}\n/);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-question-resolved.png`, fullPage: true });
  await page.goto(`#/n/${n}`);
  await expect(page.locator(".cm-lp-embed")).toHaveClass(/cm-lp-embed-done/);
  await remove(page, n);
  await remove(page, q);
});

test("a problem using the note open is made from the Note pane's settings, untitled, and named by its first title", async ({ page }) => {
  const name = `${test.info().project.name}-${Date.now().toString(36)}`;
  await page.goto("#/n/basics/bit");
  await expect(page.getByRole("textbox", { name: "The note", exact: true })).toContainText("One fair coin toss");
  if (phone()) await page.getByRole("navigation", { name: "Panes" }).getByRole("button", { name: /^Note/ }).click();
  await page.getByRole("button", { name: "Note settings" }).click();
  await page.getByRole("button", { name: "A problem using it" }).click();
  await expect(page).toHaveURL(/#\/n\/basics\/untitled-problem(-\d+)?$/);
  await expect(page.locator(".titlerow > .glyph.problem")).toBeVisible();
  await expect(page.locator(".about a")).toHaveText(["The bit"]);
  const title = page.getByLabel("Title");
  await title.fill(`Two coins ${name}`);
  await title.press("Enter");
  await expect(page).toHaveURL(new RegExp(`#/n/basics/two-coins-${name}$`));
  const file = ((await (await page.request.get(`api/note?id=basics/two-coins-${name}`)).json()) as { text: string }).text;
  expect(file).toContain("type: Problem\n");
  expect(file).toContain("uses: [basics/bit]\n");
  await remove(page, `basics/two-coins-${name}`);
});

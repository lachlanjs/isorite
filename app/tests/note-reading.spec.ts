// Reading a note in the Note pane: a single newline is a line break (in the note, and in what is said in the Agent
// pane); wide blocks scroll in their own boxes while the text keeps wrapping inside the pane's margins; and a PDF is
// shown in the pane by the browser's own viewer, with a way to open it in a tab of its own.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES } from "./serve.ts";
import { attach, box, log, toAgent } from "./agent.ts";
import { pressHead } from "./switches.ts";

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const project = () => test.info().project.name;
const note = (title: string, body: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;

test.beforeAll(() => { mkdirSync(join(NOTES, "reading"), { recursive: true }); });

test("a single newline is a line break, in the note and in the Agent pane", async ({ page }) => {
  const id = `reading/lines-${project()}`;
  writeFileSync(join(NOTES, `${id}.md`), note("Lines", "First line\nsecond line\n\n- an item\n  its second line"));
  await page.goto(`#/n/${id}`);
  await page.getByRole("button", { name: "read", exact: true }).click();
  const top = async (text: string) => (await editor(page).locator(".cm-line", { hasText: text }).first().boundingBox())!.y;
  await expect(editor(page)).toContainText("second line");
  expect(await top("second line")).toBeGreaterThan(await top("First line"));
  expect(await top("its second line")).toBeGreaterThan(await top("an item"));

  // What the person says, drawn by the same renderer as the agent's answers.
  const agent = await attach();
  try {
    await toAgent(page);
    // The scripted model's `say` reads a written \n as a newline.
    await box(page).fill(`say Heard, ${project()}.\\nOn a line of its own.`);
    await box(page).press("Enter");
    const said = log(page).locator(".said").filter({ hasText: `Heard, ${project()}.` });
    await expect(said).toContainText("On a line of its own.");
    await expect(said.locator("br")).toHaveCount(1);
  } finally { await agent.detach(); }
});

test("wide blocks scroll in their own boxes and the text keeps wrapping, inside the pane's margins", async ({ page }) => {
  const id = `reading/wide-${project()}`;
  const row = `| ${Array.from({ length: 10 }, (_, i) => `a long heading cell number ${i}`).join(" | ")} |`;
  // The plain paragraph first, and the blocks short enough that all are drawn at a phone's height (CodeMirror draws
  // only what is near the view).
  const body = [
    "The first paragraph, plain text that wraps within the pane and never pushes it wider than it is, however long it runs.",
    `A long address: https://example.com/${"averyverylongpathsegment".repeat(4)} and on.`,
    `${row}\n|${"---|".repeat(10)}\n${row}`,
    `$$\nx = ${Array.from({ length: 30 }, (_, i) => `a_{${i}}`).join(" + ")}\n$$`,
    "```js\nconst x = \"" + "z".repeat(120) + "\";\n```",
    "```mermaid\nflowchart LR\n  A --> B --> C --> D --> E --> F --> G --> H --> I --> J --> K --> L\n```",
  ].join("\n\n");
  writeFileSync(join(NOTES, `${id}.md`), note("Wide", body));
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("The first paragraph");
  for (const mode of ["edit", "read"]) {
    if (mode === "read") await page.getByRole("button", { name: "read", exact: true }).click();
    await expect(editor(page).locator(".cm-lp-diagram svg").first()).toBeVisible();
    const m = await page.evaluate(() => {
      const art = document.querySelector("article.note")!, content = document.querySelector(".cm-content")!;
      const a = art.getBoundingClientRect(), c = content.getBoundingClientRect(), s = getComputedStyle(art);
      const last = [...document.querySelectorAll(".cm-line")].find((l) => l.textContent?.startsWith("The first paragraph"))!;
      const table = document.querySelector(".cm-lp-table .table-wrap")!, maths = document.querySelector(".cm-lp-maths .katex-display")!;
      return {
        page: document.documentElement.scrollWidth <= innerWidth, column: art.scrollWidth <= art.clientWidth + 1, content: c.right <= a.right - parseFloat(s.paddingRight) + 1,
        padLeft: parseFloat(s.paddingLeft), padRight: parseFloat(s.paddingRight), width: a.width,
        lastWraps: last.getClientRects().length > 0 && last.getBoundingClientRect().height > parseFloat(getComputedStyle(last).lineHeight) * 1.5,
        tableScrolls: table.scrollWidth > table.clientWidth, mathsScrolls: maths.scrollWidth > maths.clientWidth,
      };
    });
    expect(m.page, `${mode}: the window does not scroll sideways`).toBe(true);
    expect(m.column, `${mode}: the note's column does not scroll sideways`).toBe(true);
    expect(m.content, `${mode}: the text stays inside the right margin`).toBe(true);
    expect(m.lastWraps, `${mode}: the first paragraph wraps`).toBe(true);
    expect(m.tableScrolls && m.mathsScrolls, `${mode}: the table and the equation scroll in their own boxes`).toBe(true);
    // The side margins: 5% of the column (at least 1rem, at most 3rem), or a phone's 20px.
    expect(m.padLeft).toBe(m.padRight);
    expect(m.padLeft).toBeGreaterThanOrEqual(16);
    if (!project().startsWith("phone")) expect(m.padLeft).toBeCloseTo(Math.min(48, Math.max(16, m.width * 0.05)), 0);
    await page.screenshot({ path: `test-results/screens/${project()}-wide-${mode}.png` });
  }
});

test("a PDF opens in the Note pane, in the browser's own viewer, and can open in a tab of its own", async ({ page }) => {
  // Made with the base (serve.ts): a file added later is not listed until the server starts again.
  const path = "basics/paper.pdf";
  const popups: string[] = [];
  page.on("popup", (p) => popups.push(p.url()));
  await page.goto("#/notes");
  await pressHead(page, "note", "All notes");
  const row = page.locator(`[data-file="${path}"] a`);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(new RegExp(`#/n/${path.replace(/[.]/g, "\\.")}`));
  const frame = page.locator("iframe.pdf");
  await expect(frame).toBeVisible();
  const src = await frame.getAttribute("src");
  expect(src).toContain(`api/file?path=${encodeURIComponent(path)}`);
  const tab = page.getByRole("link", { name: "open in a new tab" });
  await expect(tab).toHaveAttribute("target", "_blank");
  await expect(tab).toHaveAttribute("href", src!);
  // Served to be shown where it is framed: a PDF, inline, and not sandboxed (which would stop the viewer).
  const got = await page.request.get(src!);
  expect([got.status(), got.headers()["content-type"], got.headers()["content-disposition"]?.startsWith("inline"), got.headers()["content-security-policy"]]).toEqual([200, "application/pdf", true, undefined]);
  expect(popups).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

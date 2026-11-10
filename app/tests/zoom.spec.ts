import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { NOTES } from "./serve.ts";
import { ask, attach, toAgent, type Attached } from "./agent.ts";

// Scale and wrapping: the app is meant to hold at browser zoom 67%-200% and with a larger default font size (so sizes are
// in rem), and a note's text wraps or scrolls inside its pane, never past its edge. A larger font size is made here by
// setting the root's font size, which is what the browser's own setting does.

const notePane = (page: Page) => page.locator('[data-pane="note"]');

/** Whether anything in the pane, or the pane itself, scrolls sideways outside a block that is meant to (code, tables, diagrams). */
async function overflow(page: Page) {
  return page.evaluate(() => {
    const pane = document.querySelector<HTMLElement>('[data-pane="note"]')!;
    const rect = pane.getBoundingClientRect();
    const own = (el: Element) => el.closest("pre, .table-wrap, .diagram, .katex-display");
    const wide = [...pane.querySelectorAll(".cm-content *")].filter((el) => !own(el) && el.getBoundingClientRect().right > rect.right + 1).map((el) => el.className || el.tagName);
    let el: HTMLElement | null = pane;
    const scrolls: string[] = [];
    for (const e of pane.querySelectorAll<HTMLElement>("*")) if (e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX === "visible" && !own(e) && e.clientWidth > 0 && e.closest(".cm-content")) scrolls.push(e.className);
    el = null;
    return { pane: pane.scrollWidth <= pane.clientWidth, page: document.documentElement.scrollWidth <= innerWidth, wide, scrolls };
  });
}

test("a very long word and a long URL wrap inside the note pane, at 100% and at a larger font size", async ({ page }) => {
  const name = test.info().project.name, id = `basics/long-${name}`;
  const word = "Supercalifragilisticexpialidocious".repeat(8), url = "https://example.com/" + "a-very-long-path-segment/".repeat(10) + "end";
  writeFileSync(join(NOTES, `${id}.md`), `---\ntype: Concept\ntitle: Long ${name}\n---\n\nA word: ${word}\n\nA link: ${url}\n\nA bare one: <${url}>\n\n\`\`\`\n${"x".repeat(300)}\n\`\`\`\n\n| a | b |\n| - | - |\n| ${word} | ${url} |\n\nAnd some ordinary prose after it, long enough to be seen wrapping at the right edge of the pane, as a paragraph does.\n`);
  await page.goto(`#/n/${id}`);
  await expect(notePane(page).getByText("A word:")).toBeVisible();
  for (const size of ["100%", "150%", "200%"]) {
    await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
    await page.waitForTimeout(150);
    const o = await overflow(page);
    expect(o, `at ${size}`).toEqual({ pane: true, page: true, wide: [], scrolls: [] });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});

test("the note's text has a margin at its side, inside the pane", async ({ page }) => {
  await page.goto("#/n/basics/bit");
  const line = notePane(page).locator(".cm-line").first();
  await expect(line).toBeVisible();
  const [p, l] = await Promise.all([notePane(page).boundingBox(), line.boundingBox()]);
  expect(l!.x - p!.x).toBeGreaterThanOrEqual(15);
  expect(p!.x + p!.width - (l!.x + l!.width)).toBeGreaterThanOrEqual(15);
});

test.describe("the agent's mark", () => {
  let agent: Attached;
  test.beforeAll(async () => { agent = await attach(); });
  test.afterAll(async () => { await agent.detach(); });

  test("is one gold diamond in the Agent pane, in a finished turn", async ({ page }) => {
    await page.goto("#/n/basics/bit");
    await toAgent(page);
    const mark = `mark ${test.info().project.name}`;
    const turn = await ask(page, `read basics/bit\nsay ${mark}`, mark);
    await expect(turn).toHaveAttribute("data-state", "done");
    const n = await page.evaluate(() => {
      const probe = document.createElement("i");
      probe.style.background = "var(--growth)";
      document.body.append(probe);
      const gold = getComputedStyle(probe).backgroundColor;
      probe.remove();
      let count = 0;
      const found: string[] = [];
      for (const el of document.querySelectorAll('[data-pane="agent"] *')) for (const at of [null, "::before", "::after"]) {
        const s = getComputedStyle(el, at);
        if (at && s.content === "none") continue;
        // Turned a quarter-ish way round: a matrix with a shear (b) is a rotation; a scale alone is a bar.
        const m = /^matrix\(([^)]*)\)$/.exec(s.transform)?.[1]?.split(",").map(Number);
        const turned = s.rotate !== "none" || (m !== undefined && Math.abs(m[1] ?? 0) > 0.1);
        if (s.backgroundColor === gold && turned && s.display !== "none") { count++; found.push(`${el.tagName}.${el.className} ${at} ${s.width} ${s.rotate} ${s.transform}`); }
      }
      return found;
    });
    expect(n).toHaveLength(1);
  });
});

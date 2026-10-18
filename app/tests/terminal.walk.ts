import { expect, test } from "@playwright/test";
import replay from "../src/lib/terminal/replay.json" with { type: "json" };

// The terminal's tour, replayed on the tutorial's site: every step's screen and card, stepped through with the keys.
test("the terminal's tour is replayed step by step, its screens drawn, without the browser's tour over it", async ({ page }) => {
  const failures: string[] = [];
  page.on("pageerror", (e) => failures.push(String(e)));
  await page.goto("./#/terminal");
  const card = page.locator(".card");
  await expect(card.locator("h2")).toHaveText(replay.frames[0]!.title);
  await expect(page.getByRole("dialog", { name: "The tutorial" })).toHaveCount(0);
  // The screen is drawn: a terminal's worth of dark ground with something on it.
  const inked = await page.locator("canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let k = 0; k < d.length; k += 4 * 97) if (d[k]! + d[k + 1]! + d[k + 2]! > 300) lit++;
    return { width: c.width, lit };
  });
  expect(inked.width).toBeGreaterThan(1000);
  expect(inked.lit).toBeGreaterThan(50);
  for (const frame of replay.frames.slice(1)) {
    await page.keyboard.press("ArrowRight");
    await expect(card.locator("h2")).toHaveText(frame.title);
  }
  await expect(card.getByRole("button", { name: "next" })).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(card.locator("h2")).toHaveText(replay.frames.at(-2)!.title);
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-terminal.png` });
  expect(failures).toEqual([]);
});

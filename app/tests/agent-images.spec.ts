// Images in the agent's box: pasted or dropped, each a thumbnail chip above the text that can be taken out by keyboard,
// sent with the turn (the scripted model says what it received), shown in the session and still there after a reload. A
// model that takes no images says so on the chip and the turn goes without it; a file that is not one, or too large, is
// refused on its chip.

import { expect, test, type Page } from "@playwright/test";
import { ask, attach, box, toAgent, type Attached } from "./agent.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const name = () => test.info().project.name;

/** A file given to the pane as a drop does, or to the box as a paste does. */
async function give(page: Page, how: "drop" | "paste", file: { name: string; type: string; b64?: string; size?: number }): Promise<void> {
  await expect(box(page)).toBeVisible();
  await page.evaluate(({ how, file }) => {
    const bytes = file.b64 ? Uint8Array.from(atob(file.b64), (c) => c.charCodeAt(0)) : new Uint8Array(file.size ?? 1);
    const data = new DataTransfer();
    data.items.add(new File([bytes], file.name, { type: file.type }));
    if (how === "paste") document.querySelector("[data-prompt] .cm-content")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    else for (const type of ["dragenter", "dragover", "drop"]) document.querySelector(".apane")!.dispatchEvent(new DragEvent(type, { dataTransfer: data, bubbles: true, cancelable: true }));
  }, { how, file });
}
const chips = (page: Page) => page.getByRole("list", { name: "Images to send" }).getByRole("listitem");

test.describe("a model that takes images", () => {
  let agent: Attached;
  test.beforeAll(async () => { agent = await attach(); });
  test.afterAll(async () => { await agent.detach(); });

  test("an image dropped on the pane is a chip with its thumbnail, sent with the turn, shown in the session and kept after a reload", async ({ page }) => {
    await page.goto("#/n/basics/bit");
    await toAgent(page);
    await give(page, "drop", { name: `${name()}-coin.png`, type: "image/png", b64: PNG });
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page).first().locator("img")).toBeVisible();
    await expect(chips(page).first().getByRole("button", { name: /Remove image/ })).toBeVisible();
    await page.screenshot({ path: `test-results/screens/${name()}-agent-image-chip.png` });
    const turn = await ask(page, `what do you see ${name()}`, `${name()}`);
    await expect(turn).toHaveAttribute("data-state", "done");
    await expect(turn.locator(".said")).toContainText(/Saw 1 image: image\/png, \d+ bytes/);
    await expect(chips(page)).toHaveCount(0);
    const shot = turn.locator(".shot img");
    await expect(shot).toHaveCount(1);
    await expect.poll(() => shot.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/screens/${name()}-agent-image-turn.png` });
    await page.reload();
    await toAgent(page);
    const again = page.getByRole("log", { name: "The agent's session" }).locator(".turn").filter({ hasText: `${name()}` }).locator(".shot img");
    await expect(again).toHaveCount(1);
    await expect.poll(() => again.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  });

  test("an image pasted into the box is a chip; it is taken out by keyboard and the turn goes without it", async ({ page }) => {
    await page.goto("#/n/basics/bit");
    await toAgent(page);
    await give(page, "paste", { name: "image.png", type: "image/png", b64: PNG });
    await expect(chips(page)).toHaveCount(1);
    const x = chips(page).first().getByRole("button", { name: /Remove image/ });
    await x.focus();
    await expect(x).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveCount(0);
    // Two, and Delete on one.
    await give(page, "paste", { name: "a.png", type: "image/png", b64: PNG });
    await give(page, "paste", { name: "b.png", type: "image/png", b64: PNG });
    await expect(chips(page)).toHaveCount(2);
    await chips(page).first().getByRole("button", { name: /Remove image/ }).focus();
    await page.keyboard.press("Delete");
    await expect(chips(page)).toHaveCount(1);
    await expect(box(page)).toBeFocused();
    const turn = await ask(page, `one image ${name()} paste`, `${name()} paste`);
    await expect(turn.locator(".said")).toContainText("Saw 1 image");
  });

  test("a file that is not a png, jpeg, gif or webp, or is over 5 MB, is refused on its chip and not sent", async ({ page }) => {
    await page.goto("#/n/basics/bit");
    await toAgent(page);
    await give(page, "drop", { name: "figure.svg", type: "image/svg+xml", b64: btoa("<svg/>") });
    await give(page, "drop", { name: "huge.png", type: "image/png", size: 5_100_000 });
    await expect(chips(page)).toHaveCount(2);
    await expect(chips(page).nth(0)).toContainText("Not a png, jpeg, gif or webp");
    await expect(chips(page).nth(1)).toContainText("Over 5 MB");
    const turn = await ask(page, `nothing came ${name()} refused`, `${name()} refused`);
    await expect(turn.locator(".said")).not.toContainText("Saw");
    await expect(turn.locator(".shot")).toHaveCount(0);
  });
});

test.describe("a model that takes no images", () => {
  let agent: Attached;
  test.beforeAll(async () => { agent = await attach(true); });
  test.afterAll(async () => { await agent.detach(); });

  test("the chip says so, and the turn goes without the image", async ({ page }) => {
    await page.goto("#/n/basics/bit");
    await toAgent(page);
    await give(page, "paste", { name: "image.png", type: "image/png", b64: PNG });
    await expect(chips(page)).toHaveCount(1);
    await expect(chips(page).first()).toContainText("does not take images");
    await page.screenshot({ path: `test-results/screens/${name()}-agent-image-blind.png` });
    const turn = await ask(page, `plain ${name()} blind`, `${name()} blind`);
    await expect(turn).toHaveAttribute("data-state", "done");
    await expect(turn.locator(".said")).not.toContainText("Saw");
    await expect(turn.locator(".shot")).toHaveCount(0);
    await expect(chips(page)).toHaveCount(0);
  });
});

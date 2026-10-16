import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { STUDY } from "./serve.ts";

const editor = (page: Page) => page.getByRole("textbox", { name: "The note", exact: true });
const phone = () => test.info().project.name.startsWith("phone");
async function look(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} is no wider than the window`).toBe(true);
}

/** The server's Api, as the page would call it. */
async function api(page: Page, method: string, path: string, body?: unknown): Promise<unknown> {
  return page.evaluate(async ({ method, path, body }) => {
    const { token } = await (await fetch("api/session")).json() as { token: string };
    const res = await fetch("api/" + path, { method, headers: { "Content-Type": "application/json", "x-isorite-token": token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return res.json();
  }, { method, path, body });
}

/** A note of this test's own, and an exercise on it with two lines of working; the exercise opened. */
async function open(page: Page, what: string): Promise<{ note: string; id: string }> {
  const name = `${what}-${test.info().project.name}`, note = `basics/${name}`, id = `@study/basics/${name}`;
  await page.goto("#/notes");
  await api(page, "POST", `note?id=${encodeURIComponent(note)}`, { text: `---\ntype: Concept\ntitle: Coin ${name}\n---\n\nA fair coin has two equally likely sides.\n` });
  await api(page, "POST", `note?id=${encodeURIComponent(id)}`, { text: `---\ntype: Exercise\nkind: written\ntitle: A coin\ntests: [${note}]\n---\n\nShow that a fair coin carries one bit.\n\n## Working\n\nTwo sides, each with probability 1/2.\n\nSo it is right: one bit.\n` });
  await page.goto(`#/n/${id}`);
  await expect(editor(page)).toContainText("Two sides, each with probability 1/2.");
  return { note, id };
}

/** Select a line of the working, end to end. */
async function select(page: Page, text: string) {
  await editor(page).getByText(text).click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
}

const lit = (page: Page) => page.locator(".bar .squares .pip.lv");

test("an exercise: mark a selection as the answer, send it for marking, see the marks and the squares move, wind back", async ({ page }) => {
  const { note, id } = await open(page, "mark");
  const file = join(STUDY, "study", `${id.slice("@study/".length)}.md`);
  // What it is and what it tests, the question large, the working under its label; the squares empty.
  await expect(page.locator(".tests")).toContainText("written response · tests");
  await expect(page.locator(".tests").getByRole("link")).toHaveText(`Coin ${note.split("/")[1]}`);
  await expect(page.locator(".cm-iso-question")).toContainText("Show that a fair coin carries one bit.");
  await expect(page.locator(".cm-iso-working")).toBeVisible();
  await expect(page.locator(".bar")).toContainText("written response");
  await expect(lit(page)).toHaveCount(0);
  const send = page.getByRole("button", { name: "send for marking" });
  await expect(send).toBeDisabled();

  // The answer is any selection of the working, kept over a reload, never in the file.
  await select(page, "So it is right: one bit.");
  await page.getByRole("button", { name: "mark as answer" }).click();
  await expect(page.locator(".cm-iso-answer")).toHaveText("So it is right: one bit.");
  await expect(page.locator(".cm-content")).toContainText("your answer");
  await look(page, "exercise-answer");
  await page.reload();
  await expect(page.locator(".cm-iso-answer")).toHaveText("So it is right: one bit.");
  expect(readFileSync(file, "utf8")).not.toContain("your answer");

  // Marked: the answer right, the chip, a square, what moved, and the cost.
  const before = readFileSync(file, "utf8");
  await page.getByRole("button", { name: "send for marking" }).click();
  await expect(page.locator(".cm-iso-right")).toHaveText("So it is right: one bit.");
  await expect(page.locator(".cm-content .chip")).toHaveText("1 right");
  await expect(lit(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "mark it again" })).toBeEnabled();
  await expect(page.locator(".foot")).toContainText(`moves: Coin ${note.split("/")[1]} +1`);
  expect(readFileSync(file, "utf8")).toBe(before);
  expect((await api(page, "GET", "map") as { notes: Record<string, { step: number }> }).notes[note]!.step).toBe(1);
  await look(page, "exercise-marked");

  // The squares say why, and wind back takes one away.
  await page.locator(".bar .squares").click();
  await expect(page.locator(".why")).toContainText("Exact, and unaided.");
  await page.locator(".why").getByRole("button", { name: "[ wind back ]" }).click();
  await expect(lit(page)).toHaveCount(0);
  await expect(page.locator(".why")).toContainText("you wound it back");

  // An edit inside the answer drops its mark and the answer with it; send waits for a new one.
  await editor(page).getByText("So it is right: one bit.").click();
  await page.keyboard.press("Home");
  for (let k = 0; k < 2; k++) await page.keyboard.press("ArrowRight");
  await page.keyboard.type(", then,");
  await expect(page.locator(".cm-iso-right")).toHaveCount(0);
  await expect(page.locator(".cm-iso-answer")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "mark it again" })).toBeDisabled();
});

test("a wrong answer is marked wrong in rose and lowers nothing below nothing", async ({ page }) => {
  const { id } = await open(page, "wrong");
  void id;
  await select(page, "Two sides, each with probability 1/2.");
  await page.getByRole("button", { name: "mark as answer" }).click();
  await page.getByRole("button", { name: "send for marking" }).click();
  await expect(page.locator(".cm-iso-wrong")).toHaveText("Two sides, each with probability 1/2.");
  await expect(page.locator(".cm-content")).toContainText("× wrong");
  await expect(page.locator(".cm-content .chip")).toHaveText("× 1 wrong");
  await expect(lit(page)).toHaveCount(0);
  if (!phone()) await expect(page.locator(".bar").getByRole("button", { name: "[ wind back ]" })).toBeVisible();
  await look(page, "exercise-wrong");
});

test("an exercise asked for from a note's margin, after another: kept, it follows that one, and the study page lists both", async ({ page }) => {
  const name = `ask-${test.info().project.name}`, note = `basics/${name}`, first = `basics/first-${name}`;
  await page.goto("#/notes");
  await api(page, "POST", `note?id=${encodeURIComponent(note)}`, { text: `---\ntype: Concept\ntitle: Dice ${name}\n---\n\nA fair die has six equally likely faces.\n` });
  await api(page, "POST", `note?id=${encodeURIComponent("@study/" + first)}`, { text: `---\ntype: Exercise\nkind: written\ntitle: The first ${name}\ntests: [${note}]\n---\n\nHow many faces?\n\n## Working\n\n` });

  // The note's margin: its squares, the one exercise on it, and the way to ask for another.
  await page.goto(`#/n/${note}`);
  const margin = page.locator(".margin");
  await expect(margin.locator(".pip")).toHaveCount(6);
  await expect(margin.getByRole("link")).toHaveText("1 exercise");
  await look(page, "note-margin");
  await margin.getByRole("button", { name: "[ + an exercise ]" }).click();

  // The request: what it tests (this note), where it goes, what it comes after.
  await expect(page.locator(".draft")).toContainText("for Iso · an exercise");
  await expect(page.locator(".draft h1")).toHaveText(`An exercise on Dice ${name}`);
  await expect(page.locator(".deck .chip")).toHaveText(new RegExp(`Dice ${name}`));
  await page.getByRole("combobox", { name: "Comes after" }).selectOption(first);
  await expect(page.getByRole("combobox", { name: "Folder" })).toHaveValue("basics");
  await look(page, "exercise-request");
  await page.getByRole("button", { name: "send to Iso" }).click();

  // Iso's exercise, to keep: its title, its question.
  await expect(page.locator(".extitle")).toHaveText("a scripted exercise");
  await expect(page.locator(".question")).toContainText("What is the entropy of a fair coin, in bits?");
  await look(page, "exercise-proposed");
  await page.getByRole("button", { name: "keep the exercise" }).click();

  // Kept: the exercise opens, its question in place, the working to write; the first now leads to it.
  await expect(page.locator(".cm-iso-question")).toContainText("What is the entropy of a fair coin, in bits?");
  await expect(page.locator(".cm-iso-working")).toBeVisible();
  const kept = decodeURIComponent(page.url().split("#/n/")[1]!);
  expect(kept).toMatch(/^@study\/basics\/a-scripted-exercise(-\d+)?$/); // each size and ground keeps one more
  await expect(page.locator(".bar").getByRole("link", { name: "next" })).toHaveCount(0);
  await page.goto(`#/n/@study/${first}`);
  const next = page.locator(".bar").getByRole("link", { name: "next" });
  if (!phone()) {
    await expect(next).toBeVisible();
    await next.click();
    await expect(page).toHaveURL(new RegExp(`#/n/${kept.replace(/[/@]/g, "\\$&")}$`));
  }

  // The study page: both, the never-tried before the one tried; and narrowed to the note, only those two.
  await page.goto(`#/study?note=${encodeURIComponent(note)}`);
  await expect(page.locator(".list .sr")).toHaveCount(2);
  await expect(page.locator(".list .sr").first()).toContainText("written");
  await expect(page.locator(".list .sr").first()).toContainText(`tests Dice ${name}`);
  await page.goto("#/study");
  await expect(page.locator(".list .frame-title")).toHaveText("study · next for you");
  await expect(page.locator(".list .sr .t").filter({ hasText: "Build a prefix code" })).toBeVisible();
  const titles = await page.locator(".list .sr .t").allTextContents();
  // The seeded prefix code, tried three times, comes after every exercise never tried.
  expect(titles.indexOf("Build a prefix code")).toBeGreaterThan(titles.indexOf(`The first ${name}`));
  await expect(page.locator(".folders")).toContainText("basics");
  await look(page, "study");
});

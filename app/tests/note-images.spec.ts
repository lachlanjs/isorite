// Images dropped or pasted onto a note or the Atlas are saved in the base beside the note (its folder, by the name they came
// with, not over another) and shown by a Markdown link: at the cursor or drop point in the note's editor; at the end of the
// note dropped on in the Atlas; on a region's bare ground, saved in that folder alone.

import { expect, test, type Page } from "@playwright/test";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const name = () => test.info().project.name;
const phone = (page: Page) => (page.viewportSize()?.width ?? 1280) <= 760;

async function api(page: Page) {
  const { token } = (await (await page.request.get("api/session")).json()) as { token: string };
  return { "x-isorite-token": token, origin: new URL(test.info().project.use.baseURL!).origin };
}
async function make(page: Page, id: string, text: string) {
  expect((await page.request.post(`api/note?id=${id}`, { data: { text }, headers: await api(page) })).ok()).toBe(true);
}
const read = async (page: Page, id: string) => (await (await page.request.get(`api/note?id=${id}`)).json()) as { text: string; version: string };
async function remove(page: Page, id: string) {
  await page.request.post(`api/note/delete?id=${id}`, { data: { base: (await read(page, id)).version }, headers: await api(page) });
}
const pictures = async (page: Page) => ((await (await page.request.get("api/pictures")).json()) as { path: string }[]).map((p) => p.path);

/** A drop of a file at a point of the screen, on whatever is there: the events a browser sends. */
async function dropAt(page: Page, x: number, y: number, file: { name: string; type: string; b64: string }, how: "drop" | "paste" = "drop"): Promise<void> {
  await page.evaluate(({ x, y, file, how }) => {
    const data = new DataTransfer();
    data.items.add(new File([Uint8Array.from(atob(file.b64), (c) => c.charCodeAt(0))], file.name, { type: file.type }));
    const target = how === "paste" ? document.querySelector(".cm-content")! : document.elementFromPoint(x, y)!;
    if (how === "paste") target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    else for (const type of ["dragenter", "dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
  }, { x, y, file, how });
}

test("an image dropped in a note is saved beside it and linked where it was dropped; pasted, at the cursor; a name taken is counted up", async ({ page }) => {
  const id = `basics/drop-${name()}`;
  await make(page, id, `---\ntype: Concept\ntitle: Drop ${name()}\n---\n\nFirst line.\n\nSecond line.\n`);
  try {
    await page.goto(`#/n/${id}`);
    const editor = page.getByRole("textbox", { name: "The note", exact: true });
    await expect(editor).toContainText("Second line.");
    const box = (await editor.boundingBox())!;
    const file = { name: `${name()}-Coin.PNG`, type: "image/png", b64: PNG };
    await dropAt(page, box.x + 20, box.y + 6, file);
    const kept = `basics/${name()}-coin.png`;
    await expect.poll(() => pictures(page)).toContain(kept);
    // Saved beside the note, and linked from it, relative to the note.
    await expect.poll(async () => (await read(page, id)).text, { timeout: 10_000 }).toContain(`![${name().replaceAll("-", " ")} coin](${name()}-coin.png)`);
    expect((await page.request.get(`api/file?path=${kept}`)).headers()["content-type"]).toBe("image/png");
    await page.screenshot({ path: `test-results/screens/${name()}-note-image.png` });
    // The same name again, pasted at the cursor: counted up, not over the first.
    await editor.getByText("Second line.").click();
    await dropAt(page, 0, 0, { ...file, name: "image.png" }, "paste");
    await expect.poll(async () => (await pictures(page)).filter((p) => /basics\/pasted-/.test(p)).length).toBeGreaterThan(0);
    await dropAt(page, box.x + 20, box.y + 6, file);
    await expect.poll(() => pictures(page)).toContain(`basics/${name()}-coin-2.png`);
    await expect.poll(async () => (await read(page, id)).text, { timeout: 10_000 }).toContain(`(${name()}-coin-2.png)`);
    // Something that is not an image is not taken: said, and nothing saved.
    const before = (await pictures(page)).length;
    await dropAt(page, box.x + 20, box.y + 6, { name: "figure.svg", type: "image/svg+xml", b64: btoa("<svg/>") });
    await expect(page.getByRole("status").filter({ hasText: "not a png, jpeg, gif or webp" })).toBeVisible();
    expect((await pictures(page)).length).toBe(before);
  } finally { await remove(page, id); }
});

test("an image dropped on a note on the Atlas is saved beside it and linked at its end; on a region's ground, saved in that folder alone", async ({ page }) => {
  const id = `basics/atlas-${name()}`;
  await make(page, id, `---\ntype: Concept\ntitle: Atlas ${name()}\n---\n\nIt waits for a picture.\n`);
  try {
    await page.goto("#/atlas");
    if (phone(page)) await expect.poll(() => page.locator('[data-pane="atlas"]').evaluate((el) => Math.round(el.getBoundingClientRect().left))).toBe(0);
    const note = page.locator(`[data-note="${id}"]`);
    await expect(note).toBeVisible();
    const n = (await note.boundingBox())!;
    await dropAt(page, n.x + n.width / 2, n.y + n.height / 2, { name: `${name()}-onnote.png`, type: "image/png", b64: PNG });
    await expect(page.getByRole("status").filter({ hasText: /Added to Atlas/ })).toBeVisible();
    await expect.poll(() => pictures(page)).toContain(`basics/${name()}-onnote.png`);
    await expect.poll(async () => (await read(page, id)).text).toMatch(new RegExp(`It waits for a picture\\.\\n+!\\[${name().replace(/-/g, " ")} onnote\\]\\(${name()}-onnote\\.png\\)\\n$`));
    await page.screenshot({ path: `test-results/screens/${name()}-atlas-image.png` });

    // On a region's own ground: only saved there.
    const f = (await page.locator('.atlas [data-folder="channels"]').boundingBox())!;
    await dropAt(page, f.x + f.width - 8, f.y + f.height - 8, { name: `${name()}-ground.png`, type: "image/png", b64: PNG });
    await expect(page.getByRole("status").filter({ hasText: "Saved in channels" })).toBeVisible();
    await expect.poll(() => pictures(page)).toContain(`channels/${name()}-ground.png`);
    expect((await read(page, "channels/huffman-in-code")).text).not.toContain(`${name()}-ground`);
    // Something that is not an image is said so.
    await dropAt(page, f.x + f.width - 8, f.y + f.height - 8, { name: "x.txt", type: "text/plain", b64: btoa("x") });
    await expect(page.getByRole("alert").filter({ hasText: "Only images" })).toBeVisible();
  } finally { await remove(page, id); }
});

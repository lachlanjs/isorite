// Pictures (M22): given from the notes or the repository by their path, and nothing else that way.

import { expect, test } from "vitest";
import { sha256 } from "@isorite/core";
import { Engine, MemoryFiles } from "../src/index.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const NOTE = "---\ntype: Concept\ntitle: Hitboxes\n---\n\n![the player](hitboxes/player.png)\n";

async function open(repo: MemoryFiles | null = null) {
  const notes = new MemoryFiles({ "combat/hitboxes.md": NOTE }), own = new MemoryFiles();
  await notes.writeBytes("combat/hitboxes/player.png", PNG);
  await notes.writeBytes(".hidden/p.png", PNG);
  const engine = await Engine.open({ notes, own, clock: { now: () => 0 }, device: "laptop1", name: "game", ...(repo ? { repository: () => repo } : {}) });
  return { engine, notes };
}

test("bytes are hashed as bytes, and text as its UTF-8", () => {
  expect(sha256(new TextEncoder().encode("abc"))).toBe(sha256("abc"));
  expect(sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("memory files keep bytes apart from text, and list both", async () => {
  const { notes } = await open();
  expect(await notes.readBytes("combat/hitboxes/player.png")).toEqual(PNG);
  expect(await notes.read("combat/hitboxes/player.png")).toBeNull();
  expect(await notes.list("combat/hitboxes")).toEqual([{ name: "player.png", dir: false, size: PNG.length }]);
  await notes.remove("combat/hitboxes/player.png");
  expect(await notes.readBytes("combat/hitboxes/player.png")).toBeNull();
});

test("a picture in the notes is given with its type and a version; nothing else is", async () => {
  const { engine } = await open();
  expect(await engine.file("combat/hitboxes/player.png")).toEqual({ bytes: PNG, type: "image/png", version: sha256(PNG).slice(0, 16) });
  expect(await engine.file("/combat/hitboxes/player.png")).toMatchObject({ type: "image/png" });
  for (const path of ["combat/hitboxes.md", ".hidden/p.png", "combat/../combat/hitboxes/player.png", "../x.png", "combat//hitboxes/player.png", "gone.png", ""]) {
    expect([path, await engine.file(path)]).toEqual([path, null]);
  }
});

test("a picture in the repository, once one is named", async () => {
  const repo = new MemoryFiles();
  await repo.writeBytes("assets/sprite.webp", PNG);
  const { engine } = await open(repo);
  expect(await engine.file("assets/sprite.webp", "code")).toBeNull();
  await engine.nameRepository("../code");
  expect(await engine.file("assets/sprite.webp", "code")).toMatchObject({ type: "image/webp" });
  expect(await engine.file("../assets/sprite.webp", "code")).toBeNull();
  expect(await engine.file("assets/sprite.txt", "code")).toBeNull();
});

test("every picture in the notes, found afresh, with its size and hash; one added by hand is no longer broken", async () => {
  const { engine, notes } = await open();
  expect(await engine.pictures()).toEqual([{ path: "combat/hitboxes/player.png", bytes: PNG.length, width: null, height: null, sha256: sha256(PNG) }]);
  await notes.write("combat/dodge.md", "---\ntype: Concept\ntitle: Dodge\n---\n\n![roll](/art/roll.svg)\n");
  await engine.reload();
  expect(engine.bundle.issues.filter((i) => i.code === "broken-link").map((i) => i.path)).toEqual(["combat/dodge.md"]);
  await notes.writeBytes("art/roll.svg", new TextEncoder().encode('<svg viewBox="0 0 48 24"/>'));
  expect((await engine.pictures()).map((p) => [p.path, p.width, p.height])).toEqual([["art/roll.svg", 48, 24], ["combat/hitboxes/player.png", null, null]]);
  expect(engine.bundle.issues.filter((i) => i.code === "broken-link")).toEqual([]);
  await notes.remove("art/roll.svg");
  expect((await engine.pictures()).map((p) => p.path)).toEqual(["combat/hitboxes/player.png"]);
  expect(engine.bundle.issues.filter((i) => i.code === "broken-link").map((i) => i.path)).toEqual(["combat/dodge.md"]);
});

test("a picture is saved where it's free, at a picture's path, and then listed", async () => {
  const { engine, notes } = await open();
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9]);
  expect(await engine.savePicture("combat/hitboxes/dodge.png", png)).toMatchObject({ path: "combat/hitboxes/dodge.png", bytes: 5, sha256: sha256(png) });
  expect(await notes.readBytes("combat/hitboxes/dodge.png")).toEqual(png);
  await expect(engine.savePicture("combat/hitboxes/dodge.png", PNG)).rejects.toMatchObject({ status: 409 });
  expect(await notes.readBytes("combat/hitboxes/dodge.png")).toEqual(png);
  for (const path of ["combat/hitboxes.md", "x.html", ".isorite/p.png", "../p.png", "a//p.png", "a\\b.png"]) await expect(engine.savePicture(path, png)).rejects.toMatchObject({ status: 400 });
  expect((await engine.pictures()).map((p) => p.path)).toEqual(["combat/hitboxes/dodge.png", "combat/hitboxes/player.png"]);
});

test("a picture from the repository is checked as a code link is: broken when its file is gone", async () => {
  const repo = new MemoryFiles();
  await repo.writeBytes("assets/player.png", PNG);
  const { engine, notes } = await open(repo);
  await engine.nameRepository("../code");
  await notes.write("combat/sprites.md", "---\ntype: Concept\ntitle: Sprites\n---\n\n![the player](code:assets/player.png) ![gone](code:assets/gone.png)\n");
  await engine.reload();
  expect((await engine.notes()).notes.find((n) => n.id === "combat/sprites")?.broken).toEqual(["code:assets/gone.png"]);
});

test("the Atlas's report has the pictures a note shows, each once, and not as code links", async () => {
  const { engine, notes } = await open();
  await notes.write("combat/hitboxes.md", NOTE + "\n![again](hitboxes/player.png) ![gone](gone.png) [a link](hitboxes/player.png) ![repo](code:assets/p.png) [code](code:src/a.ts)\n");
  await engine.reload();
  const r = (await engine.map()).notes["combat/hitboxes"]!;
  expect(r.links).toEqual([{ kind: "code", href: "code:src/a.ts", text: "code" }]);
  expect(r.pictures).toEqual([
    { href: "combat/hitboxes/player.png", path: "combat/hitboxes/player.png", from: "notes", text: "the player" },
    { href: "combat/gone.png", path: "combat/gone.png", from: "notes", text: "gone", broken: true },
    { href: "code:assets/p.png", path: "assets/p.png", from: "code", text: "repo" },
  ]);
});

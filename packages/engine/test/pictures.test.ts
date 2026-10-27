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

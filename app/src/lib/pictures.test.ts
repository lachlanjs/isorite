import { expect, test } from "vitest";
import { pictureOf } from "./pictures.ts";

test("a picture's path, from the note, from the top of the notes, or in the repository (M22)", () => {
  const at = (href: string) => pictureOf(href, "combat/hitboxes");
  expect(at("hitboxes/player.png")).toEqual({ path: "combat/hitboxes/player.png", from: "notes" });
  expect(at("./hitboxes/player%20idle.PNG")).toEqual({ path: "combat/hitboxes/player idle.PNG", from: "notes" });
  expect(at("../art/sheet.webp")).toEqual({ path: "art/sheet.webp", from: "notes" });
  expect(at("/art/sheet.webp")).toEqual({ path: "art/sheet.webp", from: "notes" });
  expect(at("<hitboxes/a b.png>")).toEqual({ path: "combat/hitboxes/a b.png", from: "notes" });
  expect(at("code:assets/player.png#L3")).toEqual({ path: "assets/player.png", from: "code" });
  expect(pictureOf("p.svg", "top")).toEqual({ path: "p.svg", from: "notes" });
  // Not pictures, or out of the notes.
  for (const href of ["../../up.png", "fig.html", "other.md", "https://x.org/p.png", "code:../p.png", "code:src/sim.py", "", "#top"]) expect([href, at(href)]).toEqual([href, null]);
});

test("a picture's first description is its file name in words", async () => {
  const { describedAs } = await import("./editor/links.ts");
  expect([describedAs("art/sprites/player-idle.png"), describedAs("pasted-2026-10-27_0413.png"), describedAs("Tree.svg")]).toEqual(["player idle", "pasted 2026 10 27 0413", "Tree"]);
});

test("a pasted or dropped picture's name: safe, and when it was pasted (M22)", async () => {
  const { safeName, pastedName, digest } = await import("./pictures.ts");
  expect(["Player Idle (1).png", "Ünïcode  café.JPEG", "...hidden", "a/b\\c.svg", "--x--"].map(safeName)).toEqual(["player-idle-1", "unicode-cafe", "hidden", "a-b-c", "x"]);
  expect(pastedName(new Date(2026, 9, 27, 4, 13))).toBe("pasted-2026-10-27-0413");
  const { sha256 } = await import("@isorite/core");
  const bytes = new Uint8Array([1, 2, 3, 250]);
  expect(await digest(bytes)).toBe(sha256(bytes));
});

test("pictures are satellites when switched on, after the note's links (M22)", async () => {
  const { satellites } = await import("./atlas/kinds.ts");
  const item = { ref: "combat/hitboxes", gx: 0, gy: 0, w: 10, h: 3 } as Parameters<typeof satellites>[0][number];
  const notes = { "combat/hitboxes": { title: "Hitboxes", tokens: 1, links: [{ kind: "code" as const, href: "code:src/hit.ts", text: "hit.ts" }], pictures: [{ href: "combat/hitboxes/p.png", path: "combat/hitboxes/p.png", from: "notes" as const, text: "the player" }, { href: "code:assets/gone.png", path: "assets/gone.png", from: "code" as const, text: "gone", broken: true as const }] } };
  expect(satellites([item], notes, { web: false, code: true })).toMatchObject([{ kind: "code" }]);
  expect(satellites([item], notes, { web: false, code: true, pictures: true }).map((s) => [s.kind, s.text, s.broken, s.note, s.picture?.from, s.gx, s.gy])).toEqual([
    ["code", "hit.ts", false, "combat/hitboxes", undefined, 11, 0],
    ["picture", "the player", false, "combat/hitboxes", "notes", 15, 0],
    ["picture", "gone", true, "combat/hitboxes", "code", 19, 0],
  ]);
});

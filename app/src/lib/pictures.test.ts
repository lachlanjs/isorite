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

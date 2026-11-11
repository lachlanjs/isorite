// Lenses (docs/lenses.md): the file read, the notes resolved into islands, ghosts, Elsewhere, order, and a rename followed.

import { expect, test } from "vitest";
import { Bundle, ELSEWHERE, allIslands, ghostOf, globRe, islandNotes, lensModel, lensNotes, mapModel, parseLens, renameInLens, resolveLens } from "../src/index.ts";

const file = (path: string, meta: string, body = "") => ({ path, text: `---\n${meta}\n---\n\n${body}\n` });
const base = Bundle.fromFiles([
  file("combat/overview.md", "type: Concept\ntitle: Combat"),
  file("combat/hitboxes.md", "type: Concept\ntitle: Hit boxes\ntags: [combat]", "See [it](/combat/overview.md)."),
  file("combat/weapons/sword.md", "type: Concept\ntitle: Sword"),
  file("design/damage.md", "type: Concept\ntitle: Damage\ntags: [balance]"),
  file("design/why.md", "type: Question\ntitle: Why?\nabout: [design/damage]"),
  file("misc/loose.md", "type: Concept\ntitle: Loose"),
]);
const notes = lensNotes(base);

const TEXT = `title = "By kind"
[[islands]]
name = "Open questions"
match = ["kind:question", "kind:problem"]

[[islands]]
name = "Combat"
title = "The fight"
notes = ["/design/damage.md", "/combat/hitboxes.md"]
match = ["path:/combat/**", "links-to:/combat/overview.md", "-path:/combat/weapons/**"]
[[islands.islands]]
name = "Weapons"
match = ["path:/combat/weapons/**"]

[[islands]]
name = "Balance"
match = ["tag:balance", "tag:combat"]
`;

test("a lens file is read: title, islands in file order, an island's own title, nested islands", () => {
  const lens = parseLens("by-kind", TEXT);
  expect(lens.problems).toEqual([]);
  expect(lens.title).toBe("By kind");
  expect(lens.islands.map((i) => i.name)).toEqual(["Open questions", "Combat", "Balance"]);
  expect(lens.islands[1]).toMatchObject({ title: "The fight", notes: ["design/damage", "combat/hitboxes"], islands: [{ name: "Weapons", title: "Weapons" }] });
});

test("a lens file's mistakes are named, and a text that is not TOML gives no islands", () => {
  const bad = parseLens("x", `[[islands]]\nname = "A"\nmatch = ["colour:red", "kind:thing", "tag:"]\n[[islands]]\nmatch = []\n`);
  expect(bad.problems.map((p) => p.message)).toEqual([
    expect.stringContaining('"colour:red" is not a rule'), expect.stringContaining("a kind is note, question or problem"), expect.stringContaining('"tag:" is not a rule'), expect.stringContaining("needs a name"),
  ]);
  const broken = parseLens("y", "islands = [");
  expect(broken.islands).toEqual([]);
  expect(broken.problems[0]!.message).toMatch(/^not TOML/);
});

test("a glob: ** crosses folders, * does not", () => {
  expect(globRe("/combat/**").test("/combat/weapons/sword.md")).toBe(true);
  expect(globRe("/combat/*").test("/combat/weapons/sword.md")).toBe(false);
  expect(globRe("/**/overview.md").test("/combat/overview.md")).toBe(true);
  expect(globRe("/a.b").test("/aXb")).toBe(false);
});

test("notes are placed: the deepest island that holds one, the first in file order as home, the rest as ghosts, none as Elsewhere", () => {
  const r = resolveLens(parseLens("by-kind", TEXT), notes);
  const [questions, combat, balance] = r.islands;
  expect(questions!.notes).toEqual(["design/why"]);
  // Listed notes come first, in the order listed; then those a rule selected, by id. Combat holds sword only through Weapons.
  expect(combat!.notes).toEqual(["design/damage", "combat/hitboxes", "combat/overview"]);
  expect(combat!.islands[0]!.notes).toEqual(["combat/weapons/sword"]);
  // Damage and Hit boxes are at home in Combat and also match Balance: ghosts there, never boxes.
  expect(balance!.notes).toEqual([]);
  expect(balance!.ghosts).toEqual(["combat/hitboxes", "design/damage"]);
  expect(r.elsewhere).toEqual(["misc/loose"]);
  expect(r.home["combat/hitboxes"]).toBe(":Combat");
  expect(r.home["combat/weapons/sword"]).toBe(":Combat/Weapons");
  expect(r.home["misc/loose"]).toBe(ELSEWHERE);
  // Every note once, in the lens's order: an island's own notes, then its islands', Elsewhere last.
  expect(r.order).toEqual(["design/why", "design/damage", "combat/hitboxes", "combat/overview", "combat/weapons/sword", "misc/loose"]);
  expect(new Set(r.order).size).toBe(notes.length);
});

test("a lens can be a path: islands and the notes an island lists keep the file's order, not the alphabet", () => {
  const r = resolveLens(parseLens("path", `[[islands]]\nname = "Second"\ntitle = "Step 1"\nnotes = ["/misc/loose.md", "/design/damage.md"]\n[[islands]]\nname = "First"\ntitle = "Step 2"\nnotes = ["/combat/overview.md"]\n`), notes);
  expect(r.islands.map((i) => i.title)).toEqual(["Step 1", "Step 2"]);
  expect(r.islands[0]!.notes).toEqual(["misc/loose", "design/damage"]);
  expect(r.order.slice(0, 3)).toEqual(["misc/loose", "design/damage", "combat/overview"]);
});

test("negation takes notes out of what the rules select, not out of what is listed", () => {
  const r = resolveLens(parseLens("n", `[[islands]]\nname = "A"\nnotes = ["/combat/overview.md"]\nmatch = ["path:/combat/**", "-tag:combat", "-path:/combat/overview.md"]\n`), notes);
  expect(r.islands[0]!.notes).toEqual(["combat/overview", "combat/weapons/sword"]);
});

test("what is wrong with a lens against the notes: gone notes, rules that match nothing, empty and duplicate islands", () => {
  const r = resolveLens(parseLens("p", `[[islands]]\nname = "A"\nnotes = ["/gone/note.md"]\nmatch = ["tag:nothing"]\n[[islands]]\nname = "A"\n[[islands]]\nname = "Neg"\nmatch = ["-tag:x"]\n`), notes);
  const said = r.problems.map((p) => `${p.level}: ${p.message}`);
  expect(said).toContain("error: A: gone/note.md.md is not in the base".replace(".md.md", ".md"));
  expect(said).toContain('warning: A: "tag:nothing" matches no note');
  expect(said).toContain("warning: A: two islands have this name");
  expect(said).toContain("warning: A: holds no notes");
  expect(said).toContain("warning: Neg: a rule that only negates selects nothing");
  expect(r.islands[0]!.gone).toEqual(["gone/note"]);
  expect(r.islands[1]!.ref).toBe(":A (2)");
});

test("the map of a lens: islands for folders, each note once at its home, Elsewhere last; a filter by island", () => {
  const r = resolveLens(parseLens("by-kind", TEXT), notes);
  const model = lensModel(mapModel(base), r);
  const names = (d: typeof model.root): string[] => d.children.flatMap((c) => (c.kind === "dir" ? [c.ref, ...names(c)] : [c.ref]));
  expect(names(model.root)).toEqual([":Open questions", "design/why", ":Combat", ":Combat/Weapons", "combat/weapons/sword", "design/damage", "combat/hitboxes", "combat/overview", ":Balance", "ghost:combat/hitboxes::Balance", "ghost:design/damage::Balance", ":", "misc/loose"]);
  expect(ghostOf("ghost:combat/hitboxes::Balance")).toBe("combat/hitboxes");
  expect(ghostOf("combat/hitboxes")).toBeNull();
  expect(allIslands(r).map((i) => i.ref)).toEqual([":Open questions", ":Combat", ":Combat/Weapons", ":Balance"]);
  expect([...islandNotes(r, "Weapons")!]).toEqual(["combat/weapons/sword"]);
  expect([...islandNotes(r, "the fight")!].sort()).toEqual(["combat/hitboxes", "combat/overview", "combat/weapons/sword", "design/damage"]);
  expect(islandNotes(r, "Nowhere")).toBeNull();
});

test("a moved note is followed in a lens file: entries and exact path rules, in the form written; a glob stays; a folder by prefix", () => {
  const text = `[[islands]]\nname = "combat"\nnotes = ["/combat/overview.md", "combat/overview"]\nmatch = ["path:/combat/overview.md", "path:/combat/**", "links-to:/combat/overview.md"]\n`;
  const one = renameInLens(text, "combat/overview", "fight/start");
  expect(one.changed).toBe(3);
  expect(one.text).toBe(`[[islands]]\nname = "combat"\nnotes = ["/fight/start.md", "combat/overview"]\nmatch = ["path:/fight/start.md", "path:/combat/**", "links-to:/fight/start.md"]\n`);
  const folder = renameInLens(text, "combat", "fight", true);
  expect(folder.text).toContain('"/fight/overview.md"');
  expect(folder.text).toContain('"path:/fight/**"');
  expect(folder.text).toContain('name = "combat"');
});

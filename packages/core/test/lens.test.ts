// Lenses (docs/lenses.md): the file read, the notes resolved into islands, ghosts, Elsewhere, order, and a rename followed.

import { expect, test } from "vitest";
import { Bundle, ELSEWHERE, LensEditError, allIslands, editLens, ghostOf, globRe, hiddenBy, islandNotes, lensHomes, lensModel, lensNotes, lensShows, mapModel, newLensText, parseLens, renameInLens, resolveLens } from "../src/index.ts";

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

// ------------------------------------------------------------ linked-from, type, and each lens's hidden list

const withFiles = Bundle.fromFiles([
  file("combat/overview.md", "type: Concept\ntitle: Combat", "Read [hit boxes](/combat/hitboxes.md) and see ![a sword](/combat/sword.png)."),
  file("combat/hitboxes.md", "type: Concept\ntitle: Hit boxes"),
  file("design/damage.md", "type: Concept\ntitle: Damage", "Back to [combat](/combat/overview.md)."),
  { path: "combat/sword.png", text: "" },
  { path: "src/fight.ts", text: "" },
  { path: "src/data.csv", text: "" },
]);
const items = lensNotes(withFiles);

test("linked-from selects what a note links to, one hop; links-to what links to it", () => {
  const r = resolveLens(parseLens("l", `[[islands]]\nname = "From"\nmatch = ["linked-from:/combat/overview.md"]\n[[islands]]\nname = "To"\nmatch = ["links-to:/combat/overview.md"]\n`), items);
  expect(r.problems).toEqual([]);
  expect(r.islands[0]!.notes).toEqual(["combat/hitboxes"]);
  expect(r.islands[1]!.notes).toEqual(["design/damage"]);
});

test("type: an island holds notes unless a type rule names pictures or code; a file is listed by its path; others stay out", () => {
  const r = resolveLens(parseLens("t", `[[islands]]\nname = "Pictures"\nmatch = ["type:picture"]\n[[islands]]\nname = "Code in src"\nmatch = ["type:code", "path:/src/**"]\n[[islands]]\nname = "Src notes"\nmatch = ["path:/src/**"]\n[[islands]]\nname = "Listed"\nnotes = ["/src/data.csv"]\n`), items);
  expect(r.islands.map((i) => i.notes)).toEqual([["combat/sword.png"], ["src/fight.ts"], [], ["src/data.csv"]]);
  // Files no island holds are not in the lens at all; Elsewhere is notes.
  expect(r.elsewhere).toEqual(["combat/hitboxes", "combat/overview", "design/damage"]);
  expect(parseLens("bad", `[[islands]]\nname = "A"\nmatch = ["type:video"]\n`).problems[0]!.message).toContain("a type is note, picture or code");
  // The map places a file as the folders' map draws it, or as an item of its own.
  const model = lensModel(mapModel(withFiles), r);
  const refs = (d: typeof model.root): string[] => d.children.flatMap((c) => (c.kind === "dir" ? refs(c) : [c.ref]));
  expect(refs(model.root)).toEqual(expect.arrayContaining(["combat/sword.png", "src/fight.ts", "src/data.csv"]));
});

test("a lens hides what its own list names, or the base's where it has none; a folder entry does not hide what the lens lists by id", () => {
  const text = `[[islands]]\nname = "All"\nnotes = ["/combat/hitboxes.md"]\nmatch = ["path:/**"]\n`;
  const inherits = resolveLens(parseLens("a", text), items, ["combat"]);
  expect(inherits.ownHidden).toBe(false);
  expect(inherits.hidden).toEqual(["combat"]);
  // Listed by id beats the folder; the rest of the folder is hidden, and in no island nor Elsewhere.
  expect(inherits.islands[0]!.notes).toEqual(["combat/hitboxes", "design/damage"]);
  expect(inherits.hiddenItems).toEqual(["combat/overview"]);
  const own = resolveLens(parseLens("b", `hidden = ["/design/damage.md"]\n${text}`), items, ["combat"]);
  expect(own.ownHidden).toBe(true);
  expect(own.islands[0]!.notes).toEqual(["combat/hitboxes", "combat/overview"]);
  expect(own.hiddenItems).toEqual(["design/damage"]);
  expect([...lensShows(own)]).toEqual(["combat/hitboxes", "combat/overview"]);
  expect(lensHomes(own).get("combat/overview")).toBe("All");
  expect(hiddenBy(["a"], "a/b")).toBe(true);
  expect(hiddenBy(["a"], "a/b", new Set(["a/b"]))).toBe(false);
  expect(hiddenBy(["a/b"], "a/b", new Set(["a/b"]))).toBe(true);
  expect(hiddenBy(["a"], "ab")).toBe(false);
});

test("a lens is changed: islands added in place, nested, renamed, moved and removed; notes added in order and moved; the title", () => {
  let text = newLensText("Learning");
  expect(text).toBe('title = "Learning"\n');
  const go = (edit: Parameters<typeof editLens>[1]) => { const r = editLens(text, edit); text = r.text; return r.said; };
  go({ action: "add_island", island: "entropy", title: "Entropy", match: ["path:/learning/entropy/**"] });
  go({ action: "add_island", island: "basics", at: 0 });
  go({ action: "add_island", island: "entropy > Worked", notes: ["/a.md"] });
  go({ action: "add_notes", island: "basics", notes: ["/b.md", "/c.md"] });
  go({ action: "add_notes", island: "basics", notes: ["/c.md"], at: 0 });
  go({ action: "add_notes", island: "Worked", notes: ["/a.md"] });
  expect(text).toBe(`title = "Learning"

[[islands]]
name = "basics"
notes = ["/c.md", "/b.md"]

[[islands]]
name = "entropy"
title = "Entropy"
match = ["path:/learning/entropy/**"]

[[islands.islands]]
name = "Worked"
notes = ["/a.md"]
`);
  expect(parseLens("l", text).islands[1]!.islands[0]!.notes).toEqual(["a"]);
  expect(go({ action: "rename_island", island: "basics", name: "first" })).toBe("Renamed the island basics to first.");
  expect(parseLens("l", text).islands[0]).toMatchObject({ name: "first", title: "basics" });
  go({ action: "move_island", island: "first", at: 5 });
  expect(parseLens("l", text).islands.map((i) => i.name)).toEqual(["entropy", "first"]);
  go({ action: "remove_notes", island: "first", notes: ["b"] });
  go({ action: "title", title: "Learn" });
  go({ action: "title", island: "entropy > worked", title: "Worked examples" });
  go({ action: "set_match", island: "first", match: ["tag:x"] });
  go({ action: "remove_island", island: "Worked examples" });
  expect(parseLens("l", text)).toMatchObject({ title: "Learn", islands: [{ name: "entropy", islands: [] }, { name: "first", notes: ["c"], match: ["tag:x"] }] });
});

test("a change that cannot be made is refused, and says why", () => {
  const text = `[[islands]]\nname = "A"\n[[islands.islands]]\nname = "X"\n[[islands]]\nname = "B"\n[[islands.islands]]\nname = "X"\n`;
  const why = (edit: Parameters<typeof editLens>[1], t = text) => { try { editLens(t, edit); return null; } catch (e) { expect(e).toBeInstanceOf(LensEditError); return (e as LensEditError).message; } };
  expect(why({ action: "remove_island", island: "X" })).toContain("more than one island is called X");
  expect(why({ action: "remove_island", island: "Z" })).toBe("there is no island Z in this lens");
  expect(why({ action: "add_island", island: "A" })).toBe("there is already an island A");
  expect(why({ action: "add_island", island: "C", match: ["colour:red"] })).toContain("is not a rule");
  expect(why({ action: "title", title: "x" }, "islands = [")).toContain("not TOML");
  expect(why({ action: "remove_island", island: "A > X" })).toBeNull();
});

test("hidden in a lens alone: the base's list is where a lens without one starts; set_hidden null goes back to it", () => {
  const base = ["src"];
  const hid = editLens(newLensText("T"), { action: "hide", ids: ["/a/b.md"] }, base);
  expect(parseLens("t", hid.text).hidden).toEqual(["a/b", "src"]);
  const shown = editLens(hid.text, { action: "unhide", ids: ["src/"] }, base);
  expect(parseLens("t", shown.text).hidden).toEqual(["a/b"]);
  expect(parseLens("t", editLens(shown.text, { action: "set_hidden", ids: null }).text).hidden).toBeNull();
});

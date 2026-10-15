import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { SESSION_GAP_MS, hashText, readJournal, replay, type Change } from "@isorite/core";
import { Conflict, Engine, EngineError, MemoryFiles, type EngineEvent } from "../src/index.ts";

const NOTE = "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise.\n";

async function open(notes: Record<string, string> = { "basics/entropy.md": NOTE }, study: Record<string, string> | null = {}) {
  const clock = { t: Date.parse("2026-10-13T09:00:00Z"), now() { return this.t; } };
  const files = { notes: new MemoryFiles(notes), study: study ? new MemoryFiles(study) : null };
  const engine = await Engine.open({ ...files, clock, device: "laptop1", name: "information-theory" });
  const events: EngineEvent[] = [];
  engine.events((e) => events.push(e));
  const journal = (id: string) => readJournal(files.study?.files.get(`journal/${id}.jsonl`) ?? "") as Change[];
  return { engine, clock, events, journal, ...files };
}

test("the engine never imports Node", () => {
  const dir = new URL("../src/", import.meta.url);
  for (const name of readdirSync(dir)) {
    expect(readFileSync(new URL(name, dir), "utf8"), name).not.toMatch(/from\s+["'](node:|fs|path|crypto|os)/);
  }
});

test("lists the notes and folders, and skips what is hidden", async () => {
  const { engine } = await open({ "basics/entropy.md": NOTE, "channels/.keep": "", ".git/HEAD": "x", ".obsidian/notes.md": NOTE });
  expect(await engine.notes()).toEqual({
    notes: [{ id: "basics/entropy", title: "Entropy", description: "", type: "Concept", dir: "basics" }],
    dirs: ["basics", "channels"],
  });
});

test("opening a note the journal has not seen enters it whole, as found", async () => {
  const { engine, journal } = await open();
  const note = await engine.readNote("basics/entropy");
  expect(note).toEqual({ id: "basics/entropy", text: NOTE, version: hashText(NOTE) });
  expect(journal("basics/entropy")).toMatchObject([{ kind: "change", why: "start", who: "external", before: null, text: NOTE }]);
  await engine.readNote("basics/entropy");
  expect(journal("basics/entropy")).toHaveLength(1);
});

test("a save writes the file and one entry, and tells every listener", async () => {
  const { engine, notes, journal, events } = await open();
  const { version } = await engine.readNote("basics/entropy");
  const text = NOTE + "\nMeasured in bits.\n";
  const saved = await engine.saveNote("basics/entropy", { base: version, text });
  expect(saved).toMatchObject({ changed: true, version: hashText(text) });
  expect(notes.files.get("basics/entropy.md")).toBe(text);
  const entries = journal("basics/entropy");
  expect(entries).toHaveLength(2);
  expect(entries[1]).toMatchObject({ why: "edit", who: "you", device: "laptop1", before: version, after: hashText(text) });
  expect(entries[1]!.text).toBeUndefined();
  expect(replay(entries)!.text).toBe(text);
  expect(events.map((e) => e.type)).toEqual(["journal", "journal", "note-changed"]);
});

test("saving what the file already holds writes and enters nothing", async () => {
  const { engine, journal } = await open();
  const { version } = await engine.readNote("basics/entropy");
  expect((await engine.saveNote("basics/entropy", { base: version, text: NOTE })).changed).toBe(false);
  expect(journal("basics/entropy")).toHaveLength(1);
});

test("a change made elsewhere is entered as external, and a save from the old text is refused", async () => {
  const { engine, notes, journal } = await open();
  const { version } = await engine.readNote("basics/entropy");
  const theirs = NOTE + "\nAdded in another editor.\n";
  notes.files.set("basics/entropy.md", theirs);
  const refused = await engine.saveNote("basics/entropy", { base: version, text: NOTE + "\nMine.\n" }).catch((e) => e);
  expect(refused).toBeInstanceOf(Conflict);
  expect((refused as Conflict).current).toEqual({ id: "basics/entropy", text: theirs, version: hashText(theirs) });
  expect(notes.files.get("basics/entropy.md")).toBe(theirs);
  expect(journal("basics/entropy").map((e) => [e.why, e.who])).toEqual([["start", "external"], ["external", "external"]]);
  // From their version, the save goes through, and the journal replays to the file.
  const mine = theirs + "\nMine.\n";
  await engine.saveNote("basics/entropy", { base: hashText(theirs), text: mine });
  expect(replay(journal("basics/entropy"))!.text).toBe(mine);
});

test("a note that was deleted refuses the save and says it is gone", async () => {
  const { engine, notes } = await open();
  const { version } = await engine.readNote("basics/entropy");
  notes.files.delete("basics/entropy.md");
  const refused = await engine.saveNote("basics/entropy", { base: version, text: "x" }).catch((e) => e);
  expect(refused).toBeInstanceOf(Conflict);
  expect((refused as Conflict).current).toBeNull();
});

test("a new note starts its journal as yours, appears in the listing, and cannot be made twice", async () => {
  const { engine, journal } = await open();
  const text = "---\ntype: Concept\ntitle: Channel capacity\n---\n";
  await engine.createNote("channels/capacity", text);
  expect(journal("channels/capacity")).toMatchObject([{ why: "start", who: "you", text }]);
  expect((await engine.notes()).notes.map((n) => n.id)).toEqual(["basics/entropy", "channels/capacity"]);
  expect((await engine.search("capacity"))[0]).toMatchObject({ id: "channels/capacity" });
  await expect(engine.createNote("channels/capacity", text)).rejects.toMatchObject({ status: 409 });
});

test("ids that would leave the base are refused before they become paths", async () => {
  const { engine } = await open();
  for (const id of ["../outside", "/etc/passwd", "a//b", "a/./b", ".git/config", "a/..", "", "a\\b"]) {
    await expect(engine.readNote(id), id).rejects.toBeInstanceOf(EngineError);
    await expect(engine.createNote(id, "x"), id).rejects.toBeInstanceOf(EngineError);
    await expect(engine.journal(id), id).rejects.toBeInstanceOf(EngineError);
  }
});

test("a session holds while entries keep coming, and a new one starts after half an hour of nothing", async () => {
  const { engine, clock, journal } = await open();
  let { version } = await engine.readNote("basics/entropy");
  const save = async (text: string) => { version = (await engine.saveNote("basics/entropy", { base: version, text })).version; };
  clock.t += 60_000;
  await save(NOTE + "one\n");
  clock.t += SESSION_GAP_MS - 1;
  await save(NOTE + "two\n");
  clock.t += SESSION_GAP_MS + 1;
  await save(NOTE + "three\n");
  const [a, b, c, d] = journal("basics/entropy");
  expect(b!.session).toBe(a!.id);
  expect(c!.session).toBe(a!.id);
  expect(d!.session).toBe(d!.id);
});

test("the session carries on from the study base's newest entry when the engine is opened again", async () => {
  const first = await open();
  await first.engine.readNote("basics/entropy");
  const [start] = first.journal("basics/entropy");
  const clock = { now: () => Date.parse(start!.at) + 60_000 };
  const again = await Engine.open({ notes: first.notes, study: first.study, clock, device: "laptop1", name: "x" });
  await again.createNote("basics/surprise", "---\ntype: Concept\n---\n");
  expect(first.journal("basics/surprise")[0]!.session).toBe(start!.session);
});

test("saves asked for at once are written one at a time, in order", async () => {
  const { engine, journal, notes } = await open();
  const { version } = await engine.readNote("basics/entropy");
  const a = NOTE + "a\n", b = a + "b\n";
  const [first, second] = await Promise.all([
    engine.saveNote("basics/entropy", { base: version, text: a }),
    engine.saveNote("basics/entropy", { base: hashText(a), text: b }),
  ]);
  expect([first.changed, second.changed]).toEqual([true, true]);
  expect(notes.files.get("basics/entropy.md")).toBe(b);
  expect(replay(journal("basics/entropy"))).toMatchObject({ text: b, broken: [] });
});

test("with no study base, notes are read and written and no journal is kept", async () => {
  const { engine, notes } = await open(undefined, null);
  const { version } = await engine.readNote("basics/entropy");
  await engine.saveNote("basics/entropy", { base: version, text: NOTE + "more\n" });
  expect(notes.files.get("basics/entropy.md")).toBe(NOTE + "more\n");
  expect(await engine.journal("basics/entropy")).toEqual([]);
  expect((await engine.session()).study).toBe(false);
});

test("a study note is written into the study base's own notes, and journalled under its @study id", async () => {
  const { engine, study, journal } = await open();
  await engine.createNote("@study/basics/coin", "---\ntype: Exercise\n---\n");
  expect(study!.files.has("study/basics/coin.md")).toBe(true);
  expect(journal("@study/basics/coin")).toHaveLength(1);
});

test("the map: both bases as one model, each block with its title and where you stand", async () => {
  const exercise = "---\ntype: Exercise\nkind: written\ntitle: A fair coin\ntests: [basics/entropy]\n---\n\nShow it is one bit.\n";
  const attempt = (id: string, result: string) => JSON.stringify({ id, at: "2026-10-12T09:00:00Z", device: "laptop1", event: "attempt", exercise: "basics/a-fair-coin", tests: ["basics/entropy"], result, by: "iso:m", moves: { "basics/entropy": { by: 1, why: "" } } }) + "\n";
  const { engine } = await open(
    { "basics/entropy.md": NOTE, "basics/coding.md": NOTE.replace("Entropy", "Coding") + '\n[entropy](/basics/entropy.md "requires")\n' },
    { "study/basics/a-fair-coin.md": exercise, "record/laptop1.jsonl": attempt("01K7A000000000000000000001", "right"), "record/phone1.jsonl": attempt("01K7A000000000000000000002", "right") + attempt("01K7A000000000000000000003", "right") },
  );
  const map = await engine.map();
  expect(map.notes).toEqual({
    "basics/entropy": { title: "Entropy", step: 2, tokens: expect.any(Number) },
    "basics/coding": { title: "Coding", step: 0, tokens: expect.any(Number) },
    "@study/basics/a-fair-coin": { title: "A fair coin", step: 0, kind: "written" },
  });
  expect(map.notes["basics/entropy"]!.tokens).toBeGreaterThan(0); // its size, for the notes linked to a note for Iso
  expect(map.model.edges).toContainEqual(["basics/coding", "basics/entropy", 3]);
  expect(map.model.edges).toContainEqual(["@study/basics/a-fair-coin", "basics/entropy", 2]);
  expect(map.model.root.children.map((c) => c.ref)).toEqual(["basics", "@study/basics"]);
});

test("the map without a study base, and after a note gains a link", async () => {
  const { engine } = await open({ "a.md": NOTE, "b.md": NOTE }, null);
  expect((await engine.map()).model.edges).toEqual([]);
  const { version } = await engine.readNote("b");
  await engine.saveNote("b", { base: version, text: NOTE + '\n[a](/a.md "requires")\n' });
  expect((await engine.map()).model.edges).toEqual([["b", "a", 3]]);
});

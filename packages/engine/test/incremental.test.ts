import { expect, test } from "vitest";
import { Bundle, SearchIndex, hashText, type Concept } from "@isorite/core";
import { Engine, MemoryFiles } from "../src/index.ts";

// What a bundle holds, as plain data: what an incremental build must give exactly as a build from scratch does.
const shape = (b: Bundle) => ({
  concepts: [...b.concepts.values()].map((c: Concept) => ({ id: c.id, meta: c.meta, body: c.body, links: c.links, outward: c.outward, cites: c.cites, embeds: c.embeds, attached: c.attached })),
  issues: b.issues,
  dirs: [...b.directories].map(([k, d]) => [k, d.children, d.concepts, d.hasIndex, d.hasLog]),
  files: [...b.files],
});

// A small deterministic random source, so a failure can be run again.
function rng(seed: number) { return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

test("a base built from cached parses is the base built from scratch, after random edits", async () => {
  const rand = rng(7), pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const words = ["entropy", "channel", "surprise", "noise", "code", "bits", "average", "capacity"];
  const text = (title: string, links: string[], extra = "") =>
    `---\ntype: Concept\ntitle: ${title}\ntags: [${pick(words)}]\n---\n\n# ${title}\n\n${Array.from({ length: 4 }, () => pick(words)).join(" ")}.\n${links.map((l) => `See [${l}](/${l}.md).\n`).join("")}${extra}`;
  const ids = Array.from({ length: 12 }, (_, i) => `${i % 3 ? "a" : "b"}/n${i}`);
  const notes: Record<string, string> = {};
  for (const id of ids.slice(0, 8)) notes[`${id}.md`] = text(id, [pick(ids)]);
  const files = { notes: new MemoryFiles(notes), own: new MemoryFiles({}) };
  const clock = { now: () => Date.parse("2026-11-09T09:00:00Z") };
  const engine = await Engine.open({ ...files, clock, device: "d", name: "t" });
  const versions = new Map<string, string>();
  for (const id of ids.slice(0, 8)) versions.set(id, hashText(notes[`${id}.md`]!));
  const mess = ["\n<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> other\n", "\n```\n<<<<<<< not a conflict\n```\n", "\r\nwindows line\r\n"];
  for (let step = 0; step < 40; step++) {
    const id = pick(ids), had = versions.get(id);
    const roll = rand();
    let next = text(id, [pick(ids), pick(ids)], roll < 0.15 ? pick(mess) : "");
    if (roll > 0.9) next = next.replace("type: Concept", "type: [unclosed"); // frontmatter that does not parse
    if (had === undefined) versions.set(id, (await engine.createNote(id, next)).version);
    else if (roll > 0.8) { await engine.deleteNote(id, had); versions.delete(id); }
    else versions.set(id, (await engine.saveNote(id, { base: had, text: next })).version);
    if (step % 3) continue;
    const fresh = await Engine.open({ notes: new MemoryFiles(Object.fromEntries(files.notes.files)), own: new MemoryFiles({}), clock, device: "d", name: "t" });
    expect(shape(engine.bundle)).toEqual(shape(fresh.bundle));
    expect(shape(engine.bundle)).toEqual(shape(Bundle.fromFiles([...files.notes.files].map(([path, text]) => ({ path, text })))));
    expect(await engine.notes()).toEqual(await fresh.notes());
    expect(await engine.map()).toEqual(await fresh.map());
    for (const q of ["entropy", "capacity noise", "surprise bits"]) {
      expect(await engine.search(q)).toEqual(await fresh.search(q));
      expect(new SearchIndex(engine.bundle).search(q)).toEqual(new SearchIndex(fresh.bundle).search(q));
    }
  }
});

test("notes() and map() are worked out once per change, and the revision moves with a change", async () => {
  const files = { notes: new MemoryFiles({ "a.md": "---\ntype: Concept\n---\n\nHi.\n" }), own: new MemoryFiles({}) };
  const engine = await Engine.open({ ...files, clock: { now: () => 0 }, device: "d", name: "t" });
  const [n1, m1, r1] = [await engine.notes(), await engine.map(), await engine.revision()];
  expect(await engine.notes()).toBe(n1);
  expect(await engine.map()).toBe(m1);
  expect(await engine.revision()).toBe(r1);
  const note = await engine.readNote("a");
  await engine.saveNote("a", { base: note.version, text: note.text + "More.\n" });
  expect(await engine.revision()).not.toBe(r1);
  expect(await engine.notes()).not.toBe(n1);
});

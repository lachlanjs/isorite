import { expect, test } from "vitest";
import { Bundle } from "@isorite/core";
import { Engine, INLINE, Meaning, MemoryFiles, MemorySecrets, KEY, pieces, type Embedder, type EngineEvent } from "../src/index.ts";
import { scripted } from "./scripted.ts";

// A model for tests: a text's vector counts which of a few words it holds, so "nearest" can be reasoned about.
const WORDS = ["entropy", "surprise", "channel", "capacity", "bit", "code", "noise", "average"];
function fake(): Embedder & { calls: string[] } {
  const calls: string[] = [];
  return { model: "words-8", dim: WORDS.length, calls, embed: async (text) => { calls.push(text); return Float32Array.from(WORDS, (w) => (text.toLowerCase().split(w).length - 1) + 0.01); } };
}
const note = (title: string, body: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\n${body}\n`;
const base = (files: Record<string, string>) => Bundle.fromFiles(Object.entries(files).map(([path, text]) => ({ path, text })));
const FILES = {
  "basics/entropy.md": note("Entropy", "Entropy is the average surprise of a source, counted in bits.\n\n## Maximum\n\nEntropy is largest when every symbol is equally likely, and then it is the logarithm of their number."),
  "channels/capacity.md": note("Channel capacity", "The capacity of a channel is the most it carries reliably through noise, however clever the code."),
  "basics/short.md": note("Bit", "One."),
};

test("a note is cut at its first- and second-level headings, and a short one is still a piece", () => {
  const ps = pieces(base(FILES));
  expect(ps.map((p) => [p.note, p.heading])).toEqual([["basics/entropy", ""], ["basics/entropy", "Maximum"], ["basics/short", ""], ["channels/capacity", ""]]);
  expect(ps[1]!.text).toBe("Entropy.\nMaximum\nEntropy is largest when every symbol is equally likely, and then it is the logarithm of their number.");
  expect(new Set(ps.map((p) => p.key)).size).toBe(4);
  // A heading inside a code fence does not cut.
  expect(pieces(base({ "a.md": note("A", "Some words that are long enough to count as a piece.\n\n```\n# not a heading\n```\n") })).length).toBe(1);
});

test("the nearest notes are found, each once, by their nearest piece", async () => {
  const meaning = new Meaning(fake(), new MemoryFiles(), "v.json"), b = base(FILES);
  const found = await meaning.similar(b, "how much can a noisy channel carry: its capacity");
  expect(found).toMatchObject({ ready: true, pending: 0 });
  expect(found.hits[0]).toMatchObject({ note: "channels/capacity", heading: "" });
  expect(found.hits.map((h) => h.note).sort()).toEqual(["basics/entropy", "basics/short", "channels/capacity"]);
  expect((await meaning.similar(b, "entropy of a source", { under: "channels" })).hits.map((h) => h.note)).toEqual(["channels/capacity"]);
});

test("vectors are kept by a fingerprint of their text: an edit makes one piece again, and nothing else", async () => {
  const model = fake(), cache = new MemoryFiles(), meaning = new Meaning(model, cache, "v.json");
  expect(await meaning.refresh(base(FILES))).toEqual({ made: 4, pieces: 4 });
  expect(model.calls).toHaveLength(4);
  expect(await meaning.refresh(base(FILES))).toEqual({ made: 0, pieces: 4 });
  // One section edited, and a note renamed.
  const edited = { ...FILES, "basics/entropy.md": FILES["basics/entropy.md"].replace("equally likely", "equally probable") } as Record<string, string>;
  edited["channels/limits.md"] = edited["channels/capacity.md"]!; delete edited["channels/capacity.md"];
  expect(await meaning.refresh(base(edited))).toEqual({ made: 1, pieces: 4 });
  expect(model.calls.at(-1)).toContain("equally probable");
  // The old section's vector is forgotten; the cache names its model.
  const kept = JSON.parse(cache.files.get("v.json")!) as { model: string; dim: number; vectors: Record<string, string> };
  expect(kept).toMatchObject({ model: "words-8", dim: 8 });
  expect(Object.keys(kept.vectors)).toHaveLength(4);
  // Read back by another instance, nothing is made again; with another model, everything is.
  expect(await new Meaning(fake(), cache, "v.json").refresh(base(edited))).toEqual({ made: 0, pieces: 4 });
  expect((await new Meaning({ ...fake(), model: "other" }, cache, "v.json").refresh(base(edited))).made).toBe(4);
});

test("a few missing pieces are made before the search; many are left to the background and said to be pending", async () => {
  const many: Record<string, string> = {};
  for (let k = 0; k < INLINE + 8; k++) many[`n/${k}.md`] = note(`Note ${k}`, `Entropy and surprise, note number ${k}, with enough words to be a piece.`);
  const model = fake(), meaning = new Meaning(model, new MemoryFiles(), "v.json");
  const first = await meaning.similar(base(many), "entropy");
  expect(first).toMatchObject({ ready: false, hits: [] });
  await meaning.refresh(base(many)); // the pass started by the search, awaited
  expect((await meaning.similar(base(many), "entropy")).pending).toBe(0);
  const more = { ...many, "n/new.md": note("New", "A note about channel capacity written just now, long enough.") };
  const found = await meaning.similar(base(more), "channel capacity");
  expect(found).toMatchObject({ ready: true, pending: 0 });
  expect(found.hits[0]!.note).toBe("n/new");
});

test("in the engine: the base is embedded when opened and after a save, and Iso is offered the second tool", async () => {
  const model = fake(), cache = new MemoryFiles(), provider = scripted([{ calls: [{ name: "find_similar", arguments: { text: "capacity of a channel with noise" } }] }, { text: ["See capacity."] }]);
  const notes = new MemoryFiles(FILES);
  const engine = await Engine.open({ notes, study: new MemoryFiles(), clock: { now: () => Date.parse("2026-10-13T09:00:00Z") }, device: "laptop1", name: "it", http: provider.http, secrets: new MemorySecrets({ [KEY]: "k" }), embedder: model, cache: { files: cache, name: "it.json" } });
  await engine.meaning!.refresh(engine.bundle);
  expect(await engine.meaning!.state(engine.bundle)).toEqual({ pieces: 4, missing: 0 });

  const made = await engine.createNote("channels/noise", note("Noise", "Noise is what the channel adds to the signal that was not sent, at random."));
  expect(made.changed).toBe(true);
  await engine.meaning!.refresh(engine.bundle);
  expect(await engine.meaning!.state(engine.bundle)).toEqual({ pieces: 5, missing: 0 });

  const events: EngineEvent[] = [];
  const done = new Promise<void>((r) => engine.events((e) => { events.push(e); if (e.type === "iso-done" || e.type === "iso-failed") r(); }));
  await engine.ask({ note: "basics/entropy", form: "insert", after: null, before: null, asked: "what limits a channel", tier: "mid" });
  await done;
  expect(provider.sent[0]!.tools!.map((t) => t.function.name)).toContain("find_similar");
  const step = events.find((e) => e.type === "iso-step");
  expect(step).toMatchObject({ step: { how: "meaning" } });
  expect(step?.type === "iso-step" && step.step.failed).toBeFalsy();
  expect(step?.type === "iso-step" && step.step.notes[0]).toBe("channels/capacity");
});

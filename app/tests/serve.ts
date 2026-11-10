// The server the browser tests run against: a small base made fresh in a
// temporary folder, with its .isorite/, served on its own port. Nothing of
// yours is read or written: the device's configuration is kept there too.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ISORITE_TEST_PORT: another port, and a base of its own, so two runs can go at once.
export const PORT = Number(process.env.ISORITE_TEST_PORT) || 4799;
export const ROOT = join(tmpdir(), process.env.ISORITE_TEST_PORT ? `isorite-browser-tests-${PORT}` : "isorite-browser-tests");
export const NOTES = join(ROOT, "information-theory");
/** The agent's memory (M20): a second base on the same server, lent to every session. */
export const MEMORY = join(ROOT, "memory");
/** isorite's own files for the base (format 2). */
/** Where isorite keeps its own, apart from the base: the native agent's keys (M36). */
export const DATA = join(ROOT, "data", "isorite");
export const STUDY = join(NOTES, ".isorite");

if (process.argv[1] === import.meta.filename) {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(NOTES, "basics"), { recursive: true });
  mkdirSync(join(NOTES, "channels"));
  writeFileSync(join(NOTES, "basics", "surprise.md"), "---\ntype: Concept\ntitle: Surprise\ndescription: How unexpected one outcome is.\n---\n\nAn outcome of probability $p$ carries $-\\log p$ of surprise.\n");
  writeFileSync(join(NOTES, "basics", "bit.md"), "---\ntype: Concept\ntitle: The bit\n# kept as written\ntags: [units]\n---\n\nOne fair coin toss, the unit of information.\n\n| tosses | bits |\n|---|---|\n| 1 | 1 |\n| 2 | 2 |\n");
  // For the Atlas: a folder of three notes, each requiring the one before, the first requiring one of basics.
  mkdirSync(join(NOTES, "coding"));
  const coding = (title: string, requires: string) => `---\ntype: Concept\ntitle: ${title}\n---\n\nIt rests on [this](/${requires}.md "requires").\n`;
  writeFileSync(join(NOTES, "coding", "source-coding.md"), coding("Source coding", "basics/surprise"));
  writeFileSync(join(NOTES, "coding", "kraft-inequality.md"), coding("Kraft inequality", "coding/source-coding"));
  // The last of them also joined by weaker links: "uses", which the map draws lighter, and "see also", which it does not draw.
  writeFileSync(join(NOTES, "coding", "huffman-codes.md"), coding("Huffman codes", "coding/kraft-inequality") + `\nIt counts in [bits](/basics/bit.md "uses"). See also [surprise](/basics/surprise.md "see also").\n`);
  // Files beside the notes that are not notes: an artifact and a data file (the list of notes holds them; the Atlas shows them only when its switches are on).
  writeFileSync(join(NOTES, "basics", "dashboard.html"), "<!doctype html><title>Coin dashboard</title><p>hello</p>");
  writeFileSync(join(NOTES, "basics", "tosses.csv"), "tosses,bits\n1,1\n2,2\n");
  // Code in the notes (docs/files.md): a file of the base, off the Atlas and the list until the code switch is on.
  writeFileSync(join(NOTES, "basics", "toss.py"), "import random\n\ndef toss():\n    return random.random() < 0.5\n");
  // Code beside the notes (M12): the repository code links point into, named in the base's settings.
  mkdirSync(join(ROOT, "code", "src"), { recursive: true });
  writeFileSync(join(ROOT, "code", "src", "huffman.py"), "def build(freqs):\n    pass\n");
  mkdirSync(STUDY, { recursive: true });
  writeFileSync(join(STUDY, "settings.toml"), `repository = "../code"\n`);
  writeFileSync(join(NOTES, "channels", "huffman-in-code.md"), "---\ntype: Concept\ntitle: Huffman in code\n---\n\nBuilt in [build](code:src/huffman.py#L1); decoded in [decode](code:src/decode.py). After [Huffman](https://en.wikipedia.org/wiki/Huffman_coding).\n");
  process.env.XDG_CONFIG_HOME = join(ROOT, "config");
  process.env.XDG_CACHE_HOME = join(ROOT, "cache");
  process.env.XDG_DATA_HOME = join(ROOT, "data"); // keys and sessions of the native agent (M36)
  process.env.ISORITE_EMBED = "off"; // the browser tests are about the pages; the model has its own tests
  process.env.ISORITE_SCRIPTED = "1"; // the scripted model for isorite's own agent, put in the pane by tests/agent.ts
  mkdirSync(join(ROOT, "config", "isorite"), { recursive: true });
  writeFileSync(join(ROOT, "config", "isorite", "config.toml"), `device = "browser01"\n`);
  // The agent's memory, lent to every session, and a base known but not lent.
  mkdirSync(join(MEMORY, "tools"), { recursive: true });
  writeFileSync(join(MEMORY, "AGENTS.md"), "# What you keep across projects.\n");
  writeFileSync(join(MEMORY, "tools", "opencode.md"), "---\ntype: Concept\ntitle: OpenCode's config\n---\n\nKept in ~/.config/opencode.\n");
  mkdirSync(join(ROOT, "elsewhere"));
  writeFileSync(join(ROOT, "elsewhere", "a.md"), "---\ntype: Concept\ntitle: A note elsewhere\n---\n\nElsewhere.\n");
  writeFileSync(join(ROOT, "config", "isorite", "bases.toml"), `[memory]\npath = "${MEMORY}"\nlend = true\n\n[elsewhere]\npath = "${join(ROOT, "elsewhere")}"\n`);
  const { serve } = await import("../../packages/server/src/serve.ts");
  await serve(NOTES, { port: PORT });
}

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { finderHttp } from "@isorite/guide";
import { hasModel, writeGuide } from "../src/guide.ts";
import { liveProvider } from "../src/serve.ts";

// isorite guide (M16): the guide written into a folder once, opened as you left it after; Iso is the finder
// until a model is set up.
const temp = () => mkdtempSync(join(tmpdir(), "isorite-guide-test-"));

test("the guide is written into a new folder, with its AGENTS.md; run again, what you changed is kept", () => {
  const at = join(temp(), "guide");
  expect(writeGuide(at)).toEqual({ notes: at, fresh: true });
  expect(readFileSync(join(at, "start-here.md"), "utf8")).toMatch(/^---\ntype: Concept\ntitle: Start here/);
  expect(existsSync(join(at, "AGENTS.md"))).toBe(true);
  expect(existsSync(join(at, "iso", "what-iso-is-sent.md"))).toBe(true);
  writeFileSync(join(at, "your-notes.md"), "---\ntype: Concept\ntitle: Your notes\n---\n\nMine.\n");
  expect(writeGuide(at)).toEqual({ notes: at, fresh: false });
  expect(readFileSync(join(at, "your-notes.md"), "utf8")).toContain("Mine.");
});

test("a folder with other files in it is refused, an empty one is written into", () => {
  const busy = temp();
  writeFileSync(join(busy, "mine.md"), "# mine\n");
  expect(() => writeGuide(busy)).toThrow(/not the guide/);
  const empty = temp();
  expect(writeGuide(empty).fresh).toBe(true);
});

test("Iso has a model with a key kept, or a provider of your own; with neither it is the finder", async () => {
  const dir = temp(), config = join(dir, "config.toml");
  expect(await hasModel(config)).toBe(false);
  writeFileSync(config, '[provider]\nkey = "sk-or-test"\n');
  expect(await hasModel(config)).toBe(true);
  mkdirSync(join(dir, "b"));
  writeFileSync(join(dir, "b", "config.toml"), '[provider]\nname = "work"\nurl = "https://gateway.example/v1"\n');
  expect(await hasModel(join(dir, "b", "config.toml"))).toBe(true);
});

test("the finder answers until a model is set up, then the model does, without a restart (M18)", async () => {
  const dir = temp(), config = join(dir, "config.toml"), finder = finderHttp();
  const before = await liveProvider(config, finder);
  expect(before.provider.name).toBe("finder");
  expect(before.provider.auth).toBeUndefined();
  expect(before.http).toBe(finder);
  writeFileSync(config, '[provider]\nkey = "sk-or-test"\n');
  const after = await liveProvider(config, finder);
  expect(after.provider.name).toBe("openrouter");
  expect(after.http).not.toBe(finder);
});

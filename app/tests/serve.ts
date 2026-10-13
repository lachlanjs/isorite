// The server the browser tests run against: a small base made fresh in a
// temporary folder, with its study base, served on its own port. Nothing of
// yours is read or written: the device's configuration is kept there too.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const PORT = 4799;
export const ROOT = join(tmpdir(), "isorite-browser-tests");
export const NOTES = join(ROOT, "information-theory");

if (process.argv[1] === import.meta.filename) {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(join(NOTES, "basics"), { recursive: true });
  mkdirSync(join(NOTES, "channels"));
  writeFileSync(join(NOTES, "basics", "surprise.md"), "---\ntype: Concept\ntitle: Surprise\ndescription: How unexpected one outcome is.\n---\n\nAn outcome of probability $p$ carries $-\\log p$ of surprise.\n");
  writeFileSync(join(NOTES, "basics", "bit.md"), "---\ntype: Concept\ntitle: The bit\n# kept as written\ntags: [units]\n---\n\nOne fair coin toss, the unit of information.\n\n| tosses | bits |\n|---|---|\n| 1 | 1 |\n| 2 | 2 |\n");
  process.env.XDG_CONFIG_HOME = join(ROOT, "config");
  const { initStudyBase } = await import("../../packages/server/src/studybase.ts");
  const { serve } = await import("../../packages/server/src/serve.ts");
  initStudyBase(NOTES);
  await serve(NOTES, { port: PORT });
}

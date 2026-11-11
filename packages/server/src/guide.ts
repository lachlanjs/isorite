// isorite guide [<folder>] (M16): the guide, a knowledge base about isorite, written into a folder of yours and
// served as any base is. Run again, it opens the same folder, with what you changed in it. The pane offers to attach
// your own agent, as for any base.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { LENSES_DIR, OWN_DIR, StudyError } from "@isorite/core";
import { GUIDE_LENSES, START } from "@isorite/guide";
import { loadGuide, loadGuidePictures } from "@isorite/guide/node";
import { serve } from "./serve.ts";
import { openBrowser } from "./running.ts";

export const GUIDE_FOLDER = join(homedir(), "isorite-guide");

/** Write the guide into `folder`, unless it is there already. Returns whether it was written now. A folder that
 *  holds other files is refused: the guide is not written over anything. */
export function writeGuide(folder: string): { notes: string; fresh: boolean } {
  const at = resolve(folder);
  if (existsSync(at) && !statSync(at).isDirectory()) throw new StudyError(`${at} is a file`);
  if (existsSync(join(at, `${START}.md`))) { lenses(at); return { notes: at, fresh: false }; }
  if (existsSync(at) && readdirSync(at).some((f) => f !== OWN_DIR)) throw new StudyError(`${at} has files in it that are not the guide: name another folder, isorite guide <folder>`);
  for (const [path, text] of [...Object.entries(loadGuide()), ...Object.entries(loadGuidePictures())]) {
    mkdirSync(dirname(join(at, path)), { recursive: true });
    writeFileSync(join(at, path), text);
  }
  lenses(at);
  return { notes: at, fresh: true };
}

/** The guide's lenses, put in `.isorite/lenses/` where a file of that name is not: a guide written before them gets them, and one you changed keeps your change. */
function lenses(at: string): void {
  const dir = join(at, OWN_DIR, LENSES_DIR);
  for (const [name, text] of Object.entries(GUIDE_LENSES)) {
    if (existsSync(join(dir, name))) continue;
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), text);
  }
}

export async function guide(folder = GUIDE_FOLDER, { port = 4767, out = console.log }: { port?: number; out?: (line: string) => void } = {}): Promise<void> {
  const { notes, fresh } = writeGuide(folder);
  out(fresh ? `isorite guide: written to ${notes}; it is yours to change, and run again it opens as you left it` : `isorite guide: ${notes}, as you left it`);
  out(`  start at http://localhost:${port}/#/n/${START}`);
  await serve(notes, { port });
  if (process.env.ISORITE_NO_BROWSER !== "1") openBrowser(`http://localhost:${port}/#/n/${START}`);
}

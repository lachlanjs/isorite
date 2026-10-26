// isorite guide [<folder>] (M16): the guide, a knowledge base about isorite, written into a folder of yours and
// served as any base is. Run again, it opens the same folder, with what you changed in it. Iso is your provider's
// model when one is set up, and the guide's finder when not.

import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { OPENROUTER, KEY } from "@isorite/engine";
import { OWN_DIR, StudyError } from "@isorite/core";
import { finderHttp, START } from "@isorite/guide";
import { loadGuide } from "@isorite/guide/node";
import { ConfigSecrets, configPath, providerConfig } from "./config.ts";
import { serve } from "./serve.ts";

export const GUIDE_FOLDER = join(homedir(), "isorite-guide");

/** Write the guide into `folder`, unless it is there already. Returns whether it was written now. A folder that
 *  holds other files is refused: the guide is not written over anything. */
export function writeGuide(folder: string): { notes: string; fresh: boolean } {
  const at = resolve(folder);
  if (existsSync(at) && !statSync(at).isDirectory()) throw new StudyError(`${at} is a file`);
  if (existsSync(join(at, `${START}.md`))) return { notes: at, fresh: false };
  if (existsSync(at) && readdirSync(at).some((f) => f !== OWN_DIR)) throw new StudyError(`${at} has files in it that are not the guide: name another folder, isorite guide <folder>`);
  for (const [path, text] of Object.entries(loadGuide())) {
    mkdirSync(dirname(join(at, path)), { recursive: true });
    writeFileSync(join(at, path), text);
  }
  return { notes: at, fresh: true };
}

/** Whether Iso has a model here: a key kept, or a provider of your own (a gateway may need no key). */
export async function hasModel(config = configPath()): Promise<boolean> {
  return (await new ConfigSecrets(config).get(KEY)) !== null || providerConfig(config).url !== OPENROUTER.url;
}

export async function guide(folder = GUIDE_FOLDER, { port = 4767, out = console.log }: { port?: number; out?: (line: string) => void } = {}): Promise<void> {
  const { notes, fresh } = writeGuide(folder);
  const model = await hasModel();
  out(fresh ? `isorite guide: written to ${notes}; it is yours to change, and run again it opens as you left it` : `isorite guide: ${notes}, as you left it`);
  out(model ? "  Iso: your provider's model" : "  Iso: the guide's finder, which answers with the notes that match (no model is set up)");
  out(`  start at http://localhost:${port}/#/n/${START}`);
  await serve(notes, { port, ...(model ? {} : { stand: finderHttp(16) }) });
}

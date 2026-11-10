// isorite's own files for a base (format 2): a hidden folder inside the notes, committed with them. The notes stay
// plain OKF; everything isorite keeps about them is here.
//
//   .isorite/.gitattributes            *.jsonl merge=union, so two devices' lines merge
//   .isorite/journal/<note id>.jsonl   one journal per note (journal.ts)
//   .isorite/conversations/<id>.jsonl  the agent's conversations
//   .isorite/understanding/<id>.md     a note's Understanding note, before M24 (no longer read or written)
//   .isorite/drafts/<id>.md            notes the agent has written that are not in the base yet
//   .isorite/settings.toml             the base's settings: its repository, where code links point (M12)
//   .isorite/hidden.txt                the notes and folders kept off the Atlas and the list, one id a line (merge=union)
//
// Format 1 kept these in a study base, a second repository beside the notes; `isorite migrate` moves one in.

import { parse, stringify } from "smol-toml";

export const OWN_DIR = ".isorite";
export const OWN_FORMAT = 2;
export const HIDDEN_FILE = "hidden.txt";
/** Lines from two devices are put together, not conflicted: the journals, and what is hidden (one id a line). */
export const GITATTRIBUTES = `*.jsonl merge=union\n${HIDDEN_FILE} merge=union\n`;
export const SETTINGS_FILE = "settings.toml";

/** The base's settings. `repository`: the folder code links resolve against, relative to the notes folder (or
 *  absolute), when it isn't the git repository the notes are in. `agents_write_notes = false`: agents may not change
 *  the notes (they may unless it says so). `hidden`: where it was kept before `hidden.txt`
 *  (one line of a list could not be merged); read still, and moved out when it is next changed. */
export interface Settings { repository?: string; agents_write_notes?: boolean; hidden?: string[] }

export function parseSettings(text: string | null): Settings {
  if (!text) return {};
  let raw: Record<string, unknown>;
  try { raw = parse(text); } catch { return {}; }
  return {
    ...(typeof raw.repository === "string" && raw.repository.trim() ? { repository: raw.repository.trim() } : {}),
    ...(typeof raw.agents_write_notes === "boolean" ? { agents_write_notes: raw.agents_write_notes } : {}),
    ...(Array.isArray(raw.hidden) && raw.hidden.some((x) => typeof x === "string") ? { hidden: raw.hidden.filter((x): x is string => typeof x === "string") } : {}),
  };
}

export function settingsText(s: Settings): string {
  return `# isorite's settings for this base (format 2)\n${stringify(s)}\n`;
}

const SAFE = /^[^\0]+$/;
function checkId(id: string): string {
  if (!SAFE.test(id) || id.startsWith("/") || id.split("/").some((part) => part === ".." || part === "." || !part)) throw new Error(`not a note's id: ${JSON.stringify(id)}`);
  return id;
}

/** Where a note's journal is. Drafts are journalled under their `@draft/` ids (and Understanding notes were, before
 *  M24, under `@understanding/`). */
export const journalPath = (noteId: string): string => `journal/${checkId(noteId)}.jsonl`;

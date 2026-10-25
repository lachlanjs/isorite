// isorite's own files for a base (format 2): a hidden folder inside the notes, committed with them. The notes stay
// plain OKF; everything isorite keeps about them is here.
//
//   .isorite/.gitattributes            *.jsonl merge=union, so two devices' lines merge
//   .isorite/journal/<note id>.jsonl   one journal per note (journal.ts)
//   .isorite/conversations/<id>.jsonl  Iso's conversations
//   .isorite/understanding/<id>.md     a note's Understanding note
//   .isorite/drafts/<id>.md            notes Iso has written that are not in the base yet
//   .isorite/record/<device>.jsonl     this device's record of usage: context cleared, what turns cost
//
// Format 1 kept these in a study base, a second repository beside the notes; `isorite migrate` moves one in.

export const OWN_DIR = ".isorite";
export const OWN_FORMAT = 2;
export const GITATTRIBUTES = "*.jsonl merge=union\n";

const SAFE = /^[^\0]+$/;
function checkId(id: string): string {
  if (!SAFE.test(id) || id.startsWith("/") || id.split("/").some((part) => part === ".." || part === "." || !part)) throw new Error(`not a note's id: ${JSON.stringify(id)}`);
  return id;
}

/** Where a note's journal is. Drafts and Understanding notes are journalled under their `@draft/` and
 *  `@understanding/` ids. */
export const journalPath = (noteId: string): string => `journal/${checkId(noteId)}.jsonl`;
/** This device's record of usage: what was cleared from Iso's context, and what each turn cost (record.ts). */
export const recordPath = (device: string): string => `record/${checkId(device)}.jsonl`;

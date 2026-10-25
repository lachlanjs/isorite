// isorite's own files for a base (format 2): a hidden folder inside the notes, committed with them. The notes stay
// plain OKF; everything isorite keeps about them is here.
//
//   .isorite/.gitattributes            *.jsonl merge=union, so two devices' lines merge
//   .isorite/journal/<note id>.jsonl   one journal per note (journal.ts)
//   .isorite/conversations/<id>.jsonl  Iso's conversations
//   .isorite/understanding/<id>.md     a note's Understanding note
//   .isorite/drafts/<id>.md            notes Iso has written that are not in the base yet
//
// Format 1 kept these in a study base, a second repository beside the notes; `isorite migrate` moves one in.

export const OWN_DIR = ".isorite";
export const OWN_FORMAT = 2;
export const GITATTRIBUTES = "*.jsonl merge=union\n";

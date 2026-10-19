// Redo for a tutorial step (T3): the base as it was when the step began, put back through the Api, so it works on
// the page's own engine and against isorite --tutorial's server alike. Each change it makes is an ordinary change in
// the journal: the timeline still tells what happened.

import { app } from "$lib/app.svelte.ts";

/** Every note of the base, by id: its text. */
export type Snapshot = Map<string, string>;

export async function snapshot(): Promise<Snapshot> {
  const { notes } = await app.api.notes();
  const read = await Promise.all(notes.map(async (n) => [n.id, (await app.api.readNote(n.id)).text] as const));
  return new Map(read);
}

/** Put the base back as `was` holds it. What changed since is undone one note at a time: a note made since is
 *  deleted (or moved back, when it is one that was there under another path), a deleted note made again, and a
 *  changed note saved with its old text. */
export async function restore(was: Snapshot): Promise<void> {
  const now = await snapshot();
  const gone = [...was.keys()].filter((id) => !now.has(id));
  for (const [id, text] of now) {
    if (was.has(id)) continue;
    // Moved: the same text under a new path, where a note of the snapshot is missing.
    const from = gone.find((g) => was.get(g) === text);
    const { version } = await app.api.readNote(id);
    if (from) { await app.api.moveNote(id, from, version); gone.splice(gone.indexOf(from), 1); }
    else await app.api.deleteNote(id, version);
  }
  for (const id of gone) await app.api.createNote(id, was.get(id)!);
  for (const [id, text] of was) {
    if (gone.includes(id)) continue;
    const current = await app.api.readNote(id);
    if (current.text !== text) await app.api.saveNote(id, { base: current.version, text });
  }
  await app.refresh();
}

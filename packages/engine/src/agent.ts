// A terminal agent's edit to a note, as the passages it changes: what it becomes in the journal, a rewrite
// proposal, kept or removed a passage at a time as Iso's are. Nothing here writes the note.

import { diffLines, type Passage } from "@isorite/core";
import { EngineError } from "./api.ts";

/** What an agent asked to do to a note: replace a string in it, or write the whole of it. */
export type AgentEdit = { oldString: string; newString: string; replaceAll?: boolean } | { content: string };

export interface Region { old: Passage; new: string }

/** Which occurrence of `text` starts at `offset`, counted from 0 through the note. */
function nthAt(note: string, text: string, offset: number): number {
  let n = 0;
  for (let at = note.indexOf(text); at >= 0 && at < offset; at = note.indexOf(text, at + 1)) n++;
  return n;
}

/** The passages a string replacement changes. Refused, in words the agent can act on, when it names nothing or
 *  more than one place without saying to replace them all. */
export function editRegions(note: string, oldString: string, newString: string, replaceAll = false): Region[] {
  if (!oldString) throw new EngineError("oldString is empty: name the text to replace, or write the whole note.", 400);
  if (oldString === newString) throw new EngineError("oldString and newString are the same: nothing would change.", 400);
  let count = 0;
  for (let at = note.indexOf(oldString); at >= 0; at = note.indexOf(oldString, at + 1)) count++;
  if (!count) throw new EngineError("oldString is not in the note. Read the note again and copy the text exactly.", 400);
  if (count > 1 && !replaceAll) throw new EngineError(`oldString is in the note ${count} times. Give more of the text around it, or replaceAll.`, 400);
  return Array.from({ length: count }, (_, nth) => ({ old: { text: oldString, nth }, new: newString }));
}

/** The passages that change between a note and the whole of it written anew, by line. A passage is never empty:
 *  a line added between others is offered with the nearest line that has text beside it. */
export function writeRegions(before: string, after: string): Region[] {
  const a = before.split("\n"), b = after.split("\n"), hunks = diffLines(a, b);
  const filled = (i: number) => (a[i] ?? "").trim() !== "";
  // Each hunk as a stretch of the earlier lines, widened to a line with text where it holds none.
  const spans = hunks.map((h) => {
    let from = h.at, to = h.at + h.del.length;
    if (!a.slice(from, to).some((line) => line.trim())) {
      let k = from - 1;
      while (k >= 0 && !filled(k)) k--;
      if (k >= 0) from = k;
      else {
        k = to;
        while (k < a.length && !filled(k)) k++;
        if (k >= a.length) throw new EngineError("the note has no text to place the change against: write it with text in it", 400);
        to = k + 1;
      }
    }
    return { from, to };
  });
  // Stretches that meet are one passage.
  const merged: { from: number; to: number }[] = [];
  for (const s of spans) {
    const last = merged.at(-1);
    if (last && s.from <= last.to) last.to = Math.max(last.to, s.to);
    else merged.push({ ...s });
  }
  // A stretch's edges in the later version, moved by the changes before them. A stretch holds every change that
  // begins inside it or at either edge (a line added at its end is one of its own), so none is cut.
  const moved = (i: number, counts: (at: number) => boolean) => i + hunks.filter((h) => counts(h.at)).reduce((d, h) => d + h.ins.length - h.del.length, 0);
  const start = (i: number) => moved(i, (at) => at < i), end = (i: number) => moved(i, (at) => at <= i);
  const offset = (i: number) => a.slice(0, i).reduce((n, line) => n + line.length + 1, 0);
  return merged.map(({ from, to }) => {
    const lines = b.slice(start(from), end(to));
    let text = a.slice(from, to).join("\n"), at = offset(from);
    // Lines taken out whole take a line break with them: the one after, or before the last line, the one before.
    if (!lines.length) {
      if (to < a.length) text += "\n";
      else if (from > 0) { text = "\n" + text; at -= 1; }
    }
    return { old: { text, nth: nthAt(before, text, at) }, new: lines.join("\n") };
  });
}

/** The passages an agent's edit changes in a note as it is. */
export function regionsOf(note: string, edit: AgentEdit): Region[] {
  return "content" in edit ? writeRegions(note, edit.content) : editRegions(note, edit.oldString, edit.newString, edit.replaceAll);
}

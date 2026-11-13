// What isorite's own agent has already seen of each note in its live context, and the pointers of a message rewritten
// against it (docs/research/token-efficiency.md, the session bench in bench/tokens/sessions.ts).
//
// The pane sends a pointer as a footnote: `[^1]: /a/b.md` for a whole note, `[^1]: /a/b.md L5–7` and the words quoted
// for a passage. Left as it is, the agent reads the note again every turn, and every reading stays in the context, so a
// session spent on one growing note costs more each turn. Here a whole note the agent has not seen is sent whole, one it
// saw and that has not changed since is named and no more, and one that changed is sent as what changed. A passage of a
// note it has not seen comes with a few lines either side. Only the new message is written this way: earlier turns are
// never rewritten, so what a provider has cached of them stays good.
//
// The record says, for each note, the text the agent was last given whole and where in the conversation (the index of
// the message it came in). When the conversation is compacted, what was given before the cut is forgotten, since the
// summary does not hold it.

import { diffLines } from "@isorite/core";

export interface SeenNote {
  /** The note's file as the agent was last given it, whole. */
  text: string;
  /** The index, in the model's messages, of the message that gave it (or a later one). */
  at: number;
}

export class Seen {
  #notes = new Map<string, SeenNote>();

  constructor(kept?: Record<string, SeenNote>) {
    for (const [id, s] of Object.entries(kept ?? {})) if (typeof s?.text === "string" && Number.isInteger(s.at)) this.#notes.set(id, { text: s.text, at: s.at });
  }

  get(id: string): SeenNote | undefined { return this.#notes.get(id); }
  set(id: string, text: string, at: number): void { this.#notes.set(id, { text, at }); }
  forget(id: string): void { this.#notes.delete(id); }
  /** The note moved: what was seen of it is the same text at its new id, so a pointer to it there is "unchanged". */
  rename(from: string, to: string): void {
    const s = this.#notes.get(from);
    if (!s) return;
    this.#notes.delete(from);
    if (!this.#notes.has(to)) this.#notes.set(to, s);
  }
  clear(): void { this.#notes.clear(); }
  get size(): number { return this.#notes.size; }
  ids(): string[] { return [...this.#notes.keys()]; }

  /** The messages from `from` up to `cut` were summarised into one message at `from`: what came in them is gone, and
   *  what came after moved up. */
  compacted(from: number, cut: number): void {
    for (const [id, s] of [...this.#notes]) {
      if (s.at < cut) this.#notes.delete(id);
      else this.#notes.set(id, { text: s.text, at: s.at - cut + from + 1 });
    }
  }

  toJSON(): Record<string, SeenNote> { return Object.fromEntries(this.#notes); }
}

// ------------------------------------------------------------ pointers

/** How many lines either side of a passage are sent with it, when the agent has not seen its note, and how much of each
 *  (a paragraph is often one long line). */
export const AROUND = 3;
const AROUND_CHARS = 200;
const clip = (l: string): string => (l.length > AROUND_CHARS ? `${l.slice(0, AROUND_CHARS).trimEnd()}…` : l);

const quote = (lines: string[]): string => lines.map((l) => `    > ${l}`).join("\n");
const linesOf = (text: string): string[] => text.replace(/\n$/, "").split("\n");
const count = (text: string): string => { const n = linesOf(text).length; return `${n} line${n === 1 ? "" : "s"}`; };

/** What changed between two versions of a note, as a unified diff with no context lines, each line indented as a
 *  footnote's are. Empty when nothing did. */
export function diffText(before: string, after: string): string {
  const a = linesOf(before), b = linesOf(after);
  const out: string[] = [];
  let shift = 0;
  for (const h of diffLines(a, b)) {
    const oldAt = h.del.length ? h.at + 1 : h.at, newAt = h.ins.length ? h.at + shift + 1 : h.at + shift;
    out.push(`    @@ -${oldAt}${h.del.length === 1 ? "" : `,${h.del.length}`} +${newAt}${h.ins.length === 1 ? "" : `,${h.ins.length}`} @@`);
    for (const l of h.del) out.push(`    -${l}`);
    for (const l of h.ins) out.push(`    +${l}`);
    shift += h.ins.length - h.del.length;
  }
  return out.join("\n");
}

/** One footnote of the message: its number, where it points, and the lines under it. */
interface Footnote { n: string; place: string; body: string }

const NOTE_PLACE = /^\/(.+?)\.md(?: L(\d+)(?:–(\d+))?)?( \(it may have moved\))?$/;

/** The message's text and its footnotes, as the pane wrote them (app/src/lib/pointers.ts, `expand`). */
export function footnotes(text: string): { body: string; notes: Footnote[] } {
  const m = /\n\n(\[\^\d+\]: [^]*)$/.exec(text);
  if (!m) return { body: text, notes: [] };
  const notes: Footnote[] = [];
  for (const block of m[1]!.split(/\n\n(?=\[\^\d+\]: )/)) {
    const h = /^\[\^(\d+)\]: ([^\n]*)(?:\n([^]*))?$/.exec(block);
    if (!h) return { body: text, notes: [] };
    notes.push({ n: h[1]!, place: h[2]!, body: h[3] ?? "" });
  }
  return { body: text.slice(0, m.index), notes };
}

/** What a pointer's rewriting needs: the note's file as it is now (null where there is no such note), and the record. */
export interface PointOptions {
  read: (id: string) => Promise<string | null>;
  seen: Seen;
  /** Lines either side of a passage of a note not seen (0 sends the passage alone, as the pane wrote it). */
  around?: number;
}

/** The message with each pointer to a note rewritten against what the agent has seen, and the notes it now has whole
 *  (to record once the message is on its way). A pointer to anything else stays as the pane wrote it. */
export async function point(text: string, { read, seen, around = AROUND }: PointOptions): Promise<{ text: string; gives: Map<string, string> }> {
  const { body, notes } = footnotes(text);
  const gives = new Map<string, string>();
  if (!notes.length) return { text, gives };
  const out: string[] = [];
  for (const f of notes) {
    const m = NOTE_PLACE.exec(f.place);
    const now = m ? await read(m[1]!).catch(() => null) : null;
    if (!m || now === null) { out.push(`[^${f.n}]: ${f.place}${f.body ? `\n${f.body}` : ""}`); continue; }
    const id = m[1]!, had = gives.get(id) ?? seen.get(id)?.text;
    const whole = !m[2];
    // What the agent is told of the note itself: nothing new, what changed, or all of it.
    const change = (): string => {
      const diff = had === undefined ? "" : diffText(had, now);
      // A diff longer than the note is no saving: the note is sent whole instead.
      if (had !== undefined && diff.length < now.length * 0.8) return `changed since you last saw it in this conversation; what changed (${count(now)} now):\n${diff}`;
      return `${had === undefined ? "" : "changed since you last saw it; "}the whole note as it is now (${count(now)}):\n${quote(linesOf(now))}`;
    };
    if (whole) {
      if (had === now) out.push(`[^${f.n}]: /${id}.md, unchanged since you last saw it in this conversation (${count(now)}).`);
      else { out.push(`[^${f.n}]: /${id}.md, ${change()}`); gives.set(id, now); }
      continue;
    }
    // A passage: as the pane wrote it, and then what the agent needs of the note around it.
    const passage = `[^${f.n}]: ${f.place}${f.body ? `\n${f.body}` : ""}`;
    if (had === now) out.push(`${passage}\n    (The note is unchanged since you last saw it in this conversation.)`);
    else if (had !== undefined) { out.push(`${passage}\n    The note, /${id}.md, ${change()}`); gives.set(id, now); }
    else if (around > 0) {
      const lines = linesOf(now), from = Number(m[2]), to = Number(m[3] ?? m[2]);
      const before = lines.slice(Math.max(0, from - 1 - around), Math.max(0, from - 1)), after = lines.slice(to, to + around);
      const at = (a: number, b: number) => (a === b ? `L${a}` : `L${a}–${b}`);
      const parts = [passage];
      if (before.length) parts.push(`    Before it (${at(from - before.length, from - 1)}):\n${quote(before.map(clip))}`);
      if (after.length) parts.push(`    After it (${at(to + 1, to + after.length)}):\n${quote(after.map(clip))}`);
      parts.push(`    (The note has ${count(now)}: read_note for the rest.)`);
      out.push(parts.join("\n"));
    } else out.push(passage);
  }
  return { text: `${body}\n\n${out.join("\n\n")}`, gives };
}

/** What isorite's own agent is told of the pointers, besides what any agent is (mcp-http.ts's instructions). */
export const POINTERS = "In this pane a footnote may bring the note it points to: whole, as a diff since you last saw it, or with the lines around the passage; or it says the note is unchanged since you saw it, its text earlier in the conversation. Use what it gives before reading the note again.";

// ------------------------------------------------------------ moves

/** The notes a text links to in the base, by id: Markdown links (`](/a/b.md`) and footnotes (`[^1]: /a/b.md`). */
export function linkedIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:\]\(|\]: )\/([^\s()#\]]+?)\.md(?=[#\s)]|$)/gm)) out.add(m[1]!);
  return [...out];
}

/** The most places named in the line about moves; the rest are counted. */
const MOVES_SHOWN = 8;

/** The line appended to the person's next message when notes the session knows moved or were deleted since the last
 *  turn, or "" when none did. Notes that went from one folder to another together are said as the folder. */
export function movesLine(moved: [string, string][], deleted: string[]): string {
  if (!moved.length && !deleted.length) return "";
  // Each move as the folder it came from and went to, where the note's own path below the folder stayed the same.
  const folders = new Map<string, { from: string; to: string; n: number }>();
  const folderOf = ([a, b]: [string, string]): { from: string; to: string } | null => {
    const x = a.split("/"), y = b.split("/");
    let k = 0;
    while (k < x.length - 1 && k < y.length && x[x.length - 1 - k] === y[y.length - 1 - k]) k++;
    if (k === 0 || x.length - k < 1 || x[x.length - 1] !== y[y.length - 1]) return null;
    return { from: x.slice(0, x.length - k).join("/"), to: y.slice(0, y.length - k).join("/") };
  };
  for (const m of moved) {
    const f = folderOf(m);
    if (!f) continue;
    const key = `${f.from}\n${f.to}`, had = folders.get(key);
    folders.set(key, { ...f, n: (had?.n ?? 0) + 1 });
  }
  const parts: string[] = [], told = new Set<string>();
  for (const f of folders.values()) if (f.n > 1) { parts.push(`/${f.from}/ → /${f.to}/ (${f.n} notes)`); told.add(`${f.from}\n${f.to}`); }
  for (const m of moved) {
    const f = folderOf(m);
    if (!f || !told.has(`${f.from}\n${f.to}`)) parts.push(`/${m[0]}.md → /${m[1]}.md`);
  }
  const list = (xs: string[]) => (xs.length > MOVES_SHOWN ? `${xs.slice(0, MOVES_SHOWN).join(", ")} and ${xs.length - MOVES_SHOWN} more` : xs.join(", "));
  const said = [
    ...(parts.length ? [`Moved since your last turn: ${list(parts)}`] : []),
    ...(deleted.length ? [`${parts.length ? "deleted" : "Deleted since your last turn"}: ${list(deleted.map((d) => `/${d}.md`))}`] : []),
  ];
  return `[${said.join("; ")}.]`;
}

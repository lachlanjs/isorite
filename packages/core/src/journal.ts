// A note's journal: every change to the note, one JSON entry per line, only ever added to. It lives in isorite's
// own files beside the notes (own.ts says where), so it is personal and the notes stay the same for everyone.
//
// Two things rest on it:
//   History    Any earlier version of the note is rebuilt by replaying its changes.
//   Timeline   The entries, folded into moments (a run of your own saves is one).
//
// Entries carry a ULID, so journals from two devices merge as a union by id. A journal from before M25 may hold
// The agent's `proposal`, `revise` and `discard` entries (nothing writes them now): they are passed over when it is read.
// Nothing here touches a file system or a clock: the caller gives the text and the stamp.

import type { Anchor } from "./blocks.ts";
import { applyHunks, diffLines, type Hunk } from "./diff.ts";
import { iso, sha256 } from "./text.ts";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encode(n: bigint, length: number): string {
  let out = "";
  for (let i = length - 1; i >= 0; i--) out += CROCKFORD[Number((n >> BigInt(5 * i)) & 31n)];
  return out;
}

const RANDOM_MASK = (1n << 80n) - 1n;
let last: [number, bigint] = [0, 0n]; // the last id's time and random part

function random80(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return bytes.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
}

/** A ULID (a millisecond timestamp, then randomness, in 26 sortable characters). Within one millisecond the random
 *  part counts up, so ids from one device sort in the order they were made. */
export function newId(ms = Date.now()): string {
  const rand = ms === last[0] ? last[1] + 1n : random80();
  last = [ms, rand];
  return encode(BigInt(ms), 10) + encode(rand & RANDOM_MASK, 16);
}

/** Who made an entry: `you`, `iso:<model>`, `agent:<name>`, or `external` for a change found already made. */
export type Who = string;

export interface Stamp {
  id: string;
  at: string;
  /** The session the entry belongs to: the id of its first entry. A session ends with half an hour of nothing. */
  session: string;
  device: string;
  who: Who;
}

export type Why = "start" | "edit" | "keep" | "restore" | "external" | "move";

/** A change to the note's file. */
export interface Change extends Stamp {
  kind: "change";
  why: Why;
  /** Hashes of the whole file before and after; `before` is null for a note's first entry. */
  before: string | null;
  after: string;
  hunks: Hunk[];
  /** The whole file after the change: on the first entry, at intervals, and wherever the chain was broken. */
  text?: string;
  /** For `restore`: the entry restored to. For `move`: the note's id before (the file is unchanged). */
  to?: string;
  from?: string;
  /** What the agent was asked, for a change it made. */
  asked?: string;
}

export interface Cost {
  model: string;
  tier: "low" | "mid" | "max";
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  usd: number;
}

/** A passage of the note, named by its text: `nth` tells apart passages with the same text, counted from 0 through
 *  the whole file. It may be a few words or several paragraphs. */
export type Passage = Anchor;
/** An entry of the journal: a change to the note's file. */
export type Entry = Change;
/** The one kind an entry is. Older journals also hold `proposal`, `revise`, `discard` (the agent's offers before M25) and
 *  format 1's `marks`: they are passed over. */
const KIND = "change";

export const SNAPSHOT_EVERY = 40;
export const SESSION_GAP_MS = 30 * 60 * 1000;
/** Your edits in a row are one moment, one layer of a note's history (M24, T), until 10 minutes pass with none. */
export const LAYER_IDLE_MS = 10 * 60 * 1000;

export const hashText = (text: string): string => sha256(text).slice(0, 16);

/** A stamp for a new entry. `last` is the newest entry anywhere in the study base, which decides the session. */
export function stamp(who: Who, device: string, last: Pick<Stamp, "at" | "session"> | null, now = Date.now()): Stamp {
  const id = newId(now);
  const fresh = !last || now - Date.parse(last.at) > SESSION_GAP_MS;
  return { id, at: iso(now), session: fresh ? id : last.session, device, who };
}

/** The entries in a journal's text, each once, oldest first. Lines that do not parse are skipped. */
export function readJournal(text: string): Entry[] {
  const byId = new Map<string, Entry>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let e: unknown;
    try { e = JSON.parse(line); } catch { continue; }
    if (typeof e !== "object" || e === null) continue;
    const entry = e as Entry;
    if (typeof entry.id !== "string" || entry.kind !== KIND || byId.has(entry.id)) continue;
    byId.set(entry.id, entry);
  }
  return [...byId.keys()].sort().map((k) => byId.get(k)!);
}

/** An entry as the line appended to the journal. */
export const journalLine = (entry: Entry): string => JSON.stringify(entry) + "\n";

/** The note as the journal has it after the entry `upTo` (or after the last), and the changes that could not be
 *  replayed because the chain before them is missing. Null when the journal has no change yet. */
export function replay(entries: readonly Entry[], upTo?: string): { text: string; hash: string; broken: string[] } | null {
  let text: string | null = null;
  const broken: string[] = [];
  // A full snapshot makes everything before it irrelevant, so start from the last one at or before `upTo`: a save
  // then replays at most SNAPSHOT_EVERY entries, however long the journal has grown.
  let from = 0, end = entries.length;
  if (upTo !== undefined) { end = 0; while (end < entries.length && entries[end]!.id <= upTo) end++; }
  for (let k = end - 1; k >= 0; k--) if (entries[k]!.text !== undefined) { from = k; break; }
  for (let k = from; k < end; k++) {
    const e = entries[k]!;
    if (e.text !== undefined) text = e.text;
    else if (text !== null && hashText(text) === e.before) {
      try { text = applyHunks(text.split("\n"), e.hunks).join("\n"); } catch { broken.push(e.id); }
    } else broken.push(e.id);
  }
  return text === null ? null : { text, hash: hashText(text), broken };
}

/** Who last wrote each line of the note as the journal last has it: `you`, `iso:…`, `agent:…` or `external`. Null
 *  when the journal's chain is broken, as nothing can then be said. */
export function authors(entries: readonly Entry[]): string[] | null {
  let owners: string[] | null = null, text: string[] | null = null;
  for (const e of entries) {
    const who = e.who;
    if (owners === null || text === null) {
      if (e.text === undefined) return null;
      text = e.text.split("\n");
      owners = text.map(() => who);
      continue;
    }
    if (hashText(text.join("\n")) !== e.before) return null;
    const next: string[] = [];
    let at = 0;
    for (const h of e.hunks) {
      next.push(...owners.slice(at, h.at), ...h.ins.map(() => who));
      at = h.at + h.del.length;
    }
    next.push(...owners.slice(at));
    owners = next;
    text = applyHunks(text, e.hunks);
  }
  return owners;
}

/** A stretch of one line written by one hand: its characters `from` to `to`. */
export interface Run { from: number; to: number; who: string }

/** A line's words, spaces and marks, in order: what is compared to tell who wrote what within a line. */
const tokens = (line: string): string[] => line.match(/\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];

/** Who wrote each word of the note as the journal last has it, line by line, as runs. Where a change replaced
 *  lines, the old and the new are compared word by word, so a word kept keeps its writer and only the words put in
 *  are the changer's. Null when the chain is broken. */
export function wordAuthors(entries: readonly Entry[]): Run[][] | null {
  // Each line as its tokens, each token with its writer.
  type Line = { t: string[]; w: string[] };
  let lines: Line[] | null = null, text: string[] | null = null;
  const line = (l: string, who: string) => { const t = tokens(l); return { t, w: t.map(() => who) }; };
  for (const e of entries) {
    const who = e.who;
    if (lines === null || text === null) {
      if (e.text === undefined) return null;
      text = e.text.split("\n");
      lines = text.map((l) => line(l, who));
      continue;
    }
    if (hashText(text.join("\n")) !== e.before) return null;
    const next: Line[] = [];
    let at = 0;
    for (const h of e.hunks) {
      next.push(...lines.slice(at, h.at));
      // The removed lines and the added ones as one run of tokens each, with a line break as a token, compared.
      const old = lines.slice(h.at, h.at + h.del.length);
      const a: string[] = [], aw: string[] = [];
      old.forEach((l, k) => { if (k) { a.push("\n"); aw.push(""); } a.push(...l.t); aw.push(...l.w); });
      const b: string[] = [];
      h.ins.forEach((l, k) => { if (k) b.push("\n"); b.push(...tokens(l)); });
      const bw: string[] = b.map(() => who);
      // Words kept from the old lines keep their writer; but where most of what was put in is new, the passage was
      // rewritten, and a word that happens to recur in it ("the", "error") is the rewriter's too.
      const kept: [number, number][] = [];
      let i = 0, j = 0;
      for (const d of diffLines(a, b)) {
        while (i < d.at) { kept.push([j, i]); i++; j++; }
        i += d.del.length; j += d.ins.length;
      }
      while (i < a.length && j < b.length) { kept.push([j, i]); i++; j++; }
      const words = (ts: string[]) => ts.filter((t) => /[\p{L}\p{N}]/u.test(t)).length;
      const keptWords = kept.filter(([jj]) => /[\p{L}\p{N}]/u.test(b[jj]!)).length;
      if (keptWords * 2 >= words(b)) for (const [jj, ii] of kept) bw[jj] = aw[ii]!;
      let cur: Line = { t: [], w: [] };
      const made: Line[] = [];
      b.forEach((tok, k) => { if (tok === "\n") { made.push(cur); cur = { t: [], w: [] }; } else { cur.t.push(tok); cur.w.push(bw[k]!); } });
      if (h.ins.length) made.push(cur);
      next.push(...made);
      at = h.at + h.del.length;
    }
    next.push(...lines.slice(at));
    lines = next;
    text = applyHunks(text, e.hunks);
  }
  return (lines ?? []).map((l) => {
    const runs: Run[] = [];
    let pos = 0;
    l.t.forEach((tok, k) => {
      const who = l.w[k]!, last = runs.at(-1);
      if (last && last.who === who && last.to === pos) last.to += tok.length; else runs.push({ from: pos, to: pos + tok.length, who });
      pos += tok.length;
    });
    return runs;
  });
}

/** The note as it was after an entry. */
export const textAt = (entries: readonly Entry[], id?: string): string | null => replay(entries, id)?.text ?? null;

/** The entry for a change of the note's file to `after`, or null when nothing changed. The difference is taken
 *  from the journal's own last version, so the chain holds whatever the caller thought the file was. */
export function change(entries: readonly Entry[], after: string, s: Stamp, why: Why, extra: { to?: string; asked?: string } = {}): Change | null {
  const head = replay(entries);
  if (head && head.text === after) return null;
  const changes = entries;
  let sinceText = 0;
  for (let k = changes.length - 1; k >= 0 && changes[k]!.text === undefined; k--) sinceText++;
  const whole = !head || head.broken.length > 0 || sinceText + 1 >= SNAPSHOT_EVERY;
  return {
    ...s, kind: "change", why: head ? why : "start", before: head ? head.hash : null, after: hashText(after),
    hunks: head ? diffLines(head.text.split("\n"), after.split("\n")) : [],
    ...(whole ? { text: after } : {}), ...extra,
  };
}

/** If the file is not what the journal last saw (it was edited elsewhere, or the note is new to the journal),
 *  the entry that records it. Call before anything else is entered. */
export function reconcile(entries: readonly Entry[], file: string, s: Omit<Stamp, "who">): Change | null {
  return change(entries, file, { ...s, who: "external" }, "external");
}

/** Where a passage is in the note now, as character offsets, or null when its text is no longer there. */
export function findPassage(note: string, p: Passage): { from: number; to: number } | null {
  if (!p.text) return null;
  let at = -1;
  for (let n = 0; n <= p.nth; n++) {
    at = note.indexOf(p.text, at + 1);
    if (at < 0) break;
  }
  // The one meant is gone (an earlier twin was deleted, say): if exactly one is left, that is the place.
  if (at < 0) {
    const first = note.indexOf(p.text);
    if (first < 0 || note.indexOf(p.text, first + 1) >= 0) return null;
    at = first;
  }
  return { from: at, to: at + p.text.length };
}

// ------------------------------------------------------------ the timeline

export interface Moment {
  /** The entries folded into this moment; the last is the one to show the note at. */
  ids: string[];
  at: string;
  session: string;
  who: Who;
  what: "wrote" | "found" | "edited" | "kept" | "restored" | "moved" | "changed elsewhere";
  /** What was asked, where the agent was asked something. */
  asked?: string;
  /** How many lines it put in and took out of the note (M24, T: a layer's thickness). */
  added: number;
  removed: number;
}

/** The journal as the timeline shows it. Your own edits in a row within a session are one moment, until ten minutes
 *  pass with none (LAYER_IDLE_MS). */
export function moments(entries: readonly Entry[]): Moment[] {
  const out: Moment[] = [];
  /** Lines a change put in and took out: a note's first entry, all of its text. */
  const size = (c: Change): [number, number] => (c.why === "start" || (!c.hunks.length && c.before === null)
    ? [(c.text ?? "").split("\n").length, 0]
    : [c.hunks.reduce((n, h) => n + h.ins.length, 0), c.hunks.reduce((n, h) => n + h.del.length, 0)]);
  for (const e of entries) {
    const base = { ids: [e.id], at: e.at, session: e.session, who: e.who, added: 0, removed: 0 };
    const [added, removed] = size(e);
    const last = out[out.length - 1];
    if (e.why === "edit" && last && last.what === "edited" && last.who === e.who && last.session === e.session && Date.parse(e.at) - Date.parse(last.at) <= LAYER_IDLE_MS) {
      last.ids.push(e.id); last.at = e.at; last.added += added; last.removed += removed;
      continue;
    }
    const what = e.why === "start" ? (e.who === "external" ? "found" : "wrote") : e.why === "edit" ? "edited" : e.why === "restore" ? "restored" : e.why === "keep" ? "kept" : e.why === "move" ? "moved" : "changed elsewhere";
    out.push({ ...base, what, added, removed, ...(e.asked ? { asked: e.asked } : {}) });
  }
  return out;
}

/** Where a line of the version before a change is in the version after it, or null if the change took it out. */
function carried(hunks: readonly Hunk[], line: number): number | null {
  let shift = 0;
  for (const h of hunks) {
    if (line < h.at) break;
    if (line < h.at + h.del.length) return null;
    shift += h.ins.length - h.del.length;
  }
  return line + shift;
}

/** The lines of the version after a change that the change put there. */
function putIn(c: Change): number[] {
  if (c.why === "start" || (!c.hunks.length && c.before === null)) return (c.text ?? "").split("\n").map((_, k) => k);
  const out: number[] = [];
  let shift = 0;
  for (const h of c.hunks) {
    for (let k = 0; k < h.ins.length; k++) out.push(h.at + shift + k);
    shift += h.ins.length - h.del.length;
  }
  return out;
}

/** The lines of the note as the journal has it now that a moment put there and that are still there, as runs of
 *  lines (from 0, through the whole file, `to` exclusive). `removed` when it put lines in and none are left. A
 *  moment that changed nothing in the file (nothing) touches nothing. */
export function touched(entries: readonly Entry[], ids: readonly string[]): { runs: { from: number; to: number }[]; removed: boolean } {
  const mine = new Set(ids);
  let lines = new Set<number>(), put = false;
  for (const e of entries) {
    const next = new Set<number>();
    for (const l of lines) { const at = carried(e.hunks, l); if (at !== null) next.add(at); }
    lines = next;
    if (mine.has(e.id)) for (const l of putIn(e)) { lines.add(l); put = true; }
  }
  const sorted = [...lines].sort((a, b) => a - b), runs: { from: number; to: number }[] = [];
  for (const l of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.to === l) last.to = l + 1;
    else runs.push({ from: l, to: l + 1 });
  }
  return { runs, removed: put && !runs.length };
}

/** A moment of the session, with the note it was in. */
export interface SessionMoment extends Moment { note: string }

/** The moments of one session across notes, in the order they began. `journals` holds each note's entries of that
 *  session only. */
export function sessionMoments(journals: ReadonlyMap<string, readonly Entry[]>): SessionMoment[] {
  const out: SessionMoment[] = [];
  for (const [note, entries] of journals) for (const m of moments(entries)) out.push({ ...m, note });
  return out.sort((a, b) => (a.ids[0]! < b.ids[0]! ? -1 : 1));
}

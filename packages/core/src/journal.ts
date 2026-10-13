// A note's journal: every change to the note, and everything Iso offered for
// it, one JSON entry per line, only ever added to. It lives in the study base
// (study.ts says where), so it is personal and the knowledge base stays the
// same for everyone.
//
// Three things rest on it:
//   History    Any earlier version of the note is rebuilt by replaying its changes.
//   Unkept     Iso's text is a `proposal` entry and is never in the note's file.
//              The editor lays it over the note; the file changes when it is
//              kept, and that change is the entry that settles it.
//   Timeline   The entries, folded into moments (a run of your own saves is one).
//
// Entries carry a ULID, so journals from two devices merge as a union by id.
// Nothing here touches a file system or a clock: the caller gives the text and
// the stamp.

import { anchorOf, blocks, findAnchor, type Anchor } from "./blocks.ts";
import { applyHunks, diffLines, type Hunk } from "./diff.ts";
import { newId } from "./record.ts";
import { iso, sha256 } from "./text.ts";

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

export type Why = "start" | "edit" | "keep" | "restore" | "external";

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
  /** For `keep`: the proposal kept. For `restore`: the entry restored to. */
  proposal?: string;
  to?: string;
}

export interface Cost {
  model: string;
  tier: "low" | "mid" | "max";
  tokensIn: number;
  tokensOut: number;
  tokensCached: number;
  usd: number;
}

interface ProposalBase extends Stamp {
  kind: "proposal";
  /** What was asked, in the person's words. */
  asked: string;
  cost?: Cost;
  /** The notes Iso read to write it, in order. */
  read?: string[];
  /** For a reply to a note written for Iso, entered again in the note it became: the proposal it is a copy of, in
   *  the draft's journal. A copy is the same exchange and the same cost, counted once. */
  copyOf?: string;
  /** Something the person should know about it: that part of the reply was left out, or that it was cut short. */
  notice?: string;
}
/** New text at a point: between the block `after` and the block `before`. */
export interface Insert extends ProposalBase {
  form: "insert";
  after: Anchor | null;
  before: Anchor | null;
  text: string;
}
/** Whole blocks rewritten, and nothing else. An empty `new` removes the block. */
export interface Rewrite extends ProposalBase {
  form: "rewrite";
  blocks: { old: Anchor; new: string }[];
}
export type Proposal = Insert | Rewrite;

/** The person's edit to a proposal before keeping it. */
export interface Revise extends Stamp {
  kind: "revise";
  proposal: string;
  text?: string;
  blocks?: string[];
}
export interface Discard extends Stamp {
  kind: "discard";
  proposal: string;
}
export type Entry = Change | Proposal | Revise | Discard;

export const SNAPSHOT_EVERY = 40;
export const SESSION_GAP_MS = 30 * 60 * 1000;

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
    if (typeof entry.id !== "string" || typeof entry.kind !== "string" || byId.has(entry.id)) continue;
    byId.set(entry.id, entry);
  }
  return [...byId.keys()].sort().map((k) => byId.get(k)!);
}

/** An entry as the line appended to the journal. */
export const journalLine = (entry: Entry): string => JSON.stringify(entry) + "\n";

const isChange = (e: Entry): e is Change => e.kind === "change";

/** The note as the journal has it after the entry `upTo` (or after the last), and the changes that could not be
 *  replayed because the chain before them is missing. Null when the journal has no change yet. */
export function replay(entries: readonly Entry[], upTo?: string): { text: string; hash: string; broken: string[] } | null {
  let text: string | null = null;
  const broken: string[] = [];
  for (const e of entries) {
    if (upTo !== undefined && e.id > upTo) break;
    if (!isChange(e)) continue;
    if (e.text !== undefined) text = e.text;
    else if (text !== null && hashText(text) === e.before) {
      try { text = applyHunks(text.split("\n"), e.hunks).join("\n"); } catch { broken.push(e.id); }
    } else broken.push(e.id);
  }
  return text === null ? null : { text, hash: hashText(text), broken };
}

/** The note as it was after an entry. */
export const textAt = (entries: readonly Entry[], id?: string): string | null => replay(entries, id)?.text ?? null;

/** The entry for a change of the note's file to `after`, or null when nothing changed. The difference is taken
 *  from the journal's own last version, so the chain holds whatever the caller thought the file was. */
export function change(entries: readonly Entry[], after: string, s: Stamp, why: Why, extra: { proposal?: string; to?: string } = {}): Change | null {
  const head = replay(entries);
  if (head && head.text === after) return null;
  const changes = entries.filter(isChange);
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

// ------------------------------------------------------------ unkept text

/** The proposals neither kept nor discarded, as last revised, oldest first. */
export function pending(entries: readonly Entry[]): Proposal[] {
  const open = new Map<string, Proposal>();
  for (const e of entries) {
    if (e.kind === "proposal") open.set(e.id, e);
    else if (e.kind === "discard" || (e.kind === "change" && e.proposal && e.why === "keep")) open.delete(e.proposal!);
    else if (e.kind === "revise") {
      const p = open.get(e.proposal);
      if (!p) continue;
      if (p.form === "insert" && e.text !== undefined) open.set(p.id, { ...p, text: e.text });
      if (p.form === "rewrite" && e.blocks) open.set(p.id, { ...p, blocks: p.blocks.map((b, k) => ({ old: b.old, new: e.blocks![k] ?? b.new })) });
    }
  }
  return [...open.values()];
}

/** Where a proposal sits in the note as it now is. */
export type Placement =
  | { form: "insert"; line: number }
  | { form: "rewrite"; blocks: { from: number; to: number; new: string }[] };

/** Null when the place cannot be found: the proposal is then shown apart from the text, and is not lost. */
export function locate(note: string, p: Proposal): Placement | null {
  const all = blocks(note);
  if (p.form === "rewrite") {
    const out: { from: number; to: number; new: string }[] = [];
    for (const b of p.blocks) {
      const k = findAnchor(all, b.old);
      if (k < 0) return null;
      out.push({ from: all[k]!.from, to: all[k]!.to, new: b.new });
    }
    return { form: "rewrite", blocks: out };
  }
  const a = p.after ? findAnchor(all, p.after) : -1, b = p.before ? findAnchor(all, p.before) : -1;
  if (a >= 0) return { form: "insert", line: all[a]!.to };
  if (b >= 0) return { form: "insert", line: all[b]!.from };
  if (!p.after && !p.before) {
    if (all.length) return { form: "insert", line: all[all.length - 1]!.to };
    const lines = note.split("\n");
    let end = lines.length;
    while (end > 0 && !lines[end - 1]!.trim()) end--;
    return { form: "insert", line: end };
  }
  // Text that was to open the note still can, whatever now follows it.
  if (!p.after && all.length) return { form: "insert", line: all[0]!.from };
  return null;
}

/** The note with a proposal written in, or null when its place cannot be found. */
export function written(note: string, p: Proposal): string | null {
  const place = locate(note, p);
  if (!place) return null;
  const lines = note.split("\n");
  const blank = (k: number): boolean => k < 0 || k >= lines.length || !lines[k]!.trim();
  if (place.form === "insert") {
    const ins = p.form === "insert" ? p.text.replace(/^\n+|\n+$/g, "").split("\n") : [];
    const at = place.line;
    lines.splice(at, 0, ...(blank(at - 1) ? [] : [""]), ...ins, ...(blank(at) ? [] : [""]));
    return lines.join("\n");
  }
  for (const b of [...place.blocks].sort((x, y) => y.from - x.from)) {
    const next = b.new.replace(/^\n+|\n+$/g, "");
    if (next) lines.splice(b.from, b.to - b.from, ...next.split("\n"));
    else lines.splice(b.from, b.to - b.from + (blank(b.to) && b.to < lines.length ? 1 : 0)); // the block, and the blank line after it
  }
  return lines.join("\n");
}

/** A proposal to put `text` at a line of the note as it stands. */
export function insertAt(note: string, line: number): Pick<Insert, "form" | "after" | "before"> {
  const all = blocks(note);
  let prev = -1;
  for (let k = 0; k < all.length; k++) if (all[k]!.from < line) prev = k;
  return { form: "insert", after: prev >= 0 ? anchorOf(all, prev) : null, before: prev + 1 < all.length ? anchorOf(all, prev + 1) : null };
}

/** A proposal to rewrite the blocks at these indexes (into `blocks(note)`), before Iso has filled in the new text. */
export function rewriteOf(note: string, indexes: readonly number[]): Pick<Rewrite, "form" | "blocks"> {
  const all = blocks(note);
  return { form: "rewrite", blocks: indexes.filter((k) => all[k]).map((k) => ({ old: anchorOf(all, k), new: all[k]!.text })) };
}

// ------------------------------------------------------------ the timeline

export interface Moment {
  /** The entries folded into this moment; the last is the one to show the note at. */
  ids: string[];
  at: string;
  session: string;
  who: Who;
  what: "wrote" | "found" | "edited" | "kept" | "offered" | "discarded" | "restored" | "changed elsewhere";
  /** What was asked, where the moment came from a proposal. */
  asked?: string;
}

/** The journal as the timeline shows it. Your own edits in a row within a session are one moment; a proposal is
 *  one moment whose `what` says how it ended. Revisions are not moments. */
export function moments(entries: readonly Entry[]): Moment[] {
  const out: Moment[] = [], offered = new Map<string, Moment>(), asked = new Map<string, string>();
  for (const e of entries) {
    const base = { ids: [e.id], at: e.at, session: e.session, who: e.who };
    if (e.kind === "proposal") {
      const m: Moment = { ...base, what: "offered", asked: e.asked };
      offered.set(e.id, m); asked.set(e.id, e.asked);
      out.push(m);
    } else if (e.kind === "discard") {
      const m = offered.get(e.proposal);
      if (m) { m.what = "discarded"; m.ids.push(e.id); }
    } else if (e.kind === "change") {
      const m = e.proposal ? offered.get(e.proposal) : undefined;
      if (e.why === "keep" && m) { m.what = "kept"; m.ids.push(e.id); m.at = e.at; continue; }
      const last = out[out.length - 1];
      if (e.why === "edit" && last && last.what === "edited" && last.who === e.who && last.session === e.session) { last.ids.push(e.id); last.at = e.at; continue; }
      const what = e.why === "start" ? (e.who === "external" ? "found" : "wrote") : e.why === "edit" ? "edited" : e.why === "restore" ? "restored" : e.why === "keep" ? "kept" : "changed elsewhere";
      out.push({ ...base, what });
    }
  }
  return out;
}

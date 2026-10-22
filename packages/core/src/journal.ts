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
  /** For `keep`: the proposal kept, and for a rewrite the one region kept (without it, all that were still open).
   *  For `restore`: the entry restored to. For `move`: the note's id before (the file is unchanged). */
  proposal?: string;
  region?: number;
  to?: string;
  from?: string;
  /** Iso's change in Write mode (M10): what it was asked, in its pane. */
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
/** A passage of the note, named by its text: `nth` tells apart passages with the same text, counted from 0 through
 *  the whole file. It may be a few words or several paragraphs. */
export type Passage = Anchor;
/** Chosen passages rewritten, and nothing else. An empty `new` takes the passage out. Each is kept or removed on
 *  its own. */
export interface Rewrite extends ProposalBase {
  form: "rewrite";
  regions: { old: Passage; new: string }[];
  /** As `pending` gives it: the regions neither kept nor removed yet, by index. */
  open?: number[];
}
export type Proposal = Insert | Rewrite;

/** The person's edit to a proposal before keeping it. */
export interface Revise extends Stamp {
  kind: "revise";
  proposal: string;
  text?: string;
  /** For a rewrite: the new text of each region, in order. */
  regions?: string[];
}
export interface Discard extends Stamp {
  kind: "discard";
  proposal: string;
  /** For a rewrite: the one region removed. Without it, all that are still open. */
  region?: number;
}
/** Iso's marking of an exercise's working: passages marked right or wrong, laid over the working until they are
 *  edited away. Never written into the file. The `attempt` event in the study record names it by id, and holds what
 *  the marking moves (understanding.ts). */
export interface Marks extends Stamp {
  kind: "marks";
  /** The passage marked as the answer when it was sent. */
  answer: Passage;
  result: "right" | "partly" | "wrong";
  marks: { passage: Passage; mark: "right" | "wrong" }[];
  /** Passages Iso quoted that were not in the working. */
  dropped?: number;
  cost?: Cost;
}
export type Entry = Change | Proposal | Revise | Discard | Marks;

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

/** Who last wrote each line of the note as the journal last has it: `you`, `iso:…`, `agent:…` or `external`. Text
 *  kept from a proposal is its proposer's. Null when the journal's chain is broken, as nothing can then be said. */
export function authors(entries: readonly Entry[]): string[] | null {
  const proposers = new Map<string, string>();
  let owners: string[] | null = null, text: string[] | null = null;
  for (const e of entries) {
    if (e.kind === "proposal") proposers.set(e.id, e.who);
    if (!isChange(e)) continue;
    const who = e.why === "keep" && e.proposal ? (proposers.get(e.proposal) ?? e.who) : e.who;
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
 *  are the changer's. Text kept from a proposal is its proposer's, as in `authors`. Null when the chain is broken. */
export function wordAuthors(entries: readonly Entry[]): Run[][] | null {
  const proposers = new Map<string, string>();
  // Each line as its tokens, each token with its writer.
  type Line = { t: string[]; w: string[] };
  let lines: Line[] | null = null, text: string[] | null = null;
  const line = (l: string, who: string) => { const t = tokens(l); return { t, w: t.map(() => who) }; };
  for (const e of entries) {
    if (e.kind === "proposal") proposers.set(e.id, e.who);
    if (!isChange(e)) continue;
    const who = e.why === "keep" && e.proposal ? (proposers.get(e.proposal) ?? e.who) : e.who;
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
      let i = 0, j = 0;
      for (const d of diffLines(a, b)) {
        while (i < d.at) { bw[j] = aw[i]!; i++; j++; }
        i += d.del.length; j += d.ins.length;
      }
      while (i < a.length && j < b.length) { bw[j] = aw[i]!; i++; j++; }
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
export function change(entries: readonly Entry[], after: string, s: Stamp, why: Why, extra: { proposal?: string; region?: number; to?: string; asked?: string } = {}): Change | null {
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

/** The proposals neither kept nor discarded, as last revised, oldest first. A rewrite waits while any of its
 *  regions does, and says which (`open`). */
export function pending(entries: readonly Entry[]): Proposal[] {
  const open = new Map<string, Proposal>();
  const settle = (id: string, region: number | undefined) => {
    const p = open.get(id);
    if (!p) return;
    const left = p.form === "rewrite" && region !== undefined ? (p.open ?? []).filter((k) => k !== region) : [];
    if (p.form === "rewrite" && left.length) open.set(id, { ...p, open: left });
    else open.delete(id);
  };
  for (const e of entries) {
    if (e.kind === "proposal") open.set(e.id, e.form === "rewrite" ? { ...e, open: e.regions.map((_, k) => k) } : e);
    else if (e.kind === "discard") settle(e.proposal, e.region);
    else if (e.kind === "change" && e.proposal && e.why === "keep") settle(e.proposal, e.region);
    else if (e.kind === "revise") {
      const p = open.get(e.proposal);
      if (!p) continue;
      if (p.form === "insert" && e.text !== undefined) open.set(p.id, { ...p, text: e.text });
      if (p.form === "rewrite" && e.regions) open.set(p.id, { ...p, regions: p.regions.map((r, k) => ({ old: r.old, new: e.regions![k] ?? r.new })) });
    }
  }
  return [...open.values()];
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

/** The passage between two character offsets of the note, as it is named in the journal. */
export function passageOf(note: string, from: number, to: number): Passage {
  const text = note.slice(from, to);
  let nth = 0;
  for (let at = note.indexOf(text); at >= 0 && at < from; at = note.indexOf(text, at + 1)) nth++;
  return { text, nth };
}

/** Where a proposal sits in the note as it now is. A rewrite's regions are placed one by one: one whose passage
 *  has been edited away is null, and the others stand. */
export type Placement =
  | { form: "insert"; line: number }
  | { form: "rewrite"; regions: ({ from: number; to: number } | null)[] };

/** Null when the place of new text cannot be found: the proposal is then shown apart from the text, and is not lost. */
export function locate(note: string, p: Proposal): Placement | null {
  if (p.form === "rewrite") return { form: "rewrite", regions: p.regions.map((r) => findPassage(note, r.old)) };
  const all = blocks(note);
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

/** The note with a proposal written in. For a rewrite, `region` writes that one alone; without it, every region
 *  still open. Null when the place (or, for a rewrite, any of the places asked for) cannot be found. */
export function written(note: string, p: Proposal, region?: number): string | null {
  if (p.form === "rewrite") {
    const which = region !== undefined ? [region] : p.open ?? p.regions.map((_, k) => k);
    const places = which.map((k) => ({ k, at: p.regions[k] ? findPassage(note, p.regions[k]!.old) : null }));
    if (!places.length || places.some((x) => !x.at)) return null;
    // From the last to the first, so the offsets of the earlier ones hold.
    let out = note;
    for (const { k, at } of places.sort((x, y) => y.at!.from - x.at!.from)) out = out.slice(0, at!.from) + p.regions[k]!.new + out.slice(at!.to);
    return out;
  }
  const place = locate(note, p);
  if (!place || place.form !== "insert") return null;
  const lines = note.split("\n");
  const blank = (k: number): boolean => k < 0 || k >= lines.length || !lines[k]!.trim();
  const ins = p.text.replace(/^\n+|\n+$/g, "").split("\n");
  const at = place.line;
  lines.splice(at, 0, ...(blank(at - 1) ? [] : [""]), ...ins, ...(blank(at) ? [] : [""]));
  return lines.join("\n");
}

/** A proposal to put `text` at a line of the note as it stands. */
export function insertAt(note: string, line: number): Pick<Insert, "form" | "after" | "before"> {
  const all = blocks(note);
  let prev = -1;
  for (let k = 0; k < all.length; k++) if (all[k]!.from < line) prev = k;
  return { form: "insert", after: prev >= 0 ? anchorOf(all, prev) : null, before: prev + 1 < all.length ? anchorOf(all, prev + 1) : null };
}

// ------------------------------------------------------------ the timeline

export interface Moment {
  /** The entries folded into this moment; the last is the one to show the note at. */
  ids: string[];
  at: string;
  session: string;
  who: Who;
  what: "wrote" | "found" | "edited" | "kept" | "offered" | "discarded" | "restored" | "moved" | "changed elsewhere" | "marked";
  /** What was asked, where the moment came from a proposal. */
  asked?: string;
  /** How a marking came out. */
  result?: "right" | "partly" | "wrong";
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
    } else if (e.kind === "marks") {
      out.push({ ...base, what: "marked", result: e.result });
    } else if (e.kind === "discard") {
      const m = offered.get(e.proposal);
      if (m) { m.what = "discarded"; m.ids.push(e.id); }
    } else if (e.kind === "change") {
      const m = e.proposal ? offered.get(e.proposal) : undefined;
      if (e.why === "keep" && m) { m.what = "kept"; m.ids.push(e.id); m.at = e.at; continue; }
      const last = out[out.length - 1];
      if (e.why === "edit" && last && last.what === "edited" && last.who === e.who && last.session === e.session) { last.ids.push(e.id); last.at = e.at; continue; }
      const what = e.why === "start" ? (e.who === "external" ? "found" : "wrote") : e.why === "edit" ? "edited" : e.why === "restore" ? "restored" : e.why === "keep" ? "kept" : e.why === "move" ? "moved" : "changed elsewhere";
      out.push({ ...base, what, ...(e.asked ? { asked: e.asked } : {}) });
    }
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
 *  moment that changed nothing in the file (Iso's text not kept, a marking) touches nothing. */
export function touched(entries: readonly Entry[], ids: readonly string[]): { runs: { from: number; to: number }[]; removed: boolean } {
  const mine = new Set(ids);
  let lines = new Set<number>(), put = false;
  for (const e of entries) {
    if (!isChange(e)) continue;
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

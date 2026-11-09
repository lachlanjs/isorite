// The engine: one knowledge base and isorite's own files for it, open. Every write to a
// note goes through `saveNote` or `createNote` here, one at a time, which is
// what keeps the journal true to the file (docs/architecture.md, section 3).

import {
  AGENTS_FILE, STRENGTH, citeKind, codeTarget, fileType, pictureSize, pictureType, sha256, embedRefs, embedFor, slugify, spliceText, SETTINGS_FILE, HIDDEN_FILE, GITATTRIBUTES, parseSettings, settingsText, type BaseSettings, kindOf, idsOf, DONE, ABOUT, Bundle, SearchIndex, change, hashText, journalLine, journalPath, replay, sessionMoments, mapModel, newId, pending, readJournal, reconcile, repairFrontmatter, findSymbol, hasSymbols, splitFrontmatter, stamp, written, type Entry, type FileEntry, type MapModel, type Proposal, type SessionMoment, type Stamp,
} from "@isorite/core";
import { Conflict, EngineError, MAX_CODE_LINES, MAX_FILE_BYTES, type CodeSlice, type AgentLook, type AgentChange, type Api, type FileBytes, type PictureInfo, type AgentRecord, type AgentSession, type TerminalTurn, type Conversation, type ConversationSummary, type EngineEvent, type Listing, type MapReport, type NoteSource, type Saved, type SearchHit, type Session, type FindResult, type FindHit } from "./api.ts";
import { FIND_SIMILAR, Lookup, TOOLS, baseOf, noteId, withBase, type Similar, type ToolDef } from "./lookup.ts";
import { ARTIFACTS, ARTIFACT_RECIPE, ASK_QUESTION, OFFER_TEXT, CONVERSATIONS_DIR, ISORITE, PRACTICE, READ_ARTIFACT, READ_DATA, WRITE_ARTIFACT, conversationPath, readTurns, type TurnItem } from "./turn.ts";
import { WRITING } from "./writing.ts";
import { Meaning, type Embedder } from "./meaning.ts";
import type { Clock, Files } from "./ports.ts";
import { RECIPES, REFERENCE, checkArtifact, readsOf, columnsOf, describeShape, manifestOf, parseData, shapeOf, withManifest } from "@isorite/kit";

/** A text's size in tokens, as estimated: four characters a token. */
const estimate = (text: string): number => Math.ceil(text.length / 4);

/** The largest note taken. */
export const MAX_NOTE_BYTES = 2_000_000;

export interface EngineOptions {
  /** The knowledge base's folder. */
  notes: Files;
  /** isorite's own files for this base: its journals, conversations and drafts. On disk, the notes'
   *  `.isorite/` folder (format 2); on the guide's site and in the tests, files in memory. */
  own: Files;
  clock: Clock;
  device: string;
  name: string;
  /** Search by meaning, where the device can run the model: the model, and a folder outside both repositories
   *  for its vectors, with the name of this base's file in it. */
  embedder?: Embedder;
  cache?: { files: Files; name: string };
  /** Or a search by meaning from elsewhere (tests). */
  similar?: Similar;
  /** The files of a repository named in the base's settings (M12): where its code links point. Null where there
   *  is no such folder. */
  repository?: (path: string) => Files | null;
  /** The repository the notes are in, as `repository` takes it: where code links point unless the settings say. */
  foundRepository?: string;
  /** The other bases lent to this one's sessions (M20), where a server holds several. */
  elsewhere?: Elsewhere;
  /** An artifact run unseen (M23, Q117), where a browser can be had: what it reported. Without it, or when it
   *  answers null, only the static checks run. */
  renderArtifact?: (path: string, html: string) => Promise<ArtifactRun | null>;
}

/** What running an artifact unseen found. */
export interface ArtifactRun { rendered: boolean; errors: string[]; drawn: number }

/** The other bases a server holds that are lent to this base's sessions: their names, each with a line on what it
 *  holds, and each one's engine. */
export interface Elsewhere {
  lent(): { name: string; about: string }[];
  base(name: string): Engine | null;
}

/** What is said before an answer from another base, so its ids are not taken for this one's. */
const fromBase = (base: string, text: string): string => `(From the base ${base}: name its notes ${base}:<id>, or give base "${base}".)\n${text}`;

/** In the knowledge base itself: not one of isorite's own files, whose ids began "@" (Iso's drafts, before M25). */
const inBase = (id: string): boolean => !id.startsWith("@");

const BAD_PART = /^\.|[\0\\:*?"<>|]|^\s|\s$/;

/** A note's id, checked before it becomes a path: no "..", nothing hidden, no absolute path. */
export function checkNoteId(id: string): string {
  const parts = id.split("/");
  if (!id || id.length > 400 || parts.some((p) => !p || BAD_PART.test(p))) throw new EngineError(`not a note's id: ${JSON.stringify(id)}`);
  return id;
}

/** A file's path in the base as an agent gives one: no leading slash, no "..", nothing hidden. */
function filePathOf(raw: unknown): string | null {
  const p = String(raw ?? "").trim().replace(/^\/+/, "");
  return p && !p.split("/").some((x) => !x || x === "." || x === ".." || x.startsWith(".")) ? p : null;
}

/** A conversation's or turn's id: a ULID. */
const TURN_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** An agent as its changes are signed (`agent:<id>`), and where its sessions are kept (M25). */
const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const AGENTS_DIR = `${CONVERSATIONS_DIR}/agents`;
/** A session's file: its id as it is where that is safe as a file's name, else in base64url after a "~". */
const agentRecordPath = (agent: string, session: string): string =>
  `${AGENTS_DIR}/${agent}/${/^[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$/.test(session) ? session : "~" + btoa(String.fromCharCode(...new TextEncoder().encode(session))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.json`;
/** The notes a session drew on: given, read or changed, and questions made of what it asked. */
export function notesOfTurns(turns: readonly TerminalTurn[]): number {
  const notes = new Set<string>();
  for (const t of turns) {
    for (const g of t.given ?? []) if (g.kind !== "folder") notes.add(g.id);
    for (const i of t.items) if (i.kind === "tool" && i.note && !i.base) notes.add(i.note); else if (i.kind === "question" && i.made) notes.add(i.made);
  }
  return notes.size;
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function walk(files: Files, root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  const at = (path: string): string => (root && path ? `${root}/${path}` : root || path);
  const visit = async (dir: string): Promise<void> => {
    for (const info of await files.list(at(dir))) {
      if (info.name.startsWith(".")) continue; // .git, and anything else hidden
      const path = dir ? `${dir}/${info.name}` : info.name;
      if (info.dir) {
        out.push({ path, dir: true });
        await visit(path);
      } else if (info.name.endsWith(".md")) {
        const text = await files.read(at(path));
        if (text !== null) out.push({ path, text });
      } else out.push({ path });
    }
  };
  await visit("");
  return out;
}

/** `next` with the `resolved` or `solved` field of `before` put back, where `before` is a question or a problem. */
function keepDone(before: string, next: string): string {
  try {
    const [was] = splitFrontmatter(before), [now] = splitFrontmatter(next);
    const kind = kindOf(String(was?.type ?? ""));
    if (!was || !now || kind === "note") return next;
    const field = DONE[kind];
    return JSON.stringify(was[field] ?? null) === JSON.stringify(now[field] ?? null) ? next : spliceText(next, { [field]: was[field] ?? null }, null);
  } catch { return next; }
}

/** The most of a note sent to an agent at once, as a passage. */
const MAX_SENT = 8000;

/** The tools that make artifacts (M23). */
const ARTIFACT_TOOLS = new Set([READ_DATA, ARTIFACT_RECIPE, READ_ARTIFACT, WRITE_ARTIFACT].map((t) => t.function.name));

/** The brief of the base, an agent's first look. */
const BRIEF: ToolDef = { type: "function", function: { name: "brief_base", description: "What this knowledge base holds: its folders, how many notes each, and how to look things up in it. Call it first, once.", parameters: { type: "object", properties: {}, additionalProperties: false } } };

const NOTE_ARG = { type: "string", description: "The note's id or path in the knowledge base: physics/softening or /physics/softening.md." };
const MARKED = "The change is written at once, under your name: the person sees your words marked in the note, and can undo it from the browser. Use this, never edit or write, for any note of the knowledge base.";
const REFUSED_NOTES = "The person has switched off agents' changes to these notes. Don't try another way: offer the words with offer_text, or say what you would change.";
const EDIT_NOTE: ToolDef = { type: "function", function: { name: "edit_note", description: `Change a note of the knowledge base: oldString replaced by newString, as the edit tool does. ${MARKED}`, parameters: { type: "object", properties: { note: NOTE_ARG, oldString: { type: "string", description: "The text to replace, exactly as it is in the note." }, newString: { type: "string" }, replaceAll: { type: "boolean", description: "Replace every place oldString is." } }, required: ["note", "oldString", "newString"], additionalProperties: false } } };
const WRITE_NOTE: ToolDef = { type: "function", function: { name: "write_note", description: `Write a whole note: a new note of the knowledge base, at folder/name (lower case, hyphens), with its frontmatter (type, title), or one written anew. ${MARKED}`, parameters: { type: "object", properties: { note: NOTE_ARG, content: { type: "string", description: "The whole note, frontmatter included." } }, required: ["note", "content"], additionalProperties: false } } };

export class Engine implements Api {
  private readonly opts: EngineOptions;
  private files = new Map<string, FileEntry>();
  private built: Bundle | null = null;
  private index: SearchIndex | null = null;
  private readonly listeners = new Set<(event: EngineEvent) => void>();
  /** The newest entry made anywhere among isorite's files: it decides the session. Undefined until looked for. */
  private last: Pick<Stamp, "at" | "session"> | null | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  /** Terminal agents' turns that are going on, by agent and session: each looks up through a Lookup of its own. */
  private readonly turns = new Map<string, { request: string; lookup: Lookup }>();
  private turnCount = 0;

  /** Search by meaning, when the device has the model. */
  readonly meaning: Meaning | null;

  private constructor(opts: EngineOptions) {
    this.opts = opts;
    this.meaning = opts.embedder && opts.cache ? new Meaning(opts.embedder, opts.cache.files, opts.cache.name) : null;
  }

  /** The search by meaning Iso is offered as a tool, over the base as it is now. */
  private get similar(): Similar | null {
    const meaning = this.meaning;
    if (!meaning) return this.opts.similar ?? null;
    return (text, o) => meaning.similar(this.bundle, text, o);
  }

  /** Make the vectors the base lacks, in the background: after opening, and after every write. */
  private embedSoon(): void {
    void this.meaning?.refresh(this.bundle).catch(() => undefined);
  }

  static async open(opts: EngineOptions): Promise<Engine> {
    const engine = new Engine(opts);
    await engine.reload();
    engine.embedSoon();
    return engine;
  }

  /** Read the knowledge base again from its files. */
  async reload(): Promise<void> {
    this.files = new Map((await walk(this.opts.notes, "")).map((f) => [f.path, f]));
    this.built = this.index = null;
  }

  /** The knowledge base as the core reads it. */
  get bundle(): Bundle {
    return (this.built ??= Bundle.fromFiles(this.files.values()));
  }

  // ------------------------------------------------------------ reading

  async session(): Promise<Session> {
    return { name: this.opts.name, device: this.opts.device };
  }

  async notes(): Promise<Listing> {
    const broken = await this.brokenCode(), conflicted = this.conflicted();
    const notes = [...this.bundle.concepts.values()].map((c) => ({ id: c.id, title: c.title, description: c.description, type: c.type, dir: c.directory, ...(c.kind === "note" ? {} : { kind: c.kind, attached: c.attached }), ...(c.done ? { done: c.done } : {}), ...(broken.has(c.id) ? { broken: broken.get(c.id) } : {}), ...(conflicted.has(c.id) ? { conflicted: true as const } : {}) }));
    notes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { notes, dirs: [...this.bundle.directories.keys()].filter(Boolean).sort() };
  }

  /** The notes git left in conflict (a merge it could not finish): found as the notes are read. */
  private conflicted(): Set<string> {
    return new Set(this.bundle.issues.filter((i) => i.code === "merge-conflict").map((i) => i.path.replace(/\.md$/, "")));
  }

  /** A note's file. What it holds that the journal has not seen (an edit made elsewhere, or a note older than
   *  its journal) is entered now, so the journal is true from the moment the note is opened. */
  readNote(id: string): Promise<NoteSource> {
    return this.one(async () => {
      const { files, path } = this.where(id);
      const text = await files.read(path);
      if (text === null) throw new EngineError(`no such note: ${id}`, 404);
      const entries = await this.journal(id);
      await this.enter(id, entries, reconcile(entries, text, await this.stamp("external")));
      return { id, text, version: hashText(text) };
    });
  }

  /** The base as the Atlas draws it: the model the layout takes, and what each block says. */
  async map(): Promise<MapReport> {
    const notes: MapReport["notes"] = {}, broken = await this.brokenCode(), conflicted = this.conflicted();
    for (const c of this.bundle.concepts.values()) {
      const bad = broken.get(c.id) ?? [];
      const links = c.outward.filter((o) => !(o.kind === "code" && o.picture)).map((o) => ({ kind: o.kind, href: o.href, text: o.text, ...(bad.includes(o.href) ? { broken: true as const } : {}) }));
      // The pictures it shows (M22): its own, then the repository's, each once.
      const pictures: NonNullable<MapReport["notes"][string]["pictures"]> = [], shown = new Set<string>();
      for (const p of c.cites) {
        if (p.kind !== "image" || !p.embed || shown.has(p.target)) continue;
        shown.add(p.target);
        pictures.push({ href: p.target, path: p.target, from: "notes", text: p.alt || p.target.split("/").at(-1)!, ...(p.broken ? { broken: true as const } : {}) });
      }
      for (const o of c.outward) {
        if (o.kind !== "code" || !o.picture) continue;
        pictures.push({ href: o.href, path: o.path, from: "code", text: o.text, ...(bad.includes(o.href) ? { broken: true as const } : {}) });
      }
      notes[c.id] = { title: c.title, tokens: estimate(c.body.trim()), ...(conflicted.has(c.id) ? { conflicted: true as const } : {}), ...(c.kind !== "note" ? { kind: c.kind } : {}), ...(c.done ? { done: c.done } : {}), ...(links.length ? { links } : {}), ...(pictures.length ? { pictures } : {}) };
    }
    // Files (M23): each by its title or name, and an artifact joined to the data it says it uses.
    const model = mapModel(this.bundle), files: NonNullable<MapReport["files"]> = {};
    const items: string[] = [];
    const walk = (d: MapModel["root"]): void => { for (const c of d.children) if (c.kind === "dir") walk(c); else if (c.id.startsWith("f:")) items.push(c.ref); };
    walk(model.root);
    const all = new Set(items);
    for (const ref of items) {
      if (ref.endsWith("/")) { const count = [...this.bundle.files].filter((f) => f.startsWith(ref) && !f.slice(ref.length).includes("/")).length; files[ref] = { title: `${ref.slice(0, -1).split("/").at(-1)} · ${count} ${count === 1 ? "picture" : "pictures"}`, kind: "image", count }; continue; }
      const kind = citeKind(ref)!, name = ref.split("/").at(-1)!;
      if (kind !== "artifact") { files[ref] = { title: name, kind }; continue; }
      const html = await this.opts.notes.read(ref).catch(() => null), m = html ? manifestOf(html) : null;
      files[ref] = { title: m?.title || name, kind };
      const dir = ref.split("/").slice(0, -1);
      for (const u of m?.uses ?? []) {
        const parts = [...dir];
        for (const p of u.split("/")) { if (p === "..") parts.pop(); else if (p && p !== ".") parts.push(p); }
        const to = parts.join("/");
        if (all.has(to) && !model.edges.some(([a, b]) => a === ref && b === to)) model.edges.push([ref, to, STRENGTH.uses]);
      }
    }
    return { model, notes, ...(items.length ? { files } : {}) };
  }

  // ------------------------------------------------------------ code links (M12)

  /** The base's settings, from `.isorite/settings.toml`. */
  async settingsOfBase(): Promise<BaseSettings> { return parseSettings(await this.opts.own.read(SETTINGS_FILE)); }

  /** Where code links point: the repository named in the settings, else the one the notes are in. */
  private async repositoryOfBase(): Promise<string | undefined> {
    return (await this.settingsOfBase()).repository ?? this.opts.foundRepository;
  }

  /** Name the repository code links point into, unless the base has one: for notes kept outside the project, the one
   *  an agent is first attached in. `path` is relative to the notes folder, or absolute. */
  async nameRepository(path: string): Promise<boolean> {
    if (!path || (await this.repositoryOfBase())) return false;
    await this.one(async () => this.opts.own.write(SETTINGS_FILE, settingsText({ ...(await this.settingsOfBase()), repository: path })));
    this.codeCheck = null;
    return true;
  }

  /** Whether agents may change this base's notes: yes, unless switched off. Held here, not in a browser, so that it
   *  holds for an agent in its own terminal with no page open. */
  async agentNotes(): Promise<{ may: boolean }> {
    return { may: (await this.settingsOfBase()).agents_write_notes !== false };
  }
  async setAgentNotes(may: boolean): Promise<void> {
    await this.one(async () => {
      const { agents_write_notes: _, ...rest } = await this.settingsOfBase();
      await this.opts.own.write(SETTINGS_FILE, settingsText(may ? rest : { ...rest, agents_write_notes: false }));
    });
  }
  /** What is hidden: one id a line in `.isorite/hidden.txt`, so that two people hiding different things merge in git (the
   *  lines are put together); the list in the settings, where it was first kept, is read too. */
  async hidden(): Promise<{ ids: string[] }> {
    const tidy = (x: string): string => x.trim().replace(/^\/+|\/+$/g, "");
    const lines = ((await this.opts.own.read(HIDDEN_FILE)) ?? "").split("\n").map(tidy).filter((l) => l && !/^(<<<<<<<|=======|>>>>>>>)/.test(l));
    return { ids: [...new Set([...lines, ...((await this.settingsOfBase()).hidden ?? []).map(tidy)])].filter(Boolean).sort() };
  }
  async setHidden(ids: string[]): Promise<void> {
    const clean = [...new Set(ids.map((x) => x.trim().replace(/^\/+|\/+$/g, "")).filter(Boolean))].sort();
    await this.one(async () => {
      const own = this.opts.own, had = await own.read(HIDDEN_FILE) !== null;
      if (clean.length || had) await own.write(HIDDEN_FILE, clean.length ? `${clean.join("\n")}\n` : "");
      // Moved out of the settings, where it was first kept.
      const { hidden, ...rest } = await this.settingsOfBase();
      if (hidden !== undefined) await own.write(SETTINGS_FILE, settingsText(rest));
      // A base made before this one does not merge the file by lines yet.
      if (clean.length) {
        const attrs = (await own.read(".gitattributes")) ?? "";
        if (!attrs.split("\n").some((l) => l.trim().startsWith(`${HIDDEN_FILE} `))) await own.write(".gitattributes", `${attrs}${attrs && !attrs.endsWith("\n") ? "\n" : ""}${GITATTRIBUTES.split("\n").find((l) => l.startsWith(HIDDEN_FILE))}\n`);
      }
    });
    this.publish({ type: "hidden" });
  }
  private async agentMayWrite(): Promise<void> {
    if (!(await this.agentNotes()).may) throw new EngineError(REFUSED_NOTES, 403);
  }

  /** What was last found of the code links, and when: looked at again when the notes change, or after a while,
   *  since the repository changes outside isorite. */
  private codeCheck: { at: number; of: Bundle; broken: Map<string, string[]> } | null = null;
  /** The code links whose file is not in the repository, by note. With no repository named, none are. */
  private async brokenCode(): Promise<Map<string, string[]>> {
    const now = this.opts.clock.now(), b = this.bundle;
    if (this.codeCheck && this.codeCheck.of === b && now - this.codeCheck.at < 10_000) return this.codeCheck.broken;
    const broken = new Map<string, string[]>(), where = await this.repositoryOfBase();
    const repo = where ? this.opts.repository?.(where) ?? null : null;
    if (repo) {
      const listed = new Map<string, Promise<Set<string>>>();
      const names = (dir: string) => { let l = listed.get(dir); if (!l) listed.set(dir, (l = repo.list(dir).then((fs) => new Set(fs.filter((f) => !f.dir).map((f) => f.name)), () => new Set<string>()))); return l; };
      for (const c of b.concepts.values()) for (const o of c.outward) {
        if (o.kind !== "code") continue;
        const k = o.path.lastIndexOf("/"), dir = k < 0 ? "" : o.path.slice(0, k);
        let gone = !(await names(dir)).has(o.path.slice(k + 1));
        // A symbol that is no longer in its file is as broken as a file that is gone (M29).
        if (!gone && o.symbol) gone = (await this.code(o.href)).state === "no-symbol";
        if (gone) broken.set(c.id, [...(broken.get(c.id) ?? []), o.href]);
      }
    }
    this.codeCheck = { at: now, of: b, broken };
    return broken;
  }

  /** Code links broken since an agent was last told: each is told once (Q27). */
  private toldBroken = new Set<string>();
  async brokenNews(): Promise<{ id: string; title: string; href: string }[]> {
    const told = this.toldBroken, out: { id: string; title: string; href: string }[] = [], now = new Set<string>();
    for (const [id, hrefs] of await this.brokenCode()) for (const href of hrefs) {
      const key = `${id} ${href}`;
      now.add(key);
      if (!told.has(key)) out.push({ id, title: this.bundle.concepts.get(id)?.title ?? id, href });
    }
    // One mended and broken again is told again.
    this.toldBroken = now;
    return out;
  }

  async journal(id: string): Promise<Entry[]> {
    checkNoteId(id);
    return readJournal((await this.opts.own.read(journalPath(id))) ?? "");
  }

  async search(query: string): Promise<SearchHit[]> {
    this.index ??= new SearchIndex(this.bundle);
    return this.index.search(query, { limit: 30 }).map((h) => ({ id: h.concept.id, title: h.concept.title, snippet: h.snippet }));
  }

  async find(query: string): Promise<FindResult> {
    const q = query.trim();
    if (!q) return { hits: [], meaning: this.similar ? "on" : "off" };
    const words = await this.search(q);
    const out = new Map<string, FindHit>(words.map((h) => [h.id, { ...h, by: "words" as const }]));
    let state: FindResult["meaning"] = "off";
    const similar = this.similar;
    if (similar && q.length >= 3) {
      try {
        const m = await similar(q, { limit: 8 });
        state = m.ready ? "on" : "pending";
        const top = m.hits[0]?.score ?? 0;
        for (const h of m.hits) {
          if (h.score < 0.25 || h.score < top - 0.12) continue;
          const kept = out.get(h.note);
          if (kept) kept.by = "both";
          else out.set(h.note, { id: h.note, title: this.bundle.concepts.get(h.note)?.title ?? h.note, snippet: h.heading, by: "meaning" });
        }
      } catch { state = "pending"; }
    }
    const rank = { both: 0, words: 1, meaning: 2 };
    return { hits: [...out.values()].sort((a, b) => rank[a.by] - rank[b.by]), meaning: state };
  }

  // ------------------------------------------------------------ terminal agents

  async agentTools(): Promise<ToolDef[]> {
    const tools = [BRIEF, TOOLS[0]!, ...(this.similar ? [FIND_SIMILAR] : []), ...TOOLS.slice(1), EDIT_NOTE, WRITE_NOTE, ASK_QUESTION, OFFER_TEXT, READ_DATA, ARTIFACT_RECIPE, WRITE_ARTIFACT, READ_ARTIFACT];
    // While a server holds other bases, every tool takes one (M20); which are lent is asked at each call.
    return this.opts.elsewhere ? withBase(tools, this.lent().map((l) => l.name), true) : tools;
  }

  /** The bases lent to this one's sessions, not this one. */
  private lent(): { name: string; about: string }[] {
    return (this.opts.elsewhere?.lent() ?? []).filter((l) => l.name !== this.opts.name);
  }

  /** Another base lent here, by name, or why there is none of that name. */
  private other(base: string): Engine {
    const lent = this.lent();
    const engine = lent.some((l) => l.name === base) ? this.opts.elsewhere?.base(base) : null;
    if (!engine) throw new EngineError(lent.length ? `there is no base ${base} lent here: the bases are ${lent.map((l) => l.name).join(", ")}; leave base out for ${this.opts.name}` : `there is no base ${base} lent here: leave base out`, 404);
    return engine;
  }

  /** What this base is, in a line: its AGENTS.md's first line of text, else its name and size. */
  async about(): Promise<string> {
    const first = ((await this.agents()).text ?? "").split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find((l) => l && !l.startsWith("---"));
    return first ?? `${this.bundle.concepts.size} notes`;
  }

  async agentLook({ agent, session, tool, args, asked = "" }: AgentLook): Promise<{ text: string }> {
    const there = baseOf(args);
    if (there.base && there.base !== this.opts.name) {
      const done = await this.other(there.base).agentLook({ agent, session, tool, args: there.args, asked });
      return { text: fromBase(there.base, done.text) };
    }
    args = there.args;
    if (tool === BRIEF.function.name) {
      const lent = this.lent();
      const agents = (await this.agentsFile())?.trim();
      return { text: this.brief() + (!(await this.agentNotes()).may ? `\n\n${REFUSED_NOTES}` : "") + (agents ? `\n\n# Their instructions for this knowledge base (AGENTS.md)\n\n${agents}` : "") + (lent.length ? `\n\nOther knowledge bases lent to you, each with its own practice (brief_base with its base, before you use it):\n${lent.map((l) => `- ${l.name}: ${l.about}`).join("\n")}\nPass base to any tool to look or write there.` : "") };
    }
    if (tool === EDIT_NOTE.function.name || tool === WRITE_NOTE.function.name) {
      const str = (v: unknown, name: string) => { if (typeof v !== "string") throw new EngineError(`${tool} needs ${name}, as text`, 400); return v; };
      const edit = tool === WRITE_NOTE.function.name ? { content: str(args.content, "content") }
        : { oldString: str(args.oldString, "oldString"), newString: str(args.newString, "newString"), replaceAll: args.replaceAll === true };
      return this.agentWrite({ agent, session, note: str(args.note, "note"), asked, edit });
    }
    if (tool === ASK_QUESTION.function.name || tool === OFFER_TEXT.function.name) return { text: this.agentOffer(agent, session, tool, args) };
    if (ARTIFACT_TOOLS.has(tool)) return { text: await this.artifactTool(tool, args, `agent:${agent}`, asked) };
    const turn = this.turns.get(`${agent}/${session}`) ?? this.startTurn(agent, session);
    const { text, step } = await turn.lookup.call(tool, JSON.stringify(args));
    this.publish({ type: "agent-step", request: turn.request, agent, session, step });
    return { text };
  }

  async agentStatus(agent: string, session: string, busy: boolean): Promise<void> {
    const key = `${agent}/${session}`, turn = this.turns.get(key);
    if (busy && !turn) this.startTurn(agent, session);
    if (!busy && turn) { this.turns.delete(key); this.publish({ type: "agent-done", request: turn.request, agent, session }); }
    // Its looks in other bases were turns there: they end with this one.
    if (!busy) for (const l of this.lent()) await this.opts.elsewhere?.base(l.name)?.agentStatus(agent, session, false);
  }

  async agentWrite({ agent, session, note, asked, edit }: AgentChange): Promise<{ text: string }> {
    // As Iso's Write mode writes (M10): at once, entered in the note's journal under the agent's name, its words
    // marked in the note's Iso lens, and undone from the browser (agreed for M11, Q20).
    await this.agentMayWrite();
    const who = `agent:${agent}`;
    void session;
    const raw = note.replace(/^\/+/, "").replace(/\.md$/i, "");
    // The file itself says whether the note is there: one just written may not be in the index yet.
    const existing = noteId(this.bundle, raw) ?? (await this.onDisk(raw));
    if (!existing) {
      if (!("content" in edit)) throw new EngineError(`there is no note ${raw}: to make one, write the whole of it`, 404);
      const id = this.newNoteId(raw);
      if (!id) throw new EngineError(`${raw} is not a note's id in this base: give folder/name, lower case with hyphens`, 400);
      let text = edit.content;
      if (!/^---\n/.test(text)) text = `---\ntype: Concept\ntitle: ${JSON.stringify(/^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? id.split("/").at(-1)!.replace(/-/g, " "))}\n---\n\n${text.replace(/^#\s+.+\n+/, "")}`;
      await this.one(() => this.put(id, text, null, "edit", { asked }, who));
      return { text: `Made ${this.titleOf(id, text)} (/${id}.md). The person sees it as yours, and can undo it.` };
    }
    const id = existing, now = await this.readNote(id);
    let text: string;
    if ("content" in edit) text = edit.content;
    else {
      const at = now.text.indexOf(edit.oldString);
      if (!edit.oldString || at < 0) throw new EngineError(`that passage is not in ${this.titleOf(id, now.text)} as you wrote it: read the note again and give the passage exactly`, 409);
      if (edit.replaceAll) text = now.text.split(edit.oldString).join(edit.newString);
      else {
        if (now.text.indexOf(edit.oldString, at + 1) >= 0) throw new EngineError(`that passage occurs more than once in ${this.titleOf(id, now.text)}: give more of it, or replaceAll`, 409);
        text = now.text.slice(0, at) + edit.newString + now.text.slice(at + edit.oldString.length);
      }
    }
    const saved = await this.one(() => this.put(id, text, now.version, "edit", { asked }, who));
    return { text: saved.changed ? `Changed ${this.titleOf(id, text)}. The person sees your words marked, and can undo it.` : `That leaves ${this.titleOf(id, now.text)} as it is.` };
  }

  /** A note's id when its file is there, though the index may not have it yet; else null. */
  private async onDisk(raw: string): Promise<string | null> {
    let id: string;
    try { id = checkNoteId(raw); } catch { return null; }
    const { files, path } = this.where(id);
    return (await files.read(path)) === null ? null : id;
  }

  async agentSend({ note, passage, said }: { note: string; passage?: string; said: string }): Promise<{ id: string }> {
    const id = checkNoteId(note), concept = this.bundle.concepts.get(id);
    if (!concept) throw new EngineError(`no such note: ${id}`, 404);
    if (passage !== undefined && passage.length > MAX_SENT) throw new EngineError("that passage is too long to send at once", 413);
    const sent = newId(this.opts.clock.now()), title = concept.title, words = said.trim();
    const text = [
      `The person sent you, from the browser, ${passage?.trim() ? `this passage of their note "${title}" (/${id}.md):\n\n${passage.trim()}` : `their note "${title}" (/${id}.md). Read it with read_note if you need it.`}`,
      words ? `They said: ${words}` : "",
    ].filter(Boolean).join("\n\n");
    this.publish({ type: "agent-sent", id: sent, note: id, title, ...(passage?.trim() ? { passage: passage.trim() } : {}), said: words, text });
    return { id: sent };
  }

  async agentReceived(id: string, agent: string): Promise<void> {
    this.publish({ type: "agent-received", id, agent });
  }

  /** What agents asked back or offered (M25), by id, until kept. In memory: a question not kept is a passing one. */
  private offered = new Map<string, { agent: string; item: Extract<TurnItem, { kind: "question" | "offer" }> }>();

  /** An agent's ask_question or offer_text, checked as Iso's are, put to the person to keep or not. */
  private agentOffer(agent: string, session: string, tool: string, args: Record<string, unknown>): string {
    const id = newId(this.opts.clock.now());
    let item: Extract<TurnItem, { kind: "question" | "offer" }>;
    if (tool === ASK_QUESTION.function.name) {
      const title = String(args.title ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
      if (!title) return "Give the question, in title.";
      const about = [...new Set((Array.isArray(args.about) ? args.about : [args.about]).map((a) => noteId(this.bundle, a)).filter((a): a is string => Boolean(a)))];
      if (!about.length) return "Give the ids of the notes it is about, in about.";
      item = { kind: "question", id, title, text: String(args.text ?? "").trim().slice(0, 4000), about };
    } else {
      const agents = /^\/?AGENTS(\.md)?$/i.test(String(args.id ?? "").trim());
      const note = agents ? AGENTS_FILE : noteId(this.bundle, args.id);
      if (!note) return `There is no note ${String(args.id ?? "")}.`;
      const text = String(args.text ?? "").trim().slice(0, 8000);
      if (!text) return "Give the passage, in text.";
      item = { kind: "offer", id, note, text };
    }
    this.offered.set(id, { agent, item });
    this.publish({ type: "agent-item", agent, session, item });
    return item.kind === "question" ? "It is put to them. They can make it a question note." : `It is offered to them for ${item.note === AGENTS_FILE ? "their AGENTS.md" : this.titleOf(item.note, "")}.`;
  }

  async agentTake(id: string): Promise<{ note: string }> {
    const o = this.offered.get(id);
    if (!o) throw new EngineError("there is no such question or offer, or it was kept already", 404);
    const i = o.item;
    let note: string;
    if (i.kind === "question") note = (await this.one(() => this.makeQuestion(i, "you"))).id;
    else if (i.note === AGENTS_FILE) {
      const now = (await this.agentsFile()) ?? "";
      await this.one(() => this.opts.notes.write(AGENTS_FILE, `${now.replace(/\s*$/, "")}${now.trim() ? "\n\n" : ""}${i.text}\n`));
      note = AGENTS_FILE;
    } else {
      if (!this.bundle.concepts.has(i.note)) throw new EngineError("the note it was for is gone", 409);
      const now = await this.readNote(i.note);
      await this.one(() => this.put(i.note, `${now.text.replace(/\s*$/, "")}\n\n${i.text}\n`, now.version));
      note = i.note;
    }
    this.offered.delete(id);
    this.publish({ type: "agent-taken", id, note });
    return { note };
  }

  async agentChanged({ agent, note, asked }: { agent: string; note: string; asked: string }): Promise<void> {
    const id = noteId(this.bundle, note) ?? (await this.onDisk(note.replace(/^\/+/, "").replace(/\.md$/i, "")));
    if (!id) return;
    const who = `agent:${agent}`;
    await this.one(async () => {
      const { files, path } = this.where(id);
      const now = await files.read(path);
      if (now === null) return;
      const entries = await this.journal(id);
      const entry = change(entries, now, await this.stamp(who), "edit", asked ? { asked } : {});
      if (!entry) return;
      await this.enter(id, entries, entry);
      this.files.set(path, { path, text: now });
      this.built = this.index = null;
      this.embedSoon();
      this.publish({ type: "note-changed", id, version: hashText(now), who });
    });
  }

  // ------------------------------------------------------------ agents' sessions, as isorite carried them (M25)

  async keepAgentRecord(record: AgentRecord): Promise<void> {
    if (!AGENT_ID.test(record.agent) || !record.session || record.session.length > 200) throw new EngineError("an agent's session is named by the agent and its session's id");
    await this.opts.own.write(agentRecordPath(record.agent, record.session), JSON.stringify(record) + "\n");
  }

  async agentRecord(agent: string, session: string): Promise<AgentRecord | null> {
    if (!AGENT_ID.test(agent) || !session || session.length > 200) return null;
    const text = await this.opts.own.read(agentRecordPath(agent, session));
    try { return text ? (JSON.parse(text) as AgentRecord) : null; } catch { return null; }
  }

  async deleteAgentRecord(agent: string, session: string): Promise<void> {
    if (!AGENT_ID.test(agent) || !session || session.length > 200) throw new EngineError("an agent's session is named by the agent and its session's id");
    await this.opts.own.remove(agentRecordPath(agent, session));
  }

  async agentRecords(): Promise<AgentSession[]> {
    const own = this.opts.own, all: AgentSession[] = [];
    for (const a of await own.list(AGENTS_DIR).catch(() => [])) {
      if (!a.dir || !AGENT_ID.test(a.name)) continue;
      for (const f of await own.list(`${AGENTS_DIR}/${a.name}`).catch(() => [])) {
        if (f.dir || !f.name.endsWith(".json")) continue;
        let r: AgentRecord;
        try { r = JSON.parse((await own.read(`${AGENTS_DIR}/${a.name}/${f.name}`)) ?? "") as AgentRecord; } catch { continue; }
        if (!r?.turns?.length || r.agent !== a.name) continue;
        all.push({ agent: r.agent, name: r.name, session: r.session, title: r.title, asked: r.turns[0]!.asked, last: r.last, turns: r.turns.length, notes: notesOfTurns(r.turns), live: false, busy: false, kept: true, open: false });
      }
    }
    return all.sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  }

  /** A turn is looked up in the base as it is when the turn begins, as Iso's requests are. */
  private startTurn(agent: string, session: string): { request: string; lookup: Lookup } {
    const turn = { request: `agent:${agent}:${++this.turnCount}`, lookup: new Lookup(this.bundle, "", this.similar) };
    this.turns.set(`${agent}/${session}`, turn);
    this.publish({ type: "agent-start", request: turn.request, agent, session });
    return turn;
  }

  /** The base in brief, for an agent that has not seen it: its folders, how many notes each, and how to look. */
  private brief(): string {
    const b = this.bundle, counts = new Map<string, number>();
    for (const c of b.concepts.values()) counts.set(c.directory, (counts.get(c.directory) ?? 0) + 1);
    const dirs = [...b.directories.keys()].sort();
    const lines = dirs.slice(0, 60).map((d) => `${"  ".repeat(d ? d.split("/").length - 1 : 0)}- ${d ? d.split("/").at(-1) : "(the top)"} (${counts.get(d) ?? 0})`);
    return [
      `# ${this.opts.name}: a knowledge base of ${b.concepts.size} notes in ${dirs.filter(Boolean).length} folders`,
      `Folders, with the notes directly in each:\n${lines.join("\n")}${dirs.length > 60 ? `\n(and ${dirs.length - 60} more)` : ""}`,
      `To look: search_notes by the words a note would use${this.similar ? ", find_similar by meaning when the words are unknown" : ""}; outline_note to see a note's headings and links; read_note for one section. Follow a note's links to what it rests on before searching again. Cite a note by its title and section.`,
      // How the base is kept, so what the agent writes in it matches (M15), and how an artifact is made (M23).
      `${ISORITE}\n\n${PRACTICE}\n\n${WRITING}\n\n${ARTIFACTS}`,
    ].join("\n\n");
  }

  events(listener: (event: EngineEvent) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  // ------------------------------------------------------------ writing

  saveNote(id: string, edit: { base: string; text: string }): Promise<Saved> {
    return this.one(() => this.put(id, edit.text, edit.base));
  }

  createNote(id: string, text: string): Promise<Saved> {
    return this.one(() => this.put(id, text, null));
  }

  async makeFolder(path: string): Promise<void> {
    path = path.trim().replace(/^\/+|\/+$/g, "");
    if (!inBase(path)) throw new EngineError("only a folder of the base is made here");
    checkNoteId(path);
    if (!this.opts.notes.mkdir) throw new EngineError("an empty folder can't be made here");
    if (this.files.has(`${path}.md`)) throw new EngineError(`there is a note at ${path} already`, 409);
    await this.one(async () => {
      await this.opts.notes.mkdir!(path);
      const parts = path.split("/");
      for (let i = 1; i <= parts.length; i++) { const p = parts.slice(0, i).join("/"); if (!this.files.has(p)) this.files.set(p, { path: p, dir: true }); }
      this.built = this.index = null;
    });
  }

  async deleteFolder(path: string): Promise<void> {
    path = path.trim().replace(/^\/+|\/+$/g, "");
    if (!path || !inBase(path)) throw new EngineError("only a folder of the base is deleted here");
    checkNoteId(path);
    await this.dropFolder(path, true);
  }

  /** Take away an empty folder, and the empty ones inside it. A folder made by putting a note in it is not among the
   *  listing's entries, so `strict` (a folder asked for by name) is what says it was not there. */
  private async dropFolder(path: string, strict: boolean): Promise<void> {
    if (!this.opts.notes.rmdir) throw new EngineError("a folder can't be deleted here");
    await this.one(async () => {
      const inside = [...this.files.values()].filter((f) => f.path.startsWith(`${path}/`));
      const held = inside.filter((f) => !("dir" in f && f.dir)).length;
      if (strict && !this.files.has(path) && !inside.length) throw new EngineError(`there is no folder ${path}`, 404);
      if (held) throw new EngineError(`${path} still holds ${held} ${held === 1 ? "file" : "files"}; move or delete them first`, 409);
      for (const d of [...inside.map((f) => f.path), path].sort((a, b) => b.length - a.length)) {
        await this.opts.notes.rmdir!(d);
        this.files.delete(d);
      }
      this.built = this.index = null;
    });
  }

  async moveFolder(from: string, to: string): Promise<void> {
    const clean = (p: string) => p.trim().replace(/^\/+|\/+$/g, "");
    from = clean(from); to = clean(to);
    if (!from || !to || !inBase(from) || !inBase(to)) throw new EngineError("only a folder of the base is moved, and only within it");
    checkNoteId(from); checkNoteId(to);
    if (to === from) throw new EngineError("the folder is there already");
    if (to.startsWith(`${from}/`)) throw new EngineError("a folder can't be moved into itself");
    const inside = [...this.files.values()].filter((f) => f.path.startsWith(`${from}/`));
    const dirs = inside.filter((f) => "dir" in f && f.dir).map((f) => f.path);
    const notes = inside.filter((f) => !("dir" in f && f.dir) && f.path.endsWith(".md")).map((f) => f.path.slice(0, -3));
    const others = inside.filter((f) => !("dir" in f && f.dir) && !f.path.endsWith(".md")).map((f) => f.path);
    if (!this.files.has(from) && !inside.length) throw new EngineError(`there is no folder ${from}`, 404);
    const at = (p: string) => `${to}${p.slice(from.length)}`;
    if (this.files.has(`${to}.md`)) throw new EngineError(`there is a note at ${to} already`, 409);
    for (const id of notes) if (this.files.has(`${at(id)}.md`)) throw new EngineError(`there is already a note at ${at(id)}`, 409);
    for (const f of others) if (this.files.has(at(f)) || await this.opts.notes.readBytes(at(f)) !== null) throw new EngineError(`there is already a file at ${at(f)}`, 409);
    for (const d of [from, ...dirs].sort()) await this.makeFolder(at(d));
    for (const id of notes) await this.moveNote(id, at(id), (await this.readNote(id)).version);
    // The files that are not notes (pictures, artifacts, data) go with it, and the links to them are written anew.
    if (others.length) {
      await this.one(async () => {
        for (const f of others) {
          const bytes = await this.opts.notes.readBytes(f);
          if (!bytes) throw new EngineError(`${f} could not be read to move it`, 409);
          await this.opts.notes.writeBytes(at(f), bytes);
          await this.opts.notes.remove(f);
          this.files.delete(f);
          this.files.set(at(f), { path: at(f) });
        }
        this.pictureCache.clear();
        this.built = this.index = null;
      });
      for (const c of [...this.bundle.concepts.values()]) {
        const source = await this.readNote(c.id);
        let changed = source.text;
        for (const f of others) changed = changed.replace(new RegExp(`(\\]\\(|\\[\\[!)/${escapeRe(f)}(?=[#\\s)\\]])`, "g"), `$1/${at(f)}`);
        if (changed !== source.text) await this.one(() => this.put(c.id, changed, source.version, "edit", {}, "you"));
      }
    }
    await this.dropFolder(from, false);
  }

  /** `who` is you unless Iso moves it, in Write mode. */
  async moveNote(id: string, to: string, base: string, who = "you"): Promise<Saved> {
    to = to.trim().replace(/^\/+|\/+$/g, "").replace(/\.md$/, "");
    if (!inBase(id) || !inBase(to)) throw new EngineError("only a note of the base is moved, and only within it");
    checkNoteId(to);
    if (to === id) throw new EngineError("the note is there already");
    const notes = this.opts.notes, own = this.opts.own, from = `${checkNoteId(id)}.md`, path = `${to}.md`;
    // Who links to it, read before it moves: they are changed after.
    const linking = this.bundle.backlinks(id).filter((c) => c !== id);
    const text = await this.one(async () => {
      const now = await notes.read(from);
      if (now === null) throw new Conflict(`${id} is gone`, null);
      if (await notes.read(path) !== null) throw new EngineError(`there is already a note at ${to}`, 409);
      const entries = await this.journal(id);
      await this.enter(id, entries, reconcile(entries, now, await this.stamp("external")));
      if (base !== hashText(now)) throw new Conflict(`${id} was changed since you opened it`, { id, text: now, version: hashText(now) });
      await notes.write(path, now);
      await notes.remove(from);
      // The journal moves with the note, and says so.
      const journal = await own.read(journalPath(id));
      if (journal !== null) { await own.write(journalPath(to), journal); await own.remove(journalPath(id)); }
      const hash = hashText(now);
      await this.enter(to, entries, { ...(await this.stamp(who)), kind: "change", why: "move", before: hash, after: hash, hunks: [], from: id });
      this.files.delete(from);
      this.files.set(path, { path, text: now });
      this.built = this.index = null;
      this.embedSoon();
      this.publish({ type: "note-changed", id, version: null, who });
      this.publish({ type: "note-changed", id: to, version: hashText(now), who });
      return now;
    });
    // Links to it, in the form the base writes them (absolute, `/folder/note.md`), and its own links to itself.
    const old = new RegExp(`\\]\\(/${escapeRe(id)}\\.md(?=[#\\s)])`, "g");
    for (const c of linking) {
      const source = await this.readNote(c);
      const changed = source.text.replace(old, `](/${to}.md`);
      if (changed !== source.text) await this.one(() => this.put(c, changed, source.version, "edit", {}, who));
    }
    // What names it as a question's or problem's `about` or `uses`, and the embeds of it (M12).
    const was = this.bundle;
    for (const c of [...was.concepts.values()]) {
      if (c.id === to) continue;
      const field = c.kind === "note" ? null : ABOUT[c.kind], listed = field ? idsOf(c.meta[field]) : [];
      const embeds = embedRefs(c.body).some((ref) => ref.replace(/^\/+|\.md$/g, "") === id || ref === id.split("/").at(-1));
      if (!listed.includes(id) && !embeds) continue;
      const source = await this.readNote(c.id);
      let changed = field && listed.includes(id) ? spliceText(source.text, { [field]: listed.map((x) => (x === id ? to : x)) }, null) : source.text;
      changed = changed.replace(new RegExp(`^([ \\t]*)\\[\\[!(?:/?${escapeRe(id)}(?:\\.md)?|${escapeRe(id.split("/").at(-1)!)})\\]\\]([ \\t]*)$`, "gm"), (_m, a: string, b: string) => `${a}${embedFor(to, was.concepts.keys())}${b}`);
      if (changed !== source.text) await this.one(() => this.put(c.id, changed, source.version, "edit", {}, who));
    }
    return { id: to, text, version: hashText(text), changed: true };
  }

  async deleteNote(id: string, base: string, who = "you"): Promise<void> {
    if (!inBase(id)) throw new EngineError("only a note of the base is deleted here");
    const { files: notes, path } = this.where(id);
    await this.one(async () => {
      const now = await notes.read(path);
      if (now === null) throw new Conflict(`${id} is gone`, null);
      const entries = await this.journal(id);
      await this.enter(id, entries, reconcile(entries, now, await this.stamp("external")));
      if (base !== hashText(now)) throw new Conflict(`${id} was changed since you opened it`, { id, text: now, version: hashText(now) });
      await notes.remove(path);
      this.files.delete(path);
      this.built = this.index = null;
      this.embedSoon();
    });
    this.publish({ type: "note-changed", id, version: null, who });
  }

  /** Resolve a question, or say a problem is solved, today; or open it again (M12). Yours alone: Iso's tools never
   *  change it. `base` as for saveNote. */
  async setDone(id: string, done: boolean, base: string): Promise<Saved> {
    const c = this.bundle.concepts.get(checkNoteId(id));
    if (!c || c.kind === "note") throw new EngineError("only a question or a problem is resolved or solved");
    const source = await this.readNote(id);
    const day = new Date(this.opts.clock.now()).toISOString().slice(0, 10);
    return this.one(() => this.put(id, spliceText(source.text, { [DONE[c.kind as "question" | "problem"]]: done ? day : null }, null), base));
  }

  /** Writes happen one at a time, in the order asked. */
  private one<T>(act: () => Promise<T>): Promise<T> {
    const run = this.queue.then(act, act);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** A file in the notes that isn't a note (M23: any kind; M22 gave pictures only), or a picture in the base's
   *  repository. Within its folder, and (in the notes) never in a hidden folder such as `.isorite/`. */
  async file(path: string, from: "notes" | "code" = "notes"): Promise<FileBytes | null> {
    const type = from === "code" ? pictureType(path) : fileType(path);
    if (!type) return null;
    let files: Files | null, at: string;
    if (from === "code") {
      const target = codeTarget(`code:${path}`), where = await this.repositoryOfBase();
      files = target && where ? this.opts.repository?.(where) ?? null : null;
      at = target?.path ?? "";
    } else {
      at = path.replace(/^\/+/, "");
      const parts = at.split("/");
      files = parts.some((p) => !p || p === "." || p === ".." || p.startsWith(".")) ? null : this.opts.notes;
    }
    const bytes = files ? await files.readBytes(at) : null;
    if (!bytes) return null;
    if (bytes.length > MAX_FILE_BYTES) throw new EngineError(`${path} is larger than isorite gives (${MAX_FILE_BYTES / 1e6} MB)`, 413);
    return { bytes, type, version: sha256(bytes).slice(0, 16) };
  }

  /** The code a code link names (M29): its symbol's lines, or the lines it gives, or the file's start. A symbol is
   *  found by its name in the file as it is now, so the link holds where the code has moved. */
  async code(href: string, full = false): Promise<CodeSlice> {
    const target = codeTarget(href);
    if (!target) throw new EngineError("not a code link", 400);
    const { path, symbol } = target, where = await this.repositoryOfBase();
    const files = where ? this.opts.repository?.(where) ?? null : null;
    if (!files) return { state: "no-repository", path, ...(symbol ? { symbol } : {}) };
    const bytes = await files.readBytes(path);
    if (!bytes) return { state: "no-file", path, ...(symbol ? { symbol } : {}) };
    if (bytes.length > 2_000_000) return { state: "too-large", path };
    const lines = new TextDecoder().decode(bytes).split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    let start = target.line ?? 1, end = target.end ?? target.line ?? lines.length, count: number | undefined;
    if (full && symbol) {
      // The reader shows the file whatever the symbol: marked where it is found, and said where it is not.
      const found = hasSymbols(path) ? findSymbol(lines.join("\n"), path, symbol) : null;
      return { state: "ok", path, symbol, start: 1, end: lines.length, total: lines.length, text: lines.join("\n"), ...(found ? { mark: { start: found.start, end: found.end } } : {}), ...(found?.count && found.count > 1 ? { count: found.count } : {}) };
    }
    if (symbol) {
      if (!hasSymbols(path)) return { state: "unsupported", path, symbol };
      const found = findSymbol(lines.join("\n"), path, symbol);
      if (!found) return { state: "no-symbol", path, symbol };
      ({ start, end, count } = found);
    }
    end = Math.min(Math.max(end, start), lines.length);
    if (start > lines.length) return { state: "no-symbol", path };
    if (full) return { state: "ok", path, ...(symbol ? { symbol } : {}), start: 1, end: lines.length, total: lines.length, text: lines.join("\n"), ...(symbol || target.line ? { mark: { start, end } } : {}), ...(count && count > 1 ? { count } : {}) };
    const shown = Math.min(end, start + MAX_CODE_LINES - 1);
    return { state: "ok", path, ...(symbol ? { symbol } : {}), start, end, total: lines.length, text: lines.slice(start - 1, shown).join("\n"), ...(shown < end ? { more: true as const } : {}), ...(count && count > 1 ? { count } : {}) };
  }

  /** What was read of each picture, kept while its size and time are the same. */
  private pictureCache = new Map<string, { size?: number; mtime?: number; info: PictureInfo }>();

  /** Every picture in the notes (M22), found afresh: one put in the folder by hand since the base was opened is
   *  among them, and from then on in the bundle too, so a link to it isn't broken. A hidden folder is never looked in. */
  async pictures(): Promise<PictureInfo[]> {
    const found: { path: string; size?: number; mtime?: number }[] = [];
    const visit = async (dir: string): Promise<void> => {
      for (const f of await this.opts.notes.list(dir)) {
        if (f.name.startsWith(".")) continue;
        const path = dir ? `${dir}/${f.name}` : f.name;
        if (f.dir) await visit(path);
        else if (pictureType(f.name)) found.push({ path, ...(f.size === undefined ? {} : { size: f.size }), ...(f.mtime === undefined ? {} : { mtime: f.mtime }) });
      }
    };
    await visit("");
    const out: PictureInfo[] = [], seen = new Set<string>();
    for (const f of found) {
      seen.add(f.path);
      const kept = this.pictureCache.get(f.path);
      if (kept && f.size !== undefined && kept.size === f.size && kept.mtime === f.mtime) { out.push(kept.info); continue; }
      const bytes = f.size !== undefined && f.size > MAX_FILE_BYTES ? null : await this.opts.notes.readBytes(f.path);
      if (!bytes) continue;
      const px = pictureSize(bytes, pictureType(f.path)!);
      const info: PictureInfo = { path: f.path, bytes: bytes.length, width: px?.width ?? null, height: px?.height ?? null, sha256: sha256(bytes) };
      this.pictureCache.set(f.path, { ...(f.size === undefined ? {} : { size: f.size }), ...(f.mtime === undefined ? {} : { mtime: f.mtime }), info });
      out.push(info);
    }
    for (const path of this.pictureCache.keys()) if (!seen.has(path)) this.pictureCache.delete(path);
    // The bundle's pictures, as found.
    let changed = false;
    for (const path of seen) if (!this.files.has(path)) { this.files.set(path, { path }); changed = true; }
    for (const path of [...this.files.keys()]) if (pictureType(path) && !seen.has(path)) { this.files.delete(path); changed = true; }
    if (changed) this.built = this.index = null;
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  }

  /** Put a picture in the notes (M22). The path must be a picture's, out of any hidden folder, and free: a file
   *  that's there is never replaced. Not journaled: a picture has no history, and stays when its link goes. */
  savePicture(path: string, bytes: Uint8Array): Promise<PictureInfo> {
    return this.one(async () => {
      const type = pictureType(path), parts = path.split("/");
      if (!type || parts.some((p) => !p || p === "." || p === ".." || p.startsWith(".")) || /[\\\x00-\x1f]/.test(path)) throw new EngineError(`not a picture's path: ${path}`, 400);
      if (bytes.length > MAX_FILE_BYTES) throw new EngineError(`the picture is larger than isorite takes (${MAX_FILE_BYTES / 1e6} MB)`, 413);
      if ((await this.opts.notes.readBytes(path)) !== null) throw new Conflict(`${path} is there already`, null);
      await this.opts.notes.writeBytes(path, bytes);
      this.files.set(path, { path });
      this.built = this.index = null;
      const px = pictureSize(bytes, type);
      const info: PictureInfo = { path, bytes: bytes.length, width: px?.width ?? null, height: px?.height ?? null, sha256: sha256(bytes) };
      return info;
    });
  }

  /** Where a note's file is. */
  private where(id: string): { files: Files; path: string } {
    // An artifact (M23) is journalled as a note is, by its path: Iso's rewrites of it are marked and undone the same way.
    if (inBase(id) && citeKind(id) === "artifact") return { files: this.opts.notes, path: checkNoteId(id) };
    if (!inBase(id)) throw new EngineError(`there is no note ${id}`);
    return { files: this.opts.notes, path: `${checkNoteId(id)}.md` };
  }

  /** The note's text just after one of its journal's entries. */
  async version(id: string, entry: string): Promise<string> {
    const entries = await this.journal(id);
    if (!entries.some((e) => e.id === entry)) throw new EngineError(`no such entry in ${id}'s journal`, 404);
    const at = replay(entries, entry);
    if (!at) throw new EngineError(`${id}'s journal does not reach that entry`, 404);
    return at.text;
  }

  /** Write the note back as it was just after an entry: a change of its own, `why: restore`. */
  restore(id: string, entry: string, base: string): Promise<Saved> {
    return this.one(async () => this.put(id, await this.version(id, entry), base, "restore", { to: entry }));
  }

  private async put(id: string, text: string, base: string | null, why: "edit" | "restore" = "edit", extra: { to?: string; asked?: string } = {}, who = "you"): Promise<Saved & { entry?: string }> {
    const { files, path } = this.where(id);
    if (text.length > MAX_NOTE_BYTES) throw new EngineError("note too large", 413);
    // An agent's unquoted colon in a field (`title: Foo: bar`) is quoted for it; what you type is never rewritten under you.
    if (who !== "you" && path.endsWith(".md")) text = repairFrontmatter(text)?.text ?? text;
    const now = await files.read(path);
    if (base === null && now !== null) throw new EngineError(`there is already a note at ${id}`, 409);
    if (base !== null && now === null) throw new Conflict(`${id} is gone`, null);

    // What the file holds that the journal has not seen is entered first, as made elsewhere.
    const entries = await this.journal(id);
    if (now !== null) await this.enter(id, entries, reconcile(entries, now, await this.stamp("external")));
    if (now !== null && base !== hashText(now)) throw new Conflict(`${id} was changed since you opened it`, { id, text: now, version: hashText(now) });
    // Only you resolve a question or say a problem is solved (M12): from anyone else, that field stays as it was.
    if (who !== "you" && now !== null) text = keepDone(now, text);
    if (now === text) return { id, text, version: hashText(text), changed: false };

    await files.write(path, text);
    const entry = change(entries, text, await this.stamp(who), why, extra);
    await this.enter(id, entries, entry);
    if (inBase(id)) {
      this.files.set(path, { path, text });
      this.built = this.index = null;
      this.embedSoon();
    }
    const version = hashText(text);
    this.publish({ type: "note-changed", id, version, who });
    return { id, text, version, changed: true, ...(entry ? { entry: entry.id } : {}) };
  }

  private titleOf(id: string, text: string): string {
    try { const t = splitFrontmatter(text)[0]?.title; if (typeof t === "string" && t) return t; } catch { /* the id will do */ }
    return id.split("/").at(-1)!;
  }

  // ------------------------------------------------------------ the session

  /** The session an entry made now would belong to. */
  private async sessionNow(): Promise<string> { return (await this.stamp("you")).session; }

  /** Every journal's entries of the current session, by note. Read from the study base once a session, then kept
   *  current as entries are made. */
  private sessionLog: { session: string; notes: Map<string, Entry[]> } | null = null;
  private async sessionEntries(session?: string): Promise<Map<string, Entry[]>> {
    session ??= await this.sessionNow();
    if (this.sessionLog?.session === session) return this.sessionLog.notes;
    const notes = new Map<string, Entry[]>(), study = this.opts.own;
    const visit = async (dir: string): Promise<void> => {
      for (const info of await study.list(dir)) {
        const path = `${dir}/${info.name}`;
        if (info.dir) await visit(path);
        else if (info.name.endsWith(".jsonl")) {
          const mine = readJournal((await study.read(path)) ?? "").filter((e) => e.session === session);
          if (mine.length) notes.set(path.slice("journal/".length, -".jsonl".length), mine);
        }
      }
    };
    await visit("journal");
    this.sessionLog = { session, notes };
    return notes;
  }

  /** The moments of the last session, across every note: the one going on, or the one most recently ended. */
  async timeline(): Promise<SessionMoment[]> {
    if (this.last === undefined) this.last = await this.newest();
    return this.last ? sessionMoments(await this.sessionEntries(this.last.session)) : [];
  }

  // ------------------------------------------------------------ conversations with Iso, before M25: kept to read

  async conversation(id?: string): Promise<Conversation | null> {
    const study = this.opts.own;
    if (!id) {
      const names = await study.list(CONVERSATIONS_DIR).catch(() => []);
      id = names.filter((f) => !f.dir && f.name.endsWith(".jsonl")).map((f) => f.name.slice(0, -".jsonl".length)).sort().at(-1);
      if (!id) return null;
    }
    if (!TURN_ID.test(id)) throw new EngineError("not a conversation's id");
    const text = await study.read(conversationPath(id));
    // A turn with no ending in the file was stopped.
    return text === null ? null : { id, turns: readTurns(text) };
  }

  async deleteConversation(id: string): Promise<void> {
    if (!TURN_ID.test(id)) throw new EngineError("not a conversation's id");
    await this.opts.own.remove(conversationPath(id));
  }

  async conversations(): Promise<ConversationSummary[]> {
    const study = this.opts.own;
    const names = await study.list(CONVERSATIONS_DIR).catch(() => []);
    const all: ConversationSummary[] = [];
    for (const f of names) {
      const id = f.name.slice(0, -".jsonl".length);
      if (f.dir || !f.name.endsWith(".jsonl") || !TURN_ID.test(id)) continue;
      const turns = readTurns((await study.read(conversationPath(id))) ?? "");
      if (!turns.length) continue;
      const notes = new Set<string>();
      for (const t of turns) {
        for (const g of t.given) if (g.kind !== "folder") notes.add(g.id);
        for (const i of t.items) {
          if (i.kind === "look" && i.step.opened && !i.step.away) notes.add(i.step.opened);
          else if (i.kind === "point" || (i.kind === "change" && i.why !== "delete")) notes.add(i.kind === "change" && i.to ? i.to : i.note);
        }
      }
      all.push({ id, at: turns[0]!.at, last: turns.at(-1)!.at, asked: turns[0]!.asked, turns: turns.length, notes: notes.size });
    }
    return all.sort((a, b) => (a.last < b.last ? 1 : a.last > b.last ? -1 : 0));
  }

  /** The base's own instructions, AGENTS.md at the top of the notes, if there is one. */
  private async agentsFile(): Promise<string | null> {
    return this.opts.notes.read(AGENTS_FILE).catch(() => null);
  }

  async agents(): Promise<{ text: string | null }> { return { text: await this.agentsFile() }; }

  async saveAgents(text: string): Promise<void> {
    if (typeof text !== "string" || text.length > 50_000) throw new EngineError("AGENTS.md is text, of 50,000 characters at most", 413);
    await this.one(() => this.opts.notes.write(AGENTS_FILE, text.replace(/\s*$/, "") + (text.trim() ? "\n" : "")));
  }

  /** A note's id as Iso writes one for a new note: folder/name, without a leading slash or `.md`. */
  private newNoteId(raw: unknown): string | null {
    const id = String(raw ?? "").trim().replace(/^\/+|\/+$/g, "").replace(/\.md$/i, "");
    try { checkNoteId(id); } catch { return null; }
    return inBase(id) ? id : null;
  }

  /** An agent's read_data, artifact_recipe, read_artifact or write_artifact (M23, an agent's since M25). */
  private async artifactTool(name: string, args: Record<string, unknown>, who: string, asked: string): Promise<string> {
    if (name === READ_DATA.function.name) {
      const path = filePathOf(args.path);
      if (!path) return `${String(args.path ?? "")} is not a file's path in their base.`;
      const got = await this.file(path).catch(() => null);
      if (!got) return `There is no file ${path}.${this.nearFiles(path)}`;
      try { return describeShape(shapeOf(path, parseData(path, new TextDecoder().decode(got.bytes)))); }
      catch (e) { return `${path} could not be read as data: ${(e as Error).message}`; }
    }
    if (name === ARTIFACT_RECIPE.function.name) {
      const r = RECIPES[String(args.name ?? "")];
      if (!r) return `There's no recipe ${String(args.name ?? "")}: there are ${Object.keys(RECIPES).join(", ")}.`;
      return `${REFERENCE}\n\n# The recipe: ${String(args.name)}\n\n${r.about}. A complete working artifact; change what it marks, keep the rest.\n\n\`\`\`html\n${r.html}\`\`\``;
    }
    if (name === READ_ARTIFACT.function.name) {
      const path = filePathOf(args.path);
      if (!path || citeKind(path) !== "artifact") return `${String(args.path ?? "")} is not an artifact's path (folder/name.html).`;
      const got = await this.opts.notes.read(path);
      return got === null ? `There is no artifact ${path}.` : got;
    }
    return this.writeArtifact(args, who, asked);
  }

  /** Files in the same folder as a path, to say which there are when one isn't. */
  private nearFiles(path: string): string {
    const dir = path.split("/").slice(0, -1).join("/"), there = [...this.files.keys()].filter((f) => !f.endsWith(".md") && f.split("/").slice(0, -1).join("/") === dir);
    return there.length ? ` In ${dir || "the top folder"} there are: ${there.map((f) => f.split("/").at(-1)).join(", ")}.` : "";
  }

  /** write_artifact (M23, plan-m23 §3.5, §3.7): the manifest written as given, the rules checked before anything is
   *  written, then written and journalled as a note is, and run where it can be, with all it reports said back. */
  private async writeArtifact(args: Record<string, unknown>, who: string, asked: string): Promise<string> {
    await this.agentMayWrite();
    const path = filePathOf(args.path);
    if (!path || citeKind(path) !== "artifact" || !inBase(path)) return `${String(args.path ?? "")} is not an artifact's path: give folder/name.html.`;
    const raw = String(args.html ?? "");
    if (!raw.trim()) return "Give the whole file, in html.";
    // What it uses: as given, as its own manifest says, and what its markup and script read, all of them. A model that
    // left `uses` empty (Gemma 4 31B did, then mended the file's meta again and again) loses nothing by it.
    const given = (Array.isArray(args.uses) ? args.uses : typeof args.uses === "string" ? args.uses.split(/[\s,]+/) : []).map((u) => String(u));
    const uses = [...new Set([...given, ...manifestOf(raw).uses, ...readsOf(raw)].map((u) => u.trim().replace(/^\.\//, "")).filter(Boolean))];
    const title = String(args.title ?? "").trim() || manifestOf(raw).title || path.split("/").at(-1)!.replace(/\.html?$/, "").replace(/-/g, " ");
    const html = withManifest(raw, { title, description: String(args.description ?? "").trim() || manifestOf(raw).description, author: who.replace(/^agent:/, ""), date: new Date(this.opts.clock.now()).toISOString().slice(0, 10), kit: "1", uses });
    // What it may read: its uses that exist, beside it; and the columns of each that is data.
    const dir = path.split("/").slice(0, -1);
    const at = (rel: string) => { const parts = [...dir]; for (const p of rel.split("/")) { if (p === "..") parts.pop(); else if (p && p !== ".") parts.push(p); } return parts.join("/"); };
    const files: string[] = [], columns: Record<string, string[]> = {};
    for (const u of uses) {
      const got = await this.file(at(u)).catch(() => null);
      if (!got) continue;
      files.push(u);
      if (citeKind(u) === "data") try { columns[u] = columnsOf(parseData(u, new TextDecoder().decode(got.bytes))); } catch { /* not readable as data: its columns aren't checked */ }
    }
    const broken = checkArtifact(html, { files, columns }), errors = broken.filter((b) => b.level === "error");
    const list = (bs: { message: string }[]) => bs.map((b) => `- ${b.message}`).join("\n");
    if (errors.length) return `Not written: ${errors.length === 1 ? "a rule is" : "rules are"} broken.\n${list(errors)}\nFix ${errors.length === 1 ? "it" : "them"} and call write_artifact again with the whole file.`;
    const was = await this.opts.notes.read(path);
    await this.one(() => this.put(path, html, was === null ? null : hashText(was), "edit", asked ? { asked } : {}, who));
    const warnings = broken.filter((b) => b.level === "warning");
    const run = await this.opts.renderArtifact?.(path, html).catch(() => null) ?? null;
    const problems = [
      ...(run && !run.rendered ? ["it didn't start: the kit never said it was ready"] : []),
      ...(run?.errors ?? []).map((e) => `it reported: ${e}`),
      ...(run && run.rendered && run.drawn === 0 ? ["it drew nothing: no chart, canvas or 3D view has anything in it"] : []),
      ...warnings.map((w) => w.message),
    ];
    const ran = run ? "It was run, with every control touched" : "It couldn't be run here (no browser), so only its rules were checked";
    return `${was === null ? "Written" : "Written anew"}: ${path}. ${ran}${problems.length ? `, and:\n${problems.map((p) => `- ${p}`).join("\n")}\nFix these and call write_artifact again with the whole file.` : run ? ", with no error." : "."}`;
  }

  /** A question asked in a turn, made a question note: in the folder of the first note it is about, named by its
   *  title. */
  private async makeQuestion(q: Extract<TurnItem, { kind: "question" }>, who: string, asked?: string): Promise<{ id: string; text: string; entry?: string }> {
    const dir = q.about[0]!.split("/").slice(0, -1).join("/"), name = slugify(q.title).slice(0, 60).replace(/-+$/, "") || "question";
    let id = "";
    for (let n = 1; !id || this.bundle.concepts.has(id); n++) id = [dir, n === 1 ? name : `${name}-${n}`].filter(Boolean).join("/");
    const text = `---\ntype: Question\ntitle: ${JSON.stringify(q.title)}\nabout: [${q.about.join(", ")}]\n---\n\n${q.text ? `${q.text}\n` : ""}`;
    const saved = await this.put(id, text, null, "edit", asked ? { asked } : {}, who);
    return { id, text, ...(saved.entry ? { entry: saved.entry } : {}) };
  }

  /** A proposal still waiting in a note's journal, or a refusal. */
  private async waiting(id: string, proposal: string): Promise<{ entries: Entry[]; p: Proposal }> {
    const entries = await this.journal(id);
    const p = pending(entries).find((x) => x.id === proposal);
    if (!p) throw new EngineError("that text is no longer waiting: it was kept or removed", 409);
    return { entries, p };
  }

  keep(id: string, proposal: string, region?: number): Promise<Saved> {
    return this.one(async () => {
      const { files, path } = this.where(id);
      const now = await files.read(path);
      if (now === null) throw new Conflict(`${id} is gone`, null);
      const { entries, p } = await this.waiting(id, proposal);
      await this.enter(id, entries, reconcile(entries, now, await this.stamp("external")));
      let text: string | null;
      if (p.form === "rewrite") {
        if (region !== undefined && !p.open?.includes(region)) throw new EngineError("that change is no longer waiting: it was kept or removed", 409);
        text = written(now, p, region);
        if (text === null) throw new EngineError(region === undefined ? "a passage this would rewrite is no longer in the note as it was. Keep the others one by one." : "the passage this would rewrite is no longer in the note as it was", 409);
      } else {
        // New text whose place has gone is kept at the end of the note: shown apart, never lost.
        text = written(now, p) ?? written(now, { ...p, after: null, before: null });
        if (text === null) throw new EngineError("there is nowhere in the note to put this", 409);
      }
      await files.write(path, text);
      await this.enter(id, entries, change(entries, text, await this.stamp("you"), "keep", { proposal, ...(p.form === "rewrite" && region !== undefined ? { region } : {}) }));
      if (inBase(id)) { this.files.set(path, { path, text }); this.built = this.index = null; this.embedSoon(); }
      const version = hashText(text);
      this.publish({ type: "note-changed", id, version, who: "you" });
      return { id, text, version, changed: true };
    });
  }

  revise(id: string, proposal: string, text: string | string[]): Promise<void> {
    return this.one(async () => {
      const { entries, p } = await this.waiting(id, proposal);
      if ((typeof text === "string" ? text.length : text.join("").length) > MAX_NOTE_BYTES) throw new EngineError("too large", 413);
      if (p.form === "insert") {
        if (typeof text !== "string") throw new EngineError("new text at a point is revised as one text");
        if (text !== p.text) await this.enter(id, entries, { ...(await this.stamp("you")), kind: "revise", proposal, text });
      } else {
        if (typeof text === "string" || text.length !== p.regions.length) throw new EngineError("a rewrite is revised region by region");
        if (text.some((t, k) => t !== p.regions[k]!.new)) await this.enter(id, entries, { ...(await this.stamp("you")), kind: "revise", proposal, regions: text });
      }
    });
  }

  discard(id: string, proposal: string, region?: number): Promise<void> {
    return this.one(async () => {
      const { entries, p } = await this.waiting(id, proposal);
      if (p.form === "rewrite" && region !== undefined && !p.open?.includes(region)) throw new EngineError("that change is no longer waiting: it was kept or removed", 409);
      await this.enter(id, entries, { ...(await this.stamp("you")), kind: "discard", proposal, ...(p.form === "rewrite" && region !== undefined ? { region } : {}) });
    });
  }

  private async enter(id: string, entries: Entry[], entry: Entry | null): Promise<void> {
    if (!entry || !this.opts.own) return;
    await this.opts.own.append(journalPath(id), journalLine(entry));
    entries.push(entry);
    this.last = { at: entry.at, session: entry.session };
    if (this.sessionLog?.session === entry.session) this.sessionLog.notes.set(id, [...(this.sessionLog.notes.get(id) ?? []), entry]);
    this.publish({ type: "journal", id, entry });
  }

  private async stamp(who: string): Promise<Stamp> {
    if (this.last === undefined) this.last = await this.newest();
    return stamp(who, this.opts.device, this.last, this.opts.clock.now());
  }

  /** The newest entry in any journal of the study base, found once when the engine first writes. */
  private async newest(): Promise<Pick<Stamp, "at" | "session"> | null> {
    const study = this.opts.own;
    let newest: Entry | null = null;
    const visit = async (dir: string): Promise<void> => {
      for (const info of await study.list(dir)) {
        const path = `${dir}/${info.name}`;
        if (info.dir) await visit(path);
        else if (info.name.endsWith(".jsonl")) {
          const last = readJournal((await study.read(path)) ?? "").at(-1);
          if (last && (!newest || last.id > newest.id)) newest = last;
        }
      }
    };
    await visit("journal");
    return newest;
  }

  private publish(event: EngineEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* one listener's fault is not the writer's */ }
    }
  }
}
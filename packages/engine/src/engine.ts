// The engine: one knowledge base and isorite's own files for it, open. Every write to a
// note goes through `saveNote` or `createNote` here, one at a time, which is
// what keeps the journal true to the file (docs/architecture.md, section 3).

import {
  embedRefs, embedFor, slugify, spliceText, SETTINGS_FILE, parseSettings, settingsText, type BaseSettings, kindOf, idsOf, DONE, ABOUT, Bundle, SearchIndex, diffLines, change, findPassage, hashText, cleanEvent, journalLine, journalPath, locate, replay, sessionMoments, mapModel, newId, pending, readJournal, readRecord, recordPath, reconcile, splitFrontmatter, stamp, written, type Cost, type Entry, type FileEntry, type Proposal, type SessionMoment, type Stamp,
} from "@isorite/core";
import { Conflict, EngineError, type AgentLook, type AgentChange, type Api, type AskRequest, type Choice, type ContextItem, type ContextReport, type Conversation, type DraftSummary, type EngineEvent, type Listing, type MapReport, type NoteSource, type Saved, type SearchHit, type Session, type Settings, type TurnRequest, type UnderstandingReport } from "./api.ts";
import { CLOSE, HERE, LINKED_BUDGET, OPEN, conversation, estimate, exchanges, fitted, insertMessages, parseRewrite, replyText, noteMessages, rewriteMessages, windowed, type Exchange, type Part } from "./iso.ts";
import { ROUNDS, rounds, type Tools } from "./loop.ts";
import { FIND_SIMILAR, Lookup, TOOLS, noteId, type Similar } from "./lookup.ts";
import { UNDERSTANDING_DIR, UNDERSTANDING_PREFIX, isUnderstandingId, parseUnderstanding, understandingId, understandingText } from "./understand.ts";
import { CONVERSATIONS_DIR, MODES, conversationPath, turnTools, readTurns, sentText, turnExchange, turnMessages, type Decision, type Given, type Sent, type Turn, type TurnItem, type TurnLine } from "./turn.ts";
import { Meaning, type Embedder } from "./meaning.ts";
import { KEY, OPENROUTER, TIERS, pkce, randomToken, type Message, type ProviderConfig, type ToolDef } from "./provider.ts";
import type { Clock, Files, Http, Secrets } from "./ports.ts";

/** The largest note taken. */
export const MAX_NOTE_BYTES = 2_000_000;

/** How long a sign-in at the provider may take: its codes last ten minutes. */
const SIGN_IN_MS = 10 * 60_000;

export interface EngineOptions {
  /** The knowledge base's folder. */
  notes: Files;
  /** isorite's own files for this base: its journals, conversations and Understanding notes. On disk, the notes'
   *  `.isorite/` folder (format 2); in the tutorial and the tests, files in memory. */
  own: Files;
  clock: Clock;
  device: string;
  name: string;
  /** The base is the tutorial's: the session says so, and the app walks you through it. */
  tutorial?: boolean;
  /** For Iso: the network, where the key is kept, and which provider. Without `http`, Iso cannot be asked. */
  http?: Http;
  secrets?: Secrets;
  provider?: ProviderConfig;
  /** Search by meaning, where the device can run the model: the model, and a folder outside both repositories
   *  for its vectors, with the name of this base's file in it. */
  embedder?: Embedder;
  cache?: { files: Files; name: string };
  /** Or a search by meaning from elsewhere (tests). */
  similar?: Similar;
  /** The files of a repository named in the base's settings (M12): where its code links point. Null where there
   *  is no such folder. */
  repository?: (path: string) => Files | null;
}

/** The longest request and the longest reply asked for, in characters and tokens. */
export const MAX_ASKED = 4000, REPLY_TOKENS = 2500, NOTE_TOKENS = 6000;

/** Notes for Iso that are not in the base yet: among isorite's own files, under this prefix wherever notes are named. */
export const DRAFT_PREFIX = "@draft/", DRAFT_DIR = "drafts";
export const isDraftId = (id: string): boolean => id.startsWith(DRAFT_PREFIX);
/** A note's id without the prefix that says which of isorite's folders it is in. */
const bare = (id: string): string => (isDraftId(id) ? id.slice(DRAFT_PREFIX.length) : isUnderstandingId(id) ? id.slice(UNDERSTANDING_PREFIX.length) : id);
/** In the knowledge base itself: not one of isorite's own notes (a draft, an Understanding note), whose ids begin "@". */
const inBase = (id: string): boolean => !id.startsWith("@");

const BAD_PART = /^\.|[\0\\:*?"<>|]|^\s|\s$/;

/** A note's id, checked before it becomes a path: no "..", nothing hidden, no absolute path. */
export function checkNoteId(id: string): string {
  const parts = id.split("/");
  if (!id || id.length > 400 || parts.some((p) => !p || BAD_PART.test(p))) throw new EngineError(`not a note's id: ${JSON.stringify(id)}`);
  return id;
}

/** What a mode's tool is handed of the turn it is in. */
interface TurnCtx { turn: string; conversation: string; mode: Turn["mode"]; item: (i: TurnItem) => Promise<void>; signal: AbortSignal; who: string; asked: string }

/** A conversation's or turn's id: a ULID. */
const TURN_ID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

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

/** The brief of the base, a terminal agent's first look. */
const BRIEF: ToolDef = { type: "function", function: { name: "brief_base", description: "What this knowledge base holds: its folders, how many notes each, and how to look things up in it. Call it first, once.", parameters: { type: "object", properties: {}, additionalProperties: false } } };

const NOTE_ARG = { type: "string", description: "The note's id or path in the knowledge base: physics/softening or /physics/softening.md." };
const MARKED = "The change is written at once, under your name: the person sees your words marked in the note, and can undo it from the browser. Use this, never edit or write, for any note of the knowledge base.";
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
  /** Requests to Iso that are running, by id, and the note each is for: a note is asked one thing at a time. */
  private readonly running = new Map<string, AbortController>();
  private readonly asking = new Map<string, string>();
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
    return { name: this.opts.name, device: this.opts.device, ...(this.opts.tutorial ? { tutorial: true } : {}) };
  }

  async notes(): Promise<Listing> {
    const broken = await this.brokenCode();
    const notes = [...this.bundle.concepts.values()].map((c) => ({ id: c.id, title: c.title, description: c.description, type: c.type, dir: c.directory, ...(c.kind === "note" ? {} : { kind: c.kind, attached: c.attached }), ...(c.done ? { done: c.done } : {}), ...(broken.has(c.id) ? { broken: broken.get(c.id) } : {}) }));
    notes.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { notes, dirs: [...this.bundle.directories.keys()].filter(Boolean).sort() };
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
    const notes: MapReport["notes"] = {}, broken = await this.brokenCode();
    for (const c of this.bundle.concepts.values()) {
      const bad = broken.get(c.id) ?? [];
      const links = c.outward.map((o) => ({ kind: o.kind, href: o.href, text: o.text, ...(bad.includes(o.href) ? { broken: true as const } : {}) }));
      notes[c.id] = { title: c.title, tokens: estimate(c.body.trim()), ...(c.kind !== "note" ? { kind: c.kind } : {}), ...(c.done ? { done: c.done } : {}), ...(links.length ? { links } : {}) };
    }
    return { model: mapModel(this.bundle), notes };
  }

  // ------------------------------------------------------------ code links (M12)

  /** The base's settings, from `.isorite/settings.toml`. */
  async settingsOfBase(): Promise<BaseSettings> { return parseSettings(await this.opts.own.read(SETTINGS_FILE)); }

  /** Name the repository code links point into, unless one is named already: `isorite term` does, the first time
   *  it is run beside the base. `path` is relative to the notes folder, or absolute. */
  async nameRepository(path: string): Promise<boolean> {
    if (!path || (await this.settingsOfBase()).repository) return false;
    await this.one(() => this.opts.own.write(SETTINGS_FILE, settingsText({ repository: path })));
    this.codeCheck = null;
    return true;
  }

  /** What was last found of the code links, and when: looked at again when the notes change, or after a while,
   *  since the repository changes outside isorite. */
  private codeCheck: { at: number; of: Bundle; broken: Map<string, string[]> } | null = null;
  /** The code links whose file is not in the repository, by note. With no repository named, none are. */
  private async brokenCode(): Promise<Map<string, string[]>> {
    const now = this.opts.clock.now(), b = this.bundle;
    if (this.codeCheck && this.codeCheck.of === b && now - this.codeCheck.at < 10_000) return this.codeCheck.broken;
    const broken = new Map<string, string[]>(), where = (await this.settingsOfBase()).repository;
    const repo = where ? this.opts.repository?.(where) ?? null : null;
    if (repo) {
      const listed = new Map<string, Promise<Set<string>>>();
      const names = (dir: string) => { let l = listed.get(dir); if (!l) listed.set(dir, (l = repo.list(dir).then((fs) => new Set(fs.filter((f) => !f.dir).map((f) => f.name)), () => new Set<string>()))); return l; };
      for (const c of b.concepts.values()) for (const o of c.outward) {
        if (o.kind !== "code") continue;
        const k = o.path.lastIndexOf("/"), dir = k < 0 ? "" : o.path.slice(0, k);
        if (!(await names(dir)).has(o.path.slice(k + 1))) broken.set(c.id, [...(broken.get(c.id) ?? []), o.href]);
      }
    }
    this.codeCheck = { at: now, of: b, broken };
    return broken;
  }

  /** Code links broken since Iso, or the terminal's agent, was last told: each is told once (Q27). */
  private readonly toldBroken = { iso: new Set<string>(), agent: new Set<string>() };
  async brokenNews(to: "iso" | "agent"): Promise<{ id: string; title: string; href: string }[]> {
    const told = this.toldBroken[to], out: { id: string; title: string; href: string }[] = [], now = new Set<string>();
    for (const [id, hrefs] of await this.brokenCode()) for (const href of hrefs) {
      const key = `${id} ${href}`;
      now.add(key);
      if (!told.has(key)) out.push({ id, title: this.bundle.concepts.get(id)?.title ?? id, href });
    }
    // One mended and broken again is told again.
    this.toldBroken[to] = now;
    return out;
  }

  async journal(id: string): Promise<Entry[]> {
    checkNoteId(bare(id));
    return readJournal((await this.opts.own.read(journalPath(id))) ?? "");
  }

  async search(query: string): Promise<SearchHit[]> {
    this.index ??= new SearchIndex(this.bundle);
    return this.index.search(query, { limit: 30 }).map((h) => ({ id: h.concept.id, title: h.concept.title, snippet: h.snippet }));
  }

  // ------------------------------------------------------------ terminal agents

  async agentTools(): Promise<ToolDef[]> {
    return [BRIEF, TOOLS[0]!, ...(this.similar ? [FIND_SIMILAR] : []), ...TOOLS.slice(1), EDIT_NOTE, WRITE_NOTE];
  }

  async agentLook({ agent, session, tool, args, asked = "" }: AgentLook): Promise<{ text: string }> {
    if (tool === BRIEF.function.name) return { text: this.brief() };
    if (tool === EDIT_NOTE.function.name || tool === WRITE_NOTE.function.name) {
      const str = (v: unknown, name: string) => { if (typeof v !== "string") throw new EngineError(`${tool} needs ${name}, as text`, 400); return v; };
      const edit = tool === WRITE_NOTE.function.name ? { content: str(args.content, "content") }
        : { oldString: str(args.oldString, "oldString"), newString: str(args.newString, "newString"), replaceAll: args.replaceAll === true };
      return this.agentWrite({ agent, session, note: str(args.note, "note"), asked, edit });
    }
    const turn = this.turns.get(`${agent}/${session}`) ?? this.startTurn(agent, session);
    const { text, step } = await turn.lookup.call(tool, JSON.stringify(args));
    this.publish({ type: "agent-step", request: turn.request, agent, session, step });
    return { text };
  }

  async agentStatus(agent: string, session: string, busy: boolean): Promise<void> {
    const key = `${agent}/${session}`, turn = this.turns.get(key);
    if (busy && !turn) this.startTurn(agent, session);
    if (!busy && turn) { this.turns.delete(key); this.publish({ type: "agent-done", request: turn.request, agent, session }); }
  }

  async agentWrite({ agent, session, note, asked, edit }: AgentChange): Promise<{ text: string }> {
    // As Iso's Write mode writes (M10): at once, entered in the note's journal under the agent's name, its words
    // marked in the note's Iso lens, and undone from the browser (agreed for M11, Q20).
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
    const notes = this.opts.notes, path = `${checkNoteId(id)}.md`;
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

  /** Where a note's file is: drafts and Understanding notes are among isorite's own files. */
  private where(id: string): { files: Files; path: string } {
    if (!inBase(id)) {
      return { files: this.opts.own, path: `${isDraftId(id) ? DRAFT_DIR : UNDERSTANDING_DIR}/${checkNoteId(bare(id))}.md` };
    }
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

  // ------------------------------------------------------------ Iso

  private get provider(): ProviderConfig { return this.opts.provider ?? OPENROUTER; }

  async settings(): Promise<Settings> {
    return { provider: this.provider.name, key: Boolean(await this.opts.secrets?.get(KEY)), connect: Boolean(this.provider.auth && this.opts.secrets), tiers: this.provider.tiers };
  }

  async setKey(key: string | null): Promise<Settings> {
    if (!this.opts.secrets) throw new EngineError("keys cannot be kept here", 409);
    const clean = key?.trim() || null;
    if (clean && (clean.length > 400 || /\s/.test(clean))) throw new EngineError("that does not look like a key");
    await this.opts.secrets.set(KEY, clean);
    return this.settings();
  }

  /** Sign-ins begun and not yet back, by their state: the verifier that goes with each. */
  private signIns = new Map<string, { verifier: string; at: number }>();

  async connect(callback: string): Promise<{ url: string }> {
    const { auth, name } = this.provider;
    if (!this.opts.secrets) throw new EngineError("keys cannot be kept here", 409);
    if (!auth) throw new EngineError(`${name} cannot make a key from here: paste one`, 409);
    let back: URL;
    try { back = new URL(callback); } catch { throw new EngineError("the page to come back to is not a URL"); }
    if (back.protocol !== "http:" && back.protocol !== "https:") throw new EngineError("the page to come back to is not a web page");
    const now = this.opts.clock.now();
    for (const [state, s] of this.signIns) if (now - s.at > SIGN_IN_MS || this.signIns.size > 8) this.signIns.delete(state);
    const { verifier, challenge } = await pkce(), state = randomToken(16);
    this.signIns.set(state, { verifier, at: now });
    const url = new URL(auth);
    for (const [k, v] of Object.entries({ callback_url: back.href, code_challenge: challenge, code_challenge_method: "S256", state, key_label: "isorite" })) url.searchParams.set(k, v);
    return { url: url.href };
  }

  async connected(code: string, state: string): Promise<Settings> {
    const signIn = this.signIns.get(state);
    this.signIns.delete(state);
    if (!signIn || this.opts.clock.now() - signIn.at > SIGN_IN_MS) throw new EngineError("This sign-in was not begun here, or took too long: begin it again.", 409);
    const { name, url } = this.provider, http = this.opts.http;
    if (!http) throw new EngineError("nothing can be sent from here", 409);
    let res: Response;
    try {
      res = await http.fetch(`${url}/auth/keys`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, code_verifier: signIn.verifier, code_challenge_method: "S256" }) });
    } catch { throw new EngineError(`${name} is not answering: try again in a moment.`, 502); }
    const body = await res.json().catch(() => ({})) as { key?: unknown; error?: { message?: string } | string };
    if (!res.ok || typeof body.key !== "string") {
      const said = typeof body.error === "string" ? body.error : body.error?.message ?? res.statusText;
      throw new EngineError(`${name} did not make the key (${res.status}${said ? `: ${said}` : ""}). Begin again.`, 502);
    }
    return this.setKey(body.key);
  }

  async ask(req: AskRequest): Promise<{ request: string }> {
    const http = this.opts.http;
    if (!http) throw new EngineError("Iso cannot be asked here", 409);
    if (isDraftId(req.note) !== (req.form === "note")) throw new EngineError("a note for Iso is sent whole, and only a note for Iso is");
    if (!TIERS.includes(req.tier)) throw new EngineError("the tier is low, mid or max");
    // For a note written for Iso, what is asked is the note: its title stands for it in the journal.
    const asked = req.form === "note" ? this.titleOf(req.note, (await this.readNote(req.note)).text) : req.asked.trim();
    if (!asked) throw new EngineError("say what you want from Iso");
    // Claimed before anything is awaited, so a prompt sent twice (a second Enter, a second tab) is one request.
    if (this.asking.has(req.note)) throw new EngineError("Iso is already writing in this note. Wait for it, or stop it.", 409);
    this.asking.set(req.note, "");
    try { return await this.begin(req, http, asked); } catch (err) { this.asking.delete(req.note); throw err; }
  }

  private async begin(req: AskRequest, http: Http, asked: string): Promise<{ request: string }> {
    if (asked.length > MAX_ASKED) throw new EngineError("that is too long to ask at once", 413);
    const key = (await this.opts.secrets?.get(KEY)) ?? null;
    if (!key && /\/\/(?:[^/]*\.)?openrouter\.ai\b/.test(this.provider.url)) throw new EngineError("There is no provider key yet. Set one in settings, behind the logo.", 409);

    const { messages, olds } = await this.compose(req, asked);
    const maxTokens = req.form === "insert" ? REPLY_TOKENS : req.form === "note" ? NOTE_TOKENS : Math.max(REPLY_TOKENS, Math.ceil(olds.join("").length / 3) + 1000);
    // A request in place, when you said Iso is not to look further (I3), is one call with no tools.
    const most = (req.form === "insert" || req.form === "rewrite") && req.choice?.lookup === false ? 0 : undefined;

    const request = newId(this.opts.clock.now()), abort = new AbortController();
    this.running.set(request, abort);
    this.asking.set(req.note, request);
    const place = req.form === "insert" ? { form: req.form, after: req.after, before: req.before } : req.form === "rewrite" ? { form: req.form, regions: req.regions, after: req.after, before: req.before } : { form: req.form };
    this.publish({ type: "iso-start", request, note: req.note, asked, tier: req.tier, place });
    const lookup = new Lookup(this.bundle, req.note, this.similar);
    // The request returns at once; the rest happens as events, and ends in exactly one of done, stopped, failed.
    void (async () => {
      let ran: Awaited<ReturnType<typeof rounds>> | null = null, offered = false;
      try {
        const got = ran = await rounds({
          http, provider: this.provider, key, tier: req.tier, messages, lookup, maxTokens, signal: abort.signal, most,
          onText: (delta, again) => this.publish({ type: "iso-text", request, note: req.note, delta, again }),
          onStep: (step) => this.publish({ type: "iso-step", request, note: req.note, step }),
        });
        if (abort.signal.aborted) throw Object.assign(new Error("stopped"), { name: "AbortError" });
        const notices: string[] = got.cut ? ["The reply was cut off at its length limit. Ask for less at once."] : [];
        // What it wrote is fitted to the form here: this, not its instructions, is what limits where its text can go.
        const stamped = async () => this.stamp(`iso:${this.provider.name}/${got.usage.model}`);
        const cost: Cost = { model: got.usage.model, tier: req.tier, tokensIn: got.usage.tokensIn, tokensOut: got.usage.tokensOut, tokensCached: got.usage.tokensCached, usd: got.usage.usd };
        const common = { kind: "proposal" as const, asked, read: lookup.read() };
        let build: () => Promise<Proposal[]>;
        if (req.form !== "rewrite") {
          // A note written for Iso is answered with a note: offered whole, under what they wrote.
          // A title line, against its instructions: the title is theirs.
          const reply = replyText(got.text).replace(/^#\s+.*\n+/, "");
          if (!reply) throw new EngineError("Iso replied with nothing. Ask again, or at another tier.");
          const place = req.form === "insert" ? { after: req.after, before: req.before } : { after: null, before: null };
          build = async () => [{ ...(await stamped()), ...common, form: "insert", ...place, text: reply, cost, ...(notices.length ? { notice: notices.join(" ") } : {}) }];
        } else {
          const parsed = parseRewrite(got.text, olds.length);
          // Only the passages it changed are offered: each is kept or removed on its own.
          const regions = req.regions.flatMap((old, k) => {
            const text = parsed.regions[k];
            if (text === null || text === undefined) return [];
            const next = fitted(old.text, text);
            return next === old.text ? [] : [{ old, new: next }];
          });
          if (!regions.length && !parsed.say) throw new EngineError(parsed.outside ? "Iso replied, but not with a rewrite of what you chose, so nothing is offered. Ask for new text at a point instead, or ask again." : "Iso left what you chose as it is.");
          if (parsed.outside) notices.push("Iso also wrote outside the passages you chose. That part was left out.");
          const notice = notices.length ? { notice: notices.join(" ") } : {};
          // The changes are one proposal; what it says of them is another, in its usual place, kept or removed like any text of its.
          // The request's cost is entered once, with the changes when there are any.
          build = async () => [
            ...(regions.length ? [{ ...(await stamped()), ...common, form: "rewrite" as const, regions, cost, ...notice }] : []),
            ...(parsed.say ? [{ ...(await stamped()), ...common, form: "insert" as const, after: req.after, before: req.before, text: parsed.say, ...(regions.length ? {} : { cost, ...notice }) }] : []),
          ];
        }
        // Entered in their turn among the writes. From here they survive closing the browser.
        const made = await this.one(async () => {
          const ps = await build();
          for (const p of ps) await this.enter(req.note, await this.journal(req.note), p);
          return ps;
        });
        offered = true;
        this.publish({ type: "iso-done", request, note: req.note, proposal: made[0]!.id, ...(made[1] ? { said: made[1].id } : {}), cost });
      } catch (err) {
        if (abort.signal.aborted || (err as Error).name === "AbortError") this.publish({ type: "iso-stopped", request, note: req.note });
        else this.publish({ type: "iso-failed", request, note: req.note, message: (err as Error).message || "Iso could not answer" });
      } finally {
        this.running.delete(request);
        this.asking.delete(req.note);
        // A reply that was paid for and came to nothing is still part of what the session cost.
        if (ran && !offered && ran.usage.usd > 0) {
          const spent = ran.usage;
          void this.one(async () => this.record({ event: "iso-unused", note: req.note, session: await this.sessionNow(), model: spent.model, usd: spent.usd })).catch(() => undefined);
        }
      }
    })();
    return { request };
  }

  /** What a request is sent: the note with its place marked (cut to fit when it is long), the session's earlier
   *  exchanges (cut to fit likewise), and the request. Used to ask, and to say what asking would send. */
  private async compose(req: AskRequest, asked: string): Promise<{ messages: Message[]; parts: Part[]; text: string; olds: string[] }> {
    // The note as it is on disk now: what the journal has not seen is entered first, as for any read.
    const { text } = await this.readNote(req.note);
    const gone = () => new Conflict("the place asked about is no longer in the note", { id: req.note, text, version: hashText(text) });
    let lines = text.split("\n"), keep: number[] = [];
    const olds: string[] = [];
    if (req.form === "note") {
      let body = text;
      try { body = splitFrontmatter(text)[1]; } catch { /* sent as it is */ }
      if (!body.trim()) throw new EngineError("write what you want from Iso first");
      // The notes it links to go with it, as far as there is room; the rest Iso reads with its tools.
      const linked = this.linkedSent(body);
      const earlier = await this.exchangesNow();
      return { ...noteMessages({ tier: req.tier, meaning: Boolean(this.similar), title: this.titleOf(req.note, text), body: windowed(body.split("\n"), [0]), linked, conversation: conversation(earlier), moments: earlier.length }), text, olds };
    }
    if (req.form === "insert") {
      const at = locate(text, { form: "insert", after: req.after, before: req.before } as Proposal);
      if (!at || at.form !== "insert") throw gone();
      const before = at.line > 0 && lines[at.line - 1]!.trim() ? [""] : [];
      lines.splice(at.line, 0, ...before, HERE, ...(at.line < lines.length && lines[at.line]!.trim() ? [""] : []));
      keep = [at.line + before.length];
    } else {
      if (!req.regions.length || req.regions.length > 40) throw new EngineError("choose between one and forty passages to rewrite");
      const places = req.regions.map((r) => findPassage(text, r));
      if (places.some((x) => !x)) throw gone();
      const sorted = places.map((x, n) => ({ ...x!, n })).sort((x, y) => x.from - y.from);
      if (sorted.some((x, k) => k > 0 && x.from < sorted[k - 1]!.to)) throw new EngineError("the passages chosen overlap");
      // Marked from the last to the first, so the places of the earlier ones do not move.
      let marked = text;
      for (const x of [...sorted].reverse()) marked = marked.slice(0, x.from) + OPEN(x.n + 1) + marked.slice(x.from, x.to) + CLOSE(x.n + 1) + marked.slice(x.to);
      olds.push(...req.regions.map((r) => r.text));
      lines = marked.split("\n");
      // Every line of a chosen passage must be sent, however long the note.
      let inside = false;
      for (const [k, l] of lines.entries()) {
        const opens = /⟦\d+⟧/.test(l), closes = /⟦\/\d+⟧/.test(l);
        if (inside || opens || closes) keep.push(k);
        if (opens && !closes) inside = true; else if (closes && !opens) inside = false; else if (opens && closes) inside = l.lastIndexOf("⟦/") < l.search(/⟦\d+⟧(?![\s\S]*⟦\d+⟧)/);
      }
    }
    const title = this.titleOf(req.note, text);
    const entries = await this.journal(req.note);
    // What you chose to send (I3): earlier exchanges and linked notes switched off are left out; with no look-ups,
    // Iso has no tools.
    const off = new Set(req.choice?.off ?? []);
    const earlier = (await this.exchangesNow()).filter((x) => !off.has(`x:${x.id}`));
    let body = text;
    try { body = splitFrontmatter(text)[1]; } catch { /* links read from the whole file */ }
    const given = {
      tier: req.tier, meaning: Boolean(this.similar), title, id: req.note, marked: windowed(lines, keep), asked,
      unkept: pending(entries).map((p) => (p.form === "insert" ? p.text : p.regions.map((r) => r.new).join("\n\n"))),
      conversation: conversation(earlier), moments: earlier.length,
      linked: this.linkedSent(body, off, req.note), lookup: req.choice?.lookup !== false,
    };
    return { ...(req.form === "insert" ? insertMessages(given) : rewriteMessages({ ...given, count: olds.length })), text, olds };
  }

  /** The notes a note's text links to, each once, in order: the note itself left out. */
  private linksOf(body: string, self = ""): { id: string; title: string; body: string }[] {
    const out: { id: string; title: string; body: string }[] = [];
    for (const m of body.matchAll(/\]\(\/([^)\s#]+)\.md(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g)) {
      const c = this.bundle.concepts.get(decodeURIComponent(m[1]!));
      if (c && c.id !== self && !out.some((l) => l.id === c.id)) out.push({ id: c.id, title: c.title, body: c.body.trim() });
    }
    return out;
  }

  /** The linked notes sent with a request, those switched off left out, as far as there is room; the rest Iso
   *  reads with its tools. */
  private linkedSent(body: string, off: ReadonlySet<string> = new Set(), self = ""): { id: string; title: string; text: string }[] {
    const linked: { id: string; title: string; text: string }[] = [];
    let room = LINKED_BUDGET;
    for (const c of this.linksOf(body, self)) {
      if (off.has(`n:${c.id}`)) continue;
      const piece = c.body.slice(0, Math.max(0, room) * 4);
      if (piece.length < Math.min(c.body.length, 400)) break; // no room for a useful part of it
      linked.push({ id: c.id, title: c.title, text: piece + (piece.length < c.body.length ? "\n[…cut: read the rest with read_note]" : "") });
      room -= estimate(piece);
    }
    return linked;
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

  /** The id of the last event that cleared the conversation, or "": exchanges before it are not sent. */
  private cleared: string | undefined;
  private async clearedAt(): Promise<string> {
    if (this.cleared === undefined) {
      const text = await this.opts.own.read(recordPath(this.opts.device));
      this.cleared = readRecord(text ?? "").filter((e) => e.event === "context-cleared").map((e) => e.id).sort().at(-1) ?? "";
    }
    return this.cleared;
  }

  /** The session's exchanges with Iso, across its notes, since the conversation was last cleared. */
  private async exchangesNow(): Promise<Exchange[]> {
    const since = await this.clearedAt(), session = await this.sessionNow(), out: Exchange[] = [];
    const log = await this.sessionEntries();
    // A reply to a note for Iso that was kept is in two journals, the draft's and the new note's: told once, as kept.
    const copied = new Set([...log.values()].flatMap((entries) => entries.flatMap((e) => (e.kind === "proposal" && e.copyOf ? [e.copyOf] : []))));
    for (const [note, entries] of log) {
      // What became of each is read from the note's whole journal: a keep may be in a later session.
      const whole = entries.some((e) => e.kind === "proposal") ? await this.journal(note) : [];
      out.push(...exchanges(note, this.bundle.concepts.get(note)?.title ?? note, whole, session, since));
    }
    return out.filter((x) => !copied.has(x.id));
  }

  /** An event in this device's record of usage (record/<device>.jsonl): what was cleared from Iso's context, what turns cost. */
  private async record(event: Record<string, unknown>): Promise<string> {
    const e = cleanEvent(event, { device: this.opts.device, now: this.opts.clock.now() });
    await this.opts.own.append(recordPath(this.opts.device), JSON.stringify(e) + "\n");
    this.publish({ type: "record", event: String(e.event) });
    return e.id;
  }

  async clearConversation(): Promise<void> {
    this.cleared = await this.one(() => this.record({ event: "context-cleared" }));
  }

  async context(note?: string, choice?: Choice): Promise<ContextReport> {
    let parts: Part[] | null = null, items: ContextItem[] = [];
    // A note for Iso with nothing written in it yet is counted as no note at all.
    if (note && isDraftId(note)) {
      parts = await this.compose({ note, form: "note", tier: "mid" }, "").then((c) => c.parts, () => null);
    } else if (note) {
      ({ parts } = await this.compose({ note, form: "insert", after: null, before: null, asked: "", tier: "mid", ...(choice ? { choice } : {}) }, ""));
      // What can be switched off, each with what it would add (I3): the session's exchanges, and the notes this links to.
      const off = new Set(choice?.off ?? []);
      let body = (await this.readNote(note)).text;
      try { body = splitFrontmatter(body)[1]; } catch { /* links read from the whole file */ }
      items = [
        ...(await this.exchangesNow()).map((x): ContextItem => ({ id: `x:${x.id}`, kind: "exchange", title: x.text.split("\n")[0]!.replace(/^In (.+?) \(\/[^)]*\) they asked[^:]*: /, "$1: "), tokens: estimate(x.text), on: !off.has(`x:${x.id}`) })),
        ...this.linksOf(body, note).map((c): ContextItem => ({ id: `n:${c.id}`, kind: "linked", title: c.title, tokens: estimate(c.body), on: !off.has(`n:${c.id}`) })),
      ];
    }
    if (!parts) {
      // In no note: the instructions, and the conversation as it would be sent.
      const earlier = await this.exchangesNow();
      ({ parts } = insertMessages({ tier: "mid", meaning: Boolean(this.similar), title: "", id: "", marked: "", unkept: [], conversation: conversation(earlier), moments: earlier.length, asked: "" }));
      parts = parts.map((p) => (p.name === "this note" ? { ...p, detail: "none open", tokens: 0 } : p));
    }
    return { tokens: parts.reduce((n, p) => n + p.tokens, 0), limit: this.provider.context ?? 200_000, parts, session: await this.sessionCost(), items, lookup: choice?.lookup !== false };
  }

  /** What the session has cost: every reply offered, kept or not, every turn in Iso's pane, and every reply that came
   *  to nothing. */
  private async sessionCost(): Promise<{ usd: number; requests: number }> {
    const session = await this.sessionNow();
    let usd = 0, requests = 0;
    for (const entries of (await this.sessionEntries()).values()) for (const e of entries) if (e.kind === "proposal" && !e.copyOf && e.cost) { usd += e.cost.usd; requests++; } // a proposal with no cost is the second of one request
    const text = await this.opts.own.read(recordPath(this.opts.device));
    for (const e of readRecord(text ?? "")) if ((e.event === "iso-unused" || e.event === "iso-turn") && e.session === session) { usd += typeof e.usd === "number" ? e.usd : 0; requests++; }
    return { usd, requests };
  }

  // ------------------------------------------------------------ conversations with Iso in its pane (M10)

  /** The turn running in each conversation: one at a time. */
  private readonly conversing = new Map<string, string>();
  /** What Iso asked before doing something, waiting for your answer, by the permission's id. */
  private readonly waitingAnswer = new Map<string, { turn: string; conversation: string; settle: (d: Decision) => void }>();

  async conversation(id?: string): Promise<Conversation | null> {
    const study = this.opts.own;
    if (!id) {
      const names = await study.list(CONVERSATIONS_DIR).catch(() => []);
      id = names.filter((f) => !f.dir && f.name.endsWith(".jsonl")).map((f) => f.name.slice(0, -".jsonl".length)).sort().at(-1);
      if (!id) return null;
    }
    if (!TURN_ID.test(id)) throw new EngineError("not a conversation's id");
    const text = await study.read(conversationPath(id));
    // A turn with no ending in the file was stopped, unless it is running here now.
    return text === null ? null : { id, turns: readTurns(text).map((t) => (this.running.has(t.id) ? { ...t, state: "running" as const } : t)) };
  }

  /** What was given, checked: notes and passages of the base, and its folders. */
  private given(raw: unknown): Given[] {
    if (!Array.isArray(raw) || raw.length > 40) throw new EngineError("give Iso between none and forty notes, folders and passages");
    return raw.map((g: Record<string, unknown>): Given => {
      const id = typeof g?.id === "string" ? g.id.replace(/^\/+|\/+$/g, "") : "";
      if (g?.kind === "folder") { if (id) checkNoteId(id); return { kind: "folder", id }; }
      if (!inBase(checkNoteId(id))) throw new EngineError("only notes of the base are given to Iso");
      if (g?.kind === "note") return { kind: "note", id };
      if (g?.kind === "understanding") return { kind: "understanding", id };
      if (g?.kind === "passage" && typeof g.text === "string" && g.text.trim() && g.text.length <= 20_000) return { kind: "passage", id, text: g.text };
      throw new EngineError("a part given to Iso is a note, a folder or a passage");
    });
  }

  /** The questions still open about a note, by what they name and by embeds of them. */
  private openAbout(id: string): { id: string; title: string }[] {
    return [...this.bundle.concepts.values()].filter((c) => c.kind === "question" && !c.done && c.attached.includes(id)).map((c) => ({ id: c.id, title: c.title }));
  }

  /** What was given, read now, as it is sent. A note that is gone is left out. A note goes with the questions still
   *  open about it, unless they were taken out (`q:<id>` in `off`). */
  private async sentOf(given: readonly Given[], off: ReadonlySet<string> = new Set()): Promise<Sent[]> {
    const out: Sent[] = [];
    for (const g of given) {
      if (g.kind === "folder") {
        const under = g.id ? `${g.id}/` : "";
        out.push({ kind: "folder", id: g.id, notes: [...this.bundle.concepts.values()].filter((c) => c.id.startsWith(under) && inBase(c.id)).map((c) => ({ id: c.id, title: c.title, description: c.description })) });
        continue;
      }
      const c = this.bundle.concepts.get(g.id);
      if (!c) continue;
      if (g.kind === "understanding") {
        const u = await this.understanding(g.id);
        out.push({ kind: "understanding", id: g.id, title: c.title, reading: u.reading });
        continue;
      }
      if (g.kind === "passage") out.push({ kind: "passage", id: g.id, title: c.title, text: g.text });
      else {
        const open = this.openAbout(g.id).filter((q) => !off.has(`q:${q.id}`));
        out.push({ kind: "note", id: g.id, title: c.title, text: (await this.readNote(g.id)).text, ...(c.kind !== "note" ? { of: c.kind } : {}), ...(open.length ? { open } : {}) });
      }
    }
    return out;
  }

  async turnContext(req: Omit<TurnRequest, "asked">): Promise<ContextReport> {
    const mode = req.mode === "build" ? "ask" : req.mode;
    const all = req.conversation ? (await this.conversation(req.conversation))?.turns ?? [] : [];
    const off = new Set(req.off ?? []), earlier = all.filter((t) => !off.has(t.id));
    const given = this.given(req.given ?? []), sent = await this.sentOf(given, off);
    const { parts } = turnMessages({ mode, tier: req.tier, meaning: Boolean(this.similar), lookup: req.lookup !== false, earlier, sent, asked: "" });
    // Each earlier turn can be left out (M9's switches, kept for the pane): what it adds, whole.
    const items = all.map((t): ContextItem => ({ id: t.id, kind: "exchange", title: t.asked, tokens: estimate(turnExchange(t).text), on: !off.has(t.id) }));
    // The open questions about each note given, each sent or taken out (M12).
    const asked = new Set<string>();
    for (const g of given) if (g.kind === "note") for (const q of this.openAbout(g.id)) {
      if (asked.has(q.id)) continue;
      asked.add(q.id);
      items.push({ id: `q:${q.id}`, kind: "question", title: q.title, tokens: estimate(`- ${q.title} (/${q.id}.md)`), on: !off.has(`q:${q.id}`) });
    }
    return { tokens: parts.reduce((n, p) => n + p.tokens, 0), limit: this.provider.context ?? 200_000, parts, session: await this.sessionCost(), items, lookup: req.lookup !== false,
      given: sent.map((g) => ({ kind: g.kind, id: g.id, ...(g.kind === "passage" ? { text: g.text } : {}), tokens: estimate(sentText(g)) })) };
  }

  async converse(req: TurnRequest): Promise<{ conversation: string; turn: string }> {
    const http = this.opts.http, study = this.opts.own;
    if (!http) throw new EngineError("Iso cannot be asked here", 409);
    if (!(MODES as readonly string[]).includes(req.mode)) throw new EngineError("the mode is ask, write or build");
    if (req.mode === "build") throw new EngineError("Build mode is the terminal's: start isorite term", 409);
    if (!TIERS.includes(req.tier)) throw new EngineError("the tier is low, mid or max");
    const asked = String(req.asked ?? "").trim();
    if (!asked) throw new EngineError("say what you want from Iso");
    if (asked.length > MAX_ASKED) throw new EngineError("that is too long to ask at once", 413);
    const given = this.given(req.given ?? []);
    if (req.conversation !== undefined && !TURN_ID.test(req.conversation)) throw new EngineError("not a conversation's id");
    const conversation = req.conversation ?? newId(this.opts.clock.now());
    // Claimed before anything is awaited, so a message sent twice is one turn.
    if (this.conversing.has(conversation)) throw new EngineError("Iso is still answering in this conversation. Wait for it, or stop it.", 409);
    this.conversing.set(conversation, "");
    try { return { conversation, turn: await this.beginTurn(conversation, { ...req, mode: req.mode, asked, given }, http) }; }
    catch (err) { this.conversing.delete(conversation); throw err; }
  }

  private async beginTurn(conversation: string, req: TurnRequest & { mode: Exclude<TurnRequest["mode"], "build"> }, http: Http): Promise<string> {
    const study = this.opts.own;
    const key = (await this.opts.secrets?.get(KEY)) ?? null;
    if (!key && /\/\/(?:[^/]*\.)?openrouter\.ai\b/.test(this.provider.url)) throw new EngineError("There is no provider key yet. Set one in settings, behind the logo.", 409);
    const off = new Set(req.off ?? []), earlier = ((await this.conversation(conversation))?.turns ?? []).filter((t) => !off.has(t.id));
    const lookupOn = req.lookup !== false, mode = req.mode, sent = await this.sentOf(req.given, off), own = turnTools(mode, sent);
    const { messages } = turnMessages({ mode, tier: req.tier, meaning: Boolean(this.similar), lookup: lookupOn, earlier, sent, asked: req.asked, broken: await this.brokenNews("iso") });

    // A turn is of the session as a journal entry is, and carries it on.
    const s = await this.stamp("you"), turn = s.id, abort = new AbortController(), path = conversationPath(conversation);
    this.last = { at: s.at, session: s.session };
    const line = (l: TurnLine) => this.one(() => study.append(path, JSON.stringify(l) + "\n"));
    await line({ kind: "turn", id: turn, conversation, at: s.at, session: s.session, mode, asked: req.asked, given: req.given, tier: req.tier });
    this.running.set(turn, abort);
    this.conversing.set(conversation, turn);
    this.publish({ type: "iso-start", request: turn, note: "", asked: req.asked, tier: req.tier, place: { form: "turn", conversation, mode, given: req.given } });
    const item = async (i: TurnItem): Promise<void> => { await line({ kind: "item", turn, item: i }); this.publish({ type: "iso-item", request: turn, conversation, item: i }); };
    const who = `iso:${this.provider.name}/${this.provider.tiers[req.tier]}`;

    const lookup = new Lookup(this.bundle, req.given.find((g) => g.kind !== "folder")?.id ?? "", this.similar);
    const looks = new Set(lookup.defs().map((d) => d.function.name));
    const tools: Tools = {
      defs: () => [...(lookupOn ? lookup.defs() : []), ...own],
      call: async (name, raw) => {
        if (looks.has(name)) return lookupOn ? lookup.call(name, raw) : { text: "Looking things up is off: they chose what you are sent." };
        let args: Record<string, unknown> = {};
        try { const parsed: unknown = raw.trim() ? JSON.parse(raw) : {}; if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>; } catch { /* no arguments */ }
        if (!own.some((d) => d.function.name === name)) return { text: `There is no tool ${name} in ${mode} mode.` };
        return { text: await this.turnTool(name, args, { turn, conversation, mode, item, signal: abort.signal, who, asked: req.asked }) };
      },
    };

    const release = () => { this.running.delete(turn); this.conversing.delete(conversation); };
    void (async () => {
      try {
        const got = await rounds({
          http, provider: this.provider, key, tier: req.tier, messages, lookup: tools, maxTokens: REPLY_TOKENS * 2, signal: abort.signal, most: ROUNDS[req.tier],
          onText: (delta, again) => this.publish({ type: "iso-text", request: turn, note: "", delta, again }),
          onStep: (step) => { void item({ kind: "look", step }); this.publish({ type: "iso-step", request: turn, note: "", step }); },
        });
        if (abort.signal.aborted) throw Object.assign(new Error("stopped"), { name: "AbortError" });
        const cost: Cost = { model: got.usage.model, tier: req.tier, tokensIn: got.usage.tokensIn, tokensOut: got.usage.tokensOut, tokensCached: got.usage.tokensCached, usd: got.usage.usd };
        const said = got.text.trim() + (got.cut ? "\n\n[Cut off at its length limit.]" : "");
        if (said) await item({ kind: "text", text: said });
        await line({ kind: "end", turn, state: "done", cost });
        if (cost.usd > 0) await this.one(async () => this.record({ event: "iso-turn", conversation, turn, session: s.session, model: cost.model, usd: cost.usd }));
        // Free before it is said to be done, so a message sent at once is not refused.
        release();
        this.publish({ type: "iso-done", request: turn, note: "", proposal: "", cost });
      } catch (err) {
        const stopped = abort.signal.aborted || (err as Error).name === "AbortError";
        const message = (err as Error).message || "Iso could not answer";
        await line(stopped ? { kind: "end", turn, state: "stopped" } : { kind: "end", turn, state: "failed", message }).catch(() => undefined);
        release();
        if (stopped) this.publish({ type: "iso-stopped", request: turn, note: "" });
        else this.publish({ type: "iso-failed", request: turn, note: "", message });
      } finally {
        release();
        for (const [id, w] of this.waitingAnswer) if (w.turn === turn) { this.waitingAnswer.delete(id); w.settle("reject"); }
      }
    })();
    return turn;
  }

  /** What you allowed for the rest of a conversation ("always"): by conversation, the tools. */
  private readonly allowed = new Map<string, Set<string>>();

  /** Ask you before doing something; wait for your answer. "always" holds for the rest of the conversation. */
  private async permit(t: TurnCtx, tool: string, note: string, what: string): Promise<Decision> {
    if (this.allowed.get(t.conversation)?.has(tool)) return "always";
    const id = newId(this.opts.clock.now());
    const answer = new Promise<Decision>((settle) => this.waitingAnswer.set(id, { turn: t.turn, conversation: t.conversation, settle }));
    await t.item({ kind: "permission", id, tool, note, what });
    const stop = new Promise<Decision>((settle) => t.signal.addEventListener("abort", () => settle("reject"), { once: true }));
    const d = await Promise.race([answer, stop]);
    this.waitingAnswer.delete(id);
    if (d === "always") this.allowed.set(t.conversation, new Set([...(this.allowed.get(t.conversation) ?? []), tool]));
    return d;
  }

  /** A note's id as Iso writes one for a new note: folder/name, without a leading slash or `.md`. */
  private newNoteId(raw: unknown): string | null {
    const id = String(raw ?? "").trim().replace(/^\/+|\/+$/g, "").replace(/\.md$/i, "");
    try { checkNoteId(id); } catch { return null; }
    return inBase(id) ? id : null;
  }

  /** One of a mode's own tools, in a turn: what is said back to Iso. */
  private async turnTool(name: string, args: Record<string, unknown>, t: TurnCtx): Promise<string> {
    const title = (id: string): string => this.bundle.concepts.get(id)?.title ?? id;
    if (name === "point_to_note") {
      const id = noteId(this.bundle, args.id);
      if (!id) return `There is no note ${String(args.id ?? "")}.`;
      await t.item({ kind: "point", note: id, why: String(args.why ?? "").trim().slice(0, 300) });
      return `${title(id)} is marked on their Atlas.`;
    }
    const counted = (before: string, after: string) => {
      const hunks = diffLines(before.split("\n"), after.split("\n"));
      return { added: hunks.reduce((n, h) => n + h.ins.length, 0), removed: hunks.reduce((n, h) => n + h.del.length, 0) };
    };
    if (name === "edit_note") {
      const id = noteId(this.bundle, args.id);
      if (!id) return `There is no note ${String(args.id ?? "")}. Search for it by its words.`;
      const old = String(args.old ?? ""), next = String(args.new ?? "");
      if (!old) return "Give the passage as it is now, in old.";
      const now = await this.readNote(id);
      const at = now.text.indexOf(old), again = at < 0 ? -1 : now.text.indexOf(old, at + 1);
      if (at < 0) return `That passage is not in ${title(id)} as you wrote it. Read the note again and give the passage exactly.`;
      if (again >= 0) return `That passage occurs more than once in ${title(id)}. Give more of it, so it is found once.`;
      const text = now.text.slice(0, at) + next + now.text.slice(at + old.length);
      const saved = await this.one(() => this.put(id, text, now.version, "edit", { asked: t.asked }, t.who));
      if (saved.entry) await t.item({ kind: "change", note: id, entry: saved.entry, why: "edit", title: title(id), ...counted(now.text, text) });
      return `Changed ${title(id)}.`;
    }
    if (name === "write_note") {
      const id = this.newNoteId(args.id);
      if (!id) return `${String(args.id ?? "")} is not a note's id in their base: give folder/name, lower case with hyphens.`;
      let text = String(args.text ?? "");
      if (!text.trim()) return "Give the note's whole text.";
      if (!/^---\n/.test(text)) text = `---\ntype: Concept\ntitle: ${JSON.stringify(/^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? id.split("/").at(-1)!.replace(/-/g, " "))}\n---\n\n${text.replace(/^#\s+.+\n+/, "")}`;
      const was = this.bundle.concepts.has(id) ? await this.readNote(id) : null;
      const saved = await this.one(() => this.put(id, text, was?.version ?? null, "edit", { asked: t.asked }, t.who));
      if (saved.entry) await t.item({ kind: "change", note: id, entry: saved.entry, why: was ? "edit" : "create", title: title(id), ...counted(was?.text ?? "", text) });
      return was ? `Wrote ${title(id)} anew.` : `Made ${title(id)} (/${id}.md).`;
    }
    if (name === "move_note") {
      const id = noteId(this.bundle, args.id), to = this.newNoteId(args.to);
      if (!id) return `There is no note ${String(args.id ?? "")}.`;
      if (!to) return `${String(args.to ?? "")} is not a note's id in their base.`;
      if ((await this.permit(t, "move_note", id, `move ${title(id)} to ${to}`)) === "reject") return "They did not allow it. It was not moved.";
      const now = await this.readNote(id), before = title(id);
      try { await this.moveNote(id, to, now.version, t.who); } catch (e) { return `It could not be moved: ${(e as Error).message}`; }
      const entry = (await this.journal(to)).at(-1)?.id ?? "";
      await t.item({ kind: "change", note: to, entry, why: "move", to, title: before, added: 0, removed: 0 });
      return `Moved ${before} to /${to}.md.`;
    }
    if (name === "delete_note") {
      const id = noteId(this.bundle, args.id);
      if (!id) return `There is no note ${String(args.id ?? "")}.`;
      if ((await this.permit(t, "delete_note", id, `delete ${title(id)}`)) === "reject") return "They did not allow it. It was not deleted.";
      const now = await this.readNote(id), before = title(id);
      try { await this.deleteNote(id, now.version, t.who); } catch (e) { return `It could not be deleted: ${(e as Error).message}`; }
      await t.item({ kind: "change", note: id, entry: (await this.journal(id)).at(-1)?.id ?? "", why: "delete", title: before, added: 0, removed: now.text.split("\n").length });
      return `Deleted ${before}. Its history stays.`;
    }
    if (name === "ask_question") {
      const asked = String(args.title ?? "").trim().replace(/\s+/g, " ").slice(0, 200);
      if (!asked) return "Give the question, in title.";
      const about = [...new Set((Array.isArray(args.about) ? args.about : [args.about]).map((a) => noteId(this.bundle, a)).filter((a): a is string => Boolean(a)))];
      if (!about.length) return "Give the ids of the notes it is about, in about.";
      const body = String(args.text ?? "").trim().slice(0, 4000);
      const q: Extract<TurnItem, { kind: "question" }> = { kind: "question", id: newId(this.opts.clock.now()), title: asked, text: body, about };
      // Where Iso may change the notes it makes the question itself; elsewhere it is offered, for you to make.
      if (t.mode !== "write") { await t.item(q); return "It is put to them. They can make it a question note."; }
      const made = await this.one(() => this.makeQuestion(q, t.who, t.asked));
      await t.item({ ...q, made: made.id });
      if (made.entry) await t.item({ kind: "change", note: made.id, entry: made.entry, why: "create", title: asked, ...counted("", made.text) });
      return `Made the question ${asked} (/${made.id}.md).`;
    }
    if (name === "offer_text") {
      const id = noteId(this.bundle, args.id);
      if (!id) return `There is no note ${String(args.id ?? "")}.`;
      const text = String(args.text ?? "").trim().slice(0, 8000);
      if (!text) return "Give the passage, in text.";
      await t.item({ kind: "offer", id: newId(this.opts.clock.now()), note: id, text });
      return `It is offered to them for ${title(id)}.`;
    }
    if (name === "write_understanding") {
      const id = noteId(this.bundle, args.id);
      if (!id) return `There is no note ${String(args.id ?? "")}.`;
      const reading = String(args.reading ?? "").trim();
      if (!reading) return "Give your reading.";
      const uid = understandingId(id), was = await this.readNote(uid).catch(() => null);
      const text = understandingText(id, title(id), { ...parseUnderstanding(was?.text ?? null), reading });
      const saved = await this.one(() => this.put(uid, text, was?.version ?? null, "edit", {}, t.who));
      if (saved.entry) await t.item({ kind: "change", note: uid, entry: saved.entry, why: was ? "edit" : "create", title: `Understanding · ${title(id)}`, added: 0, removed: 0 });
      return `Your reading of ${title(id)} is written.`;
    }
    return `${name} cannot be used yet.`;
  }

  /** A note's Understanding note (M10): Iso's reading and your scratchpad. */
  async understanding(note: string): Promise<UnderstandingReport> {
    if (!inBase(checkNoteId(note))) throw new EngineError("only a note of the base has an Understanding note");
    const uid = understandingId(note);
    const source = await this.readNote(uid).catch(() => null);
    return { note, ...parseUnderstanding(source?.text ?? null), version: source?.version ?? null };
  }

  /** Your scratchpad in a note's Understanding note: yours alone; Iso does not write it. `base` as for saveNote, or
   *  null when there is no Understanding note yet. */
  async saveScratchpad(note: string, scratchpad: string, base: string | null): Promise<UnderstandingReport> {
    if (!inBase(checkNoteId(note))) throw new EngineError("only a note of the base has an Understanding note");
    const uid = understandingId(note), was = await this.readNote(uid).catch(() => null);
    const title = this.bundle.concepts.get(note)?.title ?? note;
    await this.one(() => this.put(uid, understandingText(note, title, { ...parseUnderstanding(was?.text ?? null), scratchpad }), base));
    return this.understanding(note);
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

  /** Take what Iso put to you in a turn (M12): a question, made a question note as yours; or an offer of your own
   *  answers, inserted at the end of its note as yours. */
  async takeItem(conversation: string, turn: string, item: string): Promise<{ note: string }> {
    const c = await this.conversation(conversation);
    const t = c?.turns.find((x) => x.id === turn);
    const i = t?.items.find((x) => (x.kind === "question" || x.kind === "offer") && x.id === item) as Extract<TurnItem, { kind: "question" | "offer" }> | undefined;
    if (!i) throw new EngineError("there is no such question or offer in that turn", 404);
    if (i.kind === "question" ? i.made : i.taken) throw new EngineError(i.kind === "question" ? "that question is a note already" : "that was inserted already", 409);
    let note: string;
    if (i.kind === "question") note = (await this.one(() => this.makeQuestion(i, "you"))).id;
    else {
      if (!this.bundle.concepts.has(i.note)) throw new EngineError("the note it was for is gone", 409);
      const now = await this.readNote(i.note);
      await this.one(() => this.put(i.note, `${now.text.replace(/\s*$/, "")}\n\n${i.text}\n`, now.version));
      note = i.note;
    }
    await this.one(() => this.opts.own.append(conversationPath(conversation), JSON.stringify({ kind: "taken", turn, item, note } satisfies TurnLine) + "\n"));
    this.publish({ type: "iso-taken", request: turn, conversation, item, note });
    return { note };
  }

  async undoTurn(conversation: string, turn: string): Promise<{ notes: string[]; left: string[] }> {
    const c = await this.conversation(conversation);
    const t = c?.turns.find((x) => x.id === turn);
    if (!t) throw new EngineError("there is no such turn", 404);
    if (t.state === "running") throw new EngineError("wait for Iso to finish, or stop it, first", 409);
    if (t.items.some((i) => i.kind === "undone")) throw new EngineError("that turn was undone already", 409);
    const changes = t.items.filter((i): i is Extract<TurnItem, { kind: "change" }> => i.kind === "change");
    const notes: string[] = [], left: string[] = [];
    // Newest first, so a note changed twice goes back past both.
    const done = new Set<string>();
    for (const ch of [...changes].reverse()) {
      const key = ch.why === "move" ? ch.to! : ch.note;
      if (done.has(key)) continue;
      done.add(key);
      try {
        if (ch.why === "delete") {
          const entries = await this.journal(ch.note);
          const was = replay(entries)?.text;
          if (was === undefined || this.bundle.concepts.has(ch.note)) { left.push(ch.note); continue; }
          await this.createNote(ch.note, was);
        } else if (ch.why === "move") {
          const from = (await this.journal(ch.to!)).find((e) => e.id === ch.entry);
          const back = from && "from" in from ? from.from : undefined;
          if (!back || !this.bundle.concepts.has(ch.to!)) { left.push(ch.to!); continue; }
          await this.moveNote(ch.to!, back, (await this.readNote(ch.to!)).version);
        } else {
          // Back to before the turn's first change of this note, if nothing has changed it since its last.
          const entries = await this.journal(ch.note);
          const mine = changes.filter((x) => x.note === ch.note && x.why !== "move").map((x) => x.entry);
          const first = entries.findIndex((e) => mine.includes(e.id)), last = entries.findLastIndex((e) => e.kind === "change");
          if (first < 0 || !mine.includes(entries[last]?.id ?? "")) { left.push(ch.note); continue; }
          const now = await this.readNote(ch.note);
          if (hashText(now.text) !== hashText(replay(entries)!.text)) { left.push(ch.note); continue; }
          // Made in the turn: it goes.
          if (first === 0) await this.deleteNote(ch.note, now.version);
          else await this.restore(ch.note, entries.slice(0, first).findLast((e) => e.kind === "change")!.id, now.version);
        }
        notes.push(key);
      } catch { left.push(key); }
    }
    const item: TurnItem = { kind: "undone", notes, left };
    await this.one(() => this.opts.own.append(conversationPath(conversation), JSON.stringify({ kind: "item", turn, item } satisfies TurnLine) + "\n"));
    this.publish({ type: "iso-item", request: turn, conversation, item });
    return { notes, left };
  }

  async answer(turn: string, permission: string, decision: Decision): Promise<void> {
    if (!["once", "always", "reject"].includes(decision)) throw new EngineError("the answer is once, always or reject");
    const w = this.waitingAnswer.get(permission);
    if (!w || w.turn !== turn) throw new EngineError("Iso is not waiting for that answer", 409);
    this.waitingAnswer.delete(permission);
    await this.one(() => this.opts.own.append(conversationPath(w.conversation), JSON.stringify({ kind: "answer", turn, permission, decision } satisfies TurnLine) + "\n"));
    this.publish({ type: "iso-answer", request: turn, conversation: w.conversation, permission, decision });
    w.settle(decision);
  }

  // ------------------------------------------------------------ notes for Iso

  async drafts(): Promise<DraftSummary[]> {
    const own = this.opts.own;
    const out: DraftSummary[] = [];
    for (const info of await own.list(DRAFT_DIR)) {
      if (info.dir || !info.name.endsWith(".md")) continue;
      const id = DRAFT_PREFIX + info.name.slice(0, -3), text = (await own.read(`${DRAFT_DIR}/${info.name}`)) ?? "";
      out.push({ id, title: this.titleOf(id, text) });
    }
    return out.sort((a, b) => (a.id < b.id ? 1 : -1)); // ids begin with the time: newest first
  }

  async createDraft(): Promise<NoteSource> {
    const id = DRAFT_PREFIX + newId(this.opts.clock.now()).toLowerCase();
    return this.createNote(id, "---\ntype: Concept\ntitle: \"\"\n---\n\n");
  }

  /** The draft's file is removed; its journal stays, as every journal does. */
  async discardDraft(draft: string): Promise<void> {
    if (!isDraftId(draft)) throw new EngineError("not a note for Iso");
    const { files, path } = this.where(draft);
    await this.one(() => files.remove(path));
    this.publish({ type: "note-changed", id: draft, version: null, who: "you" });
  }

  async keepDraft(draft: string, proposal: string, folder: string): Promise<Saved> {
    if (!isDraftId(draft)) throw new EngineError("not a note for Iso");
    const { p } = await this.waiting(draft, proposal);
    const source = await this.readNote(draft);
    const title = this.titleOf(draft, source.text);
    const name = title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
    if (!name || title === bare(draft)) throw new EngineError("give the note a title before keeping it");
    const id = [folder.trim().replace(/^\/+|\/+$/g, ""), name].filter(Boolean).join("/");
    // The note begins as its title alone, yours; Iso's text is then offered in it and kept, so its journal says
    // who wrote what and what was asked, as for any text of Iso's.
    await this.createNote(id, `---\ntype: Concept\ntitle: ${JSON.stringify(title)}\n---\n`);
    let asked = source.text;
    try { asked = splitFrontmatter(source.text)[1].trim(); } catch { /* the whole of it */ }
    const copy = await this.one(async () => {
      const entry = { ...p, ...(await this.stamp(p.who)), asked, after: null, before: null, copyOf: p.id } as Proposal;
      await this.enter(id, await this.journal(id), entry);
      return entry;
    });
    const kept = await this.keep(id, copy.id);
    // The draft has become the note: it is settled in its own journal, and its file goes.
    await this.one(async () => this.enter(draft, await this.journal(draft), { ...(await this.stamp("you")), kind: "discard", proposal }));
    await this.discardDraft(draft);
    return kept;
  }

  async stop(request: string): Promise<void> {
    this.running.get(request)?.abort();
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

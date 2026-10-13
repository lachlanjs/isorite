// The engine: one knowledge base and its study base, open. Every write to a
// note goes through `saveNote` or `createNote` here, one at a time, which is
// what keeps the journal true to the file (docs/architecture.md, section 3).

import {
  Bundle, SearchIndex, STUDY_DIR, STUDY_PREFIX, blocks, change, findAnchor, hashText, isStudyId, cleanEvent, journalLine, journalPath, locate, newId, pending, readJournal, readRecord, recordPath, reconcile, splitFrontmatter, stamp, written,
  type Cost, type Entry, type FileEntry, type Insert, type Proposal, type Rewrite, type Stamp,
} from "@isorite/core";
import { Conflict, EngineError, type Api, type AskRequest, type ContextReport, type DraftSummary, type EngineEvent, type Listing, type NoteSource, type Saved, type SearchHit, type Session, type Settings } from "./api.ts";
import { CLOSE, HERE, LINKED_BUDGET, OPEN, conversation, estimate, exchanges, insertMessages, noteMessages, parseRewrite, replyText, rewriteMessages, windowed, type Exchange, type Part } from "./iso.ts";
import { rounds } from "./loop.ts";
import { Lookup, type Similar } from "./lookup.ts";
import { Meaning, type Embedder } from "./meaning.ts";
import { KEY, OPENROUTER, TIERS, type Message, type ProviderConfig } from "./provider.ts";
import type { Clock, Files, Http, Secrets } from "./ports.ts";

/** The largest note taken. */
export const MAX_NOTE_BYTES = 2_000_000;

export interface EngineOptions {
  /** The knowledge base's folder. */
  notes: Files;
  /** The study base's folder, or null in project mode: no journal is kept. */
  study: Files | null;
  clock: Clock;
  device: string;
  name: string;
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
}

/** The longest request and the longest reply asked for, in characters and tokens. */
export const MAX_ASKED = 4000, REPLY_TOKENS = 2500, NOTE_TOKENS = 6000;

/** Notes for Iso that are not in the base yet: files of the study base, under this prefix wherever notes are named. */
export const DRAFT_PREFIX = "@draft/", DRAFT_DIR = "drafts";
export const isDraftId = (id: string): boolean => id.startsWith(DRAFT_PREFIX);
/** A note's id without the prefix that says which folder of the study base it is in. */
const bare = (id: string): string => (isStudyId(id) ? id.slice(STUDY_PREFIX.length) : isDraftId(id) ? id.slice(DRAFT_PREFIX.length) : id);
/** In the knowledge base itself: neither an exercise nor a draft. */
const inBase = (id: string): boolean => !isStudyId(id) && !isDraftId(id);

const BAD_PART = /^\.|[\0\\:*?"<>|]|^\s|\s$/;

/** A note's id, checked before it becomes a path: no "..", nothing hidden, no absolute path. */
export function checkNoteId(id: string): string {
  const parts = id.split("/");
  if (!id || id.length > 400 || parts.some((p) => !p || BAD_PART.test(p))) throw new EngineError(`not a note's id: ${JSON.stringify(id)}`);
  return id;
}

async function walk(files: Files, root: string): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  const visit = async (dir: string): Promise<void> => {
    for (const info of await files.list(root + dir)) {
      if (info.name.startsWith(".")) continue; // .git, and anything else hidden
      const path = dir ? `${dir}/${info.name}` : info.name;
      if (info.dir) {
        out.push({ path, dir: true });
        await visit(path);
      } else if (info.name.endsWith(".md")) {
        const text = await files.read(root + path);
        if (text !== null) out.push({ path, text });
      } else out.push({ path });
    }
  };
  await visit("");
  return out;
}

export class Engine implements Api {
  private readonly opts: EngineOptions;
  private files = new Map<string, FileEntry>();
  private built: Bundle | null = null;
  private index: SearchIndex | null = null;
  private readonly listeners = new Set<(event: EngineEvent) => void>();
  /** The newest entry made anywhere in the study base: it decides the session. Undefined until looked for. */
  private last: Pick<Stamp, "at" | "session"> | null | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  /** Requests to Iso that are running, by id, and the note each is for: a note is asked one thing at a time. */
  private readonly running = new Map<string, AbortController>();
  private readonly asking = new Map<string, string>();

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
    return { name: this.opts.name, study: this.opts.study !== null, device: this.opts.device };
  }

  async notes(): Promise<Listing> {
    const notes = [...this.bundle.concepts.values()].map((c) => ({ id: c.id, title: c.title, description: c.description, type: c.type, dir: c.directory }));
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

  async journal(id: string): Promise<Entry[]> {
    checkNoteId(bare(id));
    if (!this.opts.study) return [];
    return readJournal((await this.opts.study.read(journalPath(id))) ?? "");
  }

  async search(query: string): Promise<SearchHit[]> {
    this.index ??= new SearchIndex(this.bundle);
    return this.index.search(query, { limit: 30 }).map((h) => ({ id: h.concept.id, title: h.concept.title, snippet: h.snippet }));
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

  /** Writes happen one at a time, in the order asked. */
  private one<T>(act: () => Promise<T>): Promise<T> {
    const run = this.queue.then(act, act);
    this.queue = run.catch(() => undefined);
    return run;
  }

  /** Where a note's file is: study notes (`@study/…`) are in the study base's own folder of notes. */
  private where(id: string): { files: Files; path: string } {
    if (!inBase(id)) {
      if (!this.opts.study) throw new EngineError("there is no study base open", 404);
      return { files: this.opts.study, path: `${isDraftId(id) ? DRAFT_DIR : STUDY_DIR}/${checkNoteId(bare(id))}.md` };
    }
    return { files: this.opts.notes, path: `${checkNoteId(id)}.md` };
  }

  private async put(id: string, text: string, base: string | null): Promise<Saved> {
    const { files, path } = this.where(id);
    if (text.length > MAX_NOTE_BYTES) throw new EngineError("note too large", 413);
    const now = await files.read(path);
    if (base === null && now !== null) throw new EngineError(`there is already a note at ${id}`, 409);
    if (base !== null && now === null) throw new Conflict(`${id} is gone`, null);

    // What the file holds that the journal has not seen is entered first, as made elsewhere.
    const entries = await this.journal(id);
    if (now !== null) await this.enter(id, entries, reconcile(entries, now, await this.stamp("external")));
    if (now !== null && base !== hashText(now)) throw new Conflict(`${id} was changed since you opened it`, { id, text: now, version: hashText(now) });
    if (now === text) return { id, text, version: hashText(text), changed: false };

    await files.write(path, text);
    await this.enter(id, entries, change(entries, text, await this.stamp("you"), "edit"));
    if (inBase(id)) {
      this.files.set(path, { path, text });
      this.built = this.index = null;
      this.embedSoon();
    }
    const version = hashText(text);
    this.publish({ type: "note-changed", id, version, who: "you" });
    return { id, text, version, changed: true };
  }

  // ------------------------------------------------------------ Iso

  private get provider(): ProviderConfig { return this.opts.provider ?? OPENROUTER; }

  async settings(): Promise<Settings> {
    return { provider: this.provider.name, key: Boolean(await this.opts.secrets?.get(KEY)), tiers: this.provider.tiers };
  }

  async setKey(key: string | null): Promise<Settings> {
    if (!this.opts.secrets) throw new EngineError("keys cannot be kept here", 409);
    const clean = key?.trim() || null;
    if (clean && (clean.length > 400 || /\s/.test(clean))) throw new EngineError("that does not look like a key");
    await this.opts.secrets.set(KEY, clean);
    return this.settings();
  }

  async ask(req: AskRequest): Promise<{ request: string }> {
    const http = this.opts.http;
    if (!http) throw new EngineError("Iso cannot be asked here", 409);
    if (!this.opts.study) throw new EngineError("Iso's text is kept in a study base until you keep it, and none is open (isorite study init)", 409);
    if (isStudyId(req.note)) throw new EngineError("Iso is asked in a note of the knowledge base for now");
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

    const { messages, all, chosen } = await this.compose(req, asked);
    const olds = chosen.map((k) => all[k]!.text);
    const maxTokens = req.form === "insert" ? REPLY_TOKENS : req.form === "note" ? NOTE_TOKENS : Math.max(REPLY_TOKENS, Math.ceil(olds.join("").length / 3) + 1000);

    const request = newId(this.opts.clock.now()), abort = new AbortController();
    this.running.set(request, abort);
    this.asking.set(req.note, request);
    const place = req.form === "insert" ? { form: req.form, after: req.after, before: req.before } : req.form === "rewrite" ? { form: req.form, blocks: req.blocks } : { form: req.form };
    this.publish({ type: "iso-start", request, note: req.note, asked, tier: req.tier, place });
    const lookup = new Lookup(this.bundle, req.note, this.similar);
    // The request returns at once; the rest happens as events, and ends in exactly one of done, stopped, failed.
    void (async () => {
      let ran: Awaited<ReturnType<typeof rounds>> | null = null, offered = false;
      try {
        const got = ran = await rounds({
          http, provider: this.provider, key, tier: req.tier, messages, lookup, maxTokens, signal: abort.signal,
          onText: (delta, again) => this.publish({ type: "iso-text", request, note: req.note, delta, again }),
          onStep: (step) => this.publish({ type: "iso-step", request, note: req.note, step }),
        });
        if (abort.signal.aborted) throw Object.assign(new Error("stopped"), { name: "AbortError" });
        const notices: string[] = got.cut ? ["The reply was cut off at its length limit. Ask for less at once."] : [];
        // What it wrote is fitted to the form here: this, not its instructions, is what limits where its text can go.
        let body: Pick<Insert, "form" | "after" | "before" | "text"> | Pick<Rewrite, "form" | "blocks">;
        if (req.form !== "rewrite") {
          // A note written for Iso is answered with a note: offered whole, under what they wrote.
          const reply = replyText(got.text).replace(/^#\s+.*\n+/, ""); // a title line, against its instructions: the title is theirs
          if (!reply) throw new EngineError("Iso replied with nothing. Ask again, or at another tier.");
          body = { form: "insert", after: req.form === "insert" ? req.after : null, before: req.form === "insert" ? req.before : null, text: reply };
        } else {
          const parsed = parseRewrite(got.text, chosen.length);
          if (parsed.blocks.every((b, k) => b === null || b === olds[k])) throw new EngineError(parsed.outside ? "Iso replied, but not with a rewrite of the paragraphs you chose, so nothing is offered. Ask for new text at a point instead, or ask again." : "Iso left the paragraphs as they are.");
          if (parsed.outside) notices.push("Iso also wrote outside the paragraphs you chose. That part was left out.");
          body = { form: "rewrite", blocks: req.blocks.map((old, k) => ({ old, new: parsed.blocks[k] ?? olds[k]! })) };
        }
        const cost: Cost = { model: got.usage.model, tier: req.tier, tokensIn: got.usage.tokensIn, tokensOut: got.usage.tokensOut, tokensCached: got.usage.tokensCached, usd: got.usage.usd };
        // Entered in its turn among the writes. From here it survives closing the browser.
        const proposal = await this.one(async () => {
          const p = {
            ...(await this.stamp(`iso:${this.provider.name}/${got.usage.model}`)), kind: "proposal", asked, ...body, cost, read: lookup.read(),
            ...(notices.length ? { notice: notices.join(" ") } : {}),
          } as Proposal;
          await this.enter(req.note, await this.journal(req.note), p);
          return p;
        });
        offered = true;
        this.publish({ type: "iso-done", request, note: req.note, proposal: proposal.id, cost });
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
  private async compose(req: AskRequest, asked: string): Promise<{ messages: Message[]; parts: Part[]; text: string; all: ReturnType<typeof blocks>; chosen: number[] }> {
    // The note as it is on disk now: what the journal has not seen is entered first, as for any read.
    const { text } = await this.readNote(req.note);
    const gone = () => new Conflict("the place asked about is no longer in the note", { id: req.note, text, version: hashText(text) });
    const lines = text.split("\n"), all = blocks(text);
    let chosen: number[] = [], keep: number[] = [];
    if (req.form === "note") {
      let body = text;
      try { body = splitFrontmatter(text)[1]; } catch { /* sent as it is */ }
      if (!body.trim()) throw new EngineError("write what you want from Iso first");
      // The notes it links to go with it, as far as there is room; the rest Iso reads with its tools.
      const linked: { id: string; title: string; text: string }[] = [];
      let room = LINKED_BUDGET;
      for (const m of body.matchAll(/\]\(\/([^)\s#]+)\.md(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g)) {
        const c = this.bundle.concepts.get(decodeURIComponent(m[1]!));
        if (!c || linked.some((l) => l.id === c.id)) continue;
        const piece = c.body.trim().slice(0, Math.max(0, room) * 4);
        if (piece.length < Math.min(c.body.trim().length, 400)) break; // no room for a useful part of it
        linked.push({ id: c.id, title: c.title, text: piece + (piece.length < c.body.trim().length ? "\n[…cut: read the rest with read_note]" : "") });
        room -= estimate(piece);
      }
      const earlier = await this.exchangesNow();
      return { ...noteMessages({ tier: req.tier, meaning: Boolean(this.similar), title: this.titleOf(req.note, text), body: windowed(body.split("\n"), [0]), linked, conversation: conversation(earlier), moments: earlier.length }), text, all, chosen };
    }
    if (req.form === "insert") {
      const at = locate(text, { form: "insert", after: req.after, before: req.before } as Proposal);
      if (!at || at.form !== "insert") throw gone();
      const before = at.line > 0 && lines[at.line - 1]!.trim() ? [""] : [];
      lines.splice(at.line, 0, ...before, HERE, ...(at.line < lines.length && lines[at.line]!.trim() ? [""] : []));
      keep = [at.line + before.length];
    } else {
      if (!req.blocks.length || req.blocks.length > 40) throw new EngineError("choose between one and forty paragraphs to rewrite");
      chosen = req.blocks.map((a) => findAnchor(all, a));
      if (chosen.some((k) => k < 0) || new Set(chosen).size !== chosen.length) throw gone();
      // Marked from the last to the first, so the lines of the earlier ones do not move.
      for (const [n, k] of [...chosen.entries()].sort((x, y) => y[1] - x[1])) {
        lines.splice(all[k]!.to, 0, CLOSE(n + 1));
        lines.splice(all[k]!.from, 0, OPEN(n + 1));
      }
      keep = lines.flatMap((l, k) => (/^⟦\/?\d+⟧$/.test(l) ? [k] : []));
      // Every line of a chosen paragraph must be sent, however long the note.
      keep = Array.from({ length: Math.max(...keep) - Math.min(...keep) + 1 }, (_, k) => Math.min(...keep) + k);
    }
    const title = this.titleOf(req.note, text);
    const entries = await this.journal(req.note);
    const earlier = await this.exchangesNow();
    // What Iso read for this note's exchanges that are still in the conversation: it may well read them again.
    const read = new Set(entries.flatMap((e) => (e.kind === "proposal" && earlier.some((x) => x.id === e.id) ? e.read ?? [] : [])));
    const given = {
      tier: req.tier, meaning: Boolean(this.similar), title, id: req.note, marked: windowed(lines, keep), asked,
      unkept: pending(entries).map((p) => (p.form === "insert" ? p.text : p.blocks.map((b) => b.new).join("\n\n"))),
      conversation: conversation(earlier), moments: earlier.length,
      linked: { notes: read.size, tokens: [...read].reduce((n, id) => n + estimate(this.bundle.concepts.get(id)?.body ?? ""), 0) },
    };
    return { ...(req.form === "insert" ? insertMessages(given) : rewriteMessages({ ...given, count: chosen.length })), text, all, chosen };
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
  private async sessionEntries(): Promise<Map<string, Entry[]>> {
    const session = await this.sessionNow();
    if (this.sessionLog?.session === session) return this.sessionLog.notes;
    const notes = new Map<string, Entry[]>(), study = this.opts.study;
    const visit = async (dir: string): Promise<void> => {
      for (const info of study ? await study.list(dir) : []) {
        const path = `${dir}/${info.name}`;
        if (info.dir) await visit(path);
        else if (info.name.endsWith(".jsonl")) {
          const mine = readJournal((await study!.read(path)) ?? "").filter((e) => e.session === session);
          if (mine.length) notes.set(path.slice("journal/".length, -".jsonl".length), mine);
        }
      }
    };
    await visit("journal");
    this.sessionLog = { session, notes };
    return notes;
  }

  /** The id of the last event that cleared the conversation, or "": exchanges before it are not sent. */
  private cleared: string | undefined;
  private async clearedAt(): Promise<string> {
    if (this.cleared === undefined) {
      const text = this.opts.study ? await this.opts.study.read(recordPath(this.opts.device)) : null;
      this.cleared = readRecord(text ?? "").filter((e) => e.event === "context-cleared").map((e) => e.id).sort().at(-1) ?? "";
    }
    return this.cleared;
  }

  /** The session's exchanges with Iso, across its notes, since the conversation was last cleared. */
  private async exchangesNow(): Promise<Exchange[]> {
    const since = await this.clearedAt(), session = await this.sessionNow(), out: Exchange[] = [];
    for (const [note, entries] of await this.sessionEntries()) {
      // What became of each is read from the note's whole journal: a keep may be in a later session.
      const whole = entries.some((e) => e.kind === "proposal") ? await this.journal(note) : [];
      out.push(...exchanges(note, this.bundle.concepts.get(note)?.title ?? note, whole, session, since));
    }
    return out;
  }

  /** An event in the study record, on this device's file. */
  private async record(event: Record<string, unknown>): Promise<string> {
    const e = cleanEvent(event, { device: this.opts.device, now: this.opts.clock.now() });
    await this.opts.study?.append(recordPath(this.opts.device), JSON.stringify(e) + "\n");
    this.publish({ type: "record", event: String(e.event) });
    return e.id;
  }

  async clearConversation(): Promise<void> {
    if (!this.opts.study) return;
    this.cleared = await this.one(() => this.record({ event: "context-cleared" }));
  }

  async context(note?: string): Promise<ContextReport> {
    let parts: Part[] | null = null;
    // A note for Iso with nothing written in it yet is counted as no note at all.
    if (note && isDraftId(note)) parts = await this.compose({ note, form: "note", tier: "mid" }, "").then((c) => c.parts, () => null);
    else if (note && !isStudyId(note)) ({ parts } = await this.compose({ note, form: "insert", after: null, before: null, asked: "", tier: "mid" }, ""));
    if (!parts) {
      // In no note: the instructions, and the conversation as it would be sent.
      const earlier = await this.exchangesNow();
      ({ parts } = insertMessages({ tier: "mid", meaning: Boolean(this.similar), title: "", id: "", marked: "", unkept: [], conversation: conversation(earlier), moments: earlier.length, asked: "" }));
      parts = parts.map((p) => (p.name === "this note" ? { ...p, detail: "none open", tokens: 0 } : p));
    }
    // What the session has cost: every reply offered, kept or not, and every reply that came to nothing.
    const session = await this.sessionNow();
    let usd = 0, requests = 0;
    for (const entries of (await this.sessionEntries()).values()) for (const e of entries) if (e.kind === "proposal") { usd += e.cost?.usd ?? 0; requests++; }
    const text = this.opts.study ? await this.opts.study.read(recordPath(this.opts.device)) : null;
    for (const e of readRecord(text ?? "")) if (e.event === "iso-unused" && e.session === session) { usd += typeof e.usd === "number" ? e.usd : 0; requests++; }
    return { tokens: parts.reduce((n, p) => n + p.tokens, 0), limit: this.provider.context ?? 200_000, parts, session: { usd, requests } };
  }

  // ------------------------------------------------------------ notes for Iso

  async drafts(): Promise<DraftSummary[]> {
    const study = this.opts.study;
    if (!study) return [];
    const out: DraftSummary[] = [];
    for (const info of await study.list(DRAFT_DIR)) {
      if (info.dir || !info.name.endsWith(".md")) continue;
      const id = DRAFT_PREFIX + info.name.slice(0, -3);
      out.push({ id, title: this.titleOf(id, (await study.read(`${DRAFT_DIR}/${info.name}`)) ?? "") });
    }
    return out.sort((a, b) => (a.id < b.id ? 1 : -1)); // ids begin with the time: newest first
  }

  async createDraft(): Promise<NoteSource> {
    if (!this.opts.study) throw new EngineError("a note for Iso is kept in a study base until it is a note, and none is open (isorite study init)", 409);
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
      const entry = { ...p, ...(await this.stamp(p.who)), asked, after: null, before: null } as Proposal;
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

  keep(id: string, proposal: string): Promise<Saved> {
    return this.one(async () => {
      const { files, path } = this.where(id);
      const now = await files.read(path);
      if (now === null) throw new Conflict(`${id} is gone`, null);
      const { entries, p } = await this.waiting(id, proposal);
      await this.enter(id, entries, reconcile(entries, now, await this.stamp("external")));
      // A proposal whose place has gone is kept at the end of the note: shown apart, never lost.
      const text = written(now, p) ?? written(now, p.form === "insert" ? { ...p, after: null, before: null } : p);
      if (text === null) throw new EngineError("the paragraphs this would rewrite are no longer in the note", 409);
      await files.write(path, text);
      await this.enter(id, entries, change(entries, text, await this.stamp("you"), "keep", { proposal }));
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
        if (typeof text === "string" || text.length !== p.blocks.length) throw new EngineError("a rewrite is revised block by block");
        if (text.some((t, k) => t !== p.blocks[k]!.new)) await this.enter(id, entries, { ...(await this.stamp("you")), kind: "revise", proposal, blocks: text });
      }
    });
  }

  discard(id: string, proposal: string): Promise<void> {
    return this.one(async () => {
      const { entries } = await this.waiting(id, proposal);
      await this.enter(id, entries, { ...(await this.stamp("you")), kind: "discard", proposal });
    });
  }

  private async enter(id: string, entries: Entry[], entry: Entry | null): Promise<void> {
    if (!entry || !this.opts.study) return;
    await this.opts.study.append(journalPath(id), journalLine(entry));
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
    const study = this.opts.study;
    if (!study) return null;
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

// The engine: one knowledge base and its study base, open. Every write to a
// note goes through `saveNote` or `createNote` here, one at a time, which is
// what keeps the journal true to the file (docs/architecture.md, section 3).

import {
  Bundle, SearchIndex, STUDY_DIR, STUDY_PREFIX, WORKING, change, dumpFrontmatter, exercise, findPassage, hashText, isStudyId, cleanEvent, journalLine, journalPath, locate, mapModel, markingReply, mergeRecords, newId, pending, readJournal, readRecord, recordPath, reconcile, splitFrontmatter, stamp, studyId, studyList, testsOf, text as plain, understanding, withNext, written,
  type Cost, type Entry, type FileEntry, type Insert, type LearnerEvent, type Marks, type Passage, type Proposal, type Stamp, type Understanding,
} from "@isorite/core";
import { Conflict, EngineError, type Api, type AskRequest, type ContextReport, type DraftSummary, type EngineEvent, type Evidence, type Listing, type MapReport, type NoteSource, type Saved, type SearchHit, type Session, type Settings, type StudyReport } from "./api.ts";
import { ANSWER_CLOSE, ANSWER_OPEN, CLOSE, HERE, LINKED_BUDGET, OPEN, conversation, estimate, exchanges, exerciseMessages, exerciseReply, fitted, helpSince, insertMessages, markMessages, noteMessages, parseRewrite, replyText, rewriteMessages, windowed, type Exchange, type Part, type Tested } from "./iso.ts";
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
export const MAX_ASKED = 4000, REPLY_TOKENS = 2500, NOTE_TOKENS = 6000, MARK_TOKENS = 2000, EXERCISE_TOKENS = 1500;

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

  /** Both bases as the Atlas draws them: the model the layout takes, and what each block says. */
  async map(): Promise<MapReport> {
    const study = this.opts.study;
    const exercises = study ? Bundle.fromFiles(await walk(study, STUDY_DIR)) : null;
    const read = understanding(await this.records(), this.opts.clock.now());
    const notes: MapReport["notes"] = {};
    for (const c of this.bundle.concepts.values()) notes[c.id] = { title: c.title, step: read.get(c.id)?.step ?? 0, tokens: estimate(c.body.trim()) };
    for (const c of exercises?.concepts.values() ?? []) notes[studyId(c.id)] = { title: c.title, step: 0, kind: plain(c.meta.kind ?? "") || "note" };
    return { model: mapModel(this.bundle, exercises), notes };
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
    if (req.form === "mark" ? !isStudyId(req.note) : isStudyId(req.note) && req.form !== "insert" && req.form !== "rewrite") throw new EngineError("only an exercise is sent for marking");
    if (isDraftId(req.note) !== (req.form === "note" || req.form === "exercise")) throw new EngineError("a note for Iso is sent whole, and only a note for Iso is");
    if (!TIERS.includes(req.tier)) throw new EngineError("the tier is low, mid or max");
    // For a note written for Iso, what is asked is the note: its title stands for it in the journal.
    const asked = req.form === "note" ? this.titleOf(req.note, (await this.readNote(req.note)).text)
      : req.form === "exercise" ? await this.exerciseAsked(req.note)
      : req.form === "mark" ? "sent for marking"
      : req.asked.trim();
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

    const { messages, olds, text: sent } = await this.compose(req, asked);
    const maxTokens = req.form === "insert" ? REPLY_TOKENS : req.form === "note" ? NOTE_TOKENS : req.form === "mark" ? MARK_TOKENS : req.form === "exercise" ? EXERCISE_TOKENS : Math.max(REPLY_TOKENS, Math.ceil(olds.join("").length / 3) + 1000);
    // Marking and writing an exercise are one call with no tools: what is sent is all Iso has, and you chose it.
    const most = req.form === "mark" || req.form === "exercise" ? 0 : undefined;

    const request = newId(this.opts.clock.now()), abort = new AbortController();
    this.running.set(request, abort);
    this.asking.set(req.note, request);
    const place = req.form === "insert" ? { form: req.form, after: req.after, before: req.before } : req.form === "rewrite" ? { form: req.form, regions: req.regions, after: req.after, before: req.before } : req.form === "mark" ? { form: req.form, answer: req.answer } : { form: req.form };
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
        if (req.form === "mark") {
          if (got.cut) throw new EngineError("Iso's marking was cut off at its length limit. Send it again.");
          const marking = markingReply(got.text, sent, exercise(sent).tests);
          const { entry, attempt } = await this.one(async () => {
            const entry: Marks = { ...(await stamped()), kind: "marks", answer: req.answer, result: marking.result, marks: marking.marks, ...(marking.dropped ? { dropped: marking.dropped } : {}), cost };
            await this.enter(req.note, await this.journal(req.note), entry);
            const attempt = await this.record({
              event: "attempt", exercise: bare(req.note), tests: exercise(sent).tests, result: marking.result, by: entry.who,
              moves: marking.moves, answer: req.answer, working: exercise(sent).working, marks: entry.id,
            });
            return { entry, attempt };
          });
          offered = true;
          this.publish({ type: "iso-done", request, note: req.note, proposal: entry.id, attempt, cost });
          return;
        }
        let build: () => Promise<Proposal[]>;
        if (req.form !== "rewrite") {
          // A note written for Iso is answered with a note: offered whole, under what they wrote.
          // A title line, against its instructions: the title is theirs. An exercise's title is Iso's, and stays.
          const reply = req.form === "exercise" ? replyText(got.text) : replyText(got.text).replace(/^#\s+.*\n+/, "");
          if (req.form === "exercise" && !exerciseReply(reply).question) throw new EngineError("Iso replied without a question. Ask again, or at another tier.");
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
    if (req.form === "mark") return { ...(await this.markCompose(req.note, text, req.answer)), text, olds };
    if (req.form === "exercise") return { ...(await this.exerciseCompose(req.note, text, asked)), text, olds };
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
    const earlier = await this.exchangesNow();
    // What Iso read for this note's exchanges that are still in the conversation: it may well read them again.
    const read = new Set(entries.flatMap((e) => (e.kind === "proposal" && earlier.some((x) => x.id === e.id) ? e.read ?? [] : [])));
    const given = {
      tier: req.tier, meaning: Boolean(this.similar), title, id: req.note, marked: windowed(lines, keep), asked,
      unkept: pending(entries).map((p) => (p.form === "insert" ? p.text : p.regions.map((r) => r.new).join("\n\n"))),
      conversation: conversation(earlier), moments: earlier.length,
      linked: { notes: read.size, tokens: [...read].reduce((n, id) => n + estimate(this.bundle.concepts.get(id)?.body ?? ""), 0) },
    };
    return { ...(req.form === "insert" ? insertMessages(given) : rewriteMessages({ ...given, count: olds.length })), text, olds };
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
    if (note && isDraftId(note)) {
      const exerciseDraft = await this.exerciseDraft(note).catch(() => null);
      parts = exerciseDraft
        ? await this.readNote(note).then(async (s) => (await this.exerciseCompose(note, s.text, await this.exerciseAsked(note))).parts, () => null)
        : await this.compose({ note, form: "note", tier: "mid" }, "").then((c) => c.parts, () => null);
    } else if (note && isStudyId(note)) {
      // In an exercise, what sending it for marking would send.
      parts = await this.readNote(note).then(async (s) => (await this.markCompose(note, s.text, null)).parts, () => null);
    } else if (note) ({ parts } = await this.compose({ note, form: "insert", after: null, before: null, asked: "", tier: "mid" }, ""));
    if (!parts) {
      // In no note: the instructions, and the conversation as it would be sent.
      const earlier = await this.exchangesNow();
      ({ parts } = insertMessages({ tier: "mid", meaning: Boolean(this.similar), title: "", id: "", marked: "", unkept: [], conversation: conversation(earlier), moments: earlier.length, asked: "" }));
      parts = parts.map((p) => (p.name === "this note" ? { ...p, detail: "none open", tokens: 0 } : p));
    }
    // What the session has cost: every reply offered, kept or not, and every reply that came to nothing.
    const session = await this.sessionNow();
    let usd = 0, requests = 0;
    for (const entries of (await this.sessionEntries()).values()) for (const e of entries) if (((e.kind === "proposal" && !e.copyOf) || e.kind === "marks") && e.cost) { usd += e.cost.usd; requests++; } // a proposal with no cost is the second of one request
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
      const id = DRAFT_PREFIX + info.name.slice(0, -3), text = (await study.read(`${DRAFT_DIR}/${info.name}`)) ?? "";
      const asks = this.draftMeta(text);
      out.push(asks?.type === "Exercise" ? { id, title: `an exercise on ${testsOf(asks).map((t) => this.bundle.concepts.get(t)?.title ?? t).join(", ")}`, exercise: true } : { id, title: this.titleOf(id, text) });
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

  // ------------------------------------------------------------ exercises

  /** Every device's record, merged, in time order. */
  private async records(): Promise<LearnerEvent[]> {
    const study = this.opts.study;
    if (!study) return [];
    const files = (await study.list("record")).filter((f) => !f.dir && f.name.endsWith(".jsonl"));
    return mergeRecords(...(await Promise.all(files.map(async (f) => readRecord((await study.read(`record/${f.name}`)) ?? "")))));
  }

  /** The notes an exercise tests, as they are sent to Iso: whole (no trimming), with their squares now. */
  private async tested(tests: readonly string[]): Promise<Tested[]> {
    if (!tests.length) throw new EngineError("the exercise tests no note: name one in its `tests`");
    const read = understanding(await this.records(), this.opts.clock.now());
    return tests.map((id) => {
      const c = this.bundle.concepts.get(id);
      if (!c) throw new EngineError(`the exercise tests a note that is not in the base: ${id}`);
      return { id, title: c.title, text: c.body.trim(), squares: read.get(id)?.squares ?? 0 };
    });
  }

  /** What marking an exercise sends. With no answer (to count what it would send), the working goes unmarked. */
  private async markCompose(note: string, text: string, answer: Passage | null): Promise<{ messages: Message[]; parts: Part[] }> {
    const ex = exercise(text);
    let working = ex.working;
    if (answer) {
      const at = findPassage(text, answer);
      if (!at || at.from < ex.from) throw new Conflict("the answer you marked is no longer in the working", { id: note, text, version: hashText(text) });
      working = text.slice(ex.from, at.from) + ANSWER_OPEN + text.slice(at.from, at.to) + ANSWER_CLOSE + text.slice(at.to);
    }
    return markMessages({ title: ex.title || this.titleOf(note, text), question: ex.question, working, tested: await this.tested(ex.tests), help: helpSince(await this.journal(note)) });
  }

  /** A draft's frontmatter, or null. */
  private draftMeta(text: string): Record<string, unknown> | null {
    try { return splitFrontmatter(text)[0]; } catch { return null; }
  }

  /** A request for an exercise: where it goes, what it tests, what it follows. Refused for a draft that is not one. */
  private async exerciseDraft(draft: string): Promise<{ folder: string; tests: string[]; after: string | null; body: string }> {
    const text = (await this.readNote(draft)).text;
    const meta = this.draftMeta(text);
    if (meta?.type !== "Exercise") throw new EngineError("not a request for an exercise");
    let body = "";
    try { body = splitFrontmatter(text)[1].trim(); } catch { /* none */ }
    const after = plain(meta.after ?? "");
    return { folder: plain(meta.folder ?? ""), tests: testsOf(meta), after: after || null, body };
  }

  /** What a request for an exercise asks, in the journal's words. */
  private async exerciseAsked(draft: string): Promise<string> {
    const d = await this.exerciseDraft(draft);
    return d.body || `an exercise on ${d.tests.map((t) => this.bundle.concepts.get(t)?.title ?? t).join(", ")}`;
  }

  private async exerciseCompose(draft: string, _text: string, asked: string): Promise<{ messages: Message[]; parts: Part[] }> {
    const d = await this.exerciseDraft(draft);
    const tested = await this.tested(d.tests);
    const all = await this.studyExercises();
    const existing = all.filter((e) => e.tests.some((t) => d.tests.includes(t))).map((e) => ({ title: e.title, question: e.question }));
    const after = d.after ? all.find((e) => e.id === d.after) : undefined;
    return exerciseMessages({ asked: d.body ? asked : "", folder: d.folder, tested, existing, after: after ? { title: after.title, question: after.question } : null });
  }

  /** Every exercise of the study base, read. */
  private async studyExercises(): Promise<(ReturnType<typeof exercise> & { id: string })[]> {
    const study = this.opts.study;
    if (!study) return [];
    const out: (ReturnType<typeof exercise> & { id: string })[] = [];
    for (const f of await walk(study, STUDY_DIR)) {
      if (f.dir || !f.path.endsWith(".md") || f.text === undefined) continue;
      let type = "";
      try { type = plain(splitFrontmatter(f.text)[0]?.type ?? ""); } catch { continue; }
      if (type !== "Exercise") continue;
      const id = f.path.slice(0, -3), ex = exercise(f.text);
      out.push({ ...ex, id, title: ex.title || id.split("/").at(-1)! });
    }
    return out.sort((a, b) => (a.id < b.id ? -1 : 1));
  }

  async createExerciseDraft(folder: string, tests: string[], after: string | null = null): Promise<NoteSource> {
    if (!this.opts.study) throw new EngineError("exercises are kept in a study base, and none is open (isorite study init)", 409);
    const dir = folder.trim().replace(/^\/+|\/+$/g, "");
    if (dir && !this.bundle.directories.has(dir)) throw new EngineError(`there is no folder ${dir} in the base`);
    for (const t of tests) if (!this.bundle.concepts.has(t)) throw new EngineError(`there is no note ${t} in the base`);
    const follows = after ? bare(after) : null;
    if (follows && !(await this.studyExercises()).some((e) => e.id === follows)) throw new EngineError(`there is no exercise ${follows}`);
    const id = DRAFT_PREFIX + newId(this.opts.clock.now()).toLowerCase();
    const meta: Record<string, unknown> = { type: "Exercise", folder: dir, tests };
    if (follows) meta.after = follows;
    return this.createNote(id, `---\n${dumpFrontmatter(meta)}---\n\n`);
  }

  async keepExercise(draft: string, proposal: string): Promise<Saved> {
    if (!isDraftId(draft)) throw new EngineError("not a request for an exercise");
    const d = await this.exerciseDraft(draft);
    const { p } = await this.waiting(draft, proposal);
    if (p.form !== "insert") throw new EngineError("not an exercise");
    const { title, question } = exerciseReply(p.text);
    if (!question) throw new EngineError("there is no question in it to keep");
    const name = (title || "exercise").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "exercise";
    const all = await this.studyExercises(), taken = new Set(all.map((e) => e.id));
    let local = [d.folder, name].filter(Boolean).join("/");
    for (let k = 2; taken.has(local) || (await this.opts.study!.read(`${STUDY_DIR}/${local}.md`)) !== null; k++) local = [d.folder, `${name}-${k}`].filter(Boolean).join("/");
    const id = studyId(local);
    // Placed in its chain: it takes the place after the one it follows, and that one now leads to it.
    const before = d.after ? all.find((e) => e.id === d.after) : undefined;
    const meta: Record<string, unknown> = { type: "Exercise", kind: "written", title: title || name, tests: d.tests };
    if (before?.next) meta.next = before.next;
    meta.generated = { by: p.who, at: p.at };
    // The exercise begins as its frontmatter and the working's heading, yours; Iso's question is then offered in it
    // and kept, so its journal says who wrote what, as for any text of Iso's.
    await this.createNote(id, `---\n${dumpFrontmatter(meta)}---\n\n${WORKING}\n\n`);
    const copy = await this.one(async () => {
      const entry = { ...p, ...(await this.stamp(p.who)), text: question, after: null, before: { text: WORKING, nth: 0 }, copyOf: p.id } as Proposal;
      await this.enter(id, await this.journal(id), entry);
      return entry;
    });
    const kept = await this.keep(id, copy.id);
    if (before) {
      const prev = await this.readNote(studyId(before.id));
      await this.saveNote(prev.id, { base: prev.version, text: withNext(prev.text, local) });
    }
    await this.one(async () => this.enter(draft, await this.journal(draft), { ...(await this.stamp("you")), kind: "discard", proposal }));
    await this.discardDraft(draft);
    return kept;
  }

  async study(): Promise<StudyReport> {
    const events = await this.records(), now = this.opts.clock.now();
    const read = understanding(events, now);
    const all = await this.studyExercises();
    const byId = new Map(events.map((e) => [e.id, e]));
    const listed = studyList(all, events, read);
    const info = new Map(all.map((e) => [e.id, e]));
    const evidence = (note: string, u: Understanding): Evidence[] => u.evidence.flatMap((id): Evidence[] => {
      const e = byId.get(id);
      if (!e) return [];
      if (e.event === "wind-back") return [{ id, at: String(e.at), event: "wind-back", by: -1 }];
      const move = (e.moves as Record<string, { by?: unknown; why?: unknown }> | undefined)?.[note];
      return [{ id, at: String(e.at), event: "attempt", by: typeof move?.by === "number" ? move.by : 0, ...(typeof move?.why === "string" && move.why ? { why: move.why } : {}), ...(typeof e.exercise === "string" ? { exercise: studyId(e.exercise) } : {}), ...(typeof e.result === "string" ? { result: e.result as Evidence["result"] } : {}) }];
    });
    const notes: StudyReport["notes"] = {};
    for (const [note, u] of read) notes[note] = { level: u.level, squares: u.squares, step: u.step, due: u.due, evidence: evidence(note, u) };
    return {
      exercises: listed.map((l) => {
        const e = info.get(l.id)!;
        return { id: studyId(l.id), title: e.title, kind: e.kind, tests: l.tests, next: e.next ? studyId(e.next) : null, result: l.result, last: l.last === null ? null : new Date(l.last).toISOString(), squares: l.squares, due: l.due };
      }),
      notes,
      folders: ["", ...[...this.bundle.directories.keys()].filter(Boolean).sort()],
    };
  }

  async windBack(id: string): Promise<void> {
    if (!isStudyId(id)) throw new EngineError("wind back is done from an exercise");
    if (!this.opts.study) throw new EngineError("there is no study base open", 409);
    const tests = exercise((await this.readNote(id)).text).tests;
    if (!tests.length) throw new EngineError("the exercise tests no note");
    await this.one(async () => { for (const note of tests) await this.record({ event: "wind-back", note }); });
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

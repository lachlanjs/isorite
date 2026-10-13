// The engine: one knowledge base and its study base, open. Every write to a
// note goes through `saveNote` or `createNote` here, one at a time, which is
// what keeps the journal true to the file (docs/architecture.md, section 3).

import {
  Bundle, SearchIndex, STUDY_DIR, STUDY_PREFIX, blocks, change, findAnchor, hashText, isStudyId, journalLine, journalPath, locate, newId, pending, readJournal, reconcile, splitFrontmatter, stamp, written,
  type Cost, type Entry, type FileEntry, type Insert, type Proposal, type Rewrite, type Stamp,
} from "@isorite/core";
import { Conflict, EngineError, type Api, type AskRequest, type EngineEvent, type Listing, type NoteSource, type Saved, type SearchHit, type Session, type Settings } from "./api.ts";
import { CLOSE, HERE, OPEN, conversation, insertMessages, parseRewrite, replyText, rewriteMessages } from "./iso.ts";
import { rounds } from "./loop.ts";
import { Lookup, type Similar } from "./lookup.ts";
import { KEY, OPENROUTER, TIERS, type ProviderConfig } from "./provider.ts";
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
  /** Search by meaning, where the device can run it. */
  similar?: Similar;
}

/** The longest request and the longest reply asked for, in characters and tokens. */
export const MAX_ASKED = 4000, REPLY_TOKENS = 2500;

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

  private constructor(opts: EngineOptions) { this.opts = opts; }

  static async open(opts: EngineOptions): Promise<Engine> {
    const engine = new Engine(opts);
    await engine.reload();
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
    checkNoteId(id.startsWith(STUDY_PREFIX) ? id.slice(STUDY_PREFIX.length) : id);
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
    if (isStudyId(id)) {
      if (!this.opts.study) throw new EngineError("there is no study base open", 404);
      return { files: this.opts.study, path: `${STUDY_DIR}/${checkNoteId(id.slice(STUDY_PREFIX.length))}.md` };
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
    if (!isStudyId(id)) {
      this.files.set(path, { path, text });
      this.built = this.index = null;
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
    if (!TIERS.includes(req.tier)) throw new EngineError("the tier is low, mid or max");
    const asked = req.asked.trim();
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

    // The note as it is on disk now: what the journal has not seen is entered first, as for any read.
    const { text } = await this.readNote(req.note);
    const gone = () => new Conflict("the place asked about is no longer in the note", { id: req.note, text, version: hashText(text) });
    const lines = text.split("\n"), all = blocks(text);
    let chosen: number[] = [];
    if (req.form === "insert") {
      const at = locate(text, { form: "insert", after: req.after, before: req.before } as Proposal);
      if (!at || at.form !== "insert") throw gone();
      lines.splice(at.line, 0, ...(at.line > 0 && lines[at.line - 1]!.trim() ? [""] : []), HERE, ...(at.line < lines.length && lines[at.line]!.trim() ? [""] : []));
    } else {
      if (!req.blocks.length || req.blocks.length > 40) throw new EngineError("choose between one and forty paragraphs to rewrite");
      chosen = req.blocks.map((a) => findAnchor(all, a));
      if (chosen.some((k) => k < 0) || new Set(chosen).size !== chosen.length) throw gone();
      // Marked from the last to the first, so the lines of the earlier ones do not move.
      for (const [n, k] of [...chosen.entries()].sort((x, y) => y[1] - x[1])) {
        lines.splice(all[k]!.to, 0, CLOSE(n + 1));
        lines.splice(all[k]!.from, 0, OPEN(n + 1));
      }
    }
    let title = req.note.split("/").at(-1)!;
    try { const t = splitFrontmatter(text)[0]?.title; if (typeof t === "string" && t) title = t; } catch { /* the id will do */ }

    const entries = await this.journal(req.note);
    const session = (await this.stamp("iso")).session;
    const given = {
      tier: req.tier, meaning: Boolean(this.opts.similar), title, id: req.note, marked: lines.join("\n"), asked,
      unkept: pending(entries).map((p) => (p.form === "insert" ? p.text : p.blocks.map((b) => b.new).join("\n\n"))),
      conversation: conversation(entries, session),
    };
    const { messages } = req.form === "insert" ? insertMessages(given) : rewriteMessages({ ...given, count: chosen.length });
    const olds = chosen.map((k) => all[k]!.text);
    const maxTokens = req.form === "insert" ? REPLY_TOKENS : Math.max(REPLY_TOKENS, Math.ceil(olds.join("").length / 3) + 1000);

    const request = newId(this.opts.clock.now()), abort = new AbortController();
    this.running.set(request, abort);
    this.asking.set(req.note, request);
    const place = req.form === "insert" ? { form: req.form, after: req.after, before: req.before } : { form: req.form, blocks: req.blocks };
    this.publish({ type: "iso-start", request, note: req.note, asked, tier: req.tier, place });
    const lookup = new Lookup(this.bundle, req.note, this.opts.similar ?? null);
    // The request returns at once; the rest happens as events, and ends in exactly one of done, stopped, failed.
    void (async () => {
      try {
        const ran = await rounds({
          http, provider: this.provider, key, tier: req.tier, messages, lookup, maxTokens, signal: abort.signal,
          onText: (delta, again) => this.publish({ type: "iso-text", request, note: req.note, delta, again }),
          onStep: (step) => this.publish({ type: "iso-step", request, note: req.note, step }),
        });
        if (abort.signal.aborted) throw Object.assign(new Error("stopped"), { name: "AbortError" });
        const notices: string[] = ran.cut ? ["The reply was cut off at its length limit. Ask for less at once."] : [];
        // What it wrote is fitted to the form here: this, not its instructions, is what limits where its text can go.
        let body: Pick<Insert, "form" | "after" | "before" | "text"> | Pick<Rewrite, "form" | "blocks">;
        if (req.form === "insert") {
          const reply = replyText(ran.text);
          if (!reply) throw new EngineError("Iso replied with nothing. Ask again, or at another tier.");
          body = { form: "insert", after: req.after, before: req.before, text: reply };
        } else {
          const parsed = parseRewrite(ran.text, chosen.length);
          if (parsed.blocks.every((b, k) => b === null || b === olds[k])) throw new EngineError(parsed.outside ? "Iso replied, but not with a rewrite of the paragraphs you chose, so nothing is offered. Ask for new text at a point instead, or ask again." : "Iso left the paragraphs as they are.");
          if (parsed.outside) notices.push("Iso also wrote outside the paragraphs you chose. That part was left out.");
          body = { form: "rewrite", blocks: req.blocks.map((old, k) => ({ old, new: parsed.blocks[k] ?? olds[k]! })) };
        }
        const cost: Cost = { model: ran.usage.model, tier: req.tier, tokensIn: ran.usage.tokensIn, tokensOut: ran.usage.tokensOut, tokensCached: ran.usage.tokensCached, usd: ran.usage.usd };
        // Entered in its turn among the writes. From here it survives closing the browser.
        const proposal = await this.one(async () => {
          const p = {
            ...(await this.stamp(`iso:${this.provider.name}/${ran.usage.model}`)), kind: "proposal", asked, ...body, cost, read: lookup.read(),
            ...(notices.length ? { notice: notices.join(" ") } : {}),
          } as Proposal;
          await this.enter(req.note, await this.journal(req.note), p);
          return p;
        });
        this.publish({ type: "iso-done", request, note: req.note, proposal: proposal.id, cost });
      } catch (err) {
        if (abort.signal.aborted || (err as Error).name === "AbortError") this.publish({ type: "iso-stopped", request, note: req.note });
        else this.publish({ type: "iso-failed", request, note: req.note, message: (err as Error).message || "Iso could not answer" });
      } finally {
        this.running.delete(request);
        this.asking.delete(req.note);
      }
    })();
    return { request };
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
      if (!isStudyId(id)) { this.files.set(path, { path, text }); this.built = this.index = null; }
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

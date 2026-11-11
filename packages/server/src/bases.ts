// Several knowledge bases in one server (M20). Each has its own engine and its own API, at /b/<name>/api/, and its
// page is the app's with ?base=<name>; / and /api/ stay the base the server was started for. A base is opened the first time it is
// asked for, and a lent one (`lend = true` in config.toml: the agent's memory) at the start, for every session's
// agent and the agent to look in.

import { resolve } from "node:path";
import type { Engine, Elsewhere } from "@isorite/engine";
import { knownBases, lendBase, rememberBase, specialBases, titleBase, type KnownBase } from "./config.ts";

/** A base as the switcher lists it. */
export interface BaseView { name: string; path: string; lend: boolean; open: boolean; title: string; /** The global base or the skills base: always listed, first. */ special?: "global" | "skills" }

/** What a base's app is told of the others: the list, and, from this machine only, lending one, opening one by its
 *  folder (isorite mcp, for a server that holds another), and holding the server open. */
export interface BasesPort {
  list(): BaseView[];
  /** The bases lent to every session now: the lent ones, and the global and skills bases while they have notes. */
  lent(): { name: string; about: string }[];
  lend(name: string, on: boolean): Promise<boolean>;
  /** Show a base by a title of its own (empty: by its name again). False where none has that name. */
  title(name: string, title: string): boolean;
  open(path: string): Promise<{ name: string; first: boolean }>;
  hold(): () => void;
}

/** One base, open: its engine, and the app that serves it. */
export interface Opened { engine: Engine; fetch: (req: Request, env?: unknown) => Response | Promise<Response> }

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

export class Bases implements Elsewhere, BasesPort {
  readonly first: string;
  readonly #config: string;
  readonly #make: (base: KnownBase) => Promise<Opened>;
  readonly #open = new Map<string, Promise<Opened>>();
  readonly #ready = new Map<string, Opened>();
  readonly #about = new Map<string, string>();
  /** How many notes each special base has of its own (the skills base's built-in ones are not counted): it is lent to the agent only when there are some. */
  readonly #count = new Map<string, number>();
  readonly #data: string;
  #holds = 0;
  readonly #idle: (() => void) | undefined;

  /** `make` opens a base; `idle` is called when the last hold is let go (a server isorite mcp started). */
  constructor({ config, first, make, idle, data }: { config: string; first: string; make: (base: KnownBase) => Promise<Opened>; idle?: () => void; data: string }) {
    this.#config = config;
    this.#data = data;
    this.first = first;
    this.#make = make;
    this.#idle = idle;
  }

  /** The bases this server knows: the global base and the skills base first, then the ones in bases.toml (one that
   *  has a special base's name or folder is left out: the special one stands). */
  #known(): KnownBase[] {
    const special = specialBases(this.#data);
    return [...special, ...knownBases(this.#config).filter((b) => !special.some((s) => s.name === b.name || s.path === b.path))];
  }

  /** The first base, every special one, and every lent one. */
  async start(): Promise<void> {
    await this.get(this.first);
    await Promise.all(this.#known().filter((b) => b.lend).map((b) => this.get(b.name)?.catch((e: Error) => console.error(`isorite: ${b.name} (${b.path}) could not be opened: ${e.message}`))));
  }

  /** A known base, opened if it is not yet; null where none has that name. */
  get(name: string): Promise<Opened> | null {
    const had = this.#open.get(name);
    if (had) return had;
    const known = NAME.test(name) ? this.#known().find((b) => b.name === name) : undefined;
    if (!known) return null;
    const opening = this.#make(known).then(async (opened) => {
      this.#ready.set(name, opened);
      const keep = async (): Promise<void> => {
        this.#about.set(name, await opened.engine.about());
        if (known.special) this.#count.set(name, (await opened.engine.notes()).notes.filter((n) => !n.id.startsWith("built-in/")).length);
      };
      await keep();
      // What a base's AGENTS.md says of it is kept current for the others' briefs.
      opened.engine.events((e) => { if (e.type === "note-changed") void keep(); });
      return opened;
    });
    opening.catch(() => this.#open.delete(name));
    this.#open.set(name, opening);
    return opening;
  }

  /** Every open base, for what is kept into use in all of them (the provider). */
  each(fn: (engine: Engine) => void): void { for (const o of this.#ready.values()) fn(o.engine); }

  // ---------------------------------------------------------------- Elsewhere, for the engines

  lent(): { name: string; about: string }[] {
    // A special base is lent while it has notes of its own: with none, the agent is told nothing of it and its tools take no more words.
    return this.#known().filter((b) => b.lend && this.#ready.has(b.name) && (!b.special || (this.#count.get(b.name) ?? 0) > 0)).map((b) => ({ name: b.name, about: this.#about.get(b.name) ?? "" }));
  }

  base(name: string): Engine | null { return this.#ready.get(name)?.engine ?? null; }

  // ---------------------------------------------------------------- BasesPort, for the apps

  list(): BaseView[] {
    return this.#known().map((b) => ({ name: b.name, path: b.path, lend: b.lend, open: this.#ready.has(b.name), title: b.title ?? b.name, ...(b.special ? { special: b.special } : {}) }));
  }

  async lend(name: string, on: boolean): Promise<boolean> {
    if (specialBases(this.#data).some((b) => b.name === name)) return true; // always lent, while it has notes
    if (!lendBase(name, on, this.#config)) return false;
    if (on) await this.get(name);
    return true;
  }

  title(name: string, title: string): boolean { return titleBase(name, title, this.#config); }

  async open(path: string): Promise<{ name: string; first: boolean }> {
    const special = specialBases(this.#data).find((b) => b.path === resolve(path));
    const name = special?.name ?? rememberBase(resolve(path), { path: this.#config });
    await this.get(name);
    return { name, first: name === this.first };
  }

  hold(): () => void {
    this.#holds++;
    let let_go = false;
    return () => {
      if (let_go) return;
      let_go = true;
      // A moment's grace: a terminal starting as another stops keeps the server.
      if (--this.#holds === 0) setTimeout(() => { if (this.#holds === 0) this.#idle?.(); }, 1000).unref();
    };
  }

  /** A request to the server: to a base's API by its address, /b/<name>/api/…, or to the first. A base's page is
   *  the app's own page with ?base=<name> (SvelteKit's hash router needs its page at the root it was built for):
   *  /b/<name> is sent there. */
  async fetch(req: Request, env?: unknown): Promise<Response> {
    const url = new URL(req.url);
    const m = /^\/b\/([^/]+)(\/.*)?$/.exec(url.pathname);
    if (!m || !NAME.test(m[1]!)) return (await this.get(this.first)!).fetch(req, env);
    const name = m[1]!;
    if (!m[2]?.startsWith("/api/") && m[2] !== "/mcp") return new Response(null, { status: 302, headers: { Location: `/?base=${name}${m[2]?.startsWith("/#") ? m[2].slice(1) : ""}` } });
    const opening = this.get(name);
    if (!opening) return new Response(JSON.stringify({ error: `no base ${name} is known here: isorite bases lists them` }), { status: 404, headers: { "Content-Type": "application/json" } });
    let opened: Opened;
    try { opened = await opening; } catch (e) { return new Response(JSON.stringify({ error: `${name} could not be opened: ${(e as Error).message}` }), { status: 500, headers: { "Content-Type": "application/json" } }); }
    url.pathname = m[2];
    const body = req.method === "GET" || req.method === "HEAD" ? null : req.body;
    return opened.fetch(new Request(url, { method: req.method, headers: req.headers, body, signal: req.signal, ...(body ? { duplex: "half" } : {}) } as RequestInit), env);
  }
}

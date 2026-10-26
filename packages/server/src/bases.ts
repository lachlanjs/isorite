// Several knowledge bases in one server (M20). Each has its own engine and its own API, at /b/<name>/api/, and its
// page is the app's with ?base=<name>; / and /api/ stay the base the server was started for. A base is opened the first time it is
// asked for, and a lent one (`lend = true` in config.toml: the agent's memory) at the start, for every session's
// agent and Iso to look in.

import { resolve } from "node:path";
import type { Engine, Elsewhere } from "@isorite/engine";
import { knownBases, lendBase, rememberBase, type KnownBase } from "./config.ts";

/** A base as the switcher lists it. */
export interface BaseView { name: string; path: string; lend: boolean; open: boolean }

/** What a base's app is told of the others: the list, and, from this machine only, lending one, opening one by its
 *  folder (isorite term and mcp, for a server that holds another), and holding the server open. */
export interface BasesPort {
  list(): BaseView[];
  lend(name: string, on: boolean): Promise<boolean>;
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
  #holds = 0;
  readonly #idle: (() => void) | undefined;

  /** `make` opens a base; `idle` is called when the last hold is let go (a server isorite term started). */
  constructor({ config, first, make, idle }: { config: string; first: string; make: (base: KnownBase) => Promise<Opened>; idle?: () => void }) {
    this.#config = config;
    this.first = first;
    this.#make = make;
    this.#idle = idle;
  }

  /** The first base, and every lent one. */
  async start(): Promise<void> {
    await this.get(this.first);
    await Promise.all(knownBases(this.#config).filter((b) => b.lend).map((b) => this.get(b.name)?.catch((e: Error) => console.error(`isorite: ${b.name} (${b.path}) could not be opened: ${e.message}`))));
  }

  /** A known base, opened if it is not yet; null where none has that name. */
  get(name: string): Promise<Opened> | null {
    const had = this.#open.get(name);
    if (had) return had;
    const known = NAME.test(name) ? knownBases(this.#config).find((b) => b.name === name) : undefined;
    if (!known) return null;
    const opening = this.#make(known).then(async (opened) => {
      this.#ready.set(name, opened);
      this.#about.set(name, await opened.engine.about());
      // What a base's AGENTS.md says of it is kept current for the others' briefs.
      opened.engine.events((e) => { if (e.type === "note-changed") void opened.engine.about().then((a) => this.#about.set(name, a)); });
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
    return knownBases(this.#config).filter((b) => b.lend && this.#ready.has(b.name)).map((b) => ({ name: b.name, about: this.#about.get(b.name) ?? "" }));
  }

  base(name: string): Engine | null { return this.#ready.get(name)?.engine ?? null; }

  // ---------------------------------------------------------------- BasesPort, for the apps

  list(): BaseView[] {
    return knownBases(this.#config).map((b) => ({ name: b.name, path: b.path, lend: b.lend, open: this.#ready.has(b.name) }));
  }

  async lend(name: string, on: boolean): Promise<boolean> {
    if (!lendBase(name, on, this.#config)) return false;
    if (on) await this.get(name);
    return true;
  }

  async open(path: string): Promise<{ name: string; first: boolean }> {
    const name = rememberBase(resolve(path), { path: this.#config });
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
    if (!m[2]?.startsWith("/api/")) return new Response(null, { status: 302, headers: { Location: `/?base=${name}${m[2]?.startsWith("/#") ? m[2].slice(1) : ""}` } });
    const opening = this.get(name);
    if (!opening) return new Response(JSON.stringify({ error: `no base ${name} is known here: isorite bases lists them` }), { status: 404, headers: { "Content-Type": "application/json" } });
    let opened: Opened;
    try { opened = await opening; } catch (e) { return new Response(JSON.stringify({ error: `${name} could not be opened: ${(e as Error).message}` }), { status: 500, headers: { "Content-Type": "application/json" } }); }
    url.pathname = m[2];
    const body = req.method === "GET" || req.method === "HEAD" ? null : req.body;
    return opened.fetch(new Request(url, { method: req.method, headers: req.headers, body, signal: req.signal, ...(body ? { duplex: "half" } : {}) } as RequestInit), env);
  }
}

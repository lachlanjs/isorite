// The provider's setup from Iso's settings (M18): config.toml's [provider] and [tiers] as a form, checked as
// isorite doctor checks them before it is kept, and kept into use without a restart. Secrets go in and never come
// back: the key, the .pfx's password, and a header or query value whose name looks secret. A key stays with the
// address it was given for: change the address without giving a key, and the key is forgotten.

import { copyFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { EngineError, endpoint, OPENROUTER, TIERS, unreachable, type Http, type ProviderConfig, type ProviderSetup, type SetupCheck, type SetupDraft, type SetupPair, type SetupView, type Tier } from "@isorite/engine";
import { configPath, gatewayTlsFrom, providerFrom, readConfig, table, writeConfig, type GatewayTls, type Table } from "./config.ts";
import { checkProvider, doctor, SECRET } from "./doctor.ts";
import { gatewayHttp } from "./gateway.ts";

/** What the page sent that cannot be kept: said back to it as it is (400). */
export class SetupError extends EngineError {}

/** The fields of [provider] the form holds. The rest (spend_cap, cache_marks, context, …) are left as they are. */
const FORM = ["url", "name", "auth", "key", "key_header", "headers", "query", "pfx", "pfx_passphrase", "cert", "cert_key", "ca", "stream_usage", "max_tokens"];
const NAMED = /^\$[A-Za-z_][A-Za-z0-9_]*$/;
const text = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const secretPair = (name: string, value: string) => SECRET.test(name) && !NAMED.test(value);

/** The setup a configuration holds, its secrets held back. */
export function readSetup(config: Table): ProviderSetup {
  const p = table(config.provider), tiers = table(config.tiers);
  const pairs = (v: unknown): SetupPair[] => Object.entries(table(v)).map(([name, x]) => (secretPair(name, text(x)) ? { name, value: "", held: true } : { name, value: text(x) }));
  const gateway = typeof p.url === "string" && p.url !== "";
  return {
    kind: gateway ? "gateway" : "openrouter",
    name: text(p.name), url: gateway ? (p.url as string) : OPENROUTER.url,
    keyHeld: text(p.key) !== "", keyHeader: text(p.key_header),
    headers: pairs(p.headers), query: pairs(p.query),
    pfx: text(p.pfx), passphraseHeld: p.pfx_passphrase !== undefined && text(p.pfx_passphrase) !== "",
    cert: text(p.cert), certKey: text(p.cert_key), ca: text(p.ca),
    streamUsage: p.stream_usage !== false,
    maxTokens: typeof p.max_tokens === "number" && p.max_tokens > 0 ? p.max_tokens : null,
    tiers: Object.fromEntries(TIERS.map((t) => [t, text(tiers[t]) || OPENROUTER.tiers[t]])) as Record<Tier, string>,
  };
}

/** The configuration with `draft` in place of its setup; and whether the key was forgotten for a new address. */
export function applySetup(config: Table, draft: SetupDraft): { config: Table; forgot: boolean } {
  const old = table(config.provider), p: Table = Object.fromEntries(Object.entries(old).filter(([k]) => !FORM.includes(k)));
  const gateway = draft.kind === "gateway", url = gateway ? draft.url.trim() : "";
  if (gateway) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new SetupError("the gateway's address is not an address: it begins https:// (or http:// on this machine)"); }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new SetupError("the gateway's address begins https:// (or http:// on this machine)");
    p.url = url.replace(/\/+$/, "");
    if (draft.name.trim()) p.name = draft.name.trim();
  }
  // Where the key goes, before and after: OpenRouter's address where none is named.
  const at = (url: string) => (url || OPENROUTER.url).replace(/\/+$/, "");
  const moved = at(text(old.url)) !== at(text(p.url));
  if (!moved && old.auth !== undefined) p.auth = old.auth;
  // The key, kept only for the address it was given for.
  let forgot = false;
  if (typeof draft.key === "string" && draft.key.trim()) {
    const key = draft.key.trim();
    if (key.length > 400 || /\s/.test(key)) throw new SetupError("that does not look like a key");
    p.key = key;
  } else if (draft.key === undefined && old.key !== undefined) {
    if (moved) forgot = true; else p.key = old.key;
  }
  if (gateway) {
    if (draft.keyHeader.trim()) p.key_header = draft.keyHeader.trim();
    const pairs = (field: "headers" | "query", given: SetupPair[]): void => {
      const before = table(old[field]), out: Table = {};
      for (const pair of given) {
        const name = pair.name.trim();
        if (!name) continue;
        if (!/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/.test(name)) throw new SetupError(`${field === "headers" ? "a header's" : "a query value's"} name has a character it cannot have: ${name}`);
        // Held, and not given again: as it was, unless the address moved.
        if (pair.held && !pair.value) { if (before[name] !== undefined && !moved) out[name] = before[name]; continue; }
        out[name] = pair.value;
      }
      if (Object.keys(out).length) p[field] = out;
    };
    pairs("headers", draft.headers);
    pairs("query", draft.query);
    for (const [field, value] of [["pfx", draft.pfx], ["cert", draft.cert], ["cert_key", draft.certKey], ["ca", draft.ca]] as const) if (value.trim()) p[field] = value.trim();
    if (p.pfx !== undefined) {
      if (typeof draft.passphrase === "string" && draft.passphrase) p.pfx_passphrase = draft.passphrase;
      else if (draft.passphrase === undefined && old.pfx_passphrase !== undefined) p.pfx_passphrase = old.pfx_passphrase;
    }
    if (!draft.streamUsage) p.stream_usage = false;
    if (draft.maxTokens !== null) {
      if (!(Number.isInteger(draft.maxTokens) && draft.maxTokens > 0 && draft.maxTokens <= 1_000_000)) throw new SetupError("max_tokens is a whole number of tokens");
      p.max_tokens = draft.maxTokens;
    }
  }
  // The tiers: named where they differ from OpenRouter's, and always for a gateway, whose names are its own.
  const tiers: Table = Object.fromEntries(Object.entries(table(config.tiers)).filter(([k]) => !(TIERS as readonly string[]).includes(k)));
  for (const t of TIERS) {
    const model = draft.tiers[t]?.trim() ?? "";
    if (model.length > 200 || /\s/.test(model)) throw new SetupError(`the ${t} tier's model is not a model's name`);
    if (model && (gateway || model !== OPENROUTER.tiers[t])) tiers[t] = model;
  }
  const out: Table = { ...config, provider: p };
  if (Object.keys(tiers).length) out.tiers = tiers; else delete out.tiers;
  if (!Object.keys(p).length) delete out.provider;
  return { config: out, forgot };
}

/** How a configuration reaches its provider: the provider, its Http, and the key. Throws, saying which setting, when
 *  it cannot (a "$NAME" not set, a certificate missing or not opened by its password). */
export interface Reached { provider: ProviderConfig; http: Http; key: string | null; tls: GatewayTls | null }
export function reach(config: Table, dir: string, env: NodeJS.ProcessEnv = process.env): Reached {
  const provider = providerFrom(config, env), tls = gatewayTlsFrom(config, dir, env);
  return { provider, http: gatewayHttp(provider, tls, env), key: text(table(config.provider).key) || null, tls };
}

export interface SetupOptions {
  config?: string;
  env?: NodeJS.ProcessEnv;
  /** The notes, for the report. */
  notes?: string;
  version?: string;
  /** The server's port, for the report's line on it. */
  port?: number;
  /** Called once a setup or a key is kept, to take it into use. */
  kept?: () => Promise<void>;
}

/** The setup, for the server's routes. */
export class Setup {
  private readonly path: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly o: SetupOptions;
  constructor(o: SetupOptions = {}) {
    this.o = o;
    this.env = o.env ?? process.env;
    this.path = o.config ?? configPath(this.env);
  }

  view(local: boolean): SetupView {
    return { setup: readSetup(readConfig(this.path)), local, config: this.path };
  }

  /** The configuration a draft would make, or the one kept (null). */
  private draft(draft: SetupDraft | null): Table {
    const config = readConfig(this.path);
    return draft ? applySetup(config, draft).config : config;
  }

  /** Doctor's checks of the provider, on the draft as if it were kept. Nothing is written. */
  async check(draft: SetupDraft | null): Promise<SetupCheck[]> {
    const checks: SetupCheck[] = [], say = (step: string, outcome: SetupCheck["outcome"], said: string) => void checks.push({ step, outcome, said });
    let r: Reached;
    try { r = reach(this.draft(draft), dirname(this.path), this.env); } catch (e) { say("setup", "fail", (e as Error).message); return checks; }
    if (!r.key && !r.tls && /\/\/(?:[^/]*\.)?openrouter\.ai\b/.test(r.provider.url)) { say("key", "fail", "none: paste one, or sign in for one"); return checks; }
    await checkProvider(r.provider, r.http, r.key, say);
    return checks;
  }

  /** The models the provider lists, for the tiers to be chosen from. Empty where it has no list. */
  async models(draft: SetupDraft | null): Promise<string[]> {
    let r: Reached;
    try { r = reach(this.draft(draft), dirname(this.path), this.env); } catch (e) { throw new SetupError((e as Error).message); }
    const to = endpoint(r.provider, r.key, "/models");
    let res: Response;
    try { res = await r.http.fetch(to.url, { headers: to.headers, signal: AbortSignal.timeout(20_000) }); } catch (e) { throw new SetupError(unreachable(e, r.provider.url)); }
    if (!res.ok) { await res.body?.cancel(); return []; }
    const listed = (((await res.json().catch(() => ({}))) as { data?: { id?: unknown }[] }).data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
    return [...new Set(listed)].sort();
  }

  /** Keep the draft, once it is known to be usable, and take it into use. The file as it was is kept beside it the
   *  first time, since writing it loses its comments. */
  async keep(draft: SetupDraft, local: boolean): Promise<SetupView> {
    const { config } = applySetup(readConfig(this.path), draft);
    try { reach(config, dirname(this.path), this.env); } catch (e) { throw new SetupError((e as Error).message); }
    if (existsSync(this.path) && !existsSync(`${this.path}.bak`)) copyFileSync(this.path, `${this.path}.bak`);
    writeConfig(config, this.path);
    await this.o.kept?.();
    return this.view(local);
  }

  /** A key was kept or forgotten by the engine: taken into use as a setup is. */
  async changed(): Promise<void> { await this.o.kept?.(); }

  /** isorite doctor --report, as one block with its secrets hidden. */
  async report(): Promise<string> {
    const lines: string[] = [];
    await doctor(this.o.notes, { report: true, env: this.env, out: (l) => lines.push(l), ...(this.o.version ? { version: this.o.version } : {}), ...(this.o.port ? { port: this.o.port } : {}) });
    return lines.join("\n");
  }
}

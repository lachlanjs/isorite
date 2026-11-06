// The keys the native agent uses (M36, step 8), and which model it was told to use: kept in isorite's data folder,
// apart from the notes and from any repository, in files only their owner can read. A key is read back only to be used
// for a request; the pages are told whether one is set, never what it is. Nothing here logs a value, and an error
// names a file, never what was in it.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** The providers the settings offer: those a person signs up to with a key of their own. Pi's subscription sign-ins
 *  (for a ChatGPT or Copilot plan) are not offered: their terms are the provider's, not isorite's to rely on. */
export const PROVIDERS: { id: string; name: string; env: string }[] = [
  { id: "openrouter", name: "OpenRouter", env: "OPENROUTER_API_KEY" },
  { id: "anthropic", name: "Anthropic (API key)", env: "ANTHROPIC_API_KEY" },
  { id: "openai", name: "OpenAI (API key)", env: "OPENAI_API_KEY" },
  { id: "google", name: "Google Gemini", env: "GEMINI_API_KEY" },
  { id: "mistral", name: "Mistral", env: "MISTRAL_API_KEY" },
  { id: "groq", name: "Groq", env: "GROQ_API_KEY" },
  { id: "xai", name: "xAI", env: "XAI_API_KEY" },
  { id: "deepseek", name: "DeepSeek", env: "DEEPSEEK_API_KEY" },
  { id: "together", name: "Together", env: "TOGETHER_API_KEY" },
  { id: "fireworks", name: "Fireworks", env: "FIREWORKS_API_KEY" },
  { id: "cerebras", name: "Cerebras", env: "CEREBRAS_API_KEY" },
];

export interface Choice { provider: string; model: string }

/** What the native agent may reach in the project (M36 step 9). */
export interface Reach { files: "off" | "read" | "write"; shell: boolean }
/** The default: the project's files to read, nothing to change them with, no shell. */
export const DEFAULT_REACH: Reach = { files: "read", shell: false };

interface Kept { version: 1; keys: Record<string, string>; choice?: Choice; reach?: Reach }

const ID = /^[a-z0-9-]{1,40}$/;

/** Where isorite keeps what is its own, not the base's. */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "isorite");
}

export class Credentials {
  readonly #file: string;
  readonly #dir: string;
  readonly #env: NodeJS.ProcessEnv;
  #kept: Kept | null = null;
  #writing: Promise<void> = Promise.resolve();

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.#env = env;
    this.#dir = dataDir(env);
    this.#file = join(this.#dir, "credentials.json");
  }

  async #load(): Promise<Kept> {
    if (this.#kept) return this.#kept;
    let text: string;
    try { text = await readFile(this.#file, "utf8"); } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return (this.#kept = { version: 1, keys: {} });
      throw new Error(`The keys file ${this.#file} could not be read (${(e as NodeJS.ErrnoException).code ?? "unreadable"}). It was left where it is.`);
    }
    let parsed: Partial<Kept> | null;
    try { parsed = JSON.parse(text) as Partial<Kept> | null; } catch { throw new Error(`The keys file ${this.#file} is not valid JSON. It was left where it is.`); }
    if (!parsed || parsed.version !== 1 || typeof parsed.keys !== "object" || parsed.keys === null) throw new Error(`The keys file ${this.#file} is not one this version of isorite wrote. It was left where it is.`);
    return (this.#kept = { version: 1, keys: parsed.keys, ...(parsed.choice ? { choice: parsed.choice } : {}), ...(parsed.reach ? { reach: parsed.reach } : {}) });
  }

  async #save(next: Kept): Promise<void> {
    const run = async () => {
      await mkdir(this.#dir, { recursive: true, mode: 0o700 });
      const tmp = `${this.#file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(next), { mode: 0o600 });
      await rename(tmp, this.#file);
      this.#kept = next;
    };
    const turn = this.#writing.then(run, run);
    this.#writing = turn.catch(() => undefined);
    await turn;
  }

  /** The key to use for `provider`: the one saved here, else the provider's own variable in the environment. */
  async key(provider: string): Promise<string | undefined> {
    const kept = (await this.#load()).keys[provider];
    if (kept) return kept;
    const env = PROVIDERS.find((p) => p.id === provider)?.env;
    return (env && this.#env[env]) || undefined;
  }

  /** Where each provider's key comes from, never the key. */
  async sources(): Promise<Record<string, "saved" | "environment" | null>> {
    const kept = (await this.#load()).keys;
    return Object.fromEntries(PROVIDERS.map((p) => [p.id, kept[p.id] ? "saved" : this.#env[p.env] ? "environment" : null]));
  }

  async set(provider: string, key: string): Promise<void> {
    if (!PROVIDERS.some((p) => p.id === provider)) throw new Error(`"${provider}" is not a provider isorite offers`);
    const k = key.trim();
    if (!k || k.length > 1000 || /\s/.test(k)) throw new Error("that does not look like a key (it is empty, has spaces, or is very long)");
    const now = await this.#load();
    await this.#save({ ...now, keys: { ...now.keys, [provider]: k } });
  }

  async remove(provider: string): Promise<void> {
    const now = await this.#load();
    if (!(provider in now.keys)) return;
    const { [provider]: _gone, ...keys } = now.keys;
    await this.#save({ ...now, keys });
  }

  /** What was chosen in the settings, else the default. Anything else in the file is not believed. */
  async reach(): Promise<Reach> {
    const r = (await this.#load()).reach;
    return r && ["off", "read", "write"].includes(r.files) && typeof r.shell === "boolean" ? { files: r.files, shell: r.shell } : { ...DEFAULT_REACH };
  }

  async setReach(reach: Reach): Promise<void> {
    if (!["off", "read", "write"].includes(reach.files) || typeof reach.shell !== "boolean") throw new Error("files is off, read or write; shell is on or off");
    const now = await this.#load();
    await this.#save({ ...now, reach: { files: reach.files, shell: reach.shell } });
  }

  async choice(): Promise<Choice | null> { return (await this.#load()).choice ?? null; }

  async choose(provider: string, model: string): Promise<void> {
    if (!PROVIDERS.some((p) => p.id === provider) || !ID.test(provider)) throw new Error(`"${provider}" is not a provider isorite offers`);
    if (!model.trim() || model.length > 200) throw new Error("a model is needed");
    const now = await this.#load();
    await this.#save({ ...now, choice: { provider, model: model.trim() } });
  }
}

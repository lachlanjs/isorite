// The agent chosen in a base's settings (M25), for the Iso pane with no front end of its own: the server starts it
// behind `isorite acp --pane`, from the folder the base is in, and stops it when another is chosen or none.
//
// The agents are those of the ACP registry (agentclientprotocol.com's), run as it says: with npx or uvx, or as a
// program it names for this platform, fetched once into isorite's own folder and checked against its SHA-256. Or a
// command of your own (`hermes acp`), for an agent the registry does not list. What the agent needs to reach its
// model (a key, a provider) is its own: it is set up as for its own terminal, and it has the server's environment.
//
// The choice is kept in bases.toml, beside the base's folder: it is this machine's, not the base's to carry.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { basesPath, readConfig, table, writeConfig } from "./config.ts";
import { cacheDir } from "./embedder.ts";
import { MAIN } from "./running.ts";
import { self } from "./self.ts";

import { missingKey } from "./detect.ts";

export const REGISTRY = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";
const FRESH = 60 * 60 * 1000;

type Npx = { package: string; args?: string[]; env?: Record<string, string> };
type Binary = { archive: string; cmd: string; args?: string[]; env?: Record<string, string>; sha256?: string };
export interface Entry { id: string; name: string; version: string; description?: string; repository?: string; website?: string; distribution?: { npx?: Npx; uvx?: Npx; binary?: Record<string, Binary> } }

/** An agent of the registry, as the settings list it: how it would be run here, if it can be. */
export interface RegistryAgent { id: string; name: string; version: string; description: string; site: string; how: "npx" | "uvx" | "binary" | null }
/** What a base has chosen: an agent of the registry by its id, or a command of your own. */
export type AgentChoice = { id: string } | { command: string };
/** The base's agent, as the settings show it. */
export interface AgentState { choice: AgentChoice | null; running: boolean; command: string; problem: string; said: string; hint: string }

const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const dataDir = (env: NodeJS.ProcessEnv) => join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "isorite", "agents");
/** The registry's name for this platform. */
const platform = (): string => `${process.platform === "win32" ? "windows" : process.platform}-${process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : process.arch}`;
/** A word a shell takes as it is. */
const quoted = (s: string): string => (/^[\w@%+=:,./-]+$/.test(s) ? s : process.platform === "win32" ? `"${s.replace(/"/g, '""')}"` : `'${s.replace(/'/g, `'\\''`)}'`);
const envWords = (env: Record<string, string> | undefined): string[] => Object.entries(env ?? {}).filter(([k]) => /^[A-Za-z_]\w*$/.test(k)).map(([k, v]) => `${k}=${quoted(v)}`);

/** The registry: from ISORITE_ACP_REGISTRY (an address or a file) or the CDN, kept an hour in isorite's cache, and
 *  that copy used as it is when the registry cannot be reached. */
export async function readRegistry(env: NodeJS.ProcessEnv = process.env): Promise<Entry[]> {
  const from = env.ISORITE_ACP_REGISTRY || REGISTRY;
  const parse = (text: string): Entry[] => {
    const agents = (JSON.parse(text) as { agents?: unknown }).agents;
    return Array.isArray(agents) ? (agents as Entry[]).filter((a) => typeof a?.id === "string" && ID.test(a.id) && typeof a.name === "string") : [];
  };
  if (!/^https?:/.test(from)) return parse(readFileSync(from, "utf8"));
  const kept = join(cacheDir(env), "acp-registry.json");
  let stale: string | null = null;
  try {
    const text = readFileSync(kept, "utf8"), at = (JSON.parse(text) as { at?: number }).at ?? 0;
    if (Date.now() - at < FRESH) return parse(text);
    stale = text;
  } catch { /* none kept yet */ }
  try {
    const r = await fetch(from, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error(`the ACP registry answered ${r.status}`);
    const got = (await r.json()) as Record<string, unknown>;
    const text = JSON.stringify({ ...got, at: Date.now() });
    mkdirSync(dirname(kept), { recursive: true });
    writeFileSync(kept, text);
    return parse(text);
  } catch (e) {
    if (stale) return parse(stale);
    throw new Error(`the ACP registry could not be read: ${(e as Error).message}`);
  }
}

const howOf = (e: Entry): RegistryAgent["how"] => (e.distribution?.binary?.[platform()] ? "binary" : e.distribution?.npx ? "npx" : e.distribution?.uvx ? "uvx" : null);

export async function registryAgents(env: NodeJS.ProcessEnv = process.env): Promise<RegistryAgent[]> {
  return (await readRegistry(env)).map((e) => ({ id: e.id, name: e.name, version: e.version ?? "", description: e.description ?? "", site: e.website ?? e.repository ?? "", how: howOf(e) })).sort((a, b) => a.name.localeCompare(b.name));
}

/** How a registry agent is run here, as a shell command: its program fetched first, if it is one. A program for this
 *  platform comes before npx and uvx: it needs neither Node's nor Python's tools. */
export async function commandOf(e: Entry, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  const d = e.distribution ?? {};
  const bin = d.binary?.[platform()];
  if (bin) {
    const dir = join(dataDir(env), e.id, (e.version || "latest").replace(/[^\w.-]/g, "_"));
    const cmd = resolve(dir, bin.cmd);
    if (!cmd.startsWith(dir)) throw new Error(`${e.name}: its program is outside its folder`);
    if (!existsSync(cmd)) await fetchProgram(bin, dir);
    return [...envWords(bin.env), quoted(cmd), ...(bin.args ?? []).map(quoted)].join(" ");
  }
  if (d.npx) return [...envWords(d.npx.env), "npx", "-y", quoted(d.npx.package), ...(d.npx.args ?? []).map(quoted)].join(" ");
  if (d.uvx) return [...envWords(d.uvx.env), "uvx", quoted(d.uvx.package), ...(d.uvx.args ?? []).map(quoted)].join(" ");
  throw new Error(`${e.name} is not offered for ${platform()}`);
}

/** A program from the registry, into its own folder: fetched, checked against its SHA-256, and unpacked. */
async function fetchProgram(bin: Binary, dir: string): Promise<void> {
  if (!/^https:\/\//.test(bin.archive)) throw new Error("the registry names a program not fetched over https");
  const r = await fetch(bin.archive, { signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`${bin.archive} answered ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  const sum = createHash("sha256").update(bytes).digest("hex");
  if (bin.sha256 && sum !== bin.sha256.toLowerCase()) throw new Error(`${bin.archive} is not what the registry says (SHA-256 ${sum})`);
  const making = `${dir}.part`;
  rmSync(making, { recursive: true, force: true });
  mkdirSync(making, { recursive: true });
  const name = new URL(bin.archive).pathname.split("/").at(-1) ?? "program";
  const file = join(making, name);
  writeFileSync(file, bytes);
  const unpack = /\.zip$/i.test(name) ? (process.platform === "win32" ? ["tar", ["-xf", file, "-C", making]] : ["unzip", ["-oq", file, "-d", making]])
    : /\.(tar(\.\w+)?|tgz|tbz2?|txz)$/i.test(name) ? ["tar", ["-xf", file, "-C", making]] : null;
  if (unpack) {
    const done = spawnSync(unpack[0] as string, unpack[1] as string[], { stdio: "pipe" });
    if (done.status !== 0) throw new Error(`${name} could not be unpacked: ${String(done.stderr ?? done.error?.message ?? "").trim()}`);
    rmSync(file);
  } else {
    renameSync(file, join(making, bin.cmd));
  }
  try { chmodSync(join(making, bin.cmd), 0o755); } catch { /* where it is, as it came */ }
  rmSync(dir, { recursive: true, force: true });
  renameSync(making, dir);
}

/** What bases.toml says this base has chosen. */
export function chosenAgent(base: string, config: string): AgentChoice | null {
  const row = table(readConfig(basesPath(config))[base]);
  if (typeof row.agent === "string" && ID.test(row.agent)) return { id: row.agent };
  if (typeof row.agent_command === "string" && row.agent_command.trim()) return { command: row.agent_command.trim() };
  return null;
}
export function chooseAgent(base: string, choice: AgentChoice | null, config: string): void {
  const bases = readConfig(basesPath(config));
  if (!bases[base]) throw new Error(`${base} is not among the bases`);
  const { agent: _a, agent_command: _c, ...row } = table(bases[base]);
  bases[base] = { ...row, ...(choice && "id" in choice ? { agent: choice.id } : choice ? { agent_command: choice.command } : {}) };
  writeConfig(bases, basesPath(config));
}

/** A base's agent, started behind the wrapper for the pane. */
export class AgentRunner {
  readonly #base: string;
  readonly #url: string;
  readonly #folder: string;
  readonly #config: string;
  readonly #env: NodeJS.ProcessEnv;
  #child: ChildProcess | null = null;
  #command = "";
  #problem = "";
  #said = "";
  #starting: Promise<void> | null = null;

  /** `url`: the base on this server; `folder`: where the agent works (the repository the base is in). */
  constructor({ base, url, folder, config, env = process.env }: { base: string; url: string; folder: string; config: string; env?: NodeJS.ProcessEnv }) {
    this.#base = base;
    this.#url = url;
    this.#folder = folder;
    this.#config = config;
    this.#env = env;
    process.once("exit", () => this.#child?.kill());
  }

  state(): AgentState {
    // A stop, or a refusal to sign in, with the key not set where isorite was started, is told as that (M26).
    const hint = this.#problem && this.#command ? missingKey(this.#command, this.#env) : "";
    return { choice: chosenAgent(this.#base, this.#config), running: this.#child !== null, command: this.#command, problem: this.#problem, said: this.#said, hint };
  }
  /** Kept, and started in place of the one running; with none, the one running is stopped. */
  async choose(choice: AgentChoice | null): Promise<AgentState> {
    chooseAgent(this.#base, choice, this.#config);
    this.stop();
    if (choice) await this.start();
    return this.state();
  }

  /** The chosen agent, started if it is not running. */
  start(): Promise<void> {
    if (this.#child) return Promise.resolve();
    this.#starting ??= this.#start().finally(() => { this.#starting = null; });
    return this.#starting;
  }
  async #start(): Promise<void> {
    const choice = chosenAgent(this.#base, this.#config);
    if (!choice) return;
    this.#problem = "";
    this.#said = "";
    try {
      if ("command" in choice) this.#command = choice.command;
      else {
        const entry = (await readRegistry(this.#env)).find((e) => e.id === choice.id);
        if (!entry) throw new Error(`${choice.id} is not in the ACP registry`);
        this.#command = await commandOf(entry, this.#env);
      }
    } catch (e) {
      this.#problem = (e as Error).message;
      return;
    }
    const again = self(MAIN, ["acp", "--pane", "--url", this.#url, "--agent", this.#command]);
    const child = spawn(again.command, again.args, { cwd: this.#folder, env: this.#env, stdio: ["ignore", "ignore", "pipe"] });
    this.#child = child;
    // What it says on stderr, the last of it: why an agent that stops did.
    child.stderr?.on("data", (d: Buffer) => { this.#said = (this.#said + d.toString("utf8")).slice(-2000); });
    child.once("exit", (code) => {
      if (this.#child !== child) return;
      this.#child = null;
      if (code) this.#problem = `the agent stopped (${code})`;
    });
  }

  stop(): void {
    const child = this.#child;
    this.#child = null;
    this.#problem = "";
    child?.kill("SIGTERM");
  }
}

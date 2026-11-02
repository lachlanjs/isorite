// The chat's service (M28): who is signed in to which host, the repositories the project's remotes name, and the
// threads of those, read and replied to as the person signed in. Everything the routes need, with `fetch`, the host's
// own tool and the clock given, so it is tried against a server of the tests' making.

import { execFileSync } from "node:child_process";
import type { ChatHostId, ChatHostState, ChatKind, ChatMessage, ChatPerson, ChatRepo, ChatSignIn, ChatSignInState, ChatState, ChatThread, ChatThreadFull } from "@isorite/engine";
import { plainGitEnv, repoOf } from "../git.ts";
import { github } from "./github.ts";
import { gitlab } from "./gitlab.ts";
import { HostError, type ChatHost, type Fetch } from "./host.ts";
import { hostCli, pollDevice, refreshToken, startDevice, type Cli, type Flow } from "./signin.ts";
import { clientId, readSigned, writeSigned } from "./store.ts";

const SERVER = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(:\d{1,5})?$/;
export const HOSTS: Record<ChatHostId, { name: string; fixed: string }> = { github: { name: "GitHub", fixed: "github.com" }, gitlab: { name: "GitLab", fixed: "gitlab.com" } };

/** The repositories a list of git remotes name: github.com's, and any other host with "gitlab" in its name (a
 *  self-managed GitLab). A remote on another host is not one the chat can read. */
export function reposOf(remotes: string[]): ChatRepo[] {
  const found = new Map<string, ChatRepo>();
  for (const remote of remotes) {
    const m = /^(?:[a-z+]+:\/\/(?:[^@/]+@)?|[^@\s/]+@)([^/:\s]+)(?::\d+)?[/:](.+?)(?:\.git)?\/?$/i.exec(remote.trim());
    if (!m) continue;
    const server = m[1]!.toLowerCase(), path = m[2]!;
    const host: ChatHostId | null = server === "github.com" ? "github" : server.includes("gitlab") ? "gitlab" : null;
    if (!host || !SERVER.test(server) || (host === "github" && path.split("/").length !== 2)) continue;
    found.set(`${server}/${path}`, { host, server, path, url: `https://${server}/${path}` });
  }
  return [...found.values()];
}

export interface ChatOptions {
  /** chat.toml. */
  file: string;
  /** The project the base is in, whose remotes name the repositories; or null. */
  project: string | null;
  fetch?: Fetch;
  cli?: Cli;
  env?: NodeJS.ProcessEnv;
  now?: () => number;
}

export class Chat {
  private flows = new Map<string, { flow: Flow; started: number }>();
  private known = new Map<string, { me: ChatPerson; at: number }>();
  private tools = new Map<string, { has: boolean; at: number }>();
  private f: Fetch; private cli: Cli; private env: NodeJS.ProcessEnv; private now: () => number; private o: ChatOptions;

  constructor(o: ChatOptions) {
    this.o = o;
    this.f = o.fetch ?? fetch; this.cli = o.cli ?? hostCli; this.env = o.env ?? process.env; this.now = o.now ?? Date.now;
  }

  /** The project's repositories: read from its git remotes, which only reads. */
  repos(): ChatRepo[] {
    if (!this.o.project) return [];
    try {
      const root = repoOf(this.o.project);
      if (!root) return [];
      const out = execFileSync("git", ["remote", "-v"], { cwd: root, env: plainGitEnv(this.env), timeout: 10_000, killSignal: "SIGKILL", encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return reposOf(out.split("\n").map((l) => l.split(/\s+/)[1] ?? ""));
    } catch { return []; }
  }

  /** The servers the chat may talk to: the two public ones, the project's, and those signed in to. A page cannot
   *  have it ask elsewhere. */
  private servers(): string[] {
    return [...new Set(["github.com", "gitlab.com", ...this.repos().map((r) => r.server)])];
  }
  private checked(host: ChatHostId, server: string): string {
    const s = server.toLowerCase();
    if (host === "github" ? s !== "github.com" : !this.servers().includes(s)) throw new HostError(`${server} is not a ${HOSTS[host].name} server this project uses`, 400);
    return s;
  }
  private base = (host: ChatHostId, server: string): string => `https://${server}`;

  private async hasCli(host: ChatHostId, server: string): Promise<boolean> {
    const key = `${host}:${server}`, had = this.tools.get(key), now = this.now();
    if (had && now - had.at < 30_000) return had.has;
    const has = !!(await this.cli(host, this.base(host, server)));
    this.tools.set(key, { has, at: now });
    return has;
  }

  /** A host as the person signed in: through the app's token (renewed if it has run out), or the host's own tool's. */
  private async hostFor(host: ChatHostId, server: string): Promise<ChatHost> {
    const s = this.checked(host, server);
    const signed = readSigned(this.o.file, s);
    if (!signed) throw new HostError(`not signed in to ${s}`, 401);
    let token = signed.token ?? "";
    if (signed.via === "cli") {
      token = (await this.cli(host, this.base(host, s))) ?? "";
      if (!token) throw new HostError(`${HOSTS[host].name}'s own tool is no longer signed in`, 401);
    } else if (signed.expires && signed.expires < this.now() + 30_000) {
      if (!signed.refresh) { writeSigned(this.o.file, s, null); throw new HostError(`the sign-in to ${s} has run out; sign in again`, 401); }
      try {
        const next = await refreshToken(host, this.base(host, s), clientId(host, this.o.file, this.env), signed.refresh, this.f, this.now());
        writeSigned(this.o.file, s, { via: "device", ...next });
        token = next.token;
      } catch (e) { writeSigned(this.o.file, s, null); throw e; }
    }
    return host === "github" ? github(token, this.f) : gitlab(token, this.base(host, s), this.f);
  }

  /** A request that was refused as not signed in leaves the host signed out. */
  private async as<T>(host: ChatHostId, server: string, use: (h: ChatHost) => Promise<T>): Promise<T> {
    const h = await this.hostFor(host, server);
    try { return await use(h); } catch (e) {
      if (e instanceof HostError && e.status === 401) { this.known.delete(`${host}:${server}`); writeSigned(this.o.file, this.checked(host, server), null); }
      throw e;
    }
  }

  async state(): Promise<ChatState> {
    const repos = this.repos(), seen = new Set<string>(), hosts: ChatHostState[] = [];
    const rows: [ChatHostId, string][] = [["github", "github.com"], ["gitlab", "gitlab.com"], ...repos.map((r): [ChatHostId, string] => [r.host, r.server])];
    for (const [id, server] of rows) {
      if (seen.has(`${id}:${server}`)) continue;
      seen.add(`${id}:${server}`);
      const signed = readSigned(this.o.file, server);
      let me: ChatPerson | null = null;
      if (signed) {
        const key = `${id}:${server}`, had = this.known.get(key);
        if (had && this.now() - had.at < 60_000) me = had.me;
        else { try { me = await this.as(id, server, (h) => h.me()); this.known.set(key, { me, at: this.now() }); } catch { me = null; } }
      }
      hosts.push({ id, server, name: server === HOSTS[id].fixed ? HOSTS[id].name : `${HOSTS[id].name} (${server})`, me, via: me ? signed!.via : null, canSignIn: !!clientId(id, this.o.file, this.env), cli: await this.hasCli(id, server) });
    }
    return { hosts, repos };
  }

  /** Sign in by the device flow: the code to give the host. */
  async signIn(host: ChatHostId, server: string): Promise<ChatSignIn> {
    const s = this.checked(host, server), id = clientId(host, this.o.file, this.env);
    if (!id) throw new HostError(`isorite has no application id for ${HOSTS[host].name} yet; set ISORITE_${host.toUpperCase()}_CLIENT_ID, or use ${host === "github" ? "gh" : "glab"} if it is signed in`, 409);
    const started = await startDevice(host, this.base(host, s), id, this.f, this.now());
    this.flows.set(`${host}:${s}`, { flow: started.flow, started: this.now() });
    return { host, server: s, code: started.code, url: started.url, fullUrl: started.fullUrl, expires: started.expires };
  }

  /** Has the code been approved? The token, when it has, goes to the store and not to the page. */
  async poll(host: ChatHostId, server: string): Promise<ChatSignInState> {
    const s = this.checked(host, server), key = `${host}:${s}`, held = this.flows.get(key);
    if (!held) throw new HostError("no sign-in is waiting; start again", 409);
    const got = await pollDevice(held.flow, this.f, this.now());
    if (got.state !== "done") { if (got.state !== "waiting") this.flows.delete(key); return { state: got.state }; }
    this.flows.delete(key);
    writeSigned(this.o.file, s, { via: "device", ...got.token });
    try {
      const me = await this.as(host, s, (h) => h.me());
      this.known.set(key, { me, at: this.now() });
      return { state: "done", me };
    } catch (e) { writeSigned(this.o.file, s, null); throw e; }
  }

  /** Use the host's own tool's sign-in. Its token is asked of it each time and not copied. */
  async useCli(host: ChatHostId, server: string): Promise<ChatPerson> {
    const s = this.checked(host, server);
    if (!(await this.cli(host, this.base(host, s)))) throw new HostError(`${host === "github" ? "gh" : "glab"} is not signed in here`, 409);
    writeSigned(this.o.file, s, { via: "cli" });
    try { const me = await this.as(host, s, (h) => h.me()); this.known.set(`${host}:${s}`, { me, at: this.now() }); return me; } catch (e) { writeSigned(this.o.file, s, null); throw e; }
  }

  signOut(host: ChatHostId, server: string): void {
    const s = this.checked(host, server);
    this.flows.delete(`${host}:${s}`); this.known.delete(`${host}:${s}`);
    writeSigned(this.o.file, s, null);
  }

  /** Only a repository the project names may be read or written, whatever the page asks. */
  private named(host: ChatHostId, server: string, path: string): string {
    const s = this.checked(host, server);
    if (!this.repos().some((r) => r.host === host && r.server === s && r.path.toLowerCase() === path.toLowerCase())) throw new HostError(`${path} is not a repository this project names`, 403);
    return s;
  }
  async threads(host: ChatHostId, server: string, path: string): Promise<{ threads: ChatThread[]; note: string }> {
    const s = this.named(host, server, path);
    return this.as(host, s, (h) => h.threads(path));
  }
  async thread(host: ChatHostId, server: string, path: string, kind: ChatKind, number: number): Promise<ChatThreadFull> {
    const s = this.named(host, server, path);
    return this.as(host, s, (h) => h.thread(path, kind, number));
  }
  async reply(host: ChatHostId, server: string, path: string, kind: ChatKind, number: number, text: string): Promise<ChatMessage> {
    const s = this.named(host, server, path);
    return this.as(host, s, (h) => h.reply(path, kind, number, text));
  }
}

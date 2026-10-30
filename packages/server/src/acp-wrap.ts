// isorite acp --agent "<command>" [<notes>] (M25): an ACP agent to the front end that runs it (Toad, Zed), an ACP
// client to the real agent, which it starts behind itself. Every message passes through unchanged but for two
// things: isorite's MCP server is added to each session the front end opens, and what the pane asks (a prompt, a
// stop, an answer to a permission, notes given) goes into that session. The pane can also carry on one of the
// agent's sessions, or start one, on the same connection: the front end is shown nothing of those. What passed is
// told to the isorite server, which draws the sessions in the Iso pane.
//
// Messages are JSON-RPC 2.0, a line each, as ACP's stdio transport has them. Only stdout carries the protocol.

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { basename } from "node:path";
import { ensureServer, MAIN, tokenOf } from "./term.ts";
import { TOKEN_HEADER } from "./http.ts";
import { self } from "./self.ts";
import { ACP_SESSION, type Command, type Rpc, type Way } from "./acp.ts";
import { agentName } from "./mcp-http.ts";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { OWN_DIR } from "@isorite/core";

export interface AcpOptions {
  /** The agent's own ACP command, as a shell runs it: `opencode acp`, `omp acp`. */
  agent: string;
  port?: number;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

const OPENS = new Set(["session/new", "session/load", "session/resume", "session/fork"]);
const SKIP = new Set(["node_modules", ".git", OWN_DIR, "dist", "build", "target", ".venv"]);

/** The base for a session started in `cwd`: the folder itself or one above it holding .isorite/, else the first
 *  below it, three levels down at most (a base inside the repository, as notes/); or none. */
export function findBase(cwd: string): string | null {
  for (let at = cwd; ; at = dirname(at)) {
    if (existsSync(join(at, OWN_DIR))) return at;
    if (dirname(at) === at) break;
  }
  let level = [cwd];
  for (let depth = 0; depth < 3 && level.length; depth++) {
    const next: string[] = [];
    for (const dir of level) {
      let names: string[] = [];
      try { names = readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !SKIP.has(d.name) && !d.name.startsWith(".")).map((d) => d.name).sort(); } catch { continue; }
      for (const n of names) { if (existsSync(join(dir, n, OWN_DIR))) return join(dir, n); next.push(join(dir, n)); }
    }
    level = next;
  }
  return null;
}

export async function acp(path: string | undefined, { agent, port = 4767, input = process.stdin, output = process.stdout, env = process.env }: AcpOptions): Promise<number> {
  // Without a base named, the one in the folder the front end started this in (the repository's notes).
  path ??= findBase(process.cwd()) ?? undefined;
  const server = await ensureServer(path, { port, env, say: (line) => process.stderr.write(line + "\n") });
  const { url } = server;
  const token = await tokenOf(url);
  const child = spawn(agent, { shell: true, stdio: ["pipe", "pipe", "inherit"], env });
  let name = agentName(basename(agent.trim().split(/\s+/)[0] ?? "agent"));
  /** This wrapper, to the server: several may be attached to one base, each with its agent. */
  const link = randomUUID();
  /** Whether the agent takes MCP over HTTP: then isorite's is given as the base's address, not a command. */
  let httpMcp = false;
  /** Notes and passages given in the pane, by session, put before its next prompt from either place. */
  const given = new Map<string, string>();
  const withGiven = (session: string, prompt: unknown): unknown[] => {
    const blocks = Array.isArray(prompt) ? prompt : [];
    const text = given.get(session);
    if (!text) return blocks;
    given.delete(session);
    return [{ type: "text", text }, ...blocks];
  };

  // What passed, told to the server in batches.
  let batch: { way: Way; message: Rpc }[] = [];
  let flushing: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    flushing = null;
    const messages = batch;
    batch = [];
    if (!messages.length) return;
    await fetch(`${url}/api/acp/tap`, { method: "POST", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token, Origin: new URL(url).origin }, body: JSON.stringify({ link, messages }) }).catch(() => undefined);
  };
  const tap = (way: Way, message: Rpc) => { batch.push({ way, message }); flushing ??= setTimeout(() => void flush(), 30); };

  const toFront = (m: object) => output.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
  const toAgent = (m: object) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");

  /** The folder the front end works in, for the sessions the pane opens. */
  let cwd = process.cwd();
  let mcp = true;
  /** Sessions the pane opened: the front end knows nothing of them, so nothing of theirs goes to it. */
  const paneOnly = new Set<string>();
  /** Requests to the agent not yet answered, by id: the front end's and isorite's own, with their sessions. */
  const asked = new Map<string, { method: string; session: string; then?: string; give?: string }>();
  const busy = (session: string) => [...asked.values()].some((a) => a.method === "session/prompt" && a.session === session);
  /** The agent's requests, by id as a string, with the id as it was sent. */
  const agentAsked = new Map<string, string | number>();
  /** The agent's requests isorite answered for the pane: the front end's own answer is dropped. */
  const answered = new Set<string>();
  /** The agent's requests in sessions only the pane has, which the front end was never asked. */
  const paneAsked = new Set<string>();
  const waiting: { session: string; text: string }[] = [];
  /** What the agent can do with a session it already has: replay it, or only carry it on; and list them. */
  let can = { load: false, resume: false, list: false };
  let ours = 0;

  const isoriteMcp = () => {
    if (httpMcp) return { type: "http", name: "isorite", url: `${url}/mcp?${new URLSearchParams({ agent: name, session: ACP_SESSION })}`, headers: [] };
    const again = self(MAIN, ["mcp", ...(path ? [path] : []), "--port", String(port), "--agent", name, "--session", ACP_SESSION]);
    return { name: "isorite", command: again.command, args: again.args, env: [] };
  };
  /** A request of isorite's own to the agent; its answer goes no further. */
  const ask = (method: string, params: Record<string, unknown>, then?: string, give?: string) => {
    const id = `isorite-${++ours}`;
    const request = { id, method, params };
    asked.set(id, { method, session: typeof params.sessionId === "string" ? params.sessionId : "", ...(then ? { then } : {}), ...(give ? { give } : {}) });
    tap("ours", request);
    toAgent(request);
  };
  const sendWaiting = () => {
    for (let i = 0; i < waiting.length; i++) {
      const { session, text } = waiting[i]!;
      if (busy(session)) continue;
      waiting.splice(i--, 1);
      ask("session/prompt", { sessionId: session, prompt: withGiven(session, [{ type: "text", text }]) });
      // The front end is shown what was asked from the pane, as the user's words, in a session it has.
      if (!paneOnly.has(session)) toFront({ method: "session/update", params: { sessionId: session, update: { sessionUpdate: "user_message_chunk", content: { type: "text", text } } } });
    }
  };

  // The front end, to the agent.
  const front = (async () => {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      let m: Rpc;
      try { m = JSON.parse(line) as Rpc; } catch { child.stdin.write(line + "\n"); continue; }
      const key = m.id === undefined || m.id === null ? null : String(m.id);
      const session = typeof m.params?.sessionId === "string" ? m.params.sessionId : "";
      if (m.method && key !== null) {
        asked.set(key, { method: m.method, session });
        if (typeof m.params?.cwd === "string") cwd = m.params.cwd;
        if (OPENS.has(m.method) && mcp) {
          const servers = Array.isArray(m.params?.mcpServers) ? (m.params.mcpServers as { name?: string }[]) : [];
          if (!servers.some((s) => s.name === "isorite")) m = { ...m, params: { ...m.params, mcpServers: [...servers, isoriteMcp()] } };
        }
        // A session the pane had alone is the front end's too, once it asks for it.
        if (m.method === "session/load" || m.method === "session/resume") paneOnly.delete(session);
        if (m.method === "session/prompt" && given.has(session)) m = { ...m, params: { ...m.params, prompt: withGiven(session, m.params?.prompt) } };
      }
      if (!m.method && key !== null && answered.has(key)) { answered.delete(key); continue; }
      if (!m.method && key !== null) agentAsked.delete(key);
      tap("in", m);
      toAgent(m);
    }
    child.stdin.end();
  })();

  // The agent, to the front end.
  const back = (async () => {
    for await (const line of createInterface({ input: child.stdout, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      let m: Rpc;
      try { m = JSON.parse(line) as Rpc; } catch { output.write(line + "\n"); continue; }
      const key = m.id === undefined || m.id === null ? null : String(m.id);
      const session = typeof m.params?.sessionId === "string" ? m.params.sessionId : "";
      if (!m.method && key !== null && asked.has(key)) {
        const was = asked.get(key)!;
        asked.delete(key);
        if (was.method === "initialize") {
          const info = m.result?.agentInfo as { name?: string } | undefined;
          if (info?.name) name = agentName(info.name);
          const caps = (m.result?.agentCapabilities ?? {}) as { mcpCapabilities?: { http?: boolean }; loadSession?: boolean; sessionCapabilities?: { resume?: unknown; list?: unknown } };
          httpMcp = Boolean(caps.mcpCapabilities?.http);
          can = { load: !!caps.loadSession, resume: !!caps.sessionCapabilities?.resume, list: !!caps.sessionCapabilities?.list };
        }
        tap("out", m);
        if (key.startsWith("isorite-")) {
          // A session the pane opened: its own, and what was to be asked in it.
          const opened = was.method === "session/new" ? (typeof m.result?.sessionId === "string" ? m.result.sessionId : "") : was.session;
          if (!m.error && opened && (was.method === "session/new" || was.method === "session/load" || was.method === "session/resume")) {
            paneOnly.add(opened);
            if (was.give) given.set(opened, was.give);
            if (was.then) waiting.push({ session: opened, text: was.then });
          }
          sendWaiting();
          continue;
        }
        output.write(line + "\n");
        sendWaiting();
        continue;
      }
      if (m.method && key !== null) agentAsked.set(key, m.id!);
      if (m.method && key !== null && paneOnly.has(session)) paneAsked.add(key);
      tap("out", m);
      // What happens in a session only the pane has is not the front end's.
      if (session && paneOnly.has(session)) continue;
      output.write(line + "\n");
    }
  })();

  // What the pane asks.
  const commands = new AbortController();
  const listen = (async () => {
    while (!commands.signal.aborted) {
      try {
        const response = await fetch(`${url}/api/acp/commands?link=${link}`, { headers: { [TOKEN_HEADER]: token }, signal: commands.signal });
        if (!response.ok || !response.body) throw new Error(String(response.status));
        let buffer = "";
        for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += Buffer.from(chunk).toString("utf8");
          let at: number;
          while ((at = buffer.indexOf("\n\n")) >= 0) {
            const event = buffer.slice(0, at);
            buffer = buffer.slice(at + 2);
            if (!/^event: command$/m.test(event)) continue;
            const data = event.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("\n");
            command(JSON.parse(data) as Command);
          }
        }
      } catch { /* the server went, or was restarted: listen again */ }
      if (!commands.signal.aborted) await new Promise((r) => setTimeout(r, 1000));
    }
  })();
  function command(c: Command): void {
    if (c.type === "prompt") { waiting.push({ session: c.session, text: c.text }); sendWaiting(); }
    if (c.type === "give") { if (c.text) given.set(c.session, c.text); else given.delete(c.session); }
    if (c.type === "cancel") { const m = { method: "session/cancel", params: { sessionId: c.session } }; tap("ours", m); toAgent(m); }
    if (c.type === "list" && can.list) ask("session/list", { cwd });
    if (c.type === "open") {
      const params = { cwd, mcpServers: mcp ? [isoriteMcp()] : [] };
      if (!c.session) ask("session/new", params, c.then, c.give);
      else ask(can.load ? "session/load" : "session/resume", { ...params, sessionId: c.session }, c.then, c.give);
    }
    if (c.type === "permission" && agentAsked.has(c.id)) {
      const id = agentAsked.get(c.id)!;
      agentAsked.delete(c.id);
      answered.add(c.id);
      const m = { id, result: { outcome: { outcome: "selected", optionId: c.optionId } } };
      tap("ours", m);
      toAgent(m);
      // The front end is still asking: it is told the question is withdrawn. (One only the pane was asked, it never saw.)
      if (paneAsked.delete(c.id)) answered.delete(c.id);
      else toFront({ method: "$/cancel_request", params: { requestId: id } });
    }
  }

  const code = await new Promise<number>((done) => child.once("exit", (c) => done(c ?? 0)));
  commands.abort();
  // The front end may still be connected: only the agent's side is waited for.
  void front; void listen;
  await back.catch(() => undefined);
  await flush();
  server.release();
  return code;
}

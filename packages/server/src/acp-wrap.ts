// isorite acp --agent "<command>" [<notes>] (M25, the spike): an ACP agent to the front end that runs it (Toad,
// Zed), an ACP client to the real agent, which it starts behind itself. Every message passes through unchanged but
// for two things: isorite's MCP server is added to each session the front end opens, and what the pane asks (a
// prompt, a stop, an answer to a permission) goes into the same session. What passed is told to the isorite
// server, which draws the session in the Iso pane.
//
// Messages are JSON-RPC 2.0, a line each, as ACP's stdio transport has them. Only stdout carries the protocol.

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { basename } from "node:path";
import { ensureServer, MAIN, tokenOf } from "./term.ts";
import { TOKEN_HEADER } from "./http.ts";
import { self } from "./self.ts";
import type { Command, Rpc, Way } from "./acp.ts";

export interface AcpOptions {
  /** The agent's own ACP command, as a shell runs it: `opencode acp`, `omp acp`. */
  agent: string;
  port?: number;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

const OPENS = new Set(["session/new", "session/load", "session/resume", "session/fork"]);
/** A name the Atlas can show: small letters, digits and dashes. */
const named = (s: string): string => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "agent";

export async function acp(path: string | undefined, { agent, port = 4767, input = process.stdin, output = process.stdout, env = process.env }: AcpOptions): Promise<number> {
  const server = await ensureServer(path, { port, env, say: (line) => process.stderr.write(line + "\n") });
  const { url } = server;
  const token = await tokenOf(url);
  const child = spawn(agent, { shell: true, stdio: ["pipe", "pipe", "inherit"], env });
  let name = named(basename(agent.trim().split(/\s+/)[0] ?? "agent"));

  // What passed, told to the server in batches.
  let batch: { way: Way; message: Rpc }[] = [];
  let flushing: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    flushing = null;
    const messages = batch;
    batch = [];
    if (!messages.length) return;
    await fetch(`${url}/api/acp/tap`, { method: "POST", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token, Origin: new URL(url).origin }, body: JSON.stringify({ messages }) }).catch(() => undefined);
  };
  const tap = (way: Way, message: Rpc) => { batch.push({ way, message }); flushing ??= setTimeout(() => void flush(), 30); };

  const toFront = (m: object) => output.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
  const toAgent = (m: object) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");

  let session: string | null = null;
  let mcp = true;
  /** Requests to the agent not yet answered, by id: the front end's and isorite's own. */
  const asked = new Map<string, string>();
  const busy = () => [...asked.values()].includes("session/prompt");
  /** The agent's requests, by id as a string, with the id as it was sent. */
  const agentAsked = new Map<string, string | number>();
  /** The agent's requests isorite answered for the pane: the front end's own answer is dropped. */
  const answered = new Set<string>();
  const waiting: string[] = [];
  let ours = 0;

  const isoriteMcp = () => {
    const again = self(MAIN, ["mcp", ...(path ? [path] : []), "--port", String(port), "--agent", name]);
    return { name: "isorite", command: again.command, args: again.args, env: [] };
  };
  const sendWaiting = () => {
    if (!session || busy() || !waiting.length) return;
    const text = waiting.shift()!;
    const id = `isorite-${++ours}`;
    const request = { id, method: "session/prompt", params: { sessionId: session, prompt: [{ type: "text", text }] } };
    asked.set(id, "session/prompt");
    tap("ours", request);
    toAgent(request);
    // The front end is shown what was asked from the pane, as the user's words.
    toFront({ method: "session/update", params: { sessionId: session, update: { sessionUpdate: "user_message_chunk", content: { type: "text", text } } } });
  };

  // The front end, to the agent.
  const front = (async () => {
    for await (const line of createInterface({ input, crlfDelay: Infinity })) {
      if (!line.trim()) continue;
      let m: Rpc;
      try { m = JSON.parse(line) as Rpc; } catch { child.stdin.write(line + "\n"); continue; }
      const key = m.id === undefined || m.id === null ? null : String(m.id);
      if (m.method && key !== null) {
        asked.set(key, m.method);
        if (OPENS.has(m.method) && mcp) {
          const servers = Array.isArray(m.params?.mcpServers) ? (m.params.mcpServers as { name?: string }[]) : [];
          if (!servers.some((s) => s.name === "isorite")) m = { ...m, params: { ...m.params, mcpServers: [...servers, isoriteMcp()] } };
        }
        if (m.method === "session/load" || m.method === "session/resume") session = String(m.params?.sessionId ?? "") || session;
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
      if (!m.method && key !== null && asked.has(key)) {
        const method = asked.get(key);
        asked.delete(key);
        if (method === "initialize") {
          const info = m.result?.agentInfo as { name?: string } | undefined;
          if (info?.name) name = named(info.name);
        }
        if (method === "session/new" && typeof m.result?.sessionId === "string") session = m.result.sessionId;
        tap("out", m);
        if (key.startsWith("isorite-")) { sendWaiting(); continue; }
        output.write(line + "\n");
        sendWaiting();
        continue;
      }
      if (m.method && key !== null) agentAsked.set(key, m.id!);
      tap("out", m);
      output.write(line + "\n");
    }
  })();

  // What the pane asks.
  const commands = new AbortController();
  const listen = (async () => {
    while (!commands.signal.aborted) {
      try {
        const response = await fetch(`${url}/api/acp/commands`, { headers: { [TOKEN_HEADER]: token }, signal: commands.signal });
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
    if (c.type === "prompt") { waiting.push(c.text); sendWaiting(); }
    if (c.type === "cancel" && session) { const m = { method: "session/cancel", params: { sessionId: session } }; tap("ours", m); toAgent(m); }
    if (c.type === "permission" && agentAsked.has(c.id)) {
      const id = agentAsked.get(c.id)!;
      agentAsked.delete(c.id);
      answered.add(c.id);
      const m = { id, result: { outcome: { outcome: "selected", optionId: c.optionId } } };
      tap("ours", m);
      toAgent(m);
      // The front end is still asking: it is told the question is withdrawn.
      toFront({ method: "$/cancel_request", params: { requestId: id } });
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

// isorite mcp [<notes>]: the knowledge base's tools for any harness that speaks MCP over stdio (Claude Code, Pi).
// A bridge (M25): each message is sent on to the base's own MCP address on the isorite server (`/mcp`, over HTTP;
// `mcp-http.ts` answers it), started if it isn't running, so a harness that only speaks stdio reaches the same tools
// as one given the address. A project's config can name this command with the base's folder relative to the repo,
// which then holds on every machine.
//
// Messages are JSON-RPC 2.0, a line each, as MCP's stdio transport has them. Only stdout carries the protocol.

import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { ensureServer } from "./running.ts";
import { TOKEN_HEADER } from "./http.ts";
import { QUIET_MS, agentName, clientName, type Rpc } from "./mcp-http.ts";

export { PROTOCOL, QUIET_MS } from "./mcp-http.ts";

export interface McpOptions {
  port?: number;
  /** The agent's name, as the Atlas shows it: claude-code, pi. Without it, the name the harness gives itself. */
  agent?: string;
  quiet?: number;
  /** The session its look-ups are kept under: `isorite acp`'s, so they join the prompt's turn. */
  session?: string;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

export async function mcp(path: string | undefined, { port = 4767, agent, quiet = QUIET_MS, session: given, input = process.stdin, output = process.stdout, env = process.env }: McpOptions = {}): Promise<number> {
  const server = await ensureServer(path, { port, env, say: (line) => process.stderr.write(line + "\n") });
  const { url } = server;
  const session = given ?? `mcp-${randomBytes(6).toString("hex")}`;
  let name = agent ?? "mcp";
  const address = () => `${url}/mcp?${new URLSearchParams({ agent: name, session, quiet: String(quiet) })}`;
  const send = (message: object) => output.write(JSON.stringify(message) + "\n");

  const forward = async (line: string): Promise<void> => {
    let id: unknown = null;
    try {
      const rpc = JSON.parse(line) as Rpc;
      id = rpc.id ?? null;
      if (!agent && rpc.method === "initialize") name = agentName(clientName(rpc) ?? "mcp");
    } catch { send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "not JSON" } }); return; }
    try {
      const response = await fetch(address(), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: line });
      if (response.status === 202) return;
      const body = await response.text();
      if (body) output.write(body.trim() + "\n");
    } catch (e) {
      if (id !== null) send({ jsonrpc: "2.0", id, error: { code: -32603, message: `the isorite server did not answer: ${(e as Error).message}` } });
    }
  };

  const pending: Promise<void>[] = [];
  for await (const line of createInterface({ input, crlfDelay: Infinity })) if (line.trim()) pending.push(forward(line));
  await Promise.all(pending);
  // The harness went: its turn ends now, not after the quiet spell.
  const token = await fetch(`${url}/api/session`).then((r) => r.json() as Promise<{ token: string }>).then((s) => s.token).catch(() => "");
  await fetch(`${url}/api/agent/status`, { method: "POST", headers: { "Content-Type": "application/json", [TOKEN_HEADER]: token, Origin: new URL(url).origin }, body: JSON.stringify({ agent: name, session, busy: false }) }).catch(() => undefined);
  server.release();
  return 0;
}

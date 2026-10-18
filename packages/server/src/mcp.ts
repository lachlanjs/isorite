// isorite mcp: the knowledge base's tools for any harness that speaks MCP (Claude Code, Pi), over stdio.
// The same tools isorite term gives OpenCode, from the same server, so the Atlas in the browser draws this
// agent's path too. MCP says nothing of turns: one begins with a look-up, and ends after a quiet spell or when
// the harness goes.
//
// Messages are JSON-RPC 2.0, a line each, as MCP's stdio transport has them. Only stdout carries the protocol.

import { createInterface } from "node:readline";
import { randomBytes } from "node:crypto";
import { ensureServer } from "./term.ts";
import { TOKEN_HEADER } from "./http.ts";

export const PROTOCOL = "2025-06-18";
/** How long without a look-up before a turn is taken to have ended. */
export const QUIET_MS = 30_000;

interface ToolDef { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }
interface Rpc { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> }

export interface McpOptions {
  port?: number;
  /** The agent's name, as the Atlas shows it: claude-code, pi. */
  agent?: string;
  quiet?: number;
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
  env?: NodeJS.ProcessEnv;
}

export async function mcp(path: string | undefined, { port = 4767, agent = "mcp", quiet = QUIET_MS, input = process.stdin, output = process.stdout, env = process.env }: McpOptions = {}): Promise<number> {
  const server = await ensureServer(path, { port, env });
  const { url } = server;
  const session = `mcp-${randomBytes(6).toString("hex")}`;
  let token: Promise<string> | null = null;
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(url + path);
    const body = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(body.error ?? `${response.status}`);
    return body;
  };
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    token ??= get<{ token: string }>("/api/session").then((s) => s.token);
    const response = await fetch(url + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", [TOKEN_HEADER]: await token, Origin: url },
      body: JSON.stringify(body),
    });
    const answer = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new Error(answer.error ?? `${response.status}`);
    return answer;
  };

  let quietTimer: NodeJS.Timeout | null = null;
  const settle = () => {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = null;
    return post("/api/agent/status", { agent, session, busy: false }).catch(() => undefined);
  };
  const send = (message: object) => output.write(JSON.stringify({ jsonrpc: "2.0", ...message }) + "\n");

  const answer = async (rpc: Rpc): Promise<object> => {
    if (rpc.method === "initialize") {
      const asked = typeof rpc.params?.protocolVersion === "string" ? rpc.params.protocolVersion : PROTOCOL;
      return {
        protocolVersion: asked,
        capabilities: { tools: {} },
        serverInfo: { name: "isorite", version: "0.1.0" },
        instructions: "A knowledge base of notes. Call brief_base first, then look things up with search_notes, outline_note and read_note, following a note's links before searching again. Cite a note by its title and section.",
      };
    }
    if (rpc.method === "ping") return {};
    if (rpc.method === "tools/list") {
      const tools = await get<ToolDef[]>("/api/agent/tools");
      return { tools: tools.map(({ function: t }) => ({ name: t.name, description: t.description, inputSchema: t.parameters })) };
    }
    if (rpc.method === "tools/call") {
      const tool = String(rpc.params?.name ?? ""), args = (rpc.params?.arguments ?? {}) as Record<string, unknown>;
      if (quietTimer) clearTimeout(quietTimer);
      quietTimer = setTimeout(() => void settle(), quiet);
      try {
        const { text } = await post<{ text: string }>("/api/agent/look", { agent, session, tool, args });
        return { content: [{ type: "text", text }] };
      } catch (e) {
        return { content: [{ type: "text", text: (e as Error).message }], isError: true };
      }
    }
    throw Object.assign(new Error(`no method ${rpc.method}`), { code: -32601 });
  };

  const lines = createInterface({ input, crlfDelay: Infinity });
  const pending: Promise<void>[] = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    let rpc: Rpc;
    try { rpc = JSON.parse(line) as Rpc; } catch { send({ id: null, error: { code: -32700, message: "not JSON" } }); continue; }
    // A notification is answered by nothing.
    if (rpc.id === undefined || rpc.id === null) continue;
    pending.push(answer(rpc).then(
      (result) => { send({ id: rpc.id, result }); },
      (e: Error & { code?: number }) => { send({ id: rpc.id, error: { code: e.code ?? -32603, message: e.message } }); },
    ));
  }
  await Promise.all(pending);
  await settle();
  server.release();
  return 0;
}

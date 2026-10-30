// A scripted ACP agent (M25), for the tests: no model. Each prompt is a list of things to do, a line each:
//   read <path>         read a file with its own tools (a tool call with the file's location)
//   edit <path> <text>  append a line to a file with its own tools (a tool call with its diff)
//   ask <note id>       ask a question back about a note, through isorite's MCP over HTTP, as a real agent would
//   permit              ask before running a command
// and it then replies, citing the first note it read in isorite's link form. Everything it was given (each prompt's
// blocks, the MCP servers) it says back, so a test can see it.

import { appendFileSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { createInterface } from "node:readline";

type Rpc = { jsonrpc: "2.0"; id?: string | number; method?: string; params?: Record<string, any>; result?: any };
const send = (m: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
const update = (sessionId: string, u: object) => send({ method: "session/update", params: { sessionId, update: u } });
const sessions = new Map<string, { cwd: string; mcp: { name: string; type?: string; url?: string }[] }>();
const waiting = new Map<string, (r: any) => void>();
let n = 0;

async function mcpCall(url: string, name: string, args: object): Promise<string> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
  return ((await r.json()) as { result?: { content?: { text: string }[] } }).result?.content?.[0]?.text ?? "";
}

async function prompt(id: Rpc["id"], sessionId: string, blocks: { type: string; text?: string }[]) {
  const s = sessions.get(sessionId)!;
  const text = blocks.map((b) => b.text ?? "").join("\n");
  const read: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim())) {
    const [verb, path, ...rest] = line.split(/\s+/);
    const call = `call-${++n}`;
    if (verb === "read" && path) {
      const at = isAbsolute(path) ? path : join(s.cwd, path);
      update(sessionId, { sessionUpdate: "tool_call", toolCallId: call, title: `Read ${path}`, kind: "read", status: "in_progress", locations: [{ path: at }], rawInput: { path } });
      update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: call, status: "completed", content: [{ type: "content", content: { type: "text", text: readFileSync(at, "utf8").slice(0, 200) } }] });
      read.push(path.replace(/^.*?([^/]+\/[^/]+)\.md$/, "$1"));
    }
    if (verb === "edit" && path) {
      const at = isAbsolute(path) ? path : join(s.cwd, path), before = readFileSync(at, "utf8"), added = rest.join(" ");
      appendFileSync(at, `\n${added}\n`);
      update(sessionId, { sessionUpdate: "tool_call", toolCallId: call, title: `Edit ${path}`, kind: "edit", status: "completed", locations: [{ path: at }], content: [{ type: "diff", path: at, oldText: before, newText: `${before}\n${added}\n` }] });
    }
    if (verb === "ask" && path) {
      const isorite = s.mcp.find((m) => m.name === "isorite" && m.url);
      update(sessionId, { sessionUpdate: "tool_call", toolCallId: call, title: "isorite: ask_question", name: "mcp__isorite__ask_question", kind: "other", status: "in_progress", rawInput: { title: "Why does it drift?", about: [path] } });
      const said = isorite ? await mcpCall(isorite.url!, "ask_question", { title: "Why does it drift?", text: "", about: [path] }) : "no isorite MCP over HTTP";
      update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: call, status: "completed", content: [{ type: "content", content: { type: "text", text: said } }] });
    }
    if (verb === "permit") {
      update(sessionId, { sessionUpdate: "tool_call", toolCallId: call, title: "ls", kind: "execute", status: "pending", rawInput: { command: "ls" } });
      const answer = await new Promise<any>((done) => {
        const ask = `perm-${n}`;
        waiting.set(ask, done);
        send({ id: ask, method: "session/request_permission", params: { sessionId, toolCall: { toolCallId: call, title: "ls", rawInput: { command: "ls" } }, options: [{ optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }] } });
      });
      const allowed = answer?.outcome?.outcome === "selected" && answer.outcome.optionId === "yes";
      update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: call, status: allowed ? "completed" : "failed" });
    }
  }
  const cite = read[0] ? `[as the note says](/${read[0]}.md)` : "with no note";
  update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: `Done, ${cite}. Blocks: ${blocks.length}. MCP: ${s.mcp.map((m) => `${m.name}/${m.type ?? "stdio"}`).join(",")}.` } });
  send({ id, result: { stopReason: "end_turn" } });
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const m = JSON.parse(line) as Rpc;
  if (!m.method && m.id !== undefined && waiting.has(String(m.id))) { waiting.get(String(m.id))!(m.result); waiting.delete(String(m.id)); continue; }
  const p = m.params ?? {};
  switch (m.method) {
    case "initialize": send({ id: m.id, result: { protocolVersion: 1, agentInfo: { name: "scripted", title: "Scripted", version: "0" }, agentCapabilities: { loadSession: false, mcpCapabilities: { http: process.env.SCRIPTED_HTTP !== "0", sse: false } } } }); break;
    case "session/new": { const sessionId = `s-${++n}`; sessions.set(sessionId, { cwd: p.cwd ?? process.cwd(), mcp: p.mcpServers ?? [] }); send({ id: m.id, result: { sessionId } }); break; }
    case "session/prompt": void prompt(m.id, p.sessionId, p.prompt ?? []); break;
    case "session/cancel": break;
    default: if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: `no method ${m.method}` } });
  }
}

// A scripted ACP agent, for the M25 spike and the tests: no model. Each prompt is answered with a look-up in
// isorite's tools (as a tool call), a permission asked before a command, and a reply that cites a note in the
// sentence. It keeps its sessions in memory, lists them, and replays one on session/load.

import { createInterface } from "node:readline";

type Rpc = { jsonrpc: "2.0"; id?: string | number; method?: string; params?: Record<string, any>; result?: any };
const send = (m: object) => process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
const update = (sessionId: string, u: object) => send({ method: "session/update", params: { sessionId, update: u } });
const sessions = new Map<string, { said: { asked: string; reply: string }[]; mcp: string[] }>();
const waiting = new Map<string, (r: any) => void>();
let n = 0;

async function prompt(id: Rpc["id"], sessionId: string, asked: string) {
  const s = sessions.get(sessionId)!;
  const call = `call-${++n}`;
  update(sessionId, { sessionUpdate: "tool_call", toolCallId: call, title: "read_note geometry/triangle", name: "read_note", kind: "read", status: "in_progress", rawInput: { note: "geometry/triangle" } });
  update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: call, status: "completed", content: [{ type: "content", content: { type: "text", text: "# Triangle\nThree sides." } }] });
  const cmd = `cmd-${n}`;
  update(sessionId, { sessionUpdate: "tool_call", toolCallId: cmd, title: "ls", kind: "execute", status: "pending", rawInput: { command: "ls" } });
  const ask = `perm-${n}`;
  const answer = await new Promise<any>((done) => {
    waiting.set(ask, done);
    send({ id: ask, method: "session/request_permission", params: { sessionId, toolCall: { toolCallId: cmd, title: "ls", rawInput: { command: "ls" } }, options: [{ optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "always", name: "Always", kind: "allow_always" }, { optionId: "no", name: "Reject", kind: "reject_once" }] } });
  });
  const allowed = answer?.outcome?.outcome === "selected" && answer.outcome.optionId !== "no";
  update(sessionId, { sessionUpdate: "tool_call_update", toolCallId: cmd, status: allowed ? "completed" : "failed", content: [{ type: "content", content: { type: "text", text: allowed ? "notes\n" : "not allowed" } }] });
  const reply = `You asked “${asked}”. [A triangle has three sides](/geometry/triangle.md#triangle), as the note says. (MCP servers: ${s.mcp.join(", ") || "none"}.)`;
  for (const piece of reply.match(/.{1,24}/gs) ?? []) update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: piece } });
  update(sessionId, { sessionUpdate: "usage_update", used: 1200 * (s.said.length + 1), size: 200000, cost: { amount: 0.001 * (s.said.length + 1), currency: "USD" } });
  s.said.push({ asked, reply });
  send({ id, result: { stopReason: "end_turn" } });
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const m = JSON.parse(line) as Rpc;
  if (!m.method && m.id !== undefined && waiting.has(String(m.id))) { waiting.get(String(m.id))!(m.result); waiting.delete(String(m.id)); continue; }
  const p = m.params ?? {};
  switch (m.method) {
    case "initialize": send({ id: m.id, result: { protocolVersion: 1, agentInfo: { name: "scripted", version: "0" }, agentCapabilities: { loadSession: true, mcpCapabilities: { http: false, sse: false }, sessionCapabilities: { list: {} } } } }); break;
    case "session/new": { const sessionId = `s-${++n}`; sessions.set(sessionId, { said: [], mcp: (p.mcpServers ?? []).map((s: any) => s.name) }); send({ id: m.id, result: { sessionId } }); break; }
    case "session/list": send({ id: m.id, result: { sessions: [...sessions.keys()].map((sessionId) => ({ sessionId, cwd: process.cwd(), title: sessions.get(sessionId)!.said[0]?.asked ?? null })) } }); break;
    case "session/load": {
      const s = sessions.get(p.sessionId);
      if (!s) { send({ id: m.id, error: { code: -32002, message: "no such session" } }); break; }
      s.mcp = (p.mcpServers ?? []).map((x: any) => x.name);
      for (const t of s.said) { update(p.sessionId, { sessionUpdate: "user_message_chunk", content: { type: "text", text: t.asked } }); update(p.sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: t.reply } }); }
      send({ id: m.id, result: {} });
      break;
    }
    case "session/prompt": void prompt(m.id, p.sessionId, (p.prompt ?? []).map((b: any) => b.text ?? "").join("")); break;
    case "session/cancel": break;
    default: if (m.id !== undefined && m.method) send({ id: m.id, error: { code: -32601, message: `no method ${m.method}` } });
  }
}

// The spike's check, end to end without a model: a front end (this script) runs `isorite acp` in front of the
// scripted agent; the pane's side is played over HTTP, as the page would. Usage: node acp-e2e.ts <base> <port> [<agent command>]

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const [base, port = "4790", agentCmd] = process.argv.slice(2);
const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const agent = agentCmd ?? `${process.execPath} ${fileURLToPath(new URL("./scripted-acp.ts", import.meta.url))}`;
const wrap = spawn(process.execPath, [main, "acp", "--agent", agent, base!, "--port", port], { stdio: ["pipe", "pipe", "inherit"] });
const pending = new Map<number, (m: any) => void>();
const seen: any[] = [];
let n = 0;
const send = (m: object) => wrap.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
const ask = (method: string, params: object) => new Promise<any>((done) => { const id = ++n; pending.set(id, done); send({ id, method, params }); });
let permissionFromFront = true;
void (async () => {
  for await (const line of createInterface({ input: wrap.stdout })) {
    const m = JSON.parse(line);
    seen.push(m);
    if (m.id !== undefined && !m.method && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
    // The front end answers a permission itself, unless the pane is to.
    if (m.method === "session/request_permission" && permissionFromFront) setTimeout(() => send({ id: m.id, result: { outcome: { outcome: "selected", optionId: "yes" } } }), 50);
  }
})();

const root = `http://127.0.0.1:${port}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let api = root;
const token = async () => ((await (await fetch(`${api}/api/session`)).json()) as { token: string }).token;
const view = async () => (await (await fetch(`${api}/api/terminal`)).json()) as any;
const post = async (path: string, body: object) => { const r = await fetch(api + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": await token(), Origin: root }, body: JSON.stringify(body) }); return [r.status, await r.text()]; };
const check = (what: string, ok: boolean, detail: unknown = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${what}${ok ? "" : " " + JSON.stringify(detail).slice(0, 600)}`); if (!ok) process.exitCode = 1; };

const init = await ask("initialize", { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "e2e", version: "0" } });
check("initialize passes through", init.result?.agentInfo !== undefined, init);
const made = await ask("session/new", { cwd: process.cwd(), mcpServers: [] });
const session = made.result.sessionId;
check("session/new answered", typeof session === "string", made);
// The base's own API, if the server holds several.
const listed = (await (await fetch(`${root}/api/bases`).catch(() => null))?.json().catch(() => null)) as any;
for (const b of listed?.bases ?? []) { const v = (await (await fetch(`${root}/b/${b.name}/api/terminal`)).json()) as any; if (v.connected) api = `${root}/b/${b.name}`; }
await sleep(200);
check("the pane sees the session", (await view()).session === session, await view());

const first = await ask("session/prompt", { sessionId: session, prompt: [{ type: "text", text: "What is a triangle?" }] });
await sleep(200);
let v = await view();
check("prompt from the front end ends", first.result?.stopReason === "end_turn", first);
const said = seen.filter((m) => m.params?.update?.sessionUpdate === "agent_message_chunk").map((m) => m.params.update.content.text).join("");
check("isorite's MCP was added to the session", said.includes("MCP servers: isorite"), said);
check("the pane has the turn, from the terminal", v.turns.length === 1 && v.turns[0].from === "terminal" && v.turns[0].state === "done", v.turns);
check("the pane has the read_note tool with its note", v.turns[0]?.items.some((i: any) => i.kind === "tool" && i.name === "read_note" && i.note === "geometry/triangle" && i.status === "done"), v.turns[0]?.items);
check("the pane has the cited reply", v.turns[0]?.items.some((i: any) => i.kind === "text" && i.text.includes("](/geometry/triangle.md#triangle)")), v.turns[0]?.items);
check("usage reaches the pane", v.tokens.input === 1200 && v.cost > 0, v);

// From the pane: a prompt, and the permission answered there.
permissionFromFront = false;
const before = seen.length;
console.log("     pane prompt:", await post("/api/terminal/prompt", { asked: "And a square?", given: [] }));
for (let i = 0; i < 50 && !(await view()).asking.length; i++) await sleep(50);
v = await view();
check("the pane is asked the permission", v.asking.length === 1, v);
console.log("     pane answer:", await post("/api/terminal/permission", { id: v.asking[0]?.id, decision: "once" }));
for (let i = 0; i < 50 && (await view()).turns.at(-1)?.state !== "done"; i++) await sleep(50);
v = await view();
const after = seen.slice(before);
check("the front end saw the pane's prompt as the user's words", after.some((m) => m.params?.update?.sessionUpdate === "user_message_chunk" && m.params.update.content.text === "And a square?"));
check("the front end saw the agent's reply to it", after.some((m) => m.params?.update?.sessionUpdate === "agent_message_chunk"));
check("the front end's permission request was withdrawn", after.some((m) => m.method === "$/cancel_request"));
check("the pane's turn is from here, done, the command allowed", v.turns.length === 2 && v.turns[1].from === "here" && v.turns[1].state === "done" && v.turns[1].items.some((i: any) => i.kind === "tool" && i.output.startsWith("notes")), v.turns[1]);

// Carried on elsewhere: a second front end loads the session (the scripted agent keeps it while it runs).
const loaded = await ask("session/load", { sessionId: session, cwd: process.cwd(), mcpServers: [] });
await sleep(200);
v = await view();
check("session/load replays into the pane", !loaded.error && v.turns.length === 2 && v.turns[0].asked === "What is a triangle?" && v.turns[1].asked === "And a square?", v.turns);

wrap.stdin.end();
wrap.kill();
await sleep(300);
check("the pane lets the session go when the wrapper goes", !(await view()).connected, await view());
process.exit();

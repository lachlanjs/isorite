// What a real agent does through isorite acp, without a model: its handshake, a session with isorite's MCP added,
// whether it starts that MCP server, its session list, and what a prompt does. Usage: node acp-probe.ts <base> <port> <agent command>
import { spawn, execSync } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
const [base, port, agent] = process.argv.slice(2);
const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const wrap = spawn(process.execPath, [main, "acp", "--agent", agent!, base!, "--port", port!], { stdio: ["pipe", "pipe", "pipe"] });
let errors = ""; wrap.stderr.on("data", (d) => { errors += d; });
const pending = new Map<number, (m: any) => void>(); const seen: any[] = []; let n = 0;
const ask = (method: string, params: object, ms = 60000) => new Promise<any>((done) => { const id = ++n; pending.set(id, done); wrap.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); setTimeout(() => done({ timeout: ms }), ms); });
void (async () => { for await (const line of createInterface({ input: wrap.stdout })) { try { const m = JSON.parse(line); seen.push(m); if (m.id !== undefined && !m.method && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } if (m.method === "session/request_permission") wrap.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { outcome: { outcome: "selected", optionId: m.params.options[0].optionId } } }) + "\n"); } catch { console.log("not JSON on stdout:", line.slice(0, 200)); } } })();
const show = (label: string, v: unknown) => console.log(label, JSON.stringify(v).slice(0, 900));
const init = await ask("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }, clientInfo: { name: "probe", version: "0" } });
show("initialize:", init.result ? { agentInfo: init.result.agentInfo, caps: init.result.agentCapabilities, auth: init.result.authMethods?.map((a: any) => a.id) } : init);
const made = await ask("session/new", { cwd: process.cwd(), mcpServers: [] });
show("session/new:", made.result ? { sessionId: made.result.sessionId, modes: made.result.modes?.availableModes?.map((m: any) => m.id), configOptions: made.result.configOptions?.map((c: any) => c.id) } : made);
await new Promise((r) => setTimeout(r, 4000));
const ps = execSync("ps -eo args | grep '[m]ain.ts mcp' || true").toString().trim();
console.log("isorite mcp started by the agent:", ps ? "yes" : "no", ps.split("\n")[0]?.slice(0, 200) ?? "");
const list = await ask("session/list", { cwd: process.cwd() }, 15000);
show("session/list:", list.result ? list.result.sessions?.map((s: any) => ({ id: s.sessionId, title: s.title })) : list);
if (made.result) {
  const p = await ask("session/prompt", { sessionId: made.result.sessionId, prompt: [{ type: "text", text: "Say hello." }] }, 45000);
  show("session/prompt:", p);
  show("updates seen:", [...new Set(seen.filter((m) => m.method === "session/update").map((m) => m.params.update.sessionUpdate))]);
}
console.log("stderr:", errors.slice(-600));
wrap.kill(); process.exit();

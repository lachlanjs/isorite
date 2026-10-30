// The spike's second question: a session started in the agent's own terminal, carried on through isorite acp.
// Lists the agent's sessions, loads (or resumes) one, shows what the Iso pane then holds, and asks one more thing.
// Usage: node acp-move.ts <base> <port> <agent command> <session id> [<model>]
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
const [base, port, agent, id, model] = process.argv.slice(2);
const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const wrap = spawn(process.execPath, [main, "acp", "--agent", agent!, base!, "--port", port!], { stdio: ["pipe", "pipe", "inherit"], cwd: base });
const pending = new Map<number, (m: any) => void>(); let n = 0; const updates: any[] = [];
const ask = (method: string, params: object, ms = 240_000) => new Promise<any>((done) => { const i = ++n; pending.set(i, done); wrap.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: i, method, params }) + "\n"); setTimeout(() => done({ timeout: ms }), ms); });
void (async () => { for await (const line of createInterface({ input: wrap.stdout })) { let m: any; try { m = JSON.parse(line); } catch { continue; } if (m.id !== undefined && !m.method && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } if (m.method === "session/update") updates.push(m.params.update); if (m.method === "session/request_permission") wrap.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { outcome: { outcome: "selected", optionId: m.params.options.find((o: any) => o.kind === "allow_once")?.optionId ?? m.params.options[0].optionId } } }) + "\n"); } })();
const root = `http://127.0.0.1:${port}`;
const view = async () => { const bases = await (await fetch(`${root}/api/bases`)).json().catch(() => null) as any; for (const b of bases?.bases ?? []) { const v = await (await fetch(`${root}/b/${b.name}/api/terminal`)).json() as any; if (v.connected) return v; } return (await (await fetch(`${root}/api/terminal`)).json()); };
const brief = (v: any) => ({ session: v.session, title: v.title, turns: v.turns.map((t: any) => ({ asked: t.asked.slice(0, 60), from: t.from, state: t.state, items: t.items.map((i: any) => (i.kind === "text" ? `text(${i.text.length})` : `${i.name}:${i.status}`)) })) });
const init = await ask("initialize", { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "spike", version: "0" } });
console.log("agent:", init.result?.agentInfo?.name, "load:", init.result?.agentCapabilities?.loadSession);
const list = await ask("session/list", { cwd: base });
console.log("listed:", (list.result?.sessions ?? []).length, "includes it:", (list.result?.sessions ?? []).some((s: any) => s.sessionId === id), list.error ?? "");
const loaded = await ask("session/load", { sessionId: id, cwd: base, mcpServers: [] });
await new Promise((r) => setTimeout(r, 800));
console.log("load:", loaded.error ? loaded.error.message : "ok", "updates replayed:", updates.length, [...new Set(updates.map((u) => u.sessionUpdate))].join(","));
console.log("pane after load:", JSON.stringify(brief(await view())));
if (model) {
  const opt = (loaded.result?.configOptions ?? []).find((c: any) => c.id === "model");
  const values = (opt?.options ?? []).flatMap((o: any) => (o.options ? o.options : [o]));
  const pick = values.find((v: any) => String(v.value).endsWith(model));
  if (opt && pick) await ask("session/set_config_option", { sessionId: id, configId: opt.id, value: pick.value });
}
const more = await ask("session/prompt", { sessionId: id, prompt: [{ type: "text", text: "And what does θ trade off, in a sentence?" }] });
console.log("prompt:", more.result?.stopReason ?? more.error?.message ?? more);
console.log("pane after prompt:", JSON.stringify(brief(await view())));
wrap.kill(); process.exit();

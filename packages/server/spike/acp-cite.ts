// The spike's third question: do agents cite notes in isorite's link form when isorite's instructions ask?
// Six questions on the example base, each in a new session through isorite acp; permissions allowed once.
// Usage: node acp-cite.ts <base> <port> <agent command> [<model, as the agent's model option names it>] > result.json
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const [base, port, agent, model] = process.argv.slice(2);
const QUESTIONS = [
  "Why does leapfrog conserve energy better than Euler's method?",
  "What is softening, and why is it needed?",
  "How does Barnes–Hut decide whether to open a node of the tree?",
  "How should I choose the timestep?",
  "What should I watch during a run to know it is going well?",
  "What does the main loop do on each step?",
];
const main = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const wrap = spawn(process.execPath, [main, "acp", "--agent", agent!, base!, "--port", port!], { stdio: ["pipe", "pipe", "inherit"], cwd: base });
const pending = new Map<number, (m: any) => void>();
let n = 0, updates: any[] = [];
const ask = (method: string, params: object, ms = 240_000) => new Promise<any>((done) => { const id = ++n; pending.set(id, done); wrap.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); setTimeout(() => done({ timeout: ms }), ms); });
void (async () => {
  for await (const line of createInterface({ input: wrap.stdout })) {
    let m: any; try { m = JSON.parse(line); } catch { continue; }
    if (m.id !== undefined && !m.method && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
    if (m.method === "session/update") updates.push(m.params.update);
    if (m.method === "session/request_permission") {
      const o = m.params.options.find((x: any) => x.kind === "allow_once") ?? m.params.options[0];
      wrap.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: { outcome: { outcome: "selected", optionId: o.optionId } } }) + "\n");
    }
  }
})();
const init = await ask("initialize", { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: "spike", version: "0" } });
// An agent that asks to be signed in first (Codex) is, with its API key's method.
const key = (init.result?.authMethods ?? []).find((a: any) => /api.?key/i.test(a.id));
if (key) console.error("authenticate:", JSON.stringify(await ask("authenticate", { methodId: key.id })).slice(0, 200));
const results: any[] = [];
for (const q of QUESTIONS) {
  const made = await ask("session/new", { cwd: base, mcpServers: [] });
  const sessionId = made.result?.sessionId;
  if (!sessionId) { results.push({ q, error: made }); continue; }
  if (model) {
    const opt = (made.result.configOptions ?? []).find((c: any) => c.id === "model" || c.category === "model");
    const values = (opt?.options ?? []).flatMap((o: any) => (o.options ? o.options : [o]));
    const pick = values.find((v: any) => String(v.value).endsWith(model)) ?? values.find((v: any) => String(v.value).includes(model));
    if (opt && pick) await ask("session/set_config_option", { sessionId, configId: opt.id, value: pick.value });
    else if (results.length === 0) console.error("no model option matching", model, values.slice(0, 5).map((v: any) => v.value));
  }
  updates = [];
  const began = Date.now();
  const answer = await ask("session/prompt", { sessionId, prompt: [{ type: "text", text: q }] });
  const reply = updates.filter((u) => u.sessionUpdate === "agent_message_chunk").map((u) => u.content?.text ?? "").join("");
  const tools = updates.filter((u) => u.sessionUpdate === "tool_call").map((u) => `${u.name ?? u.kind}: ${String(u.title ?? "").slice(0, 70)}`);
  const links = [...reply.matchAll(/\]\((\/?[^)\s]+?\.md)(#[^)\s]*)?(?:\s+"[^"]*")?\)/g)].map((m) => m[1]!);
  const real = links.filter((l) => existsSync(join(base!, l.replace(/^\//, ""))));
  const usage = updates.filter((u) => u.sessionUpdate === "usage_update").at(-1);
  results.push({ q, stop: answer.result?.stopReason ?? answer.error?.message ?? answer, seconds: Math.round((Date.now() - began) / 1000), tools, links, real: real.length, invented: links.length - real.length, isoriteForm: links.filter((l) => l.startsWith("/")).length, endList: /\n\s*(sources|references|notes used)\s*:?\s*\n/i.test(reply), usage: usage ? { used: usage.used, cost: usage.cost } : null, reply });
  console.error(`${q.slice(0, 40)}… ${results.at(-1).stop} tools=${tools.length} links=${links.length} real=${real.length}`);
}
console.log(JSON.stringify({ agent: init.result?.agentInfo, model, results }, null, 1));
wrap.kill(); process.exit();

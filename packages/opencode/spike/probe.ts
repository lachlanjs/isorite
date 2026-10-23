// M11 probe: the shapes of OpenCode 2's messages and events for a turn with text, a command (asked first) and a
// file written, as the isorite server will read them. Run: node packages/opencode/spike/probe.ts <out.json>
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OpenCode } from "@opencode/client";
import { openCodeConfig, startScripted, lastAsked } from "../src/index.ts";

const out = process.argv[2]!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const model = await startScripted((req) => {
  const asked = lastAsked(req);
  const last = req.messages.at(-1);
  if (last?.role === "tool") return { text: "Done: " + asked.slice(0, 30) };
  const tool = (re: RegExp) => req.tools.find((t) => re.test(t)) ?? req.tools[0]!;
  if (asked.includes("shell")) return { tool: tool(/bash|shell/i), args: { command: "echo probed", description: "say probed" } };
  if (asked.includes("write")) return { tool: tool(/^write$/i), args: { path: "hello.txt", content: "hello\n" } };
  return { text: "Plain reply to: " + asked };
});
const root = mkdtempSync(join(tmpdir(), "isorite-probe-"));
const project = join(root, "project"); mkdirSync(project);
const config = join(root, "oc"); mkdirSync(config);
writeFileSync(join(config, "opencode.json"), JSON.stringify({ ...openCodeConfig({ url: model.url, models: ["scripted"] }), permissions: [{ action: "shell", resource: "*", effect: "ask" }] }));
const env = { ...process.env, OPENCODE_CONFIG_DIR: config, ISORITE_GATEWAY_KEY: "p", OPENCODE_PASSWORD: "pw", XDG_CONFIG_HOME: join(root, "c"), XDG_DATA_HOME: join(root, "d"), XDG_STATE_HOME: join(root, "s"), XDG_CACHE_HOME: join(root, "k") };
const serve = spawn("opencode2", ["serve", "--port", "4793", "--hostname", "127.0.0.1"], { cwd: project, env, stdio: "ignore" });
const client = OpenCode.make({ baseUrl: "http://127.0.0.1:4793", headers: { authorization: "Basic " + Buffer.from("opencode:pw").toString("base64") } });
for (let i = 0; ; i++) { try { await client.server.info(); break; } catch (e) { if (i > 60) throw e; await sleep(500); } }
const events: unknown[] = [];
void (async () => { for await (const ev of client.event.subscribe()) { events.push(ev); const e = ev as { type: string; data?: { id?: string; sessionID?: string } }; if (e.type === "permission.asked") await client.permission.reply({ sessionID: e.data?.sessionID, requestID: e.data?.id, decision: "once" } as never).catch((x) => events.push({ replyFailed: String(x) })); } })();
const result: Record<string, unknown> = {};
try {
  const s = await client.session.create({ location: { directory: project } } as never).catch(async (e) => { result.createFailed = String(e); return client.session.create(); });
  result.session = s;
  const sid = (s as { id: string }).id;
  for (const text of ["hello there", "run a shell command", "write a file"]) {
    result["prompt:" + text] = await client.session.prompt({ sessionID: sid, text } as never);
    await sleep(500);
    await client.session.wait({ sessionID: sid } as never).catch((e) => (result["waitFailed:" + text] = String(e)));
  }
  await sleep(500);
  result.list = await client.session.list();
  result.messages = await client.message.list({ sessionID: sid } as never);
  result.active = await client.session.active();
} catch (e) { result.failed = String((e as Error).stack ?? e); }
result.events = events;
writeFileSync(out, JSON.stringify(result, null, 1));
serve.kill(); await model.close(); process.exit(0);

// W5 spike: can a second client follow and act in the session the terminal shows?
// A scripted model, `opencode2 serve` on a port, the TUI in tmux pointed at it with --server,
// and @opencode/client as the second client (what the isorite server would be).
// Run: node packages/opencode/spike/mirror.ts   (writes its log to the spike folder)

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { OpenCode } from "@opencode/client";
import { openCodeConfig, startScripted, lastAsked } from "../src/index.ts";
import { Pane } from "../test/fixtures/tmux.ts";

const here = dirname(fileURLToPath(import.meta.url));
const LOG = join(here, "mirror.log");
writeFileSync(LOG, "");
const log = (...a: unknown[]) => { const line = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); appendFileSync(LOG, line + "\n"); console.log(line); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The model: a shell call the first time it is asked, then words.
let turn = 0;
const model = await startScripted((req) => {
  const asked = lastAsked(req);
  log("[model] asked:", asked.slice(0, 80), "tools:", req.tools.join(","));
  const last = req.messages.at(-1);
  if (last?.role === "tool") return { text: "The command ran. Done." };
  turn++;
  if (asked.includes("shell")) {
    const bash = req.tools.find((t) => /bash|shell/i.test(t)) ?? req.tools[0]!;
    return { tool: bash, args: { command: "echo mirrored > spike.txt", description: "write a file" } };
  }
  return { text: `Reply ${turn} to: ${asked}` };
});

const root = mkdtempSync(join(tmpdir(), "isorite-mirror-"));
const project = join(root, "project");
mkdirSync(project);
const config = join(root, "opencode-config");
mkdirSync(config);
writeFileSync(join(config, "opencode.json"), JSON.stringify({ ...openCodeConfig({ url: model.url, models: ["scripted"] }), permissions: [{ action: "shell", resource: "*", effect: "ask" }] }, null, 2));
const env = {
  ...process.env,
  OPENCODE_CONFIG_DIR: config, ISORITE_GATEWAY_KEY: "spike", OPENCODE_PASSWORD: "spike-password",
  XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: join(root, "data"), XDG_STATE_HOME: join(root, "state"), XDG_CACHE_HOME: join(root, "cache"),
};
log("[spike] root", root);

const PORT = 4791;
const serve = spawn("opencode2", ["serve", "--port", String(PORT), "--hostname", "127.0.0.1"], { cwd: project, env, stdio: ["ignore", "pipe", "pipe"] });
serve.stdout.on("data", (d) => appendFileSync(LOG, "[serve] " + d));
serve.stderr.on("data", (d) => appendFileSync(LOG, "[serve!] " + d));
const url = `http://127.0.0.1:${PORT}`;
const client = OpenCode.make({ baseUrl: url, headers: { authorization: "Basic " + Buffer.from("opencode:spike-password").toString("base64") } });
for (let i = 0; ; i++) {
  try { log("[client] server", await client.server.info()); break; } catch (e) { if (i > 60) throw e; await sleep(500); }
}

// Follow every event, as the Iso pane would.
const seen: string[] = [];
const asked: { sessionID: string; id: string }[] = [];
void (async () => {
  try {
    for await (const ev of client.event.subscribe()) {
      const e = ev as { type: string; properties?: Record<string, unknown>; data?: Record<string, unknown> };
      seen.push(e.type);
      const body = e.properties ?? e.data ?? e;
      if (!/delta|keepalive|usage/.test(e.type)) log("[event]", e.type, JSON.stringify(body).slice(0, 300));
      if (e.type === "permission.asked") asked.push(body as unknown as { sessionID: string; id: string });
    }
  } catch (err) { log("[event] stream ended", String(err)); }
})();

const pane = new Pane(["opencode2", "--server", url], { cwd: project, env: Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as Record<string, string> });
try {
  await sleep(4000);
  log("[tui] after start:\n" + pane.text());

  // 1. Asked in the terminal: does the client see it?
  pane.type("hello from the terminal");
  pane.keys("Enter");
  await sleep(4000);
  log("[tui] after terminal prompt:\n" + pane.text());
  const sessions = await client.session.list();
  log("[client] sessions", sessions);
  const active = await client.session.active();
  log("[client] active", active);
  const sid = (sessions as { data?: { id: string }[] }).data?.[0]?.id ?? (Array.isArray(sessions) ? (sessions as { id: string }[])[0]?.id : undefined);
  if (!sid) throw new Error("no session found");
  log("[client] messages", JSON.stringify(await client.message.list({ sessionID: sid })).slice(0, 1500));

  // 2. Asked from the client: does the terminal show it?
  log("[client] prompt", await client.session.prompt({ sessionID: sid, text: "hello from the browser" }));
  await sleep(4000);
  log("[tui] after client prompt:\n" + pane.text());

  // 3. A permission asked, answered from the client.
  await client.session.prompt({ sessionID: sid, text: "run a shell command" });
  for (let i = 0; i < 20 && !asked.length; i++) await sleep(500);
  await sleep(1500);
  log("[tui] while asking:\n" + pane.text());
  const pending = await client.permission.request.list().catch((e) => String(e));
  log("[client] pending permissions", pending);
  if (asked.length) {
    const a = asked[0]!;
    await client.permission.reply({ sessionID: a.sessionID ?? sid, requestID: a.id, decision: "once" } as never);
    log("[client] replied once to", a.id);
  }
  await sleep(4000);
  log("[tui] after reply:\n" + pane.text());
  log("[spike] event types seen", [...new Set(seen)].join(" "));
} catch (e) {
  log("[spike] failed", String((e as Error)?.stack ?? e));
  log("[tui] at failure:\n" + pane.text());
} finally {
  pane.close();
  serve.kill();
  await model.close();
  process.exit(0);
}

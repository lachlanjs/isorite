import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { PassThrough } from "node:stream";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import { acp, findBase } from "../src/acp-wrap.ts";
import { commandOf, readRegistry, registryAgents } from "../src/agents.ts";
import { ensureServer } from "../src/running.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-acp-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const SCRIPTED = fileURLToPath(new URL("./fixtures/scripted-acp.ts", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

test("isorite acp (M25): between a front end and its agent; the session in the pane, the base told what the agent read, changed and asked", async () => {
  const base = await writeExample(join(root, "base"));
  const port = await freePort(), input = new PassThrough(), output = new PassThrough();
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), ISORITE_EMBED: "off" };
  const done = acp(base.notes, { agent: `"${process.execPath}" "${SCRIPTED}"`, port, input, output, env });
  const url = `http://127.0.0.1:${port}`;

  // The front end: requests and their answers, and what else the wrapper sends it.
  type Msg = { id?: number | string; method?: string; params?: any; result?: any; error?: any };
  const answers = new Map<number | string, Msg>(), told: Msg[] = [];
  let buffer = "";
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    for (let end; (end = buffer.indexOf("\n")) >= 0; buffer = buffer.slice(end + 1)) {
      const m = JSON.parse(buffer.slice(0, end)) as Msg;
      if (m.id !== undefined && !m.method) answers.set(m.id, m); else told.push(m);
    }
  });
  let id = 0;
  const ask = async (method: string, params: object) => {
    const mine = ++id;
    input.write(JSON.stringify({ jsonrpc: "2.0", id: mine, method, params }) + "\n");
    await expect.poll(() => answers.has(mine), { timeout: 60_000, interval: 20 }).toBe(true);
    return answers.get(mine)!;
  };
  const view = async () => (await (await fetch(`${url}/api/terminal`)).json()) as any;
  const token = async () => ((await (await fetch(`${url}/api/session`)).json()) as { token: string }).token;
  const post = async (path: string, body: object) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": await token(), Origin: url }, body: JSON.stringify(body) });

  expect((await ask("initialize", { protocolVersion: 1, clientCapabilities: {} })).result.agentInfo.name).toBe("scripted");
  const { sessionId } = (await ask("session/new", { cwd: base.notes, mcpServers: [] })).result;
  await expect.poll(async () => (await view()).session).toBe(sessionId);
  expect((await view()).agent).toBe("Scripted");

  // What the Atlas hears from here on.
  const heard: string[] = [], abort = new AbortController();
  void fetch(`${url}/api/events`, { signal: abort.signal }).then(async (r) => {
    for await (const chunk of r.body!) heard.push(...[...new TextDecoder().decode(chunk as Uint8Array).matchAll(/^event: (agent-\S+)$/gm)].map((m) => m[1]!));
  }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 200));

  // A note given in the pane goes before the next prompt, asked in the front end.
  expect((await post("/api/acp/give", { given: [{ kind: "note", id: "integrators/leapfrog" }] })).status).toBe(200);
  await new Promise((r) => setTimeout(r, 200));
  const asked = "read integrators/leapfrog.md\nedit integrators/eulers-method.md A line the agent wrote.\nask integrators/leapfrog";
  expect((await ask("session/prompt", { sessionId, prompt: [{ type: "text", text: asked }] })).result.stopReason).toBe("end_turn");
  const reply = told.filter((m) => m.params?.update?.sessionUpdate === "agent_message_chunk").map((m) => m.params.update.content.text).join("");
  expect(reply).toContain("Blocks: 2");
  expect(reply).toContain("MCP: isorite/http");
  expect(reply).toContain("[as the note says](/integrators/leapfrog.md)");

  await expect.poll(async () => (await view()).turns[0]?.state).toBe("done");
  // What it asked back is placed a moment after the call (AFTER_TAP), once the wrapper has told of the prompt.
  await expect.poll(async () => (await view()).turns[0].items.some((i: any) => i.kind === "question")).toBe(true);
  const items = (await view()).turns[0].items;
  // The file read with the agent's own tools is the note; so is the one it changed; the question stands, to keep.
  expect(items.find((i: any) => i.kind === "tool" && i.title.startsWith("Read"))).toMatchObject({ note: "integrators/leapfrog", status: "done" });
  expect(items.find((i: any) => i.kind === "tool" && i.title.startsWith("Edit"))).toMatchObject({ note: "integrators/eulers-method", diff: expect.arrayContaining(["+A line the agent wrote."]) });
  const question = items.find((i: any) => i.kind === "question");
  expect(question).toMatchObject({ title: "Why does it drift?", about: ["integrators/leapfrog"] });
  await expect.poll(() => heard).toEqual(expect.arrayContaining(["agent-start", "agent-step", "agent-item", "agent-done"]));

  // The change is the agent's, with what was asked, not a change made elsewhere.
  const journal = (await (await fetch(`${url}/api/journal?id=integrators/eulers-method`)).json()) as { who: string; asked?: string }[];
  expect(journal.at(-1)).toMatchObject({ who: "agent:scripted", asked: expect.stringContaining("edit integrators/eulers-method.md") });

  // Kept from the pane, the question is a note.
  const kept = (await (await post("/api/agent/take", { id: question.id })).json()) as { note: string };
  expect(readFileSync(join(base.notes, `${kept.note}.md`), "utf8")).toContain("Why does it drift?");
  await expect.poll(async () => (await view()).turns[0].items.find((i: any) => i.kind === "question").made).toBe(kept.note);

  // Asked from the pane, answered there: the front end sees the prompt as the user's, and the question withdrawn.
  expect((await post("/api/terminal/prompt", { asked: "permit", given: [] })).status).toBe(200);
  await expect.poll(async () => (await view()).asking.length).toBe(1);
  expect((await post("/api/terminal/permission", { id: (await view()).asking[0].id, decision: "once" })).status).toBe(200);
  await expect.poll(async () => (await view()).turns[1]?.state).toBe("done");
  expect((await view()).turns[1]).toMatchObject({ from: "here", asked: "permit" });
  expect(told.some((m) => m.params?.update?.sessionUpdate === "user_message_chunk" && m.params.update.content.text === "permit")).toBe(true);
  expect(told.some((m) => m.method === "$/cancel_request")).toBe(true);
  abort.abort();

  // Agents' changes to the notes switched off: asking to edit a note is refused with no page open.
  expect((await post("/api/agents/notes", { may: false })).status).toBe(200);
  expect((await post("/api/terminal/prompt", { asked: "permit-edit physics/units.md", given: [] })).status).toBe(200);
  await expect.poll(async () => JSON.stringify((await view()).turns[2] ?? ""), { timeout: 10_000 }).toContain("edit refused");
  expect((await post("/api/agents/notes", { may: true })).status).toBe(200);

  // A base in no repository takes the one an agent is first attached in, relative to the notes.
  mkdirSync(join(root, "project", ".git"), { recursive: true });
  await ask("session/new", { cwd: join(root, "project"), mcpServers: [] });
  const settings = join(base.notes, ".isorite", "settings.toml");
  await expect.poll(() => existsSync(settings) && readFileSync(settings, "utf8")).toContain(`repository = "${relative(base.notes, join(root, "project"))}"`);

  input.end();
  expect(await done).toBe(0);
  await expect.poll(async () => (await view().catch(() => ({ connected: false }))).connected, { timeout: 5000 }).toBe(false);
}, 120_000);

test("several sessions (M25): one from the front end, one from the pane, one carried on from the agent's own terminal; kept here, listed in the drawer", async () => {
  const base = await writeExample(join(root, "sessions"));
  const port = await freePort(), input = new PassThrough(), output = new PassThrough();
  const store = join(root, "scripted-store.json");
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, "config2"), XDG_CACHE_HOME: join(root, "cache2"), ISORITE_EMBED: "off", SCRIPTED_STORE: store };
  const scripted = `"${process.execPath}" "${SCRIPTED}"`;
  // A session asked in the agent's own terminal, before isorite was there.
  const own = await new Promise<string>((done) => {
    const child = spawn(process.execPath, [SCRIPTED], { env, stdio: ["pipe", "pipe", "inherit"] });
    const rl = createInterface({ input: child.stdout! });
    let session = "";
    rl.on("line", (line) => {
      const m = JSON.parse(line) as { id?: number; result?: { sessionId?: string; stopReason?: string } };
      if (m.id === 2) { session = m.result!.sessionId!; child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "session/prompt", params: { sessionId: session, prompt: [{ type: "text", text: "read integrators/leapfrog.md\nasked in its own terminal" }] } }) + "\n"); }
      if (m.id === 3) { child.stdin!.end(); child.kill(); done(session); }
    });
    child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: 1 } }) + "\n");
    child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: base.notes, mcpServers: [] } }) + "\n");
  });

  const done = acp(base.notes, { agent: scripted, port, input, output, env });
  const url = `http://127.0.0.1:${port}`;
  type Msg = { id?: number | string; method?: string; params?: any; result?: any };
  const answers = new Map<number | string, Msg>(), told: Msg[] = [];
  let buffer = "";
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    for (let end; (end = buffer.indexOf("\n")) >= 0; buffer = buffer.slice(end + 1)) {
      const m = JSON.parse(buffer.slice(0, end)) as Msg;
      if (m.id !== undefined && !m.method) answers.set(m.id, m); else told.push(m);
    }
  });
  let id = 0;
  const ask = async (method: string, params: object) => {
    const mine = ++id;
    input.write(JSON.stringify({ jsonrpc: "2.0", id: mine, method, params }) + "\n");
    await expect.poll(() => answers.has(mine), { timeout: 60_000, interval: 20 }).toBe(true);
    return answers.get(mine)!;
  };
  const view = async () => (await (await fetch(`${url}/api/terminal`)).json()) as any;
  await ask("initialize", { protocolVersion: 1, clientCapabilities: {} });
  const token = ((await (await fetch(`${url}/api/session`)).json()) as { token: string }).token;
  const post = (path: string, body: object) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: url }, body: JSON.stringify(body) });
  const front = (await ask("session/new", { cwd: base.notes, mcpServers: [] })).result.sessionId as string;
  await ask("session/prompt", { sessionId: front, prompt: [{ type: "text", text: "asked in the front end" }] });
  await expect.poll(async () => (await view()).turns[0]?.state).toBe("done");
  // The agent's own session is in the drawer, beside the live one.
  await expect.poll(async () => (await view()).sessions.map((x: any) => [x.session, x.live])).toEqual(expect.arrayContaining([[front, true], [own, false]]));
  expect((await view()).size).toBe(200_000);

  // A new session from the pane, with a note given before it opens: the front end sees none of it.
  const toldBefore = told.length;
  expect((await post("/api/acp/new", { agent: "scripted" })).status).toBe(200);
  await expect.poll(async () => (await view()).session).not.toBe(front);
  const pane = (await view()).session as string;
  expect((await post("/api/acp/give", { given: [{ kind: "note", id: "integrators/leapfrog" }] })).status).toBe(200);
  expect((await post("/api/terminal/prompt", { asked: "read integrators/leapfrog.md\nasked from the pane", given: [{ kind: "note", id: "integrators/leapfrog" }] })).status).toBe(200);
  await expect.poll(async () => (await view()).turns[0]?.state).toBe("done");
  const t = (await view()).turns[0];
  expect(t).toMatchObject({ from: "here", asked: "read integrators/leapfrog.md\nasked from the pane", given: [{ kind: "note", id: "integrators/leapfrog" }] });
  expect(t.items.find((i: any) => i.kind === "text").text).toContain("Blocks: 2");
  expect(told.slice(toldBefore).some((m) => JSON.stringify(m).includes(pane))).toBe(false);
  // Given once in a session: asked again, the note is not put before it again.
  expect((await post("/api/terminal/prompt", { asked: "again", given: [{ kind: "note", id: "integrators/leapfrog" }] })).status).toBe(200);
  await expect.poll(async () => (await view()).turns[1]?.state).toBe("done");
  expect((await view()).turns[1].items.find((i: any) => i.kind === "text").text).toContain("Blocks: 1");

  // The agent's own session, carried on here: its history replayed into the pane, then asked in.
  expect((await post("/api/acp/follow", { agent: "scripted", session: own })).status).toBe(200);
  await expect.poll(async () => (await view()).turns.map((x: any) => x.asked)).toEqual(["read integrators/leapfrog.md\nasked in its own terminal"]);
  expect((await post("/api/terminal/prompt", { asked: "carried on here", given: [] })).status).toBe(200);
  await expect.poll(async () => (await view()).turns[1]?.state).toBe("done");

  // Each is kept here; the drawer says so. Shown again, the front end's is as it was.
  await expect.poll(async () => ((await (await fetch(`${url}/api/agent/records`)).json()) as any[]).filter((r) => r.agent !== "claude").map((r) => r.session).sort()).toEqual([front, own, pane].sort());
  expect((await post("/api/acp/follow", { agent: "scripted", session: front })).status).toBe(200);
  await expect.poll(async () => (await view()).turns[0]?.asked).toBe("asked in the front end");

  input.end();
  expect(await done).toBe(0);
}, 120_000);

test("the base for a session: the folder or one above it with .isorite/, else the first below it", async () => {
  const base = await writeExample(join(root, "repo", "docs", "notes"));
  expect(findBase(join(root, "repo"))).toBe(base.notes);
  expect(findBase(join(base.notes, "integrators"))).toBe(base.notes);
  expect(findBase(tmpdir() === root ? "/" : join(root, "config"))).toBeNull();
});

test("the agent chosen in the base's settings (M25): started for the pane, with no front end; signed in with its API key when it asks; stopped when none is chosen", async () => {
  const base = await writeExample(join(root, "chosen"));
  const port = await freePort();
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, "config-chosen"), XDG_CACHE_HOME: join(root, "cache"), ISORITE_EMBED: "off", SCRIPTED_AUTH: "1" };
  const server = await ensureServer(base.notes, { port, env });
  const url = server.url;
  const view = async () => (await (await fetch(`${url}/api/terminal`)).json()) as any;
  const token = ((await (await fetch(`${url}/api/session`)).json()) as { token: string }).token;
  const post = (path: string, body: object) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: url }, body: JSON.stringify(body) });
  try {
    expect(await (await fetch(`${url}/api/acp/agent`)).json()).toMatchObject({ choice: null, running: false });

    const command = `"${process.execPath}" "${SCRIPTED}"`;
    expect(await (await post("/api/acp/choose", { choice: { command } })).json()).toMatchObject({ choice: { command }, running: true });
    await expect.poll(async () => (await view()).agent, { timeout: 30_000 }).toBe("Scripted");
    expect(readFileSync(join(env.XDG_CONFIG_HOME, "isorite", "bases.toml"), "utf8")).toContain("agent_command");

    // Asked in the pane: a session opened for it (the agent signed in first), and the answer drawn there.
    expect((await post("/api/terminal/prompt", { asked: "read integrators/leapfrog.md\nglance integrators/eulers-method.md\ncite integrators/eulers-method.md#the-step\ncite sandbox:/integrators/leapfrog.md\ncite nowhere/at-all.md", given: [] })).status).toBe(200);
    await expect.poll(async () => (await view()).turns[0]?.state, { timeout: 30_000 }).toBe("done");
    const v = await view();
    expect(v.problem).toBeUndefined();
    // Its links to notes in isorite's form, however it wrote them; one to no note as it was.
    expect(v.turns[0].items.find((i: any) => i.kind === "text").text).toContain("Done, [as the note says](/integrators/leapfrog.md), [cited](/integrators/eulers-method.md#the-step), [cited](/integrators/leapfrog.md), [cited](nowhere/at-all.md).");
    expect(v.turns[0].from).toBe("here");
    // A read the agent never said was finished is, with the turn; its file (relative to where it works) is the note.
    expect(v.turns[0].items.find((i: any) => i.kind === "tool" && i.title.startsWith("read:"))).toMatchObject({ note: "integrators/eulers-method", status: "done" });

    expect(await (await post("/api/acp/choose", { choice: null })).json()).toMatchObject({ choice: null, running: false });
    await expect.poll(async () => (await view()).connected, { timeout: 15_000 }).toBe(false);
  } finally {
    await post("/api/acp/choose", { choice: null }).catch(() => undefined);
    server.release();
  }
});

test("the ACP registry: its agents as the settings list them, and how each is run here", async () => {
  const file = join(root, "registry.json");
  writeFileSync(file, JSON.stringify({ version: "1", agents: [
    { id: "claude-acp", name: "Claude Agent", version: "0.99.1", description: "ACP wrapper for Anthropic's Claude", distribution: { npx: { package: "@agentclientprotocol/claude-agent-acp@0.99.1" } } },
    { id: "fast-agent", name: "fast-agent", version: "0.10.1", distribution: { uvx: { package: "fast-agent-acp==0.10.1", args: ["-x"], env: { FAST_AGENT_MODEL: "codex plan" } } } },
    { id: "elsewhere", name: "Elsewhere", version: "1", distribution: { binary: { "plan9-mips": { archive: "https://example.invalid/a.zip", cmd: "./a" } } } },
    { id: "Not An Id", name: "Bad", version: "1", distribution: {} },
  ] }));
  const env = { ...process.env, ISORITE_ACP_REGISTRY: file };
  expect(await registryAgents(env)).toEqual([
    { id: "claude-acp", name: "Claude Agent", version: "0.99.1", description: "ACP wrapper for Anthropic's Claude", site: "", how: "npx" },
    { id: "elsewhere", name: "Elsewhere", version: "1", description: "", site: "", how: null },
    { id: "fast-agent", name: "fast-agent", version: "0.10.1", description: "", site: "", how: "uvx" },
  ]);
  const entries = await readRegistry(env);
  expect(await commandOf(entries.find((e) => e.id === "claude-acp")!, env)).toBe("npx -y @agentclientprotocol/claude-agent-acp@0.99.1");
  expect(await commandOf(entries.find((e) => e.id === "fast-agent")!, env)).toBe(process.platform === "win32" ? `FAST_AGENT_MODEL="codex plan" uvx fast-agent-acp==0.10.1 -x` : `FAST_AGENT_MODEL='codex plan' uvx fast-agent-acp==0.10.1 -x`);
  await expect(commandOf(entries.find((e) => e.id === "elsewhere")!, env)).rejects.toThrow(/not offered for/);
});

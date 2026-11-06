// Subagents over ACP (M36, step 4): a client that declares `subagents` is told of each as a session of its own. The
// pane shows it as a step of the turn, and what it reads in the base is told under its own name, so the Atlas can
// tell it from its parent. A client that does not declare it sees the work as the parent's, as before.

import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import { acp } from "../src/acp-wrap.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-acp-sub-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const SCRIPTED = fileURLToPath(new URL("./fixtures/scripted-acp.ts", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

type Turn = { state: string; items: { kind: string; name?: string; title?: string; status?: string; text?: string }[] };

/** Run one turn that delegates two reads; the agents the base heard of, and the turn as the pane shows it. */
async function run(declare: boolean): Promise<{ agents: string[]; turn: Turn; text: string }> {
  const base = await writeExample(join(root, `base-${declare}`));
  const port = await freePort(), input = new PassThrough(), output = new PassThrough();
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, `config-${declare}`), XDG_CACHE_HOME: join(root, `cache-${declare}`), ISORITE_EMBED: "off" };
  const done = acp(base.notes, { agent: `"${process.execPath}" "${SCRIPTED}"`, port, input, output, env });
  const url = `http://127.0.0.1:${port}`;
  const answers = new Map<number | string, { result?: { sessionId?: string } }>();
  let buffer = "";
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    for (let end; (end = buffer.indexOf("\n")) >= 0; buffer = buffer.slice(end + 1)) {
      const m = JSON.parse(buffer.slice(0, end)) as { id?: number; method?: string; result?: { sessionId?: string } };
      if (m.id !== undefined && !m.method) answers.set(m.id, m);
    }
  });
  let id = 0;
  const ask = async (method: string, params: object) => {
    const mine = ++id;
    input.write(JSON.stringify({ jsonrpc: "2.0", id: mine, method, params }) + "\n");
    await expect.poll(() => answers.has(mine), { timeout: 60_000, interval: 20 }).toBe(true);
    return answers.get(mine)!;
  };
  await ask("initialize", { protocolVersion: 1, clientCapabilities: declare ? { subagents: {} } : {} });
  const { sessionId } = (await ask("session/new", { cwd: base.notes, mcpServers: [] })).result!;
  // What the base hears from here on.
  const agents = new Set<string>(), abort = new AbortController();
  void fetch(`${url}/api/events`, { signal: abort.signal }).then(async (r) => {
    let rest = "";
    for await (const chunk of r.body!) {
      rest += new TextDecoder().decode(chunk as Uint8Array);
      for (const m of rest.matchAll(/^event: agent-step\ndata: (.*)$/gm)) agents.add((JSON.parse(m[1]!) as { agent: string }).agent);
    }
  }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 200));
  await ask("session/prompt", { sessionId, prompt: [{ type: "text", text: "delegate integrators/leapfrog.md scout one\ndelegate integrators/eulers-method.md scout two" }] });
  const view = async () => (await (await fetch(`${url}/api/terminal`)).json()) as { turns: Turn[] };
  await expect.poll(async () => (await view()).turns[0]?.state).toBe("done");
  await new Promise((r) => setTimeout(r, 300));
  const turn = (await view()).turns[0]!;
  abort.abort();
  input.end();
  await done;
  return { agents: [...agents].sort(), turn, text: turn.items.find((i) => i.kind === "text")?.text ?? "" };
}

test("a client that declares subagents sees each as a step, and the base hears them under their own names", async () => {
  const got = await run(true);
  expect(got.text).toContain("Subagents: declared");
  expect(got.turn.items.filter((i) => i.name === "subagent").map((i) => [i.title, i.status])).toEqual([["scout one", "done"], ["scout two", "done"]]);
  expect(got.agents).toEqual(["scripted-scout-one-1", "scripted-scout-two-2"]);
}, 120_000);

test("a client that does not declare it sees the work as the parent's, as before", async () => {
  const got = await run(false);
  expect(got.text).toContain("Subagents: no");
  expect(got.turn.items.some((i) => i.name === "subagent")).toBe(false);
  expect(got.agents).toEqual(["scripted"]);
}, 120_000);

test("with the pane alone in front, isorite declares it itself", async () => {
  const base = await writeExample(join(root, "base-pane"));
  const port = await freePort();
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, "config-pane"), XDG_CACHE_HOME: join(root, "cache-pane"), ISORITE_EMBED: "off" };
  const done = acp(base.notes, { agent: `"${process.execPath}" "${SCRIPTED}"`, port, pane: true, env });
  const url = `http://127.0.0.1:${port}`;
  await expect.poll(async () => (await fetch(`${url}/api/session`).catch(() => null))?.status, { timeout: 30_000, interval: 50 }).toBe(200);
  const token = ((await (await fetch(`${url}/api/session`)).json()) as { token: string }).token;
  const post = (path: string, body: object) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: url }, body: JSON.stringify(body) });
  const view = async () => (await (await fetch(`${url}/api/terminal`)).json()) as { connected: boolean; session: string | null; turns: Turn[] };
  await expect.poll(async () => (await view()).connected, { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => ((await view()) as { agentId?: string }).agentId, { timeout: 30_000 }).toBe("scripted");
  expect((await post("/api/acp/new", { agent: "scripted" })).status).toBe(200);
  await expect.poll(async () => (await view()).session, { timeout: 30_000 }).not.toBeNull();
  expect((await post("/api/terminal/prompt", { asked: `read ${join(base.notes, "integrators/leapfrog.md")}`, given: [] })).status).toBe(200);
  await expect.poll(async () => (await view()).turns[0]?.state, { timeout: 30_000 }).toBe("done");
  expect((await view()).turns[0]!.items.find((i) => i.kind === "text")?.text).toContain("Subagents: declared");
  // Stopped as a person stops it, and waited for.
  process.emit("SIGINT");
  await done;
}, 120_000);

import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import { mcp } from "../src/mcp.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-mcp-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

test("isorite mcp: the base's tools over stdio, each look-up a step on the Atlas, the turn ended when quiet", async () => {
  const base = await writeExample(join(root, "base"));
  const port = await freePort(), input = new PassThrough(), output = new PassThrough();
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, "config"), XDG_CACHE_HOME: join(root, "cache"), ISORITE_EMBED: "off" };
  const done = mcp(base.study, { port, agent: "claude-code", quiet: 300, input, output, env });

  type Reply = { id: number; result?: Record<string, unknown>; error?: { code: number } };
  const replies = new Map<number, Reply>();
  let buffer = "";
  output.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    for (let end; (end = buffer.indexOf("\n")) >= 0; buffer = buffer.slice(end + 1)) {
      const reply = JSON.parse(buffer.slice(0, end)) as Reply;
      replies.set(reply.id, reply);
    }
  });
  let id = 0;
  const call = async (method: string, params: object = {}) => {
    const mine = ++id;
    input.write(JSON.stringify({ jsonrpc: "2.0", id: mine, method, params }) + "\n");
    for (let waited = 0; !replies.has(mine); waited += 20) {
      if (waited > 60_000) throw new Error(`no reply to ${method}`);
      await new Promise((r) => setTimeout(r, 20));
    }
    return replies.get(mine)!;
  };

  const init = await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
  expect(init.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "isorite" } });
  input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const listed = (await call("tools/list")).result as { tools: { name: string; inputSchema: { type: string } }[] };
  expect(listed.tools.map((t) => t.name)).toEqual(["brief_base", "search_notes", "outline_note", "read_note", "propose_note_edit", "propose_note_write"]);
  expect(listed.tools[1]!.inputSchema.type).toBe("object");

  // What the browser hears, from here on.
  const heard: string[] = [], abort = new AbortController();
  void fetch(`http://127.0.0.1:${port}/api/events`, { signal: abort.signal }).then(async (response) => {
    for await (const chunk of response.body!) heard.push(...[...new TextDecoder().decode(chunk as Uint8Array).matchAll(/^event: (agent-\S+)$/gm)].map((m) => m[1]!));
  }).catch(() => undefined);
  await new Promise((r) => setTimeout(r, 200));

  const found = (await call("tools/call", { name: "search_notes", arguments: { query: "leapfrog" } })).result as { content: { text: string }[]; isError?: boolean };
  expect(found.isError).toBeUndefined();
  expect(found.content[0]!.text).toContain("/integrators/leapfrog.md");
  const missing = (await call("tools/call", { name: "read_note", arguments: { id: "no/such" } })).result as { content: { text: string }[] };
  expect(missing.content[0]!.text).toMatch(/There is no note no\/such/);
  expect((await call("no/such/method")).error?.code).toBe(-32601);
  expect((await call("ping")).result).toEqual({});

  await new Promise((r) => setTimeout(r, 700)); // quiet: the turn ends
  expect(heard).toEqual(["agent-start", "agent-step", "agent-step", "agent-done"]);
  abort.abort();

  input.end();
  expect(await done).toBe(0);
  // It started the server, so it stopped it.
  await new Promise((r) => setTimeout(r, 300));
  expect(await fetch(`http://127.0.0.1:${port}/api/session`).then(() => true, () => false)).toBe(false);
}, 120_000);

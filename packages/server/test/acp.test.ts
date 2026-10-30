import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import { acp, findBase } from "../src/acp-wrap.ts";

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

  input.end();
  expect(await done).toBe(0);
  await expect.poll(async () => (await view().catch(() => ({ connected: false }))).connected, { timeout: 5000 }).toBe(false);
}, 120_000);

test("the base for a session: the folder or one above it with .isorite/, else the first below it", async () => {
  const base = await writeExample(join(root, "repo", "docs", "notes"));
  expect(findBase(join(root, "repo"))).toBe(base.notes);
  expect(findBase(join(base.notes, "integrators"))).toBe(base.notes);
  expect(findBase(tmpdir() === root ? "/" : join(root, "config"))).toBeNull();
});

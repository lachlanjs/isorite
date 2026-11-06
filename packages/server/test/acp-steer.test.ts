// Steering over ACP (M36, step 6b): an agent that says it takes a message into a turn that is running is sent one,
// and the turn shows it; one that does not is never sent the request, and the pane says why.

import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import { acp } from "../src/acp-wrap.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-acp-steer-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const SCRIPTED = fileURLToPath(new URL("./fixtures/scripted-acp.ts", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

type Turn = { state: string; items: { kind: string; text?: string; mode?: string; state?: string }[] };

async function run(steerable: boolean) {
  const base = await writeExample(join(root, `base-${steerable}`));
  const port = await freePort(), input = new PassThrough(), output = new PassThrough();
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, `config-${steerable}`), XDG_CACHE_HOME: join(root, `cache-${steerable}`), ISORITE_EMBED: "off", SCRIPTED_STEER: steerable ? "1" : "0" };
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
  await ask("initialize", { protocolVersion: 1, clientCapabilities: {} });
  const token = ((await (await fetch(`${url}/api/session`)).json()) as { token: string }).token;
  const post = (path: string, body: object) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: url }, body: JSON.stringify(body) });
  const view = async () => (await (await fetch(`${url}/api/terminal`)).json()) as { steer?: boolean; busy: boolean; turns: Turn[] };
  const { sessionId } = (await ask("session/new", { cwd: base.notes, mcpServers: [] })).result!;
  // A prompt that works for a while, asked from the front end.
  const prompting = ask("session/prompt", { sessionId, prompt: [{ type: "text", text: "wait 1500" }] });
  await expect.poll(async () => (await view()).busy).toBe(true);
  const steered = await post("/api/terminal/steer", { asked: "Actually, be brief.", given: [] });
  const body = await steered.json().catch(() => ({})) as { error?: string };
  await prompting;
  await expect.poll(async () => (await view()).turns[0]?.state).toBe("done");
  const out = { status: steered.status, error: body.error, view: await view() };
  input.end();
  await done;
  return out;
}

test("an agent that takes steering is sent the message mid-turn, and the turn shows it was sent", async () => {
  const got = await run(true);
  expect(got.status).toBe(200);
  expect(got.view.steer).toBe(true);
  const turn = got.view.turns[0]!;
  expect(turn.items.find((i) => i.kind === "message")).toMatchObject({ text: "Actually, be brief.", mode: "steer", state: "sent" });
  expect(turn.items.find((i) => i.kind === "text")?.text).toContain("Steered: Actually, be brief.");
}, 120_000);

test("an agent that does not is not sent the request, and the pane says why", async () => {
  const got = await run(false);
  expect(got.status).toBe(409);
  expect(got.error).toMatch(/cannot be steered/);
  expect(got.view.steer).toBeUndefined();
  expect(got.view.turns[0]!.items.some((i) => i.kind === "message")).toBe(false);
  expect(got.view.turns[0]!.items.find((i) => i.kind === "text")?.text).not.toContain("Steered");
}, 120_000);

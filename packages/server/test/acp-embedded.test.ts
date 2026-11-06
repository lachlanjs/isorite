// Chips as embedded resources (M36, step 3b): an agent that says it takes embedded context is given a passage as a
// resource block (the note's address, the passage as its text); one that does not is given it quoted in the text.

import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import { acp } from "../src/acp-wrap.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-acp-embedded-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const SCRIPTED = fileURLToPath(new URL("./fixtures/scripted-acp.ts", import.meta.url));

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

/** Ask from the pane with a passage and a note chosen; the agent's reply says what it was given. */
async function reply(embedded: boolean): Promise<{ text: string; given: unknown }> {
  const base = await writeExample(join(root, `base-${embedded}`));
  const port = await freePort(), input = new PassThrough(), output = new PassThrough();
  const env = { ...process.env, XDG_CONFIG_HOME: join(root, `config-${embedded}`), XDG_CACHE_HOME: join(root, `cache-${embedded}`), ISORITE_EMBED: "off", SCRIPTED_EMBEDDED: embedded ? "1" : "0" };
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
  const view = async () => (await (await fetch(`${url}/api/terminal`)).json()) as { session: string | null; turns: { state: string; given?: unknown; items: { kind: string; text?: string }[] }[] };

  await ask("initialize", { protocolVersion: 1, clientCapabilities: {} });
  const token = ((await (await fetch(`${url}/api/session`)).json()) as { token: string }).token;
  const post = (path: string, body: object) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: url }, body: JSON.stringify(body) });
  await ask("session/new", { cwd: base.notes, mcpServers: [] });
  await expect.poll(async () => (await view()).session).not.toBeNull();
  const given = [{ kind: "note", id: "integrators/leapfrog" }, { kind: "passage", id: "integrators/eulers-method", text: "The step is small." }];
  expect((await post("/api/terminal/prompt", { asked: "say what you were given", given })).status).toBe(200);
  await expect.poll(async () => (await view()).turns[0]?.state).toBe("done");
  const turn = (await view()).turns[0]!;
  input.end();
  await done;
  return { text: turn.items.find((i) => i.kind === "text")?.text ?? "", given: turn.given };
}

test("an agent that takes embedded context gets the passage as a resource; one that does not gets it quoted", async () => {
  const yes = await reply(true);
  expect(yes.text).toContain('Resource isorite://nbody-notes/integrators/eulers-method="The step is small."');
  expect(yes.text).toContain("Blocks: 3");
  expect(yes.given).toHaveLength(2);

  const no = await reply(false);
  expect(no.text).not.toContain("Resource isorite://");
  expect(no.text).toContain("Blocks: 2");
  expect(no.given).toHaveLength(2);
}, 120_000);

// Who the base takes an MCP caller to be (M36, step 4). The endpoint keeps no session: a caller is `?agent=` on the
// address, else the client name a request carries, else "mcp". So a harness and its subagents, given one address,
// are one agent; they can be told apart only where each request names itself.

import { mkdtempSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve as nodeServe } from "@hono/node-server";
import { afterAll, beforeAll, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import type { EngineEvent } from "@isorite/engine";
import { createApp } from "../src/http.ts";
import { locate, openEngine } from "../src/serve.ts";

let root: string, url: string, server: ReturnType<typeof nodeServe>;
const steps: string[] = [];

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "isorite-mcp-id-"));
  const base = await writeExample(join(root, "base"));
  const api = await openEngine(locate(base.notes), "testdev1", null);
  api.events((e: EngineEvent) => { if (e.type === "agent-step") steps.push(e.agent); });
  server = nodeServe({ fetch: createApp({ api, token: "t", loopback: true, web: null }).fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise((done) => server.once("listening", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); rmSync(root, { recursive: true, force: true }); });

/** One look-up, as a client sends it; the agent the base heard of. */
async function look(query: string, meta?: object): Promise<string> {
  const before = steps.length;
  const res = await fetch(`${url}/mcp${query}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "search_notes", arguments: { query: "entropy" }, ...(meta ? { _meta: meta } : {}) } }) });
  expect(res.status).toBe(200);
  await expect.poll(() => steps.length).toBeGreaterThan(before);
  return steps[before]!;
}

test("one address is one agent, however many callers use it", async () => {
  expect(await look("?agent=claude")).toBe("claude");
  expect(await look("?agent=claude")).toBe("claude");
});

test("callers are told apart where each request names itself, or has an address of its own", async () => {
  expect(await look("", { "io.modelcontextprotocol/clientInfo": { name: "Scout One" } })).toBe("scout-one");
  expect(await look("", { "io.modelcontextprotocol/clientInfo": { name: "Scout Two" } })).toBe("scout-two");
  expect(await look("?agent=scout-three")).toBe("scout-three");
});

test("a request that names nothing is just \"mcp\"", async () => {
  expect(await look("")).toBe("mcp");
});

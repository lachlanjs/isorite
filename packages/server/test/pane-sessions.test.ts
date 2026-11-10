// The Agent pane's routes serve any host of sessions held to the PaneSessions interface: it is asked through the
// pages' own routes and told to their event stream.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve as nodeServe } from "@hono/node-server";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Given, TerminalView } from "@isorite/engine";
import { TOKEN_HEADER, createApp } from "../src/http.ts";
import { locate, openEngine } from "../src/serve.ts";
import type { PaneSessions } from "../src/sessions.ts";

const TOKEN = "the-token";
let root: string, url: string, server: ReturnType<typeof nodeServe>;

const EMPTY: TerminalView = { connected: true, agent: "Scripted", agentId: "scripted", session: "s1", title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "", sessions: [] };

/** A host that keeps its calls, and shows one turn per prompt. */
class Fake implements PaneSessions {
  calls: string[] = [];
  #view = EMPTY;
  #listeners = new Set<(v: TerminalView) => void>();
  view() { return this.#view; }
  listen(fn: (v: TerminalView) => void) { this.#listeners.add(fn); return () => { this.#listeners.delete(fn); }; }
  asked() { return this.#view.turns.at(-1)?.state === "running" ? this.#view.turns.at(-1)!.asked : ""; }
  async prompt(text: string) {
    this.calls.push(`prompt:${text}`);
    this.#view = { ...this.#view, busy: true, turns: [...this.#view.turns, { id: "t1", asked: text, from: "here", items: [{ kind: "text", text: "An answer." }], state: "running" }] };
    for (const fn of this.#listeners) fn(this.#view);
  }
  async interrupt() { this.calls.push("interrupt"); }
  async give(parts: Given[], render: (p: Given[]) => string) { this.calls.push(`give:${render(parts)}`); }
  async reply(id: string, decision: string) { this.calls.push(`reply:${id}:${decision}`); }
  async follow(agent: string, session: string) { this.calls.push(`follow:${agent}:${session}`); }
  async fresh(agent: string) { this.calls.push(`fresh:${agent}`); }
  async forget(agent: string, session: string) { this.calls.push(`forget:${agent}:${session}`); }
  refresh() { this.calls.push("refresh"); }
}
const host = new Fake();

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "isorite-pane-"));
  const notes = join(root, "notes");
  mkdirSync(join(notes, "basics"), { recursive: true });
  writeFileSync(join(notes, "basics", "entropy.md"), "---\ntype: Concept\ntitle: Entropy\n---\n\nThe average surprise.\n");
  const api = await openEngine(locate(notes), "testdev1", null);
  server = nodeServe({ fetch: createApp({ api, token: TOKEN, loopback: true, web: null, terminal: host }).fetch, hostname: "127.0.0.1", port: 0 });
  await new Promise((done) => server.once("listening", done));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); rmSync(root, { recursive: true, force: true }); });

const post = (path: string, body: unknown) => fetch(url + path, { method: "POST", headers: { Origin: url, "Content-Type": "application/json", [TOKEN_HEADER]: TOKEN }, body: JSON.stringify(body) });

test("the pane reads, asks, gives, stops and answers through its host", async () => {
  expect(await (await fetch(url + "/api/terminal")).json()).toMatchObject({ connected: true, agent: "Scripted", session: "s1" });
  expect((await post("/api/terminal/prompt", { asked: "What is entropy?", given: [{ kind: "passage", id: "basics/entropy", text: "The average surprise." }] })).status).toBe(200);
  expect(host.calls[0]).toContain("give:");
  expect(host.calls[0]).toContain("> The average surprise.");
  expect(host.calls[1]).toBe("prompt:What is entropy?");
  expect(await (await fetch(url + "/api/terminal")).json()).toMatchObject({ busy: true, turns: [{ asked: "What is entropy?", items: [{ kind: "text", text: "An answer." }] }] });
  expect((await post("/api/terminal/stop", {})).status).toBe(200);
  expect((await post("/api/terminal/permission", { id: "p1", decision: "once" })).status).toBe(200);
  expect(host.calls.slice(2)).toEqual(["interrupt", "reply:p1:once"]);
});

test("the tray, a new session, one followed and one forgotten reach the host through the terminal routes", async () => {
  host.calls.length = 0;
  expect((await post("/api/terminal/give", { given: [{ kind: "note", id: "basics/entropy" }] })).status).toBe(200);
  expect((await post("/api/terminal/new", { agent: "scripted" })).status).toBe(200);
  expect((await post("/api/terminal/follow", { agent: "scripted", session: "s2" })).status).toBe(200);
  expect((await post("/api/terminal/forget", { agent: "scripted", session: "s2" })).status).toBe(200);
  expect((await post("/api/terminal/fork", { agent: "scripted", session: "s2" })).status).toBe(409);
  expect(host.calls).toEqual(["give:From my knowledge base (read them with read_note, or outline_note first):\n- Entropy (basics/entropy)", "fresh:scripted", "follow:scripted:s2", "forget:scripted:s2"]);
});

test("the pane's view reaches the page's event stream from the host, as it changes", async () => {
  const stream = await fetch(url + "/api/events");
  const reader = stream.body!.getReader();
  const seen = async (want: string): Promise<string> => {
    let text = "";
    for (let i = 0; i < 50 && !text.includes(want); i++) { const { value, done } = await reader.read(); if (done) break; text += new TextDecoder().decode(value); }
    return text;
  };
  expect(await seen("event: terminal")).toContain("\"agent\":\"Scripted\"");
  await host.prompt("A second question");
  expect(await seen("A second question")).toContain("A second question");
  await reader.cancel();
});

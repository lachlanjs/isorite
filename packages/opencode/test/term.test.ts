// isorite term from end to end: the real launcher, the real isorite server on the example
// base, and OpenCode 2, in tmux, against a scripted gateway. Skipped without OpenCode 2 or tmux.
// ISORITE_OPENCODE names the OpenCode to use; ISORITE_PREVIEW names a folder to keep each
// screen in, with its colours, for pictures.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadBundle } from "@isorite/core/node";
import { writeExample } from "@isorite/example/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lines } from "../plugin/logo.ts";
import { findOpenCode, type Found } from "../src/opencode.ts";
import { startGateway, lastAsked, type Gateway } from "./fixtures/gateway.ts";
import { hasTmux, Pane } from "./fixtures/tmux.ts";

const MAIN = fileURLToPath(new URL("../../server/src/main.ts", import.meta.url));

// What the scripted model looks up when asked to check against the notes: the base, a search, a section, and a
// note the first rests on, reached along its link.
const LOOKS = [
  { tool: "brief_base", args: {} },
  { tool: "search_notes", args: { query: "mixing" } },
  { tool: "read_note", args: { id: "dmft/the-dmft-loop", section: "Mixing" } },
  { tool: "read_note", args: { id: "/dmft/self-consistency-condition.md" } },
];

/** The server's events, as the browser hears them, from now until stopped. */
function listen(port: number): { events: { type: string; data: Record<string, unknown> }[]; stop: () => void } {
  const events: { type: string; data: Record<string, unknown> }[] = [], abort = new AbortController();
  void (async () => {
    const response = await fetch(`http://127.0.0.1:${port}/api/events`, { signal: abort.signal });
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body!) {
      buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      let end: number;
      while ((end = buffer.indexOf("\n\n")) >= 0) {
        const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const type = block.match(/^event: (.*)$/m)?.[1], data = block.match(/^data: (.*)$/m)?.[1];
        if (type && data) events.push({ type, data: JSON.parse(data) as Record<string, unknown> });
      }
    }
  })().catch(() => undefined);
  return { events, stop: () => abort.abort() };
}

let opencode: Found | null = null;
try { opencode = findOpenCode(); } catch { /* skipped below */ }
const ready = opencode !== null && hasTmux();

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as { port: number };
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

async function serving(port: number): Promise<boolean> {
  try { return (await fetch(`http://127.0.0.1:${port}/api/session`, { signal: AbortSignal.timeout(1000) })).ok; } catch { return false; }
}

describe.skipIf(!ready)("isorite term", () => {
  let root: string, base: { notes: string; study: string }, gateway: Gateway, pane: Pane, port: number;
  const keep = (name: string) => {
    const dir = process.env.ISORITE_PREVIEW;
    if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${name}.ans`), pane.ansi()); }
  };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "isorite-term-"));
    base = await writeExample(join(root, "base"));
    mkdirSync(join(root, "code"));
    gateway = await startGateway((request) => {
      if (!lastAsked(request).includes("my notes")) return { text: `You asked: ${lastAsked(request)}. Mixing keeps part of the old bath.` };
      const looked = request.messages.slice(request.messages.findLastIndex((m) => m.role === "user")).filter((m) => m.role === "tool").length;
      return LOOKS[looked] ?? { text: "Your note on the loop says to mix: keep part of the old self-energy." };
    });
    port = await freePort();
    pane = new Pane([process.execPath, MAIN, "term", base.study, "--port", String(port)], {
      cwd: join(root, "code"),
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? root,
        ISORITE_OPENCODE: opencode!.command,
        ISORITE_GATEWAY_URL: gateway.url,
        ISORITE_GATEWAY_MODELS: "scripted",
        ISORITE_GATEWAY_KEY: "test-key",
        // Everything OpenCode and isorite keep goes in the test's own folder; the cache, which holds
        // the AI SDK package OpenCode fetches, is shared.
        XDG_CONFIG_HOME: join(root, "config"),
        XDG_DATA_HOME: join(root, "data"),
        XDG_STATE_HOME: join(root, "state"),
      },
    });
  }, 60_000);

  afterAll(async () => {
    pane?.close();
    await gateway?.close();
    rmSync(root, { recursive: true, force: true });
  });

  it("opens on the splash: the mark, the name, and the base as the server tells it", async () => {
    const text = await pane.waitFor("i s o r i t e", 90_000);
    const count = loadBundle(base.notes).concepts.size;
    await pane.waitFor(`${basename(base.notes)} · ${count} notes · study base found`);
    for (const row of lines().filter((l) => l.trim())) expect(text).toContain(row.trim());
    expect(text).toContain(" [enter] open    [a] atlas in the browser   [?] keys   [q] quit");
    keep("1-splash");
  }, 120_000);

  it("goes into OpenCode on enter, with the gateway as its model", async () => {
    pane.keys("Enter");
    await pane.waitFor("Gateway");
    keep("2-home");
  }, 30_000);

  it("sends a prompt to the gateway, with the key, and shows the reply", async () => {
    pane.type("why does my loop not converge?");
    pane.keys("Enter");
    await pane.waitFor("Mixing keeps part of the old bath.", 60_000);
    expect(gateway.requests.at(-1)?.authorization).toBe("Bearer test-key");
    keep("3-session");
  }, 90_000);

  it("looks things up in the base with Iso's tools, and the server publishes each step for the Atlas", async () => {
    const heard = listen(port);
    await new Promise((r) => setTimeout(r, 300));
    pane.type("why does my loop not converge? check it against my notes");
    pane.keys("Enter");
    await pane.waitFor("keep part of the old self-energy", 60_000);
    const text = pane.text();
    expect(text).toContain("brief_base");
    expect(text).toContain("search_notes [query=mixing]");
    expect(text).toMatch(/read_note \[id=dmft\/the-dmft-loop, section=Mixing\]/);
    // The tools came from the server, with Iso's descriptions; the turn ends when the session goes idle.
    expect(gateway.requests.at(-1)?.tools).toEqual(expect.arrayContaining(["brief_base", "search_notes", "outline_note", "read_note"]));
    // From this turn's start: the turn before may still be ending when listening begins.
    const turnOf = () => {
      const agentEvents = heard.events.filter((e) => e.type.startsWith("agent-"));
      const start = agentEvents.findIndex((e) => e.type === "agent-start");
      return start < 0 ? [] : agentEvents.slice(start);
    };
    const started = Date.now();
    while (!turnOf().some((e) => e.type === "agent-done") && Date.now() - started < 10_000) await new Promise((r) => setTimeout(r, 100));
    heard.stop();
    const turn = turnOf();
    expect(turn.map((e) => e.type)).toEqual(["agent-start", "agent-step", "agent-step", "agent-step", "agent-done"]);
    expect(new Set(turn.map((e) => e.data.request)).size).toBe(1);
    const steps = turn.flatMap((e) => (e.type === "agent-step" ? [e.data.step as { how: string; opened?: string; from?: string; notes: string[] }] : []));
    expect(steps[0]).toMatchObject({ how: "keyword" });
    expect(steps[0]!.notes).toContain("dmft/the-dmft-loop");
    expect(steps[1]).toMatchObject({ how: "keyword", opened: "dmft/the-dmft-loop" });
    expect(steps[2]).toMatchObject({ how: "link", opened: "dmft/self-consistency-condition", from: "dmft/the-dmft-loop" });
    keep("4-lookups");
  }, 90_000);

  it("stops the server it started when OpenCode exits", async () => {
    expect(await serving(port)).toBe(true);
    pane.keys("C-c");
    await pane.waitFor(/\[exited \d+\]/, 30_000);
    expect(await serving(port)).toBe(false);
  }, 60_000);
});

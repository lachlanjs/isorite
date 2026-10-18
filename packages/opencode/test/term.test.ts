// isorite term from end to end: the real launcher, the real isorite server on the example
// base, and OpenCode 2, in tmux, against a scripted gateway. Skipped without OpenCode 2 or tmux.
// ISORITE_OPENCODE names the OpenCode to use; ISORITE_PREVIEW names a folder to keep each
// screen in, with its colours, for pictures.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pending, readJournal } from "@isorite/core";
import { loadBundle } from "@isorite/core/node";
import { writeExample } from "@isorite/example/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lines } from "../plugin/logo.ts";
import { findOpenCode, type Found } from "../src/opencode.ts";
import * as Wordmark from "../plugin/wordmark.ts";
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
      // Iso, asked in place from the note view: its requests carry no edit tool, as OpenCode's do.
      if (!request.tools.includes("edit")) return { text: "Near the transition the bath swings, so the step is halved." };
      if (lastAsked(request).includes("fix the loop")) {
        const done = request.messages.slice(request.messages.findLastIndex((m) => m.role === "user")).filter((m) => m.role === "tool").length;
        const edits = [
          // OpenCode's own edit, on a note: made a proposal by the plugin.
          { tool: "edit", args: { path: join(base.notes, "dmft", "the-dmft-loop.md"), oldString: "Keep part of the old self-energy:", newString: "Keep part of the old self-energy, half of it to begin with:" } },
          { tool: "propose_note_write", args: { note: "dmft/broyden-mixing.md", content: "---\ntype: Concept\ntitle: Broyden mixing\n---\n\nAdapts the mixing weight each pass.\n" } },
          // And a file of code, which is OpenCode's own business.
          { tool: "write", args: { path: "mixing.py", content: "MIX = 0.5\n" } },
        ];
        return edits[done] ?? { text: "Done: the note's change waits for you, and mixing.py is written." };
      }
      if (!lastAsked(request).includes("my notes")) return { text: `You asked: ${lastAsked(request)}. Mixing keeps part of the old bath.` };
      const looked = request.messages.slice(request.messages.findLastIndex((m) => m.role === "user")).filter((m) => m.role === "tool").length;
      return LOOKS[looked] ?? { text: "Your note on the loop says to mix `[1]`: keep part of the old self-energy.\n\n```isorite\n[1] dmft/the-dmft-loop § Mixing\n```" };
    });
    port = await freePort();
    // Iso, in the isorite server, is pointed at the scripted gateway too.
    mkdirSync(join(root, "config", "isorite"), { recursive: true });
    writeFileSync(join(root, "config", "isorite", "config.toml"), `[provider]\nname = "scripted"\nurl = "${gateway.url}"\nkey = "iso-key"\n`);
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

  it("goes into OpenCode on enter, with the gateway as its model, and isorite's name where OpenCode's is", async () => {
    pane.keys("Enter");
    await pane.waitFor("Gateway");
    const text = await pane.waitFor(Wordmark.lines()[5]!.trim());
    for (const row of Wordmark.lines()) expect(text).toContain(row.trim());
    expect(text).not.toContain("█▀▀█ █▀▀█ █▀▀█ █▀▀▄");
    keep("2-home");
  }, 30_000);

  it("says in the status line which base it is, and that the Atlas follows only while a browser has it open", async () => {
    const footer = () => pane.text();
    await pane.waitFor(() => footer().includes("dmft-notes"));
    expect(footer()).not.toContain("atlas following");
    // A page of the browser: the server counts it, and the status line says the Atlas follows.
    const page = new AbortController();
    void fetch(`http://127.0.0.1:${port}/api/events`, { signal: page.signal }).then(async (r) => { for await (const _ of r.body!) { /* listening */ } }).catch(() => undefined);
    await pane.waitFor(() => footer().includes("◆ atlas following"));
    keep("2b-status");
    page.abort();
    await pane.waitFor(() => !footer().includes("atlas following"));
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
    // The sidebar has the notes in play: the one found, and the one reached along its link.
    const shown = await pane.waitFor("notes in play");
    // The answer's source is drawn as the board draws a citation, and the note it names is used.
    expect(shown).toContain("says to mix [1]: keep");
    expect(shown).toContain("[1] the dmft loop § mixing");
    expect(await pane.waitFor(/the dmft loop\s+◆ used/)).toBeTruthy();
    // A long title wraps in the narrow sidebar; its state stays on its first line.
    expect(shown).toMatch(/requires › self-\s*read/);
    expect(shown).toContain("consistency condition");
    keep("4-lookups");
  }, 90_000);

  it("shows one note's atlas beside the chat: what it requires, what builds on it; [a] the next note in play; esc closes it", async () => {
    pane.type("/atlas self-consistency");
    await new Promise((r) => setTimeout(r, 500));
    pane.keys("Enter");
    const shown = await pane.waitFor("atlas · self-consistency condition", 30_000);
    expect(shown).toContain("it requires");
    expect(shown).toContain("builds on it");
    expect(shown).toContain("weiss field");
    expect(shown).toContain("dyson equation");
    expect(shown).toContain("the dmft loop");
    expect(shown).toMatch(/┏━+┓/);
    keep("4b-atlas");
    // Focused (leader, then →), its keys are its own: [a] steps to the next note in play, esc closes it.
    pane.keys("C-x", "Right");
    await new Promise((r) => setTimeout(r, 300));
    pane.keys("a");
    await pane.waitFor((t: string) => /atlas · (?!self-consistency)/.test(t));
    pane.keys("Escape");
    await pane.waitFor((t: string) => !t.includes("atlas · "));
  }, 60_000);

  it("proposes changes to notes, which wait to be kept, and writes code as OpenCode does", async () => {
    const loop = join(base.notes, "dmft", "the-dmft-loop.md"), before = readFileSync(loop, "utf8");
    pane.type("fix the loop: mix half the old self-energy, and note Broyden mixing");
    pane.keys("Enter");
    // OpenCode asks before writing a file of code; a note's proposal is not a write, and asks nothing.
    const asked = await pane.waitFor(/Done: the note's change waits|Allow|allow/, 60_000);
    if (!asked.includes("Done:")) { pane.keys("Enter"); await pane.waitFor("Done: the note's change waits", 60_000); }
    keep("5-proposals");
    expect(readFileSync(loop, "utf8")).toBe(before);
    expect(readFileSync(join(root, "code", "mixing.py"), "utf8")).toBe("MIX = 0.5\n");
    const journal = readJournal(readFileSync(join(base.study, "journal", "dmft", "the-dmft-loop.jsonl"), "utf8"));
    expect(pending(journal).at(-1)).toMatchObject({
      who: "agent:opencode", form: "rewrite", asked: "fix the loop: mix half the old self-energy, and note Broyden mixing",
      regions: [{ old: { text: "Keep part of the old self-energy:" }, new: "Keep part of the old self-energy, half of it to begin with:" }],
    });
    // The new note waits as a note for review.
    const drafts = (await (await fetch(`http://127.0.0.1:${port}/api/drafts`)).json()) as { title: string }[];
    expect(drafts.map((d) => d.title)).toContain("Broyden mixing");
    // The agent was told where the notes are and how they change.
    const system = JSON.stringify(gateway.requests.at(-1)?.messages.filter((m) => m.role === "system"));
    expect(system).toContain(base.notes);
    expect(system).toContain("propose_note_edit");
  }, 120_000);

  it("opens a note in the terminal: its gutter, its code, the agent's change waiting with its keys; [k] keeps it", async () => {
    const loop = join(base.notes, "dmft", "the-dmft-loop.md");
    pane.type("/note dmft loop");
    await new Promise((r) => setTimeout(r, 500));
    pane.keys("Enter");
    const shown = await pane.waitFor("dmft / the dmft loop", 30_000);
    expect(shown).toContain("python");
    expect(shown).toMatch(/◆ OpenCode · not kept yet/);
    expect(shown).toContain("[k] keep  [e] edit  [r] remove");
    expect(shown).toContain("Keep part of the old self-energy, half of it to begin with:");
    keep("7-note");
    pane.keys("k");
    for (let waited = 0; !readFileSync(loop, "utf8").includes("half of it to begin with") && waited < 10_000; waited += 100) await new Promise((r) => setTimeout(r, 100));
    expect(readFileSync(loop, "utf8")).toContain("Keep part of the old self-energy, half of it to begin with:");
    await pane.waitFor((t: string) => !t.includes("not kept yet"));

    // [/] asks Iso here; its text waits as a change of its own, and [r] removes it.
    pane.keys("/");
    await pane.waitFor("Ask Iso here");
    pane.type("say why it swings");
    pane.keys("Enter");
    const asked = await pane.waitFor("◆ Iso · not kept yet", 60_000);
    expect(asked).toContain("Near the transition the bath swings, so the step is halved.");
    keep("8-asked");
    pane.keys("r");
    await pane.waitFor((t: string) => !t.includes("◆ Iso · not kept yet"));
    // Asked again: [e] edits Iso's text, and keeps it as edited.
    pane.keys("/");
    await pane.waitFor("Ask Iso here");
    pane.type("say it again");
    pane.keys("Enter");
    await pane.waitFor("◆ Iso · not kept yet", 60_000);
    pane.keys("e");
    await pane.waitFor("Edit Iso's change, then keep it");
    pane.keys("End");
    pane.type(" Mostly.");
    pane.keys("Enter");
    for (let waited = 0; !readFileSync(loop, "utf8").includes("so the step is halved. Mostly.") && waited < 10_000; waited += 100) await new Promise((r) => setTimeout(r, 100));
    expect(readFileSync(loop, "utf8")).toContain("Near the transition the bath swings, so the step is halved. Mostly.");

    // [t] is the note's timeline; a moment chosen shows the note as it was, and q comes back to it as it is.
    pane.keys("t");
    const timeline = await pane.waitFor("The note's timeline");
    expect(timeline).toMatch(/OpenCode · “fix the loop/);
    pane.keys("Down", "Enter");
    await pane.waitFor("as it was");
    keep("9-timeline");
    pane.keys("q");
    await pane.waitFor((t: string) => !t.includes("as it was") && t.includes("dmft / the dmft loop"));
    // [s] sends the paragraph the cursor is on to the agent; it is in the session, under from you, once back there.
    pane.keys("s");
    await pane.waitFor("Send to the agent");
    pane.type("is this the loop you meant?");
    pane.keys("Enter");
    pane.keys("q");
    await pane.waitFor("fix the loop: mix half the old self-energy", 10_000);
    await pane.waitFor("“is this the loop you meant?”", 10_000);
  }, 90_000);

  it("takes a note sent from the browser into the session on screen, shows it under from you, and the agent reads it next", async () => {
    const heard = listen(port);
    await new Promise((r) => setTimeout(r, 300));
    const url = `http://127.0.0.1:${port}`;
    const { token } = (await (await fetch(`${url}/api/session`)).json()) as { token: string };
    const sent = await fetch(`${url}/api/agent/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: url },
      body: JSON.stringify({ note: "lattice-models/mott-transition", said: "check this against my note" }),
    });
    const { id } = (await sent.json()) as { id: string };
    const started = Date.now();
    while (!heard.events.some((e) => e.type === "agent-received" && e.data.id === id) && Date.now() - started < 10_000) await new Promise((r) => setTimeout(r, 100));
    heard.stop();
    expect(heard.events.find((e) => e.type === "agent-received")?.data).toEqual({ type: "agent-received", id, agent: "opencode" });
    const shown = await pane.waitFor("from you");
    expect(shown).toContain("lattice models / mott transition");
    expect(shown).toContain("“check this against my note”");
    keep("6-from-you");
    // It waits in the session, and goes to the model with the next message.
    pane.type("what did I just send you?");
    pane.keys("Enter");
    await pane.waitFor("You asked: what did I just send you?", 60_000);
    expect(JSON.stringify(gateway.requests.at(-1)?.messages)).toContain('their note \\"Mott transition\\" (/lattice-models/mott-transition.md)');
  }, 90_000);

  it("stops the server it started when OpenCode exits", async () => {
    expect(await serving(port)).toBe(true);
    pane.keys("C-c");
    await pane.waitFor(/\[exited \d+\]/, 30_000);
    expect(await serving(port)).toBe(false);
  }, 60_000);
});

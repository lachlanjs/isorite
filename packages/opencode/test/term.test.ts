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
import { lastAsked, startScripted, type Scripted } from "../src/scripted.ts";
import { hasTmux, Pane } from "./fixtures/tmux.ts";

const MAIN = fileURLToPath(new URL("../../server/src/main.ts", import.meta.url));

// What the scripted model looks up when asked to check against the notes: the base, a search, a section, and a
// note the first rests on, reached along its link.
const LOOKS = [
  { tool: "brief_base", args: {} },
  { tool: "search_notes", args: { query: "drift" } },
  { tool: "read_note", args: { id: "integrators/leapfrog", section: "Why it does not drift" } },
  { tool: "read_note", args: { id: "/integrators/symplectic-integrators.md" } },
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
  let root: string, base: { notes: string }, gateway: Scripted, pane: Pane, port: number;
  const keep = (name: string) => {
    const dir = process.env.ISORITE_PREVIEW;
    if (dir) { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, `${name}.ans`), pane.ansi()); }
  };

  beforeAll(async () => {
    root = mkdtempSync(join(tmpdir(), "isorite-term-"));
    base = await writeExample(join(root, "base"));
    mkdirSync(join(root, "code"));
    gateway = await startScripted((request) => {
      // Iso, asked in place from the note view: its requests carry no edit tool, as OpenCode's do.
      if (!request.tools.includes("edit")) return { text: "Most of the time is in the pairwise distances." };
      if (lastAsked(request).includes("profile the loop")) {
        const done = request.messages.slice(request.messages.findLastIndex((m) => m.role === "user")).filter((m) => m.role === "tool").length;
        const edits = [
          // OpenCode's own edit, on a note: made through isorite by the plugin, entered and marked as the agent's.
          { tool: "edit", args: { path: join(base.notes, "simulation", "the-main-loop.md"), oldString: "All the time is in `accelerations`.", newString: "All the time is in `accelerations`: profile it before changing anything else." } },
          { tool: "write_note", args: { note: "simulation/profiling.md", content: "---\ntype: Concept\ntitle: Profiling\n---\n\nTime each part of a step before making any of it faster.\n" } },
          // And a file of code, which is OpenCode's own business.
          { tool: "write", args: { path: "profile.py", content: "import cProfile\n" } },
        ];
        return edits[done] ?? { text: "Done: the note is changed, marked as mine, and profile.py is written." };
      }
      // Asked from the Iso pane (M11): a command, which OpenCode asks before running.
      if (lastAsked(request).includes("run the tests")) {
        if (request.messages.at(-1)?.role === "tool") return { text: "The tests pass." };
        return { tool: request.tools.find((t) => /^(shell|bash)$/.test(t)) ?? "shell", args: { command: "echo tests pass", description: "run the tests" } };
      }
      if (!lastAsked(request).includes("my notes")) return { text: `You asked: ${lastAsked(request)}. Leapfrog keeps the energy bounded.` };
      const looked = request.messages.slice(request.messages.findLastIndex((m) => m.role === "user")).filter((m) => m.role === "tool").length;
      return LOOKS[looked] ?? { text: "Your note on leapfrog says why `[1]`: its energy error stays bounded.\n\n```isorite\n[1] integrators/leapfrog § Why it does not drift\n```" };
    });
    port = await freePort();
    // Iso is pointed at the scripted gateway, and OpenCode reaches it through the isorite server's relay (M13),
    // which adds the key: OpenCode is given only the server's token.
    mkdirSync(join(root, "config", "isorite"), { recursive: true });
    writeFileSync(join(root, "config", "isorite", "config.toml"), `[provider]\nname = "scripted"\nurl = "${gateway.url}"\nkey = "iso-key"\n[tiers]\nlow = "scripted"\nmid = "scripted"\nmax = "scripted"\n`);
    // Commands ask first (your own local.json, kept over what isorite writes), so a page can answer one.
    mkdirSync(join(root, "config", "isorite", "opencode"), { recursive: true });
    writeFileSync(join(root, "config", "isorite", "opencode", "local.json"), JSON.stringify({ permissions: [{ action: "shell", resource: "*", effect: "ask" }] }));
    pane = new Pane([process.execPath, MAIN, "term", base.notes, "--port", String(port)], {
      cwd: join(root, "code"),
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? root,
        ISORITE_OPENCODE: opencode!.command,
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
    await pane.waitFor(`${basename(base.notes)} · ${count} notes`);
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
    await pane.waitFor(() => footer().includes("nbody-notes"));
    expect(footer()).not.toContain("atlas following");
    // A page of the browser: the server counts it, and the status line says the Atlas follows.
    const page = new AbortController();
    void fetch(`http://127.0.0.1:${port}/api/events`, { signal: page.signal }).then(async (r) => { for await (const _ of r.body!) { /* listening */ } }).catch(() => undefined);
    await pane.waitFor(() => footer().includes("◆ atlas following"));
    keep("2b-status");
    page.abort();
    await pane.waitFor(() => !footer().includes("atlas following"));
  }, 30_000);

  it("sends a prompt to the gateway through isorite's relay, which adds the key, and shows the reply", async () => {
    pane.type("why does my orbit drift?");
    pane.keys("Enter");
    await pane.waitFor("Leapfrog keeps the energy bounded.", 60_000);
    expect(gateway.requests.at(-1)?.authorization).toBe("Bearer iso-key");
    keep("3-session");
  }, 90_000);

  it("looks things up in the base with Iso's tools, and the server publishes each step for the Atlas", async () => {
    const heard = listen(port);
    await new Promise((r) => setTimeout(r, 300));
    pane.type("why does my orbit drift? check it against my notes");
    pane.keys("Enter");
    await pane.waitFor("its energy error stays bounded", 60_000);
    const text = pane.text();
    expect(text).toContain("brief_base");
    expect(text).toContain("search_notes [query=drift]");
    expect(text).toMatch(/read_note \[id=integrators\/leapfrog, section=Why it does not drift\]/);
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
    expect(steps[0]!.notes).toContain("integrators/leapfrog");
    expect(steps[1]).toMatchObject({ how: "keyword", opened: "integrators/leapfrog" });
    expect(steps[2]).toMatchObject({ how: "link", opened: "integrators/symplectic-integrators", from: "integrators/leapfrog" });
    // The sidebar has the notes in play: the one found, and the one reached along its link.
    const shown = await pane.waitFor("notes in play");
    // The answer's source is drawn as the board draws a citation, and the note it names is used.
    expect(shown).toContain("says why [1]: its");
    expect(shown).toContain("[1] leapfrog § why it does not drift");
    expect(await pane.waitFor(/leapfrog\s+◆ used/)).toBeTruthy();
    expect(shown).toMatch(/symplectic integrators\s+read/);
    // A long title wraps in the narrow sidebar; its state stays on its first line.
    expect(shown).toMatch(/energy and its\s+not opened/);
    keep("4-lookups");
  }, 90_000);

  it("shows one note's atlas beside the chat: what it requires, what builds on it; [a] the next note in play; esc closes it", async () => {
    pane.type("/atlas leapfrog");
    await new Promise((r) => setTimeout(r, 500));
    pane.keys("Enter");
    const shown = await pane.waitFor("atlas · leapfrog", 30_000);
    expect(shown).toContain("it requires");
    expect(shown).toContain("builds on it");
    expect(shown).toContain("the n-body");
    expect(shown).toContain("the main loop");
    expect(shown).toContain("choosing the");
    expect(shown).toMatch(/┏━+┓/);
    keep("4b-atlas");
    // Focused (leader, then →), its keys are its own: [a] steps to the next note in play, esc closes it.
    pane.keys("C-x", "Right");
    await new Promise((r) => setTimeout(r, 300));
    pane.keys("a");
    await pane.waitFor((t: string) => /atlas · (?!leapfrog)/.test(t));
    pane.keys("Escape");
    await pane.waitFor((t: string) => !t.includes("atlas · "));
  }, 60_000);

  it("changes notes at once, entered and marked as the agent's, and writes code as OpenCode does", async () => {
    const loop = join(base.notes, "simulation", "the-main-loop.md");
    pane.type("profile the loop, and note how to time it");
    pane.keys("Enter");
    // OpenCode asks before writing a file of code; a change to a note goes through isorite, and asks nothing.
    const asked = await pane.waitFor(/Done: the note is changed|Allow|allow/, 60_000);
    if (!asked.includes("Done:")) { pane.keys("Enter"); await pane.waitFor("Done: the note is changed", 60_000); }
    keep("5-changes");
    expect(readFileSync(loop, "utf8")).toContain("All the time is in `accelerations`: profile it before changing anything else.");
    expect(readFileSync(join(root, "code", "profile.py"), "utf8")).toBe("import cProfile\n");
    const journal = readJournal(readFileSync(join(base.notes, ".isorite", "journal", "simulation", "the-main-loop.jsonl"), "utf8"));
    expect(pending(journal)).toHaveLength(0);
    expect(journal.at(-1)).toMatchObject({ kind: "change", who: "agent:opencode", asked: "profile the loop, and note how to time it" });
    // The new note is made where it was meant.
    expect(readFileSync(join(base.notes, "simulation", "profiling.md"), "utf8")).toContain("Time each part of a step");
    // The agent was told where the notes are and how they change.
    const system = JSON.stringify(gateway.requests.at(-1)?.messages.filter((m) => m.role === "system"));
    expect(system).toContain(base.notes);
    expect(system).toContain("edit_note");
  }, 120_000);

  it("opens a note in the terminal: its gutter, its code, the agent's paragraph marked as its own; Iso asked in place waits to be kept", async () => {
    const loop = join(base.notes, "simulation", "the-main-loop.md");
    pane.type("/note main loop");
    await new Promise((r) => setTimeout(r, 500));
    pane.keys("Enter");
    const shown = await pane.waitFor("simulation / the main loop", 30_000);
    expect(shown).toContain("python");
    expect(shown).not.toContain("not kept yet");
    expect(shown).toContain("profile it before changing anything else.");
    keep("7-note");

    // [/] asks Iso here; its text waits as a change of its own, and [r] removes it.
    pane.keys("/");
    await pane.waitFor("Ask Iso here");
    pane.type("say where the time goes");
    pane.keys("Enter");
    const asked = await pane.waitFor("◆ Iso · not kept yet", 60_000);
    expect(asked).toContain("Most of the time is in the pairwise distances.");
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
    for (let waited = 0; !readFileSync(loop, "utf8").includes("pairwise distances. Mostly.") && waited < 10_000; waited += 100) await new Promise((r) => setTimeout(r, 100));
    expect(readFileSync(loop, "utf8")).toContain("Most of the time is in the pairwise distances. Mostly.");

    // [t] is the note's timeline; a moment chosen shows the note as it was, and q comes back to it as it is.
    pane.keys("t");
    const timeline = await pane.waitFor("The note's timeline");
    expect(timeline).toMatch(/OpenCode · “profile the loop/);
    pane.keys("Down", "Enter");
    await pane.waitFor("as it was");
    keep("9-timeline");
    pane.keys("q");
    await pane.waitFor((t: string) => !t.includes("as it was") && t.includes("simulation / the main loop"));
    // [s] sends the paragraph the cursor is on to the agent; it is in the session, under from you, once back there.
    pane.keys("s");
    await pane.waitFor("Send to the agent");
    pane.type("is this the loop you meant?");
    pane.keys("Enter");
    pane.keys("q");
    await pane.waitFor("profile the loop, and note how to time it", 10_000);
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
      body: JSON.stringify({ note: "physics/softening", said: "check this against my note" }),
    });
    const { id } = (await sent.json()) as { id: string };
    const started = Date.now();
    while (!heard.events.some((e) => e.type === "agent-received" && e.data.id === id) && Date.now() - started < 10_000) await new Promise((r) => setTimeout(r, 100));
    heard.stop();
    expect(heard.events.find((e) => e.type === "agent-received")?.data).toEqual({ type: "agent-received", id, agent: "opencode" });
    const shown = await pane.waitFor("from you");
    expect(shown).toContain("physics / softening");
    expect(shown).toContain("“check this against my note”");
    keep("6-from-you");
    // It waits in the session, and goes to the model with the next message.
    pane.type("what did I just send you?");
    pane.keys("Enter");
    await pane.waitFor("You asked: what did I just send you?", 60_000);
    expect(JSON.stringify(gateway.requests.at(-1)?.messages)).toContain('their note \\"Softening\\" (/physics/softening.md)');
  }, 90_000);

  it("shows the terminal's session in the Iso pane, and a page asks in it, gives it a note, and answers what it asks", async () => {
    const url = `http://127.0.0.1:${port}`;
    const { token } = (await (await fetch(`${url}/api/session`)).json()) as { token: string };
    const post = (path: string, body: unknown) => fetch(url + path, { method: "POST", headers: { "Content-Type": "application/json", "x-isorite-token": token, Origin: url }, body: JSON.stringify(body) });
    type View = { connected: boolean; busy: boolean; turns: { asked: string; from: string; state: string; items: { kind: string; text?: string; name?: string; title?: string; status?: string }[] }[]; asking: { id: string; action: string; resources: string[] }[] };
    const view = async () => (await (await fetch(`${url}/api/terminal`)).json()) as View;
    const until = async (test: (v: View) => boolean, ms = 30_000) => {
      const started = Date.now();
      for (;;) { const v = await view(); if (test(v)) return v; if (Date.now() - started > ms) throw new Error("the pane did not see it: " + JSON.stringify({ ...v, turns: v.turns.slice(-2) }).slice(0, 3000)); await new Promise((r) => setTimeout(r, 150)); }
    };
    // What was asked in the terminal is there, with its reply.
    const seen = await until((v) => v.turns.some((t) => t.asked.includes("what did I just send you?") && t.items.some((i) => i.text?.includes("You asked"))));
    expect(seen.connected).toBe(true);
    expect(seen.turns.find((t) => t.asked.includes("what did I just send you?"))?.from).toBe("terminal");
    // Asked from a page, with a note given: the terminal shows it, and the model is told which note.
    const heard = listen(port);
    expect((await post("/api/terminal/prompt", { asked: "hello from the pane", given: [{ kind: "note", id: "physics/softening" }] })).status).toBe(200);
    await pane.waitFor("You asked: hello from the pane", 30_000);
    expect(JSON.stringify(gateway.requests.at(-1)?.messages)).toContain("Softening (physics/softening)");
    const asked = await until((v) => v.turns.some((t) => t.asked.startsWith("hello from the pane") && t.state === "done" && t.items.some((i) => i.text?.includes("You asked"))));
    expect(asked.turns.find((t) => t.asked.startsWith("hello from the pane"))?.from).toBe("here");
    heard.stop();
    expect(heard.events.some((e) => e.type === "terminal")).toBe(true);
    // A command: OpenCode asks; the page answers once; it runs, and the pane shows the line with its output.
    await post("/api/terminal/prompt", { asked: "run the tests", given: [] });
    const asking = await until((v) => v.asking.length > 0);
    expect(asking.asking[0]).toMatchObject({ action: "shell", resources: ["echo tests pass"] });
    keep("7-asking-from-the-pane");
    expect((await post("/api/terminal/permission", { id: asking.asking[0]!.id, decision: "once" })).status).toBe(200);
    const ran = await until((v) => v.turns.some((t) => t.asked === "run the tests" && t.state === "done" && t.items.some((i) => i.text === "The tests pass.")));
    expect(ran.turns.find((t) => t.asked === "run the tests")?.items).toContainEqual(expect.objectContaining({ kind: "tool", name: "shell", title: "echo tests pass", status: "done", output: "tests pass\n" }));
    await pane.waitFor("The tests pass.", 10_000);
    // Only what it asks can be answered.
    expect((await post("/api/terminal/permission", { id: "per_none", decision: "once" })).status).toBe(409);
  }, 120_000);

  it("stops the server it started when OpenCode exits", async () => {
    expect(await serving(port)).toBe(true);
    pane.keys("C-c");
    await pane.waitFor(/\[exited \d+\]/, 30_000);
    expect(await serving(port)).toBe(false);
  }, 60_000);
});

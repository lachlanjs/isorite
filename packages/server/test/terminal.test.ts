// The terminal's session as the Iso pane draws it (M11): OpenCode's messages made turns, and what a page asks
// with what it gave.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { modelsFor } from "../src/term.ts";
import { given, titleOf, toTurns, type Message } from "../src/terminal.ts";

// As OpenCode 2.0.32 lists them, oldest first (spike/probe.ts).
const MESSAGES: Message[] = [
  { id: "u1", type: "user", text: "hello there" },
  { id: "a1", type: "assistant", content: [{ type: "text", text: "Plain reply" }] },
  { id: "i1", type: "idle", outcome: "succeeded" },
  { id: "u2", type: "user", text: "fix the step" },
  { id: "a2", type: "assistant", content: [
    { type: "tool", id: "c1", name: "read_note", state: { status: "completed", input: { id: "/integrators/leapfrog.md", section: "Why" }, content: [{ type: "text", text: "Leapfrog…" }] } },
    { type: "tool", id: "c2", name: "edit", state: { status: "completed", input: { path: "step.py", oldString: "x += v\n", newString: "x += v * dt\n" }, content: [{ type: "text", text: "Edited" }] } },
    { type: "tool", id: "c3", name: "shell", state: { status: "running", input: { command: "pytest -q" } } },
  ] },
];

describe("the terminal's turns", () => {
  it("makes a turn of each prompt, with its text, its tool calls and how it ended", () => {
    const turns = toTurns(MESSAGES, { busy: true, ours: new Set(["u2"]) });
    expect(turns.map((t) => [t.asked, t.from, t.state])).toEqual([["hello there", "terminal", "done"], ["fix the step", "here", "running"]]);
    expect(turns[0]!.items).toEqual([{ kind: "text", text: "Plain reply" }]);
    expect(turns[1]!.items).toEqual([
      { kind: "tool", id: "c1", name: "read_note", title: "/integrators/leapfrog.md § Why", status: "done", output: "Leapfrog…", note: "integrators/leapfrog" },
      { kind: "tool", id: "c2", name: "edit", title: "step.py", status: "done", output: "Edited", diff: ["-x += v", "+x += v * dt"] },
      { kind: "tool", id: "c3", name: "shell", title: "pytest -q", status: "running", output: "" },
    ]);
  });

  it("adds text still arriving, and calls a turn done once the session is idle", () => {
    const live = new Map([["a3", "Half a rep"]]);
    expect(toTurns(MESSAGES, { busy: true, live }).at(-1)!.items.at(-1)).toEqual({ kind: "text", text: "Half a rep" });
    expect(toTurns(MESSAGES, { busy: false }).at(-1)!.state).toBe("done");
    expect(toTurns([...MESSAGES, { id: "i2", type: "idle", outcome: "interrupted" }]).at(-1)!.state).toBe("stopped");
  });

  it("names what a call acted on", () => {
    expect(titleOf("shell", { command: "ls" })).toBe("ls");
    expect(titleOf("search_notes", { query: "drift" })).toBe("drift");
    expect(titleOf("write", { path: "a.py" })).toBe("a.py");
  });
});

describe("what a page asks", () => {
  it("names the notes given, for the agent to read, and quotes the passages", () => {
    const title = (id: string) => ({ "physics/softening": "Softening" })[id] ?? id;
    expect(given("why?", [{ kind: "note", id: "physics/softening" }, { kind: "passage", id: "physics/softening", text: "a\nb" }], title)).toBe(
      "why?\n\nFrom my knowledge base (read them with read_note, or outline_note first):\n- Softening (physics/softening)\n\nFrom Softening (physics/softening):\n> a\n> b",
    );
    expect(given(" just this ", [], title)).toBe("just this");
  });
});

describe("the terminal's models", () => {
  const home = (toml: string) => {
    const dir = mkdtempSync(join(tmpdir(), "isorite-models-"));
    mkdirSync(join(dir, "isorite"));
    writeFileSync(join(dir, "isorite", "config.toml"), toml);
    return { XDG_CONFIG_HOME: dir } as NodeJS.ProcessEnv;
  };

  const server = { url: "http://127.0.0.1:4767", token: "the-token" };

  it("are Iso's provider, reached through the isorite server's relay with its token, never the key", async () => {
    const { gateway, env, from } = await modelsFor(home(`[provider]\nname = "work"\nurl = "https://gateway.work/v1"\nkey = "sk-work"\n[tiers]\nlow = "small"\nmid = "middle"\nmax = "big"\n`), server);
    expect(gateway).toEqual({ url: "http://127.0.0.1:4767/api/gateway", models: ["middle", "big", "small"] });
    expect(env.ISORITE_GATEWAY_KEY).toBe("the-token");
    expect(from).toBe("config");
  });

  it("are the gateway named in the environment first, and OpenCode's own without a key or a certificate", async () => {
    const named = { ...home(`[provider]\nkey = "sk-or"\n`), ISORITE_GATEWAY_URL: "https://other/v1", ISORITE_GATEWAY_MODELS: "m" };
    expect(await modelsFor(named, server)).toMatchObject({ gateway: { url: "https://other/v1", models: ["m"] }, from: "environment" });
    expect(await modelsFor(home(`device = "abcd1234"\n`), server)).toMatchObject({ gateway: null, from: "opencode" });
  });
});

describe("a tool used in another base (M20)", () => {
  it("names the base, and its note is that base's", () => {
    const messages: Message[] = [
      { id: "u1", type: "user", text: "remember this" },
      { id: "a1", type: "assistant", content: [
        { type: "tool", id: "t1", name: "read_note", state: { status: "completed", input: { id: "memory:tools/opencode" } } },
        { type: "tool", id: "t2", name: "write_note", state: { status: "completed", input: { base: "memory", note: "you/likes", content: "x" } } },
        { type: "tool", id: "t3", name: "read_note", state: { status: "completed", input: { id: "basics/entropy" } } },
      ] },
    ];
    const [turn] = toTurns(messages);
    expect(turn!.items).toMatchObject([
      { kind: "tool", title: "memory: tools/opencode", note: "tools/opencode", base: "memory" },
      { kind: "tool", title: "memory: you/likes", note: "you/likes", base: "memory" },
      { kind: "tool", title: "basics/entropy", note: "basics/entropy" },
    ]);
    expect("base" in turn!.items[2]!).toBe(false);
  });
});

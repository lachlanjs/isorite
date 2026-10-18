import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOAL, PROMPTS, TOUR, type TourState } from "../plugin/tour.ts";
import { tutorialScript, UNSCRIPTED } from "../src/tutorial.ts";
import type { Request } from "../src/scripted.ts";

const state = (s: Partial<TourState> = {}): TourState => ({ page: "home", turns: 0, inPlay: 0, atlasOpen: false, note: "", waiting: -1, past: false, isoAnswers: 0, sent: 0, ...s });
const asked = (text: string, tools = ["edit", "brief_base"], after: Request["messages"] = []): Request =>
  ({ messages: [{ role: "system", content: "You are OpenCode." }, { role: "user", content: text }, ...after], tools, authorization: undefined });

describe("the terminal's tour", () => {
  it("is replayed on the tutorial's site as it now reads: record it again when its words change (npm run record:tour)", () => {
    const replay = JSON.parse(readFileSync(new URL("../../../app/src/lib/terminal/replay.json", import.meta.url), "utf8")) as { frames: { title: string; text: string }[] };
    expect(replay.frames.map((f) => [f.title, f.text])).toEqual(TOUR.map((s) => [s.title, s.text]));
  });

  it("moves on from a note's changes only once the note is read and has none left", () => {
    const keep = TOUR.find((s) => s.title === "Keep it, or not")!;
    expect(keep.until!(state({ page: "note", note: GOAL, waiting: -1 }), state())).toBe(false);
    expect(keep.until!(state({ page: "note", note: GOAL, waiting: 1 }), state())).toBe(false);
    expect(keep.until!(state({ page: "note", note: GOAL, waiting: 0 }), state())).toBe(true);
  });

  it("waits for a turn of the agent's that ends after the step began", () => {
    const ask = TOUR.find((s) => s.fill === PROMPTS.code)!;
    expect(ask.until!(state({ turns: 1, inPlay: 0 }), state())).toBe(false);
    expect(ask.until!(state({ turns: 1, inPlay: 2 }), state({ turns: 1 }))).toBe(false);
    expect(ask.until!(state({ turns: 2, inPlay: 2 }), state({ turns: 1 }))).toBe(true);
  });
});

describe("the tutorial's model", () => {
  const script = tutorialScript("/base/nbody-notes");
  const tool = (n: number) => Array.from({ length: n }, () => ({ role: "tool", content: "…" }));

  it("looks the notes up, step by step, writes the code, then answers citing them", () => {
    expect(script(asked(PROMPTS.code))).toEqual({ tool: "brief_base", args: {} });
    expect(script(asked(PROMPTS.code, undefined, tool(3)))).toMatchObject({ tool: "read_note", args: { section: "Why it does not drift" } });
    expect(script(asked(PROMPTS.code, undefined, tool(5)))).toMatchObject({ tool: "write", args: { path: "sim.py", content: expect.stringContaining("v += 0.5 * dt * a") } });
    expect(script(asked(PROMPTS.code, undefined, tool(6)))).toMatchObject({ text: expect.stringContaining("[1] integrators/leapfrog § Why it does not drift") });
  });

  it("writes Barnes–Hut, and notes where it is as OpenCode edits a file: on the base's own note", () => {
    expect(script(asked(PROMPTS.tree, undefined, tool(2)))).toMatchObject({ tool: "write", args: { path: "barnes_hut.py" } });
    expect(script(asked(PROMPTS.tree, undefined, tool(3)))).toMatchObject({ tool: "edit", args: { path: "/base/nbody-notes/simulation/two-galaxies-colliding.md" } });
  });

  it("answers Iso as the browser's tutorial does, with only the tools Iso was offered, at once and with what it cost", () => {
    const question = "# What they ask now\n\nhow is a body inserted, and what does each node keep?";
    expect(script(asked(question, ["search_notes", "read_note"]))).toMatchObject({ calls: [{ name: "search_notes" }, { name: "read_note" }], usage: { usd: expect.any(Number) } });
    const close = "# What they wrote for you\n\nClose encounters";
    expect(script(asked(close, ["read_note", "search_notes"]))).toMatchObject({ calls: [{ name: "read_note" }, { name: "read_note" }] });
  });

  it("names the session, answers Iso, and says what it is to anything else", () => {
    expect(script({ messages: [{ role: "system", content: "You are a title generator. You output ONLY a thread title." }, { role: "user", content: PROMPTS.code }], tools: [], authorization: undefined }))
      .toEqual({ text: "Two bodies, stepped with leapfrog" });
    expect(script(asked("say what changes in 3D", ["search_notes"]))).toMatchObject({ text: expect.stringContaining("octree") });
    expect(script(asked("what is a Green's function?"))).toEqual({ text: UNSCRIPTED });
  });
});

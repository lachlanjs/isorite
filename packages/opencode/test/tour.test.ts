import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOOP, PROMPTS, TOUR, type TourState } from "../plugin/tour.ts";
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
    expect(keep.until!(state({ page: "note", note: LOOP, waiting: -1 }), state())).toBe(false);
    expect(keep.until!(state({ page: "note", note: LOOP, waiting: 1 }), state())).toBe(false);
    expect(keep.until!(state({ page: "note", note: LOOP, waiting: 0 }), state())).toBe(true);
  });

  it("waits for a turn of the agent's that ends after the step began", () => {
    const ask = TOUR.find((s) => s.fill === PROMPTS.ask)!;
    expect(ask.until!(state({ turns: 1, inPlay: 0 }), state())).toBe(false);
    expect(ask.until!(state({ turns: 1, inPlay: 2 }), state({ turns: 1 }))).toBe(false);
    expect(ask.until!(state({ turns: 2, inPlay: 2 }), state({ turns: 1 }))).toBe(true);
  });
});

describe("the tutorial's model", () => {
  const script = tutorialScript("/base/dmft-notes");

  it("looks the notes up, step by step, then answers citing one", () => {
    const tool = (n: number) => Array.from({ length: n }, () => ({ role: "tool", content: "…" }));
    expect(script(asked(PROMPTS.ask))).toEqual({ tool: "brief_base", args: {} });
    expect(script(asked(PROMPTS.ask, undefined, tool(2)))).toMatchObject({ tool: "read_note", args: { section: "Mixing" } });
    expect(script(asked(PROMPTS.ask, undefined, tool(4)))).toMatchObject({ text: expect.stringContaining("[1] dmft/the-dmft-loop § Mixing") });
  });

  it("changes a note as OpenCode does, on the base's own file, then writes code", () => {
    expect(script(asked(PROMPTS.fix))).toMatchObject({ tool: "edit", args: { path: "/base/dmft-notes/dmft/the-dmft-loop.md" } });
    expect(script(asked(PROMPTS.fix, undefined, [{ role: "tool" }, { role: "tool" }]))).toMatchObject({ tool: "write", args: { path: "mixing.py" } });
  });

  it("names the session, answers Iso, and says what it is to anything else", () => {
    expect(script({ messages: [{ role: "system", content: "You are a title generator. You output ONLY a thread title." }, { role: "user", content: PROMPTS.ask }], tools: [], authorization: undefined }))
      .toEqual({ text: "Why the loop does not converge" });
    expect(script(asked("say why it swings", ["search_notes"]))).toMatchObject({ text: expect.stringContaining("Broyden") });
    expect(script(asked("what is a Green's function?"))).toEqual({ text: UNSCRIPTED });
  });
});

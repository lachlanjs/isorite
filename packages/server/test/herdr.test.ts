// The agent's status told to herdr (OSC 7501): only in a herdr terminal, in the protocol's grammar, and a word per change.

import { expect, test } from "vitest";
import type { TerminalTurn, TerminalView } from "@isorite/engine";
import { HerdrStatus, encode, inHerdr, oneLine, statusOf } from "../src/herdr.ts";
import type { PaneSessions } from "../src/sessions.ts";

// The report's grammar, from the protocol (revision 0.4): pairs of a lowercase key and a value from a small set, ST as
// ESC backslash.
const REPORT = /^\x1b\]7501;([a-z]+=[A-Za-z0-9_.,+/=-]*)(:[a-z]+=[A-Za-z0-9_.,+/=-]*)*\x1b\\$/;
const pairs = (bytes: string) => Object.fromEntries(bytes.slice(7, -2).split(":").map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]));
const msgOf = (bytes: string) => Buffer.from(pairs(bytes).msg ?? "", "base64").toString("utf8");

const turn = (asked: string, state: TerminalTurn["state"]): TerminalTurn => ({ id: asked, asked, from: "here", items: [], state });
const view = (more: Partial<TerminalView> = {}): TerminalView => ({ connected: true, agent: "pi", session: "s", title: "", busy: false, turns: [], asking: [], cost: 0, tokens: { input: 0, output: 0 }, model: "", ...more });

test("on only in a herdr terminal on a real terminal, and ISORITE_HERDR=0 turns it off", () => {
  expect(inHerdr({ HC_TERMINAL_ID: "t3" }, true)).toBe(true);
  expect(inHerdr({ HC_TERMINAL_ID: "t3" }, false)).toBe(false);
  expect(inHerdr({}, true)).toBe(false);
  expect(inHerdr({ TERM_PROGRAM: "ghostty" }, true)).toBe(false);
  expect(inHerdr({ HC_TERMINAL_ID: "" }, true)).toBe(false);
  expect(inHerdr({ HC_TERMINAL_ID: "t3", ISORITE_HERDR: "0" }, true)).toBe(false);
});

test("a report is in the protocol's grammar, with kind only when blocked and msg as base64 of one line", () => {
  const working = encode({ state: "working", msg: "Explain the\nproof\tof 3.2" });
  expect(working).toMatch(REPORT);
  expect(pairs(working)).toMatchObject({ state: "working", app: "isorite" });
  expect(msgOf(working)).toBe("Explain the proof of 3.2");
  const blocked = encode({ state: "blocked", kind: "permission", msg: "Approve: edit notes/a.md" });
  expect(blocked).toMatch(REPORT);
  expect(pairs(blocked)).toMatchObject({ state: "blocked", kind: "permission" });
  expect(pairs(encode({ state: "done", kind: "permission" })).kind).toBeUndefined();
  expect(encode({ state: "idle" })).toBe("\x1b]7501;state=idle:app=isorite\x1b\\");
  expect(encode({ state: "done", msg: "λ → ∞" })).toMatch(REPORT);
  expect(msgOf(encode({ state: "done", msg: "λ → ∞" }))).toBe("λ → ∞");
});

test("a message has no control characters and stays short", () => {
  expect(oneLine("a\u0000b\u007fc\u0085d\r\ne")).toBe("a b c d e");
  const long = oneLine("x".repeat(500));
  expect([...long].length).toBe(120);
  expect(long.endsWith("…")).toBe(true);
});

test("a turn is working, an approval is blocked, its end is done, a stop is idle and a failure is error", () => {
  expect(statusOf([view()], "")).toEqual({ state: "idle" });
  expect(statusOf([view()], "idle")).toBeNull();
  expect(statusOf([view({ busy: true, turns: [turn("What is a\nsheaf?", "running")] })], "idle")).toEqual({ state: "working", msg: "What is a" });
  expect(statusOf([view({ busy: true, turns: [turn("q", "running")], asking: [{ id: "p", action: "edit", resources: ["a.md"] }] })], "working")).toEqual({ state: "blocked", kind: "permission", msg: "Approve: edit a.md" });
  expect(statusOf([view({ turns: [turn("q", "done")] })], "working")).toEqual({ state: "done", msg: "Answered: q" });
  expect(statusOf([view({ turns: [turn("q", "stopped")] })], "blocked")).toEqual({ state: "idle" });
  expect(statusOf([view({ turns: [turn("q", "failed")] })], "working")?.state).toBe("error");
  expect(statusOf([view({ turns: [turn("q", "done")] })], "done")).toBeNull();
  // Two bases: one asking is enough to be blocked, one working enough to be working.
  expect(statusOf([view({ busy: true, turns: [turn("q", "running")] }), view({ asking: [{ id: "p", action: "run", resources: [] }] })], "working")?.state).toBe("blocked");
  expect(statusOf([view(), view({ busy: true, turns: [turn("r", "running")] })], "idle")?.state).toBe("working");
});

test("the reporter writes one report per change of word, following each base's pane", () => {
  const written: string[] = [];
  const listeners = new Set<(v: TerminalView) => void>();
  let now = view();
  const pane = { view: () => now, listen: (fn: (v: TerminalView) => void) => { listeners.add(fn); return () => listeners.delete(fn); } } as unknown as PaneSessions;
  const show = (v: TerminalView) => { now = v; for (const fn of listeners) fn(v); };
  const status = new HerdrStatus((b) => written.push(b));
  status.watch("notes", pane);
  show(view({ busy: true, turns: [turn("q", "running")] }));
  show(view({ busy: true, turns: [turn("q", "running")] })); // a token streamed: nothing new to say
  show(view({ busy: true, turns: [turn("q", "running")], asking: [{ id: "p", action: "edit", resources: ["a.md"] }] }));
  show(view({ busy: true, turns: [turn("q", "running")] }));
  show(view({ turns: [turn("q", "done")] }));
  show(view({ turns: [turn("q", "done")] }));
  expect(written.map((b) => pairs(b).state)).toEqual(["idle", "working", "blocked", "working", "done"]);
  for (const b of written) expect(b).toMatch(REPORT);
});

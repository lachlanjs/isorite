// Notes that move while a session goes on (pi/host.ts, pi/seen.ts): the line the agent's next message carries, the seen
// record following the note, read_note on an old path, today's date in the system prompt, and the compaction prompt.
// The pure parts, then the host on the scripted model.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { KEEP_WORDS, PiHost } from "../src/pi/host.ts";
import { scriptedModel } from "../src/pi/scripted.ts";
import { linkedIn, movesLine, Seen } from "../src/pi/seen.ts";
import { locate, openEngine } from "../src/serve.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-moves-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("the line", () => {
  test("nothing moved says nothing; a note, a folder of notes and a deletion are said in one line", () => {
    expect(movesLine([], [])).toBe("");
    expect(movesLine([["a", "b/a"]], [])).toBe("[Moved since your last turn: /a.md → /b/a.md.]");
    expect(movesLine([["streaming/keyed-state", "concepts/streaming/keyed-state"], ["streaming/windows", "concepts/streaming/windows"], ["x/old", "x/new"]], ["c"]))
      .toBe("[Moved since your last turn: /streaming/ → /concepts/streaming/ (2 notes), /x/old.md → /x/new.md; deleted: /c.md.]");
    expect(movesLine([], ["c", "d"])).toBe("[Deleted since your last turn: /c.md, /d.md.]");
  });

  test("a long list is cut, the rest counted", () => {
    const many = Array.from({ length: 11 }, (_, i): [string, string] => [`n${i}`, `m${i}`]);
    expect(movesLine(many, [])).toMatch(/\/n7\.md → \/m7\.md and 3 more\.\]$/);
  });

  test("the notes a text links to, by link or footnote", () => {
    expect(linkedIn("See [state](/streaming/keyed-state.md \"requires\") and [w](/streaming/windows.md#Late).\n\n[^1]: /a/b.md L3")).toEqual(["streaming/keyed-state", "streaming/windows", "a/b"]);
    expect(linkedIn("[web](https://x.org/a.md) [g](global:x)")).toEqual([]);
  });

  test("the seen record follows a move", () => {
    const seen = new Seen();
    seen.set("a", "A", 3);
    seen.rename("a", "b/a");
    expect(seen.get("a")).toBeUndefined();
    expect(seen.get("b/a")).toEqual({ text: "A", at: 3 });
  });
});

describe("the host", () => {
  async function setup() {
    const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
    const api = await openEngine(locate(base.notes), "testdev1", null);
    const { chosen, streamFn } = scriptedModel(undefined, { tokensPerSecond: 0 });
    const sent: { user: string; results: string[]; date: string | null; whole: string }[] = [];
    const watched = ((model: never, context: { messages: { role?: string; content?: unknown; sections?: Record<string, string> }[] }, options: never) => {
      const text = (m: { content?: unknown }) => (Array.isArray(m.content) ? (m.content as { text?: string }[]).map((b) => b.text ?? "").join("\n") : String(m.content ?? ""));
      const users = context.messages.filter((m) => m.role === "user"), last = context.messages.lastIndexOf(users.at(-1)!);
      const date = context.messages.filter((m) => m.role === "system" && m.sections?.date).at(-1)?.sections?.date ?? null;
      sent.push({ user: users.length ? text(users.at(-1)!) : "", results: context.messages.slice(last).filter((m) => m.role === "toolResult").map(text), date, whole: context.messages.map(text).join("\n") });
      return (streamFn as (...a: unknown[]) => unknown)(model, context, options);
    }) as never;
    const clock = { t: Date.parse("2026-11-12T22:00:00Z") };
    const host = new PiHost({ api, model: chosen!, streamFn: watched, clock: () => clock.t });
    const settled = (): Promise<TerminalView> => new Promise((done) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } }); });
    const ask = async (text: string) => { const done = settled(); await host.prompt(text); return done; };
    return { host, api, sent, ask, clock };
  }

  test("a folder moved by the person between turns is said once at the end of the next message, and a moved note it saw is still seen", async () => {
    const { api, sent, ask } = await setup();
    await ask("Read it. [^1]\nread physics/softening\nread physics/units\n\n[^1]: /physics/softening.md");
    await ask("Nothing moved.");
    expect(sent.at(-1)!.user).not.toContain("since your last turn");
    await api.moveFolder("physics", "mechanics/physics");
    await ask("Go on. [^1]\n\n[^1]: /mechanics/physics/softening.md");
    const said = sent.at(-1)!.user;
    expect(said.trimEnd().split("\n").at(-1)).toBe("[Moved since your last turn: /physics/ → /mechanics/physics/ (2 notes).]");
    // The note it had whole, moved and unchanged, is named, not sent again.
    expect(said).toContain("[^1]: /mechanics/physics/softening.md, unchanged since you last saw it");
    await ask("And now?");
    expect(sent.at(-1)!.user).not.toContain("since your last turn");
  });

  test("a note the agent linked in a reply, then deleted, is said deleted; read_note on a moved path finds the note", async () => {
    const { api, sent, ask } = await setup();
    await ask("Where is leapfrog?\nsay It is in [leapfrog](/integrators/leapfrog.md).");
    await api.moveNote("integrators/leapfrog", "methods/leapfrog", (await api.readNote("integrators/leapfrog")).version);
    await ask("Read it.\nread integrators/leapfrog");
    expect(sent.at(-2)!.user).toContain("[Moved since your last turn: /integrators/leapfrog.md → /methods/leapfrog.md.]");
    expect(sent.at(-1)!.results[0]).toMatch(/^\(\/integrators\/leapfrog\.md moved to \/methods\/leapfrog\.md\)\n/);
    await api.deleteNote("methods/leapfrog", (await api.readNote("methods/leapfrog")).version);
    await ask("And?");
    expect(sent.at(-1)!.user).toContain("[Deleted since your last turn: /methods/leapfrog.md.]");
  });

  test("today's date is in the system prompt, told again only when the day changes", async () => {
    const { sent, ask, clock } = await setup();
    await ask("Hello.");
    expect(sent.at(-1)!.date).toBe("Today is 2026-11-12.");
    const before = sent.at(-1)!.whole;
    await ask("Again.");
    // Nothing earlier in the request changed.
    expect(sent.at(-1)!.whole.startsWith(before)).toBe(true);
    clock.t += 4 * 3600_000;
    await ask("After midnight.");
    expect(sent.at(-1)!.date).toBe("Today is 2026-11-13.");
  });

  test("a summary is asked to keep the person's own words", async () => {
    const { sent, ask } = await setup();
    await ask("First question, about softening.");
    await ask("Second.");
    await ask("/compact");
    expect(sent.at(-1)!.whole).toContain(`Additional focus: ${KEEP_WORDS}`);
  });
});

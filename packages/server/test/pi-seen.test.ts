// What isorite's own agent has seen of each note (pi/seen.ts), and the pointers of a message rewritten against it: the
// pure parts, then the host on the scripted model, as the pane uses it, and the session bench against its baseline.

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vitest";
import { writeExample } from "@isorite/example/node";
import type { TerminalView } from "@isorite/engine";
import { PiHost } from "../src/pi/host.ts";
import { scriptedModel } from "../src/pi/scripted.ts";
import { diffText, footnotes, point, Seen } from "../src/pi/seen.ts";
import { locate, openEngine } from "../src/serve.ts";
import { BASELINE, regressions, runAll, VARIANTS, type Baseline } from "../../../bench/tokens/sessions.ts";

const root = mkdtempSync(join(tmpdir(), "isorite-pi-seen-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const NOTE = "---\ntype: Concept\ntitle: A\n---\n\none\ntwo\nthree\nfour\nfive\nsix\nseven\neight\n";
const files = (map: Record<string, string>) => async (id: string) => map[id] ?? null;

describe("the record", () => {
  test("compaction forgets what came before the cut and moves the rest up", () => {
    const seen = new Seen();
    seen.set("a", "A", 2);
    seen.set("b", "B", 9);
    seen.compacted(0, 5);
    expect(seen.get("a")).toBeUndefined();
    expect(seen.get("b")).toEqual({ text: "B", at: 5 });
    expect(new Seen(seen.toJSON()).get("b")).toEqual({ text: "B", at: 5 });
  });

  test("a diff names the lines that changed, as they were and are", () => {
    expect(diffText("a\nb\nc\n", "a\nb\nc\nd\ne\n")).toBe("    @@ -3,0 +4,2 @@\n    +d\n    +e");
    expect(diffText("a\nb\nc", "a\nB\nc")).toBe("    @@ -2 +2 @@\n    -b\n    +B");
    expect(diffText("a\nb", "a\nb")).toBe("");
  });

  test("the footnotes are read as the pane writes them", () => {
    const { body, notes } = footnotes("what is [^1] next to [^2]\n\n[^1]: /a.md\n\n[^2]: /a.md L2–3\n    > x\n    > y");
    expect(body).toBe("what is [^1] next to [^2]");
    expect(notes).toEqual([{ n: "1", place: "/a.md", body: "" }, { n: "2", place: "/a.md L2–3", body: "    > x\n    > y" }]);
    expect(footnotes("no pointers here").notes).toEqual([]);
  });
});

describe("a pointer's text", () => {
  test("a whole note not seen is sent whole; seen and unchanged, by name; changed, as what changed", async () => {
    const seen = new Seen();
    const first = await point("look [^1]\n\n[^1]: /a.md", { read: files({ a: NOTE }), seen });
    expect(first.text).toContain("[^1]: /a.md, the whole note as it is now (13 lines):\n    > ---\n    > type: Concept");
    expect(first.gives.get("a")).toBe(NOTE);
    seen.set("a", NOTE, 1);
    expect((await point("look [^1]\n\n[^1]: /a.md", { read: files({ a: NOTE }), seen })).text).toBe("look [^1]\n\n[^1]: /a.md, unchanged since you last saw it in this conversation (13 lines).");
    const grown = `${NOTE}nine\n`;
    const changed = await point("look [^1]\n\n[^1]: /a.md", { read: files({ a: grown }), seen });
    expect(changed.text).toBe("look [^1]\n\n[^1]: /a.md, changed since you last saw it in this conversation; what changed (14 lines now):\n    @@ -13,0 +14 @@\n    +nine");
    expect(changed.gives.get("a")).toBe(grown);
  });

  test("a note rewritten so much that the diff is longer is sent whole", async () => {
    const seen = new Seen();
    seen.set("a", NOTE, 1);
    const other = NOTE.replace(/^(one|two|three|four|five|six|seven|eight)$/gm, (w) => w.toUpperCase());
    expect((await point("[^1]\n\n[^1]: /a.md", { read: files({ a: other }), seen })).text).toContain("changed since you last saw it; the whole note as it is now (13 lines):");
  });

  test("a passage of a note not seen comes with the lines around it, and is not recorded as the note", async () => {
    const seen = new Seen();
    const r = await point("this [^1]\n\n[^1]: /a.md L9–10\n    > four\n    > five", { read: files({ a: NOTE }), seen });
    expect(r.text).toBe("this [^1]\n\n[^1]: /a.md L9–10\n    > four\n    > five\n    Before it (L6–8):\n    > one\n    > two\n    > three\n    After it (L11–13):\n    > six\n    > seven\n    > eight\n    (The note has 13 lines: read_note for the rest.)");
    expect(r.gives.size).toBe(0);
    // With none around it, as the pane wrote it.
    expect((await point("this [^1]\n\n[^1]: /a.md L9\n    > four", { read: files({ a: NOTE }), seen, around: 0 })).text).toBe("this [^1]\n\n[^1]: /a.md L9\n    > four");
  });

  test("a passage of a note seen says so, or brings what changed", async () => {
    const seen = new Seen();
    seen.set("a", NOTE, 1);
    expect((await point("[^1]\n\n[^1]: /a.md L9\n    > four", { read: files({ a: NOTE }), seen })).text).toBe("[^1]\n\n[^1]: /a.md L9\n    > four\n    (The note is unchanged since you last saw it in this conversation.)");
    const r = await point("[^1]\n\n[^1]: /a.md L9\n    > four", { read: files({ a: `${NOTE}nine\n` }), seen });
    expect(r.text).toContain("    The note, /a.md, changed since you last saw it in this conversation; what changed (14 lines now):\n    @@ -13,0 +14 @@\n    +nine");
  });

  test("code, folders, the agent's answers and notes not there stay as the pane wrote them", async () => {
    const text = "[^1] [^2] [^3] [^4]\n\n[^1]: src/a.py L3–4\n    > x\n\n[^2]: /physics/\n\n[^3]: the agent's earlier answer\n    > y\n\n[^4]: /gone.md";
    expect((await point(text, { read: files({}), seen: new Seen() })).text).toBe(text);
  });

  test("two pointers to one note in a message send it once", async () => {
    const r = await point("[^1] [^2]\n\n[^1]: /a.md\n\n[^2]: /a.md L9\n    > four", { read: files({ a: NOTE }), seen: new Seen() });
    expect(r.text.match(/whole note/g)).toHaveLength(1);
    expect(r.text).toContain("[^2]: /a.md L9\n    > four\n    (The note is unchanged since you last saw it in this conversation.)");
  });
});

describe("the host", () => {
  async function setup() {
    const base = await writeExample(join(root, `base-${Math.random().toString(36).slice(2)}`));
    const api = await openEngine(locate(base.notes), "testdev1", null);
    const { chosen, streamFn } = scriptedModel(undefined, { tokensPerSecond: 0 });
    // The person's message and the tool results of each request, as text.
    const sent: { user: string; results: string[] }[] = [];
    const watched = ((model: never, context: { messages: { role?: string; content?: unknown }[] }, options: never) => {
      const text = (m: { content?: unknown }) => (Array.isArray(m.content) ? (m.content as { text?: string }[]).map((b) => b.text ?? "").join("") : String(m.content ?? ""));
      const users = context.messages.filter((m) => m.role === "user"), last = context.messages.lastIndexOf(users.at(-1)!);
      sent.push({ user: users.length ? text(users.at(-1)!) : "", results: context.messages.slice(last).filter((m) => m.role === "toolResult").map(text) });
      return (streamFn as (...a: unknown[]) => unknown)(model, context, options);
    }) as never;
    const host = new PiHost({ api, model: chosen!, streamFn: watched });
    const settled = (): Promise<TerminalView> => new Promise((done) => { const off = host.listen((v) => { if (!v.busy && v.turns.at(-1)?.state !== "running") { off(); done(v); } }); });
    const ask = async (text: string) => { const done = settled(); await host.prompt(text); return done; };
    const append = async (id: string, line: string) => { const now = await api.readNote(id); await api.saveNote(id, { base: now.version, text: `${now.text}\n${line}\n` }); };
    return { host, api, sent, ask, append };
  }
  const id = "physics/softening";

  test("a note pointed at each turn is sent whole once, then by name or by what changed, and reading it again unchanged is a line", async () => {
    const { sent, ask, append, api } = await setup();
    const whole = (await api.readNote(id)).text;
    const v1 = await ask(`What is this? [^1]\nread ${id}\n\n[^1]: /${id}.md`);
    expect(v1.turns.at(-1)!.asked).toBe(`What is this? [^1]\nread ${id}\n\n[^1]: /${id}.md`);
    expect(sent[0]!.user).toContain(`[^1]: /${id}.md, the whole note as it is now`);
    expect(sent[0]!.user).toContain(`    > ${whole.split("\n")[1]}`);
    // The read in the same turn: the note is in the message already.
    expect(sent[1]!.results[0]).toMatch(new RegExp(`^/${id}.md is unchanged since you last saw it`));
    await ask(`And now? [^1]\n\n[^1]: /${id}.md`);
    expect(sent.at(-1)!.user).toContain(`[^1]: /${id}.md, unchanged since you last saw it in this conversation`);
    await append(id, "A line the person added.");
    await ask(`And now? [^1]\n\n[^1]: /${id}.md`);
    expect(sent.at(-1)!.user).toContain("changed since you last saw it in this conversation; what changed");
    expect(sent.at(-1)!.user).toContain("    +A line the person added.");
    expect(sent.at(-1)!.user).not.toContain(`    > ${whole.split("\n")[1]}`);
  });

  test("an edit by the agent of a note it had keeps the record in step", async () => {
    const { sent, ask, api } = await setup();
    await ask(`Read it. [^1]\n\n[^1]: /${id}.md`);
    const word = (await api.readNote(id)).text.split("\n").find((l) => l.length > 40)!.split(" ").slice(0, 3).join(" ");
    await ask(`Change it.\nedit ${id} ${word} => ${word} (edited)`);
    await ask(`Again. [^1]\n\n[^1]: /${id}.md`);
    expect(sent.at(-1)!.user).toContain("unchanged since you last saw it");
  });

  test("compaction forgets what it summarised: the note is sent whole again", async () => {
    const { sent, ask } = await setup();
    await ask(`Read it. [^1]\n\n[^1]: /${id}.md`);
    await ask("Something else.");
    await ask("/compact");
    await ask(`Again. [^1]\n\n[^1]: /${id}.md`);
    expect(sent.at(-1)!.user).toContain(`[^1]: /${id}.md, the whole note as it is now`);
  });
});

test("the session bench is within its baseline", async () => {
  const results = await runAll(VARIANTS.filter((v) => v.name === "after"));
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
  expect(regressions(results, baseline)).toEqual([]);
}, 60_000);

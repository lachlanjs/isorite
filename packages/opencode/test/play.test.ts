import { expect, test } from "vitest";
import { Play } from "../plugin/play.ts";

const TITLES: Record<string, string> = { loop: "The DMFT loop", sc: "Self-consistency condition", weiss: "Weiss field", mott: "Mott transition", qp: "Quasiparticle weight" };
const title = (id: string) => TITLES[id] ?? id;

test("found notes are roots, notes reached along links hang under what they were reached from, each with how far it got", () => {
  const play = new Play();
  play.add({ tool: "search_notes", how: "keyword", query: "converge", notes: ["loop", "mott"] });
  play.add({ tool: "find_similar", how: "meaning", query: "oscillates", notes: ["qp", "loop"], scores: { qp: 0.81, loop: 0.7 } });
  play.add({ tool: "read_note", how: "keyword", notes: ["loop"], opened: "loop" });
  play.add({ tool: "read_note", how: "link", notes: ["sc"], opened: "sc", from: "loop", rel: "requires" });
  play.add({ tool: "outline_note", how: "link", notes: ["weiss"], opened: "weiss", from: "sc", rel: "requires" });
  play.add({ tool: "read_note", how: "read", notes: [], opened: "nope", failed: true });
  play.cite(["loop", "sc", "not-in-play"]);
  expect(play.rows(title).map((r) => `${r.prefix}${r.label} | ${r.detail} | ${r.state}`)).toEqual([
    `├─ the dmft loop | keyword "converge" | used`,
    `│  └─ requires › self-consistency condition |  | used`,
    `│     └─ requires › weiss field |  | looked at`,
    `├─ mott transition | keyword "converge" | not opened`,
    `└─ quasiparticle weight | meaning 0.81 | not opened`,
  ]);
  expect(play.summary()).toEqual({ found: 3, followed: 2, used: 2 });
});

test("a note read after it was looked at is read; one looked at after it was read stays read", () => {
  const play = new Play();
  play.add({ tool: "outline_note", how: "read", notes: ["loop"], opened: "loop" });
  play.add({ tool: "read_note", how: "read", notes: ["loop"], opened: "loop" });
  play.add({ tool: "outline_note", how: "read", notes: ["loop"], opened: "loop" });
  expect(play.rows(title)).toMatchObject([{ id: "loop", state: "read", detail: "" }]);
});

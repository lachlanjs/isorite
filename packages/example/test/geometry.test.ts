import { expect, test } from "vitest";
import { authors, hashText, readJournal, replay, splitFrontmatter } from "@isorite/core";
import { buildGeometry, BONNET, COMPACT, GEOMETRY_PROBLEMS, ISO_QUESTIONS, READING, SOLVED, TRIANGLE } from "../src/index.ts";
import { loadGeometry } from "../src/node.ts";

const { notes: sources, code } = loadGeometry();
const NOW = Date.parse("2026-10-25T10:00:00Z");
const built = await buildGeometry(sources, code, NOW);

test("every source note reads, and comes out as written, bar the date you marked it solved", () => {
  for (const [path, text] of Object.entries(sources)) {
    const [meta] = splitFrontmatter(text);
    expect(meta, path).toMatchObject({ type: expect.stringMatching(/^(Concept|Question|Problem)$/), title: expect.any(String) });
    const got = built.notes[path]!, id = path.replace(/\.md$/, "");
    const solved = SOLVED.includes(id);
    expect(solved ? got.replace(/^solved: .*\n/m, "") : got, path).toBe(text);
    if (solved) expect(got, path).toMatch(/^solved: \d{4}-\d{2}-\d{2}$/m);
    expect(replay(readJournal(built.own[`journal/${id}.jsonl`] ?? ""))?.text, path).toBe(got);
  }
});

test("Iso made two questions, and left them open; the others are yours", () => {
  const made = Object.keys(built.notes).filter((p) => !(p in sources));
  expect(made).toHaveLength(2);
  const titles = made.map((p) => splitFrontmatter(built.notes[p]!)[0]?.title).sort();
  expect(titles).toEqual([ISO_QUESTIONS.disc.title, ISO_QUESTIONS.triangulation.title].sort());
  for (const p of made) {
    expect(splitFrontmatter(built.notes[p]!)[0]).toMatchObject({ type: "Question" });
    expect(readJournal(built.own[`journal/${p.replace(/\.md$/, "")}.jsonl`]!)[0]!).toMatchObject({ who: expect.stringContaining("iso") });
  }
});

test("Gauss–Bonnet's proof sketch is Iso's, untouched, and the examples are yours; the question inside it is embedded and open", () => {
  const head = replay(readJournal(built.own[`journal/${BONNET}.jsonl`]!))!;
  const who = authors(readJournal(built.own[`journal/${BONNET}.jsonl`]!))!, lines = head.text.split("\n");
  const sketch = lines.findIndex((l) => l === "## Proof sketch"), hypotheses = lines.findIndex((l) => l === "## Why each hypothesis");
  for (const [k, l] of lines.entries()) if (l.trim() && k > 4) expect(who[k]!.startsWith("iso"), l.slice(0, 40)).toBe(k >= sketch && k < hypotheses);
  expect(head.text).toContain("[[!where-is-compactness-used]]");
  expect(built.notes[`${COMPACT}.md`]).not.toMatch(/^resolved:/m);
});

test("Iso has read you on Gauss–Bonnet, and has not marked the triangle", () => {
  const u = built.own[`journal/@understanding/${BONNET}.jsonl`] ?? Object.entries(built.own).find(([p]) => p.includes("understanding"))?.[1];
  expect(u).toBeTruthy();
  expect(Object.values(built.own).join("\n")).toContain("You can state it and use it");
  expect(READING).toContain(TRIANGLE);
  expect(built.notes[`${TRIANGLE}.md`]).not.toMatch(/^solved:/m);
});

test("the problems are all there, and the code link in the base's repository resolves for one file and not the other", () => {
  for (const id of GEOMETRY_PROBLEMS) expect(built.notes[`${id}.md`], id).toMatch(/^type: Problem$/m);
  expect(Object.keys(built.code)).toEqual(["curvature.py"]);
  expect(built.own["settings.toml"]).toContain('repository = "../code"');
  expect(hashText(built.notes[`${BONNET}.md`]!)).toBe(replay(readJournal(built.own[`journal/${BONNET}.jsonl`]!))!.hash);
});

import { geometryAnswer, GEOMETRY_PROMPTS, REMARK, UNSCRIPTED } from "../src/index.ts";
const user = (content: string, tool = 0) => ({ model: "m", messages: [{ role: "user", content }, ...Array.from({ length: tool }, () => ({ role: "tool", content: "x" }))] });

test("the tutorial's Iso looks, asks back, and says so; joins your answers into a remark; anything else is answered plainly", () => {
  const ask = `# What they ask now\n\n${GEOMETRY_PROMPTS.back}`;
  expect(geometryAnswer(user(ask)).calls?.map((c) => c.name)).toEqual(["read_note", "read_note"]);
  expect(geometryAnswer(user(ask, 2)).calls?.map((c) => c.name)).toEqual(["ask_question"]);
  expect(geometryAnswer(user(ask, 3)).text).toContain("What does that sum need");
  const remark = `# What they ask now\n\n${GEOMETRY_PROMPTS.remark}`;
  expect(geometryAnswer(user(remark, 2)).calls?.[0]).toMatchObject({ name: "offer_text", arguments: { text: REMARK } });
  expect(geometryAnswer(user("# What they ask now\n\nwrite me a poem")).text).toBe(UNSCRIPTED);
});

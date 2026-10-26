// Open questions and problems (M12): their kind, what they are about, when they are done, and embeds.

import { expect, test } from "vitest";
import { Bundle, codeTarget, embedFor, embedRefs, idsOf, mapModel, outwardLinks, parseSettings, settingsText } from "../src/index.ts";

const file = (path: string, meta: string, body = "") => ({ path, text: `---\n${meta}\n---\n\n${body}\n` });
const base = Bundle.fromFiles([
  file("global/gauss-bonnet.md", "type: Concept\ntitle: Gauss–Bonnet theorem", "Total curvature is 2πχ.\n\n**Compact:**\n\n[[!where-is-compactness-used]]\n"),
  file("global/where-is-compactness-used.md", "type: Question\ntitle: Where is compactness used?\nabout: [global/euler]", "The proof never says."),
  file("global/euler.md", "type: Concept\ntitle: Euler characteristic"),
  file("global/angles.md", "type: Problem\ntitle: Angles of a geodesic triangle\nuses: [/global/gauss-bonnet.md]\nsolved: 2026-10-25"),
  file("surfaces/angles.md", "type: Concept\ntitle: Angles"),
  file("surfaces/second.md", "type: Concept\ntitle: Second", "[[!angles]]\n\n[[!nothing-here]]\n\n```\n[[!not-in-code]]\n```"),
]);

test("a note's kind is its type; what it is about, and when it was done", () => {
  const q = base.concepts.get("global/where-is-compactness-used")!, p = base.concepts.get("global/angles")!;
  expect([q.kind, p.kind, base.concepts.get("global/euler")!.kind]).toEqual(["question", "problem", "note"]);
  expect(q.done).toBeNull();
  expect(p.done).toBe("2026-10-25");
  expect(p.attached).toEqual(["global/gauss-bonnet"]);
});

test("an embed attaches the question to the note it is in, beside what its frontmatter names", () => {
  expect(base.concepts.get("global/gauss-bonnet")!.embeds).toEqual(["global/where-is-compactness-used"]);
  expect(base.concepts.get("global/where-is-compactness-used")!.attached).toEqual(["global/euler", "global/gauss-bonnet"]);
});

test("an embed by a shared name, or of nothing, is an issue; one in code is not an embed", () => {
  expect(embedRefs("[[!a]]\n```\n[[!b]]\n```\n  [[!c]]  \ntext [[!d]]")).toEqual(["a", "c"]);
  const issues = base.lint().filter((i) => i.code === "embed-broken").map((i) => i.message);
  expect(issues).toEqual(["two notes are named angles: embed one by its path", "no note to embed: nothing-here"]);
});

test("the embed that names a note: its file name, or its path where another shares it", () => {
  expect(embedFor("global/where-is-compactness-used", base.concepts.keys())).toBe("[[!where-is-compactness-used]]");
  expect(embedFor("global/angles", base.concepts.keys())).toBe("[[!global/angles]]");
  expect(idsOf("/a/b.md")).toEqual(["a/b"]);
});

test("on the map, a question or a problem says so, and is joined to what it is about", () => {
  const model = mapModel(base);
  const notes = (model.root.children.find((c) => c.ref === "global") as { children: { ref: string; of?: string }[] }).children;
  expect(notes.find((n) => n.ref === "global/where-is-compactness-used")).toMatchObject({ of: "question" });
  expect(notes.find((n) => n.ref === "global/angles")).toMatchObject({ of: "problem" });
  expect(notes.find((n) => n.ref === "global/euler")).not.toHaveProperty("of");
  expect(model.edges).toContainEqual(["global/where-is-compactness-used", "global/euler", 2]);
  expect(model.edges).toContainEqual(["global/where-is-compactness-used", "global/gauss-bonnet", 2]);
  expect(model.edges).toContainEqual(["global/angles", "global/gauss-bonnet", 2]);
});

test("links out of the base: to the web, and to code by its path and lines; a path leaving the repository is none", () => {
  const body = "See [the paper](https://arxiv.org/abs/1) and [`step`](code:src/sim.py#L40-L52), [it](code:src/sim.py#L40-L52) again, [up](code:../etc/passwd), <https://example.org> and [a note](/a/b.md).";
  expect(outwardLinks(body)).toEqual([
    { kind: "web", href: "https://arxiv.org/abs/1", text: "the paper" },
    { kind: "code", href: "code:src/sim.py#L40-L52", text: "step", path: "src/sim.py", line: 40, end: 52 },
    { kind: "web", href: "https://example.org", text: "https://example.org" },
  ]);
  expect(codeTarget("code:./README.md")).toEqual({ path: "README.md" });
  expect(parseSettings(settingsText({ repository: "../code" }))).toEqual({ repository: "../code" });
  expect(parseSettings("not = [toml")).toEqual({});
});

test("AGENTS.md at the top of a base is the base's instructions, a file, not a note; elsewhere it is a note", () => {
  const b = Bundle.fromFiles([
    { path: "AGENTS.md", text: "Write logarithms in base 2.\n" },
    { path: "basics/AGENTS.md", text: "---\ntype: Concept\ntitle: Agents\n---\n\nA note.\n" },
  ]);
  expect([...b.concepts.keys()]).toEqual(["basics/AGENTS"]);
  expect(b.files.has("AGENTS.md")).toBe(true);
  expect(b.issues.filter((i) => i.path === "AGENTS.md")).toEqual([]);
});

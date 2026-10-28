// A study base (format 1) moved into its notes' .isorite/, refused where a base is opened, and the check command.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { expect, test } from "vitest";
import { StudyError, splitFrontmatter } from "@isorite/core";
import { check } from "../src/main.ts";
import { exerciseAsProblem, migrate, uniteJournals } from "../src/migrate.ts";
import { locate } from "../src/serve.ts";

const line = (id: string, more = "") => `{"id":"${id}","at":"2026-10-12T09:00:00Z","who":"you","kind":"change"${more}}`;

function base(): string {
  const dir = mkdtempSync(join(tmpdir(), "isorite-")), repo = join(dir, "info-theory");
  mkdirSync(join(repo, "basics"), { recursive: true });
  writeFileSync(join(repo, "basics/entropy.md"), "---\ntype: Concept\ntitle: Entropy\n---\n\nAverage surprise.\n");
  writeFileSync(join(repo, "basics/bit.md"), "---\ntype: Concept\n---\n\nSee [entropy](/basics/entropy.md \"requires\") and [nothing](/basics/missing.md).\n");
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo, stdio: "ignore" });
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-q", "-m", "notes");
  return repo;
}

/** A study base beside `repo`, as format 1 made them, with a journal, a conversation, an exercise and a record. */
function studyBase(repo: string): string {
  const study = repo + "-study";
  const files: Record<string, string> = {
    "isorite.toml": 'format = 1\n\n[base]\npath = "../info-theory"\nremote = ""\nroot = ""\n',
    ".gitattributes": "*.jsonl merge=union\n",
    "journal/basics/entropy.jsonl": line("01K7A0000000000000000000A1") + "\n",
    "journal/@study/basics/a-fair-coin.jsonl": line("01K7A0000000000000000000B1") + "\n",
    "conversations/01k7c.jsonl": '{"kind":"item","turn":"t1"}\n',
    "understanding/basics/entropy.md": "---\ntype: Understanding\n---\n\nIso's reading.\n",
    "study/basics/a-fair-coin.md": "---\ntype: Exercise\nkind: written\ntitle: A fair coin\ntests: [basics/entropy]\nnext: basics/a-die\n---\n\nShow that a fair coin has one bit.\n\n## Working\n\nH = 1/2 + 1/2 = 1.\n",
    "record/laptop1.jsonl": '{"id":"r1"}\n{"id":"r2"}\n',
  };
  for (const [path, text] of Object.entries(files)) { mkdirSync(dirname(join(study, path)), { recursive: true }); writeFileSync(join(study, path), text); }
  return study;
}

test("a study base is moved into its notes' .isorite/, its exercises becoming problem notes", () => {
  const repo = base(), study = studyBase(repo), own = join(repo, ".isorite");
  const done = migrate(study);
  expect(done.notes).toBe(repo);
  expect(done.problems).toEqual([{ from: "study/basics/a-fair-coin.md", to: "basics/a-fair-coin.md" }]);
  expect(done.dropped).toBe(2);
  expect(readFileSync(join(own, "journal/basics/entropy.jsonl"), "utf8")).toContain("01K7A0000000000000000000A1");
  // The exercise's journal follows it to the problem's own.
  expect(readFileSync(join(own, "journal/basics/a-fair-coin.jsonl"), "utf8")).toContain("01K7A0000000000000000000B1");
  expect(existsSync(join(own, "journal/@study"))).toBe(false);
  for (const p of ["conversations/01k7c.jsonl", "understanding/basics/entropy.md", ".gitattributes"]) expect(existsSync(join(own, p))).toBe(true);
  expect(existsSync(join(own, "record"))).toBe(false);
  const [meta, body] = splitFrontmatter(readFileSync(join(repo, "basics/a-fair-coin.md"), "utf8"));
  expect(meta).toEqual({ type: "Problem", title: "A fair coin", uses: ["basics/entropy"] });
  expect(body).toContain("Show that a fair coin has one bit.");
  expect(body).toContain("## Solution\n\nH = 1/2 + 1/2 = 1.");
  // The study base is only read.
  expect(existsSync(join(study, "study/basics/a-fair-coin.md"))).toBe(true);
});

test("a second move stops unless told to merge, and then unites the journals by id", () => {
  const repo = base(), study = studyBase(repo);
  migrate(study);
  expect(() => migrate(study)).toThrow(/--merge/);
  writeFileSync(join(study, "journal/basics/entropy.jsonl"), line("01K7A0000000000000000000A1") + "\n" + line("01K7A0000000000000000000A2") + "\n");
  const done = migrate(study, { merge: true });
  const lines = readFileSync(join(repo, ".isorite/journal/basics/entropy.jsonl"), "utf8").trim().split("\n");
  expect(lines.map((l) => JSON.parse(l).id)).toEqual(["01K7A0000000000000000000A1", "01K7A0000000000000000000A2"]);
  expect(done.kept).toContain("understanding/basics/entropy.md");
  // A problem whose place is taken by the first move's is written beside it.
  expect(done.problems[0]!.to).toBe("basics/a-fair-coin-problem.md");
});

test("journals united: each entry once, in the order of their ids", () => {
  expect(uniteJournals(line("B") + "\n" + line("A") + "\n", line("A") + "\n" + line("C") + "\n").trim().split("\n").map((l) => JSON.parse(l).id)).toEqual(["A", "B", "C"]);
});

test("an exercise with no working is a problem with no solution yet", () => {
  expect(exerciseAsProblem("---\ntype: Exercise\ntitle: T\n---\n\nShow it.\n")).toBe("---\ntype: Problem\ntitle: T\n---\n\nShow it.\n");
});

test("a study base is refused where a base is opened, with how to move it in", () => {
  const repo = base(), study = studyBase(repo);
  expect(() => locate(study)).toThrow(new StudyError(`${study} is a study base, which this isorite no longer reads (format 1). Move it into its notes with: isorite migrate ${study}`));
  expect(() => locate(repo)).toThrow(/isorite migrate/);
  migrate(study);
  expect(locate(repo)).toEqual({ notes: repo });
});

test("check reports what is wrong and counts the notes", () => {
  const lines: string[] = [];
  const code = check(base(), (l) => lines.push(l));
  expect(lines.at(-1)).toMatch(/^2 notes in 2 folders/);
  expect(lines.join("\n")).toMatch(/bit\.md/);
  expect([0, 1]).toContain(code);
});

test("check checks each artifact on the kit by write_artifact's rules, with its data beside it (M23); an HTML file of its own is left be", () => {
  const repo = base(), lines: string[] = [];
  writeFileSync(join(repo, "basics/runs.csv"), "t,e\n0,1\n");
  writeFileSync(join(repo, "basics/fig.html"), '<title>Fig</title><meta name="description" content="d"><meta name="isorite:kit" content="1"><meta name="isorite:uses" content="runs.csv"><iso-chart data="runs.csv" x="t" y="energy"></iso-chart><style>p{color:#fff}</style>');
  writeFileSync(join(repo, "basics/old.html"), "<p style='color:#fff'>a report of its own</p>");
  const code = check(repo, (l) => lines.push(l));
  expect(lines.filter((l) => l.includes(".html"))).toEqual([
    'error   basics/fig.html: <iso-chart data="runs.csv" y="energy">: runs.csv has no column "energy" (it has t, e)',
    "error   basics/fig.html: a colour of its own (#fff): use the theme's, var(--lattice) in CSS or iso.tokens().lattice in script",
  ]);
  expect(code).toBe(1);
});

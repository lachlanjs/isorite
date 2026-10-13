// Making a study base on disk, and the check command.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { StudyError } from "@isorite/core";
import { check } from "../src/main.ts";
import { initStudyBase, openStudyBase } from "../src/studybase.ts";

function base(): string {
  const dir = mkdtempSync(join(tmpdir(), "isorite-")), repo = join(dir, "info-theory");
  mkdirSync(join(repo, "basics"), { recursive: true });
  writeFileSync(join(repo, "basics/entropy.md"), "---\ntype: Concept\ntitle: Entropy\n---\n\nAverage surprise.\n");
  writeFileSync(join(repo, "basics/bit.md"), "---\ntype: Concept\n---\n\nSee [entropy](/basics/entropy.md \"requires\") and [nothing](/basics/missing.md).\n");
  const git = (...a: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...a], { cwd: repo, stdio: "ignore" });
  git("init", "-q", "-b", "main"); git("add", "-A"); git("commit", "-q", "-m", "notes");
  return repo;
}

test("a study base is made beside the knowledge base and names it", () => {
  const repo = base(), made = initStudyBase(repo);
  expect(made.path).toBe(repo + "-study");
  expect(made.config.base).toMatchObject({ path: "../info-theory", remote: "" });
  expect(made.config.base.root).toMatch(/^[0-9a-f]{40}$/);
  expect(readFileSync(join(made.path, ".gitattributes"), "utf8")).toBe("*.jsonl merge=union\n");
  for (const d of ["journal", "record", "study", ".git"]) expect(existsSync(join(made.path, d))).toBe(true);
  expect(openStudyBase(made.path)).toEqual({ config: made.config, notes: repo });
});

test("it is never made inside the knowledge base, nor over existing files", () => {
  const repo = base();
  expect(() => initStudyBase(repo, join(repo, "study"))).toThrow(StudyError);
  initStudyBase(repo);
  expect(() => initStudyBase(repo)).toThrow(/already has files/);
  expect(() => openStudyBase(repo)).toThrow(/not a study base/);
});

test("check reports what is wrong and counts the notes", () => {
  const lines: string[] = [];
  const code = check(base(), (l) => lines.push(l));
  expect(lines.at(-1)).toMatch(/^2 notes in 2 folders/);
  expect(lines.join("\n")).toMatch(/bit\.md/);
  expect([0, 1]).toContain(code);
});

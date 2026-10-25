// isorite migrate: a study base (format 1, a repository beside the notes) moved into the notes' own .isorite/
// (format 2). The study base itself is only read: it is left as it was, to be removed by its owner once they are
// satisfied.
//
//   journal/, conversations/, understanding/, drafts/   copied into .isorite/
//   study/<folder>/<name>.md                             each exercise becomes a problem note at <folder>/<name>.md
//                                                        in the notes (type: Problem; tests become uses; the
//                                                        working becomes the solution), and its journal moves
//                                                        from journal/@study/… to the note's own
//   record/                                              not carried over: there is no record in format 2
//
// With journals already in .isorite/, it stops unless told to merge: then a journal's lines are united by id, as
// two devices' are, and any other file already there is kept.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { GITATTRIBUTES, OWN_DIR, STUDY_DIR, StudyError, dumpFrontmatter, splitFrontmatter, type Meta } from "@isorite/core";
import { openStudyBase } from "./studybase.ts";

export interface Migrated {
  notes: string;
  /** Files written into .isorite/, by path within it. */
  copied: string[];
  /** Exercises written as problem notes: where each was in the study base, and where it is now among the notes. */
  problems: { from: string; to: string }[];
  /** Files already in .isorite/ that were kept as they were (merge only). */
  kept: string[];
  /** Lines of the study record not carried over. */
  dropped: number;
}

const CARRIED = ["journal", "conversations", "understanding", "drafts"];
/** Where an exercise's working began (format 1). */
const WORKING = "## Working";

/** Every file under `dir`, by path relative to it with "/" between parts; hidden ones left out. */
function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const visit = (at: string) => {
    for (const name of readdirSync(at)) {
      if (name.startsWith(".")) continue;
      const path = join(at, name);
      if (statSync(path).isDirectory()) visit(path);
      else out.push(relative(dir, path).split(sep).join("/"));
    }
  };
  visit(dir);
  return out.sort();
}

function put(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A journal's lines and another's, as one: each entry once, by id, in the order of their ids (ULIDs sort by time). */
export function uniteJournals(a: string, b: string): string {
  const byId = new Map<string, string>();
  for (const line of (a + "\n" + b).split("\n")) {
    if (!line.trim()) continue;
    let id: string;
    try { id = String((JSON.parse(line) as { id?: unknown }).id ?? line); } catch { id = line; }
    if (!byId.has(id)) byId.set(id, line);
  }
  return [...byId].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).map(([, line]) => line + "\n").join("");
}

/** An exercise's text as a problem note's: the same title, `uses` for `tests`, the question as the statement and the
 *  working as the solution. */
export function exerciseAsProblem(text: string): string {
  const [meta, body] = splitFrontmatter(text);
  const m: Meta = { ...(meta ?? {}) };
  const out: Meta = { type: "Problem" };
  if (m.title !== undefined) out.title = m.title;
  if (Array.isArray(m.tests) && m.tests.length) out.uses = m.tests;
  if (m.generated !== undefined) out.generated = m.generated;
  const cut = body.indexOf(WORKING);
  const statement = (cut < 0 ? body : body.slice(0, cut)).trim();
  const working = cut < 0 ? "" : body.slice(cut + WORKING.length).trim();
  return `---\n${dumpFrontmatter(out)}---\n\n${statement}\n${working ? `\n## Solution\n\n${working}\n` : ""}`;
}

export function migrate(studyPath: string, { merge = false } = {}): Migrated {
  const { notes } = openStudyBase(studyPath);
  if (!existsSync(notes)) throw new StudyError(`this study base studies ${notes}, which is not there`);
  const own = join(notes, OWN_DIR);
  if (!merge && files(join(own, "journal")).length) throw new StudyError(`${own} already has journals: run again with --merge to unite them`);
  const out: Migrated = { notes, copied: [], problems: [], kept: [], dropped: 0 };
  // Exercises first, so their journals can follow them.
  const moved = new Map<string, string>(); // @study/<id> to the problem's note id
  for (const path of files(join(studyPath, STUDY_DIR)).filter((p) => p.endsWith(".md"))) {
    const id = path.slice(0, -3);
    let to = id;
    for (let k = 2; existsSync(join(notes, `${to}.md`)); k++) to = `${id}-problem${k === 2 ? "" : `-${k}`}`;
    put(join(notes, `${to}.md`), exerciseAsProblem(readFileSync(join(studyPath, STUDY_DIR, path), "utf8")));
    moved.set(`@study/${id}`, to);
    out.problems.push({ from: `${STUDY_DIR}/${path}`, to: `${to}.md` });
  }
  for (const dir of CARRIED) {
    for (const path of files(join(studyPath, dir))) {
      let target = `${dir}/${path}`;
      if (dir === "journal") {
        const id = path.replace(/\.jsonl$/, "");
        if (moved.has(id)) target = `journal/${moved.get(id)}.jsonl`;
      }
      const from = readFileSync(join(studyPath, dir, path), "utf8"), at = join(own, target);
      if (existsSync(at)) {
        if (dir === "journal") put(at, uniteJournals(readFileSync(at, "utf8"), from));
        else { out.kept.push(target); continue; }
      } else put(at, from);
      out.copied.push(target);
    }
  }
  if (!existsSync(join(own, ".gitattributes"))) put(join(own, ".gitattributes"), GITATTRIBUTES);
  for (const path of files(join(studyPath, "record"))) out.dropped += readFileSync(join(studyPath, "record", path), "utf8").split("\n").filter((l) => l.trim()).length;
  return out;
}

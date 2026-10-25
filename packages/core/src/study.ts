// The study base: a repository of one person's own, beside the knowledge base
// it studies. It holds what is personal (the journal of every note, the record
// of what was practised, the exercises) so the knowledge base stays the same
// for everyone and can be exported without any of it.
//
//   isorite.toml                    which knowledge base this studies
//   .gitattributes                  *.jsonl merge=union, so two devices' lines merge
//   journal/<note id>.jsonl         one journal per note (journal.ts)
//   record/<device>.jsonl           the study record, one file per device (record.ts)
//   study/<folder>/<name>.md        study notes (exercises), as an OKF bundle of its own
//
// A study folder is the folder in study/ with the same path as a folder of the
// knowledge base. Nothing else pairs them.

import { parse, stringify } from "smol-toml";
import type { Bundle } from "./bundle.ts";
import { STRENGTH } from "./graph.ts";
import { dirname, text } from "./text.ts";
export { GITATTRIBUTES } from "./own.ts";

export const STUDY_FORMAT = 1;
export const CONFIG_FILE = "isorite.toml";
export const STUDY_DIR = "study";

export class StudyError extends Error {}

export interface StudyConfig {
  format: number;
  base: {
    /** The folder of notes, from the study base's folder. */
    path: string;
    /** Where the knowledge base is cloned from, for a device that does not have it yet. */
    remote: string;
    /** The knowledge base's root commit: the same in every clone, so it names the base. */
    root: string;
  };
}

export function parseStudyConfig(source: string): StudyConfig {
  let raw: Record<string, unknown>;
  try { raw = parse(source) as Record<string, unknown>; } catch (e) { throw new StudyError(`${CONFIG_FILE} is not valid TOML: ${(e as Error).message}`); }
  const base = (raw.base ?? {}) as Record<string, unknown>;
  const format = raw.format === undefined ? STUDY_FORMAT : Number(raw.format);
  if (format !== STUDY_FORMAT) throw new StudyError(`${CONFIG_FILE} is format ${text(raw.format)}; this isorite reads format ${STUDY_FORMAT}`);
  if (typeof base.path !== "string" || !base.path) throw new StudyError(`${CONFIG_FILE} needs [base] path, the knowledge base's folder`);
  return { format, base: { path: base.path, remote: text(base.remote ?? ""), root: text(base.root ?? "") } };
}

export function dumpStudyConfig(config: StudyConfig): string {
  return "# The knowledge base this study base studies. Written by `isorite study init`.\n" + stringify(config) + "\n";
}

const SAFE = /^[^\0]+$/;
function checkId(id: string): string {
  if (!SAFE.test(id) || id.startsWith("/") || id.split("/").some((part) => part === ".." || part === "." || !part)) throw new StudyError(`not a note's id: ${JSON.stringify(id)}`);
  return id;
}

/** Where a note's journal is, in the study base. Notes of the study base itself are journalled under their `@study/` id. */
export const journalPath = (noteId: string): string => `journal/${checkId(noteId)}.jsonl`;
export const recordPath = (device: string): string => `record/${checkId(device)}.jsonl`;

// ------------------------------------------------------------ the two bases as one map

/** The prefix of a study note's or study folder's id wherever the two bases are spoken of together. */
export const STUDY_PREFIX = "@study/";
export const isStudyId = (id: string): boolean => id.startsWith(STUDY_PREFIX) || id === "@study";
export const studyId = (idInStudyBundle: string): string => STUDY_PREFIX + idInStudyBundle;

/** The notes of the knowledge base a study note tests: its `tests` frontmatter, as note ids. */
export function testsOf(meta: Record<string, unknown>): string[] {
  const raw = meta.tests;
  const list = typeof raw === "string" ? [raw] : Array.isArray(raw) ? raw : [];
  return list.map((t) => text(t).replace(/^\//, "").replace(/\.md$/, "")).filter(Boolean);
}

export interface MapNote { kind: "concept"; id: string; ref: string; weight: number; rank: number; study?: true }
export interface MapDir { kind: "dir"; id: string; ref: string; children: (MapDir | MapNote)[]; study?: true }
export interface MapModel { root: MapDir; edges: [from: string, to: string, strength: number][] }

/** The Atlas's model of a knowledge base and, with it, its study base: every study folder is an ordinary folder,
 *  flagged, standing beside the folder it studies (the root's stands inside the root), and each study note is
 *  joined to the notes it tests. `study` is the bundle read from the study base's study/ folder. */
export function mapModel(base: Bundle, study: Bundle | null = null): MapModel {
  const order = base.prerequisiteOrder();
  const note = (id: string): MapNote => ({ kind: "concept", id: "c:" + id, ref: id, weight: 1, rank: order.get(id)?.depth ?? 0 });
  const edges: MapModel["edges"] = [];
  for (const c of base.concepts.values()) {
    const strongest = new Map<string, number>();
    for (const l of c.links) {
      if (l.broken || l.kind !== "concept" || l.target === c.id || !base.concepts.has(l.target)) continue;
      strongest.set(l.target, Math.max(strongest.get(l.target) ?? 0, (l.rel && STRENGTH[l.rel]) || STRENGTH.uses));
    }
    for (const [to, s] of strongest) edges.push([c.id, to, s]);
  }

  // Study notes by the folder they study; a folder the knowledge base no longer has falls back to the nearest one above.
  const byFolder = new Map<string, MapNote[]>();
  if (study) for (const s of [...study.concepts.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    let folder = dirname(s.id);
    while (folder && !base.directories.has(folder)) folder = dirname(folder);
    const ref = studyId(s.id);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), { kind: "concept", id: "s:" + s.id, ref, weight: 1, rank: 0, study: true }]);
    for (const t of testsOf(s.meta)) if (base.concepts.has(t)) edges.push([ref, t, STRENGTH.uses]);
  }
  const studyDir = (folder: string): MapDir[] => {
    const notes = byFolder.get(folder);
    return notes ? [{ kind: "dir", id: "sd:" + folder, ref: folder ? studyId(folder) : "@study", children: notes, study: true }] : [];
  };
  const dir = (id: string): MapDir => {
    const d = base.directories.get(id)!;
    const children: (MapDir | MapNote)[] = [];
    for (const child of [...d.children].sort()) children.push(dir(child), ...studyDir(child));
    children.push(...[...d.concepts].sort().map(note));
    if (id === "") children.push(...studyDir(""));
    return { kind: "dir", id: "d:" + id, ref: id, children };
  };
  return { root: dir(""), edges };
}

/** The map without the study base: its folders and notes, and the edges to them, left out. The Atlas draws study
 *  folders only in its Understand lens (M10). */
export function withoutStudy(model: MapModel): MapModel {
  const strip = (d: MapDir): MapDir => ({ ...d, children: d.children.filter((c) => !c.study).map((c) => (c.kind === "dir" ? strip(c) : c)) });
  return { root: strip(model.root), edges: model.edges.filter(([a, b]) => !a.startsWith("@") && !b.startsWith("@")) };
}

// ------------------------------------------------------------ what a note rests on

/** One link of a note's reach: `from` requires `to`. */
export interface ReachLink {
  from: string; to: string; kind: "requires" | "builds" | "uses";
  /** A link down the chain that a longer way already makes: left out when the whole chain is drawn. */
  spare?: true;
}
export interface Reach {
  /** What the note requires, all the way back, nearest first. */
  requires: string[];
  /** How many steps back each of those is: 1 for what the note itself requires. */
  depth: Record<string, number>;
  /** The note each was first reached from, so the way back to the note can be walked. */
  via: Record<string, string>;
  /** What builds on it directly. */
  builds: string[];
  /** What it is joined to by a weaker link, either way, one step: by "uses", which the map draws, and by "see also", which it does not. */
  uses: string[];
  also: string[];
  /** The links between them: every one down the chain of what it requires, each from what builds on it, and its own "uses". */
  links: ReachLink[];
}

/** What lights when a note is chosen on the Atlas (refs, as the map model names notes). Where the base rates its
 *  links, only "requires" is followed back; where it rates none, every drawn link is. A study note requires what it tests. */
export function reach(model: Pick<MapModel, "edges">, note: string): Reach {
  const least = model.edges.some(([from, , s]) => s >= STRENGTH.requires && !isStudyId(from)) ? STRENGTH.requires : STRENGTH.uses;
  const needs = new Map<string, string[]>(), neededBy = new Map<string, string[]>();
  const uses = new Set<string>(), also = new Set<string>(), weak: ReachLink[] = [];
  for (const [from, to, s] of model.edges) {
    if (from === to) continue;
    if (s < least && !isStudyId(from)) {
      if (from !== note && to !== note) continue;
      (s >= STRENGTH.uses ? uses : also).add(from === note ? to : from);
      if (s >= STRENGTH.uses) weak.push({ from, to, kind: "uses" });
      continue;
    }
    needs.set(from, [...(needs.get(from) ?? []), to]);
    neededBy.set(to, [...(neededBy.get(to) ?? []), from]);
  }
  const depth: Record<string, number> = {}, via: Record<string, string> = {};
  const seen = new Set([note]), requires: string[] = [], links: ReachLink[] = [], todo = [note];
  for (let k = 0; k < todo.length; k++) {
    const from = todo[k]!;
    for (const to of needs.get(from) ?? []) {
      links.push({ from, to, kind: "requires" });
      if (seen.has(to)) continue;
      seen.add(to); requires.push(to); todo.push(to);
      depth[to] = (depth[from] ?? 0) + 1; via[to] = from;
    }
  }
  // A link is spare when the links kept so far join its ends a longer way.
  const kept = new Map<string, Set<string>>();
  for (const l of links) kept.set(l.from, (kept.get(l.from) ?? new Set()).add(l.to));
  for (const l of links) {
    const met = new Set<string>(), walk = [...kept.get(l.from)!].filter((t) => t !== l.to);
    let found = false;
    while (walk.length && !found) {
      const v = walk.pop()!;
      if (v === l.to) found = true;
      else if (v !== l.from && !met.has(v)) { met.add(v); walk.push(...(kept.get(v) ?? [])); }
    }
    if (found) { l.spare = true; kept.get(l.from)!.delete(l.to); }
  }
  const builds = [...new Set(neededBy.get(note) ?? [])];
  for (const from of builds) links.push({ from, to: note, kind: "builds" });
  const own = new Set([...requires, ...builds]);
  return { requires, depth, via, builds, uses: [...uses].filter((r) => !own.has(r)), also: [...also].filter((r) => !own.has(r) && !uses.has(r)), links: [...links, ...weak.filter((l) => !own.has(l.from === note ? l.to : l.from))] };
}

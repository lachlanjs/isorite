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

export const STUDY_FORMAT = 1;
export const CONFIG_FILE = "isorite.toml";
export const STUDY_DIR = "study";
export const GITATTRIBUTES = "*.jsonl merge=union\n";

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

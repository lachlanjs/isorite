// A study base (format 1): a repository beside the knowledge base, which isorite kept until milestone 12. It is
// read now only to be moved into the notes' .isorite/ (format 2) by `isorite migrate`, and to be refused where a
// base is opened.
//
//   isorite.toml                    which knowledge base it studies
//   journal/, conversations/, understanding/, drafts/   as in .isorite/ now (own.ts)
//   record/<device>.jsonl           the study record, one file per device
//   study/<folder>/<name>.md        exercises, which become problem notes

import { parse } from "smol-toml";
import { text } from "./text.ts";

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


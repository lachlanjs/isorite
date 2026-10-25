// The example on disk: its notes read from this package, and the base written into a folder, with isorite's own
// files in its .isorite/.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { OWN_DIR } from "@isorite/core";
import { buildExample, NAME, type Sources } from "./history.ts";
import { buildGeometry, GEOMETRY_NAME } from "./geometry.ts";

export const NOTES_DIR = join(import.meta.dirname, "..", "notes");

/** The example's notes as they stand today, by path. */
export function loadSources(dir = NOTES_DIR): Sources {
  const out: Sources = {};
  const visit = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (name.endsWith(".md")) out[relative(dir, path).split(sep).join("/")] = readFileSync(path, "utf8");
    }
  };
  visit(dir);
  return out;
}

/** Write the example's base into `folder`, which must be empty or not yet exist. Returns the notes' path. */
export async function writeExample(folder: string, now = Date.now()): Promise<{ notes: string }> {
  folder = resolve(folder);
  if (existsSync(folder) && readdirSync(folder).length) throw new Error(`${folder} already has files in it`);
  const built = await buildExample(loadSources(), now);
  const notes = join(folder, NAME);
  for (const [root, files] of [[notes, built.notes], [join(notes, OWN_DIR), built.own]] as const) {
    for (const [path, text] of Object.entries(files)) {
      const at = join(root, ...path.split("/"));
      mkdirSync(dirname(at), { recursive: true });
      writeFileSync(at, text);
    }
  }
  return { notes };
}

export const GEOMETRY_DIR = join(import.meta.dirname, "..", "geometry");

/** The geometry example's notes, and the code beside them, as they stand today, by path. */
export function loadGeometry(dir = GEOMETRY_DIR): { notes: Sources; code: Record<string, string> } {
  const read = (at: string, keep: (name: string) => boolean): Sources => {
    const out: Sources = {};
    const visit = (from: string) => {
      for (const name of readdirSync(from)) {
        const path = join(from, name);
        if (statSync(path).isDirectory()) visit(path);
        else if (keep(name)) out[relative(at, path).split(sep).join("/")] = readFileSync(path, "utf8");
      }
    };
    visit(at);
    return out;
  };
  return { notes: read(join(dir, "notes"), (n) => n.endsWith(".md")), code: read(join(dir, "code"), () => true) };
}

/** Write the geometry example into `folder`: its notes (with isorite's own files in their .isorite/), and the code
 *  beside them, where the base's `repository` points. */
export async function writeGeometry(folder: string, now = Date.now()): Promise<{ notes: string }> {
  folder = resolve(folder);
  if (existsSync(folder) && readdirSync(folder).length) throw new Error(`${folder} already has files in it`);
  const { notes: sources, code } = loadGeometry();
  const built = await buildGeometry(sources, code, now);
  const notes = join(folder, GEOMETRY_NAME);
  for (const [root, files] of [[notes, built.notes], [join(notes, OWN_DIR), built.own], [join(folder, "code"), built.code]] as const) {
    for (const [path, text] of Object.entries(files)) {
      const at = join(root, ...path.split("/"));
      mkdirSync(dirname(at), { recursive: true });
      writeFileSync(at, text);
    }
  }
  return { notes };
}

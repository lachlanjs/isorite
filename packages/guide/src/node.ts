// The guide on disk: its files read from this package.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { GuideFiles } from "./index.ts";

/** In a checkout, the package's notes/; in the npm package, where this is bundled into dist/, the guide/ beside it. */
export const GUIDE_DIR = [join(import.meta.dirname, "..", "guide"), join(import.meta.dirname, "..", "notes")].find((d) => existsSync(join(d, "general", "start-here.md"))) ?? join(import.meta.dirname, "..", "notes");

/** The guide's files that aren't notes, by path, as bytes: its pictures (M22), and its artifacts and their data (M23). */
export function loadGuidePictures(dir = GUIDE_DIR): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  const visit = (at: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(png|jpe?g|gif|svg|webp|avif|html|csv|tsv|json|jsonl|stl|glb|gltf|obj|pdf)$/i.test(name)) out[relative(dir, path).split(sep).join("/")] = new Uint8Array(readFileSync(path));
    }
  };
  visit(dir);
  return out;
}

/** The guide's files as they stand in the package: its notes and its AGENTS.md, by path. */
export function loadGuide(dir = GUIDE_DIR): GuideFiles {
  const out: GuideFiles = {};
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

/** A site base's files as they stand in the repository (see bases.ts), by path within it, as text; its lens files are
 *  `lenses`, by name. The Skills base has the skills isorite ships in `built-in/`, as the real skills base does. */
export function loadSiteBase(folder: string): { files: Record<string, string>; lenses: Record<string, string> } {
  const root = join(import.meta.dirname, "..", "..", folder), files: Record<string, string> = {}, lenses: Record<string, string> = {};
  const visit = (at: string, into: string, dir: string) => {
    for (const name of readdirSync(at)) {
      const path = join(at, name);
      if (name === "node_modules" || name === ".git") continue;
      if (statSync(path).isDirectory()) { if (name === ".isorite") { for (const l of readdirSync(join(path, "lenses"))) lenses[l] = readFileSync(join(path, "lenses", l), "utf8"); } else visit(path, `${into}${name}/`, dir); }
      else files[`${into}${name}`] = readFileSync(path, "utf8");
    }
  };
  visit(root, "", root);
  if (folder === "example-skills") visit(join(import.meta.dirname, "..", "..", "server", "skills"), "built-in/", root);
  return { files, lenses };
}

// The guide on disk: its files read from this package.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { GuideFiles } from "./index.ts";

export const GUIDE_DIR = join(import.meta.dirname, "..", "notes");

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

// The bases the public site holds (M16, and the site's switcher since 0.27): the guide as the Tutorial, and three example
// bases beside it, as the real app's switcher shows the global base, the skills base and a person's own. Which base a
// page is for is in its address, `#/b/<name>/n/<id>`; an address without one is the Tutorial's, so the guide's older
// links keep working. This file is what the app and the tests both need to know of them; their files are in packages/.

/** One base of the site. `special` is set where the real app draws it as the global base or the skills base. */
export interface SiteBase {
  name: string;
  title: string;
  special?: "global" | "skills";
  /** The note a first visit opens on. */
  start: string;
  /** Where its folder is in the repository, below `packages/`. */
  folder: string;
  /** Code files show on the Atlas from the first (they are what the base is about). */
  code: boolean;
}

/** The site's bases in the order the switcher lists them: the special ones first, as in the app. */
export const SITE_BASES: readonly SiteBase[] = [
  { name: "global", title: "Global", special: "global", start: "conventions/naming", folder: "example-global", code: false },
  { name: "skills", title: "Skills", special: "skills", start: "commit-message/SKILL", folder: "example-skills", code: true },
  { name: "tutorial", title: "Tutorial", start: "general/start-here", folder: "guide/notes", code: false },
  { name: "code", title: "Code", start: "notes/overview", folder: "example-code", code: true },
];

/** The base an address without one is for. */
export const DEFAULT_BASE = "tutorial";

/** The base an address names, and the rest of it as the app routes it: `#/b/code/n/notes/main` is `code` and `/n/notes/main`.
 *  An unknown or missing base is the Tutorial, whole, so `#/n/start-here` is as it always was. */
export function parseSiteHash(hash: string): { base: string; rest: string } {
  const path = hash.replace(/^#/, "");
  const m = /^\/b\/([^/?#]+)(\/[^]*|)$/.exec(path);
  if (!m || !SITE_BASES.some((b) => b.name === m[1])) return { base: DEFAULT_BASE, rest: path };
  return { base: m[1]!, rest: m[2]! };
}

/** The address of a place in a base: the Tutorial's has no prefix at a note, as the guide's addresses never had. A base alone
 *  is always named, so that choosing the Tutorial from another base is told from a link that names none. */
export function siteHash(base: string, rest = ""): string {
  const tail = rest && !rest.startsWith("/") ? `/${rest}` : rest;
  return base === DEFAULT_BASE && tail ? `#${tail}` : `#/b/${base}${tail}`;
}

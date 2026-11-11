// The guide (M16): a knowledge base whose subject is isorite, read in isorite. Its notes are in `notes/`, as
// Markdown; this names what the app and the server need to know of it. Its things to do are its problem notes,
// which you mark solved yourself.

/** The base's name, as the server and the site show it. */
export const GUIDE_NAME = "isorite guide";
/** The note the guide opens on. */
export const START = "general/start-here";
/** The note of your own the problems ask you to write in. */
export const YOURS = "general/your-notes";

/** The guide's files, by path within the base: its notes and its AGENTS.md. */
export type GuideFiles = Record<string, string>;

export { finderTurn, NOT_A_MODEL, type FinderCall } from "./finder.ts";
export { GUIDE_LENSES } from "./lenses.ts";
export { MOVED, movedHash } from "./moved.ts";
export { SITE_BASES, DEFAULT_BASE, parseSiteHash, siteHash, type SiteBase } from "./bases.ts";

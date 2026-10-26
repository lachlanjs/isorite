// The guide (M16): a knowledge base whose subject is isorite, read in isorite. Its notes are in `notes/`, as
// Markdown; this names what the app and the server need to know of it. Its things to do are its problem notes,
// which you mark solved yourself.

/** The base's name, as the server and the site show it. */
export const GUIDE_NAME = "isorite guide";
/** The note the guide opens on. */
export const START = "start-here";
/** The note of your own the problems ask you to write in. */
export const YOURS = "your-notes";

/** The guide's files, by path within the base: its notes and its AGENTS.md. */
export type GuideFiles = Record<string, string>;

export { finderAnswer, NOT_A_MODEL, type FinderReply, type FinderRequest } from "./finder.ts";
import type { Http } from "@isorite/engine";
import { scriptedHttp } from "@isorite/example";
import { finderAnswer } from "./finder.ts";

/** The finder as the engine's provider: `pace` is the wait between pieces of its text, so it is seen arriving. */
export const finderHttp = (pace = 0): Http => scriptedHttp(finderAnswer, pace);

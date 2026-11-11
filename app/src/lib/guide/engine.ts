// The site's bases (M16; several since 0.27): the real engine, in the page, over one base at a time as this browser keeps
// it (kept.ts), with the finder standing in for an agent (finder.ts). Nothing is sent anywhere. Which base is the page's
// is in its address (`#/b/code/n/<id>`, no prefix for the Tutorial); a switch is a reload into the other, so only
// that base's files are fetched: each base's text is its own chunk, loaded when it is opened.

import { Engine, MemoryFiles, systemClock, type Api, type Elsewhere } from "@isorite/engine";
import { LENSES_DIR } from "@isorite/core";
import { GUIDE_LENSES, GUIDE_NAME, SITE_BASES } from "@isorite/guide";
import { SITE_HERE } from "./site.ts";
import { KeptFiles, keptNames } from "./kept.ts";
import { withFinder } from "./finder.ts";
import type { BaseRow } from "../api.ts";

type Texts = Record<string, () => Promise<string>>;
/** A base's files as the repository has them, by path within it, and its lens files by their names. */
interface Seed { files: () => Promise<Record<string, string>>; lenses: () => Promise<Record<string, string>>; urls: Record<string, string>; }

const URL_KINDS = "png,jpg,jpeg,gif,svg,webp,avif,html,csv,tsv,json,jsonl,stl,glb,gltf,obj,pdf";

/** The files a glob found, read, and named by what follows `at` in their paths (with `into` put before it). */
async function read(found: Texts, at: string, into = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all(Object.entries(found).map(async ([path, load]) => { out[into + path.slice(path.indexOf(at) + at.length)] = await load(); }));
  return out;
}

// The Tutorial: the guide's notes. Its other files (M22's pictures; M23's artifacts and their data) are put in the notes
// each time the page opens, as the site serves them, never kept in the browser.
const guideNotes = import.meta.glob("../../../../packages/guide/notes/**/*.md", { query: "?raw", import: "default" }) as Texts;
const guidePictures = import.meta.glob(`../../../../packages/guide/notes/**/*.{${URL_KINDS}}`, { query: "?url", import: "default", eager: true }) as Record<string, string>;

// The three examples, each a folder under packages/. The Skills base is the folder of a person's skills with the skills
// isorite ships in a `built-in` island beside them, as the real skills base is.
const globalNotes = import.meta.glob("../../../../packages/example-global/{conventions,glossary,people}/**/*.md", { query: "?raw", import: "default" }) as Texts;
const globalAgents = import.meta.glob("../../../../packages/example-global/AGENTS.md", { query: "?raw", import: "default" }) as Texts;
const skillFiles = import.meta.glob("../../../../packages/example-skills/*/**", { query: "?raw", import: "default" }) as Texts;
const builtIn = import.meta.glob("../../../../packages/server/skills/**", { query: "?raw", import: "default" }) as Texts;
const codeFiles = import.meta.glob("../../../../packages/example-code/{AGENTS.md,README.md,package.json,tasks.example.txt,notes/**,src/**,test/**}", { query: "?raw", import: "default" }) as Texts;

const lensFiles = (found: Texts, at: string) => () => read(found, at);
const lensesOf = {
  global: import.meta.glob("../../../../packages/example-global/.isorite/lenses/*.toml", { query: "?raw", import: "default" }) as Texts,
  skills: import.meta.glob("../../../../packages/example-skills/.isorite/lenses/*.toml", { query: "?raw", import: "default" }) as Texts,
  code: import.meta.glob("../../../../packages/example-code/.isorite/lenses/*.toml", { query: "?raw", import: "default" }) as Texts,
};

const seeds: Record<string, Seed> = {
  tutorial: { files: () => read(guideNotes, "/guide/notes/"), lenses: async () => GUIDE_LENSES, urls: guidePictures },
  global: { files: async () => ({ ...(await read(globalNotes, "/example-global/")), ...(await read(globalAgents, "/example-global/")) }), lenses: lensFiles(lensesOf.global, "/lenses/"), urls: {} },
  skills: { files: async () => ({ ...(await read(skillFiles, "/example-skills/")), ...(await read(builtIn, "/server/skills/", "built-in/")) }), lenses: lensFiles(lensesOf.skills, "/lenses/"), urls: {} },
  code: { files: () => read(codeFiles, "/example-code/"), lenses: lensFiles(lensesOf.code, "/lenses/"), urls: {} },
};

/** Whether what is done on the site is kept in this browser. */
export const kept = { lasting: false };

/** The bases as the switcher lists them: fixed, so nothing in them is renamed or lent. */
export function siteRows(): BaseRow[] {
  return SITE_BASES.map((b) => ({ name: b.name, path: "", lend: false, open: b.name === SITE_HERE, title: b.title, ...(b.special ? { special: b.special } : {}) }));
}

/** Made once for the page's life, however often it is asked for. */
let made: Promise<Api> | null = null;
export function guideEngine(): Promise<Api> { return (made ??= open()); }

async function open(): Promise<Api> {
  const base = SITE_HERE, seed = seeds[base]!, here = SITE_BASES.find((b) => b.name === base)!;
  const notes = await KeptFiles.open(keptNames(base).notes, await seed.files()), own = await KeptFiles.open(keptNames(base).own, {});
  kept.lasting = notes.lasting;
  // Its lenses are beside the notes' own files, put there where they are not (a lens you changed here stays changed).
  for (const [name, text] of Object.entries(await seed.lenses())) if ((await own.read(`${LENSES_DIR}/${name}`)) === null) await own.write(`${LENSES_DIR}/${name}`, text);
  await Promise.all(Object.entries(seed.urls).map(async ([path, url]) => {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) await notes.writeBytes(path.split("/guide/notes/").at(-1)!, new Uint8Array(await res.arrayBuffer()));
  }));
  // A link to the global base is checked against the example one, opened beside any other base (a few notes, in memory).
  let elsewhere: Elsewhere | undefined;
  if (base !== "global") {
    const global = await Engine.open({ notes: new MemoryFiles(await seeds.global!.files()), own: new MemoryFiles(), clock: systemClock, device: "browser", name: "global", special: "global" });
    elsewhere = { lent: () => [], base: (name) => (name === "global" ? global : null) };
  }
  const engine = await Engine.open({ notes, own, clock: systemClock, device: "browser", name: base === "tutorial" ? GUIDE_NAME : here.title, ...(here.special ? { special: here.special } : {}), ...(elsewhere ? { elsewhere } : {}) });
  const bases = { list: async () => ({ here: base, local: false, fixed: true, bases: siteRows() }), lend: async () => siteRows(), title: async () => siteRows() };
  return withFinder(engine, { bases });
}

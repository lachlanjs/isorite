// The guide on the public site (M16): the real engine, in the page, over the guide's notes as this browser keeps
// them (kept.ts), with the finder standing in for an agent (finder.ts). Nothing is sent anywhere.

import { Engine, systemClock, type Api } from "@isorite/engine";
import { LENSES_DIR } from "@isorite/core";
import { GUIDE_LENSES, GUIDE_NAME } from "@isorite/guide";
import { KeptFiles } from "./kept.ts";
import { withFinder } from "./finder.ts";

// The guide's files, as they stand in the repository, by their path within the base.
const raw = import.meta.glob("../../../../packages/guide/notes/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const seed = Object.fromEntries(Object.entries(raw).map(([path, text]) => [path.split("/guide/notes/").at(-1)!, text]));
// Its other files (M22's pictures; M23's artifacts and their data), as the site serves them: put in the notes each time
// the page opens, never kept in the browser.
const pictures = import.meta.glob("../../../../packages/guide/notes/**/*.{png,jpg,jpeg,gif,svg,webp,avif,html,csv,tsv,json,jsonl,stl,glb,gltf,obj,pdf}", { query: "?url", import: "default", eager: true }) as Record<string, string>;

/** Whether what is done in the guide is kept in this browser. */
export const kept = { lasting: false };

/** Made once for the page's life, however often it is asked for. */
let made: Promise<Api> | null = null;
export function guideEngine(): Promise<Api> { return (made ??= open()); }

async function open(): Promise<Api> {
  const notes = await KeptFiles.open("notes", seed), own = await KeptFiles.open("own", {});
  kept.lasting = notes.lasting;
  // Its lenses are beside the notes' own files, put there where they are not (a lens you changed here stays changed).
  for (const [name, text] of Object.entries(GUIDE_LENSES)) if ((await own.read(`${LENSES_DIR}/${name}`)) === null) await own.write(`${LENSES_DIR}/${name}`, text);
  await Promise.all(Object.entries(pictures).map(async ([path, url]) => {
    const res = await fetch(url).catch(() => null);
    if (res?.ok) await notes.writeBytes(path.split("/guide/notes/").at(-1)!, new Uint8Array(await res.arrayBuffer()));
  }));
  return withFinder(await Engine.open({ notes, own, clock: systemClock, device: "browser", name: GUIDE_NAME }));
}

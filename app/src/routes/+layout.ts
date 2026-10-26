// A single-page app (hash routing implies no server rendering): everything renders in the browser. What is open and the
// list of notes are asked for once here, before the first page.
import { START } from "@isorite/guide";
import { app } from "$lib/app.svelte.ts";
import { panes } from "$lib/panes.svelte.ts";


export async function load() {
  // The guide's site (M16) has no server: its engine runs here, over the guide (lib/guide), and opens on Start here.
  // Once: asked again, it would hear every event twice.
  if (import.meta.env.MODE === "guide") {
    if (!app.api) await app.load(await (await import("$lib/guide/engine.ts")).guideEngine());
    if (!panes.last) panes.setLast(START);
  } else await app.load();
  return {};
}

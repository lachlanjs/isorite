// A single-page app (hash routing implies no server rendering): everything renders in the browser. What is open and the
// list of notes are asked for once here, before the first page.
import { SITE_BASES } from "@isorite/guide";
import { SITE_HERE, followAddress } from "$lib/guide/site.ts";
import { app } from "$lib/app.svelte.ts";
import { panes } from "$lib/panes.svelte.ts";


export async function load() {
  // The guide's site (M16) has no server: its engine runs here, over the base the address names (lib/guide; the Tutorial where it names none), and opens on its first note.
  // Once: asked again, it would hear every event twice.
  if (import.meta.env.MODE === "guide") {
    if (!app.api) await app.load(await (await import("$lib/guide/engine.ts")).guideEngine());
    // A base is a page of its own: an address for another base, however it was come to, loads that base afresh.
    window.addEventListener("hashchange", followAddress);
    if (!panes.last) panes.setLast(SITE_BASES.find((b) => b.name === SITE_HERE)!.start);
  } else await app.load();
  return {};
}

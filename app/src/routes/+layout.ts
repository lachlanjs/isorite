// A single-page app (hash routing implies no server rendering): everything renders in the browser. What is open and the
// list of notes are asked for once here, before the first page.
import { app } from "$lib/app.svelte.ts";


export async function load() {
  // The tutorial's build has no server: its engine runs here, over the example base (lib/tutorial).
  // Once: asked again, it would hear every event twice.
  if (import.meta.env.MODE === "tutorial") { if (!app.api) await app.load(await (await import("$lib/tutorial/engine.ts")).tutorialEngine()); }
  else await app.load();
  return {};
}

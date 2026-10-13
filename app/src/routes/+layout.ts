// A single-page app (hash routing implies no server rendering): everything renders in the browser. What is open and the
// list of notes are asked for once here, before the first page.
import { app } from "$lib/app.svelte.ts";


export async function load() {
  await app.load();
  return {};
}

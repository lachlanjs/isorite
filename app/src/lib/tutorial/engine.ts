// The tutorial's engine: the real one, in the page, over the example base made at load (so its last session has just
// ended), with the tutorial's scripted Iso in place of a provider. Nothing is sent anywhere; a reload starts again.

import { Engine, KEY, MemoryFiles, MemorySecrets, OPENROUTER, systemClock, type Api } from "@isorite/engine";
import { buildExample, NAME, scriptedHttp, similar, tutorialAnswer } from "@isorite/example";

// The example's notes, as they stand today, by their path within the base.
const raw = import.meta.glob("../../../../packages/example/notes/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const sources = Object.fromEntries(Object.entries(raw).map(([path, text]) => [path.split("/notes/").at(-1)!, text]));

/** Made once for the page's life, however often it is asked for. */
let made: Promise<Api> | null = null;
export function tutorialEngine(): Promise<Api> { return (made ??= open()); }

async function open(): Promise<Api> {
  const built = await buildExample(sources);
  return Engine.open({
    notes: new MemoryFiles(built.notes), study: new MemoryFiles(built.study), clock: systemClock, device: "tutorial", name: NAME,
    http: scriptedHttp(tutorialAnswer, 16), secrets: new MemorySecrets({ [KEY]: "tutorial" }),
    // No signing in for a key: there is no provider here.
    provider: { ...OPENROUTER, auth: undefined }, similar,
  });
}

// The tutorial's engine: the real one, in the page, over an example base made at load (so its last session has just
// ended), with the tutorial's scripted Iso in place of a provider. Nothing is sent anywhere; a reload starts again.
// Two bases: the N-body simulation's notes, and the differential geometry notes of the "Questions and problems"
// section, chosen by `?base=geometry` in the address (a section that needs the other base loads the page again).

import { Engine, KEY, MemoryFiles, MemorySecrets, OPENROUTER, systemClock, type Api } from "@isorite/engine";
import { buildExample, buildGeometry, geometryAnswer, GEOMETRY_NAME, NAME, scriptedHttp, similar, tutorialAnswer } from "@isorite/example";

import { baseNow } from "./base.ts";

// The examples' notes, as they stand today, by their path within the base.
const raw = import.meta.glob("../../../../packages/example/notes/**/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const sources = Object.fromEntries(Object.entries(raw).map(([path, text]) => [path.split("/notes/").at(-1)!, text]));
const geometryRaw = import.meta.glob("../../../../packages/example/geometry/**/*", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const under = (folder: string) => Object.fromEntries(Object.entries(geometryRaw).filter(([p]) => p.includes(`/geometry/${folder}/`)).map(([p, text]) => [p.split(`/geometry/${folder}/`).at(-1)!, text]));

/** Made once for the page's life, however often it is asked for. */
let made: Promise<Api> | null = null;
export function tutorialEngine(): Promise<Api> { return (made ??= baseNow() === "geometry" ? openGeometry() : open()); }

async function open(): Promise<Api> {
  const built = await buildExample(sources);
  return Engine.open({
    notes: new MemoryFiles(built.notes), own: new MemoryFiles(built.own), clock: systemClock, device: "tutorial", name: NAME,
    http: scriptedHttp(tutorialAnswer, 16), secrets: new MemorySecrets({ [KEY]: "tutorial" }),
    // No signing in for a key: there is no provider here.
    provider: { ...OPENROUTER, auth: undefined }, similar,
  });
}

async function openGeometry(): Promise<Api> {
  const code = under("code"), built = await buildGeometry(under("notes"), code);
  return Engine.open({
    notes: new MemoryFiles(built.notes), own: new MemoryFiles(built.own), clock: systemClock, device: "tutorial", name: GEOMETRY_NAME,
    http: scriptedHttp(geometryAnswer, 16), secrets: new MemorySecrets({ [KEY]: "tutorial" }),
    provider: { ...OPENROUTER, auth: undefined }, repository: () => new MemoryFiles(code),
  });
}

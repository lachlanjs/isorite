// The second example: notes on the differential geometry of surfaces, three weeks in, with its questions and
// problems (M12). Like the first it is made by driving the engine, over files in memory, with a clock set to each
// moment and a scripted Iso, so every journal and event is the engine's own.
//
// What it leaves: the surfaces and curvature understood or worked through; Gauss–Bonnet stated, with Iso's proof
// sketch untouched, your examples, and an open question of yours inside it; two open questions of Iso's; problems
// solved, problems stated and not begun, and one (the angles of a geodesic triangle) with a solution Iso has read;
// Iso's reading of you on Gauss–Bonnet. Two links out of the base: to the web, and to code (one resolves, one does
// not).

import { blocks, SETTINGS_FILE, settingsText, GITATTRIBUTES, type Anchor } from "@isorite/core";
import { Engine, MemoryFiles, MemorySecrets, KEY, type Clock, type EngineEvent } from "@isorite/engine";
import { block, drop, type Built, type Sources } from "./history.ts";
import { scriptedHttp, type Reply } from "./scripted.ts";

export const GEOMETRY_NAME = "surfaces-notes", GEOMETRY_DEVICE = "laptop1";
/** Where the code is, from the notes' folder (the base's `repository`). */
export const GEOMETRY_REPOSITORY = "../code";
const DAY = 86_400_000, MIN = 60_000;

/** The files of the example, by path: the notes, and the code beside them. */
export interface GeometryBuilt extends Built { code: Record<string, string> }

const S = "surfaces", C = "curvature", G = "global";
const n = (folder: string, name: string) => `${folder}/${name}`;
export const REGULAR = n(S, "regular-surfaces"), FIRST = n(S, "first-ff"), SECOND = n(S, "second-ff"), ORIENTABLE = n(S, "orientable"),
  GAUSSIAN = n(C, "gaussian-curvature"), EGREGIUM = n(C, "egregium"), GAUSS_EQ = n(C, "gauss-equation"), GEODESIC = n(C, "geodesic-curvature"),
  EULER = n(G, "euler"), BONNET = n(G, "gauss-bonnet"), TRIANGULATIONS = n(G, "triangulations"),
  COMPACT = n(G, "where-is-compactness-used"), IISIGN = n(S, "why-ii-changes-sign"), DERIVS = n(C, "derivatives-when-f-is-zero"), CORNERS = n(G, "kg-at-the-corners"),
  TORUS = n(G, "total-curvature-of-the-torus"), TRIANGLE = n(G, "angles-of-a-geodesic-triangle"), MOBIUS = n(G, "gauss-bonnet-and-the-mobius-band"),
  SPHERE = n(C, "curvature-of-a-sphere"), SADDLE = n(C, "curvature-of-the-saddle"), CYLINDER = n(C, "the-cylinder-and-the-plane"),
  EG_ONLY = n(C, "k-from-e-and-g-alone"), CATENOID = n(C, "catenoid-and-helicoid"), GENUS = n(G, "chi-of-a-surface-of-genus-g");

/** The problems, in the order they were made, each marked solved by you (on the day its solution was last worked on)
 *  or not. The solution is the part of the note below "## Solution", written a day after the statement. */
export const GEOMETRY_PROBLEMS = [SPHERE, GENUS, CYLINDER, TORUS, TRIANGLE, MOBIUS, SADDLE, EG_ONLY, CATENOID];
export const SOLVED = [SPHERE, GENUS, CYLINDER, TORUS];

/** The questions Iso asked in the history, by the title it gave; their ids are made from it. */
export const ISO_QUESTIONS = {
  triangulation: { title: "Why doesn't the total depend on the triangulation?", text: "The last step of the proof needs it, and Euler characteristic only states it.", about: [BONNET] },
  disc: { title: "What makes T a disc?", text: "You used χ(T) = 1. Does the triangle have to lie in one coordinate patch?", about: [TRIANGLE] },
};

/** Iso's reading of you on Gauss–Bonnet, each sentence resting on what you can open. */
export const READING = `You can state it and use it: the [examples](/${BONNET}.md) are yours, and you [solved the torus](/${TORUS}.md). [The proof sketch](/${BONNET}.md) is still mine, untouched: you have not yet said it in your own words. [Where compactness is used](/${COMPACT}.md) is open, and so is [the triangle](/${TRIANGLE}.md), whose solution leans on a step not yet shown.`;

const anchor = (text: string): Anchor => ({ text, nth: 0 });

/** The notes as you wrote them, and the code beside them: made into a base with its history. */
export async function buildGeometry(sources: Sources, code: Record<string, string>, now = Date.now()): Promise<GeometryBuilt> {
  const final = (id: string): string => { const t = sources[`${id}.md`]; if (t === undefined) throw new Error(`no note ${id} in the example`); return t; };
  const notes = new MemoryFiles(), own = new MemoryFiles({ ".gitattributes": GITATTRIBUTES, [SETTINGS_FILE]: settingsText({ repository: GEOMETRY_REPOSITORY }) });
  let t = 0;
  const clock: Clock = { now: () => t++ };
  const replies: Reply[] = [];
  const http = scriptedHttp(() => { const r = replies.shift(); if (!r) throw new Error("Iso was asked more than the script says"); return r; });
  const engine = await Engine.open({
    notes, own, clock, device: GEOMETRY_DEVICE, name: GEOMETRY_NAME, http, secrets: new MemorySecrets({ [KEY]: "example" }),
    repository: () => new MemoryFiles(code),
  });

  const done = new Map<string, Extract<EngineEvent, { type: "iso-done" | "iso-failed" }>>();
  const waiting = new Map<string, () => void>();
  engine.events((e) => {
    if (e.type !== "iso-done" && e.type !== "iso-failed") return;
    done.set(e.request, e);
    waiting.get(e.request)?.();
  });
  const finished = async (id: string): Promise<Extract<EngineEvent, { type: "iso-done" }>> => {
    if (!done.has(id)) await new Promise<void>((r) => waiting.set(id, r));
    const e = done.get(id)!;
    if (e.type === "iso-failed") throw new Error(`Iso failed: ${e.message}`);
    return e;
  };
  const write = async (id: string, text: string) => {
    let version: string | null = null;
    try { version = (await engine.readNote(id)).version; } catch { /* a new note */ }
    return version === null ? engine.createNote(id, text) : engine.saveNote(id, { base: version, text });
  };
  /** Iso asked for new text after the block that begins `after`, and its reply. */
  const insert = async (id: string, after: string, asked: string, reply: string, calls: Reply["calls"], usage: NonNullable<Reply["usage"]>) => {
    const text = (await engine.readNote(id)).text, all = blocks(text), k = all.findIndex((b) => b.text.startsWith(after));
    if (k < 0) throw new Error(`no block begins "${after}" in ${id}`);
    replies.push(...(calls?.length ? [{ calls, usage: { in: Math.round(usage.in * 0.6), out: 40, usd: usage.usd * 0.4 } }, { text: reply, usage }] : [{ text: reply, usage }]));
    const { request } = await engine.ask({ note: id, form: "insert", after: anchor(all[k]!.text), before: all[k + 1] ? anchor(all[k + 1]!.text) : null, asked, tier: "mid" });
    return finished(request);
  };
  /** A turn in Iso's pane, with the notes switch on, given the notes named, and the replies it is to give. */
  const turn = async (asked: string, given: string[], ...said: Reply[]) => {
    replies.push(...said);
    const { turn: id } = await engine.converse({ mode: "write", asked, tier: "mid", given: given.map((g) => ({ kind: "note" as const, id: g })) });
    return finished(id);
  };

  const ops: [number, number, () => Promise<unknown>][] = [];
  const on = (day: number, minute: number, act: () => Promise<unknown>) => ops.push([day, minute, act]);
  const sans = (id: string, ...prefixes: string[]) => prefixes.reduce((text, p) => drop(text, p), final(id));
  const solution = (text: string) => text.slice(0, text.indexOf("\n## Solution"));

  // ---- the surfaces, three weeks ago
  on(21, 0, () => write(REGULAR, final(REGULAR)));
  on(21, 20, () => write(FIRST, final(FIRST)));
  on(20, 0, () => write(SECOND, final(SECOND)));
  on(19, 0, () => write(ORIENTABLE, final(ORIENTABLE)));
  on(19, 30, () => write(IISIGN, final(IISIGN)));

  // ---- curvature
  on(18, 0, () => write(GAUSSIAN, final(GAUSSIAN)));
  on(16, 0, () => write(GAUSS_EQ, final(GAUSS_EQ)));
  on(16, 25, () => write(DERIVS, final(DERIVS)));
  on(16, 40, () => write(EGREGIUM, final(EGREGIUM)));
  on(15, 0, () => write(SPHERE, solution(final(SPHERE)) + "\n"));
  on(14, 0, async () => { await write(SPHERE, final(SPHERE)); await engine.setDone(SPHERE, true, (await engine.readNote(SPHERE)).version); });
  on(13, 0, () => write(GEODESIC, final(GEODESIC)));
  on(12, 0, () => write(TRIANGULATIONS, final(TRIANGULATIONS)));
  on(12, 20, () => write(EULER, final(EULER)));
  on(11, 0, () => write(GENUS, solution(final(GENUS)) + "\n"));
  on(10, 0, async () => { await write(GENUS, final(GENUS)); await engine.setDone(GENUS, true, (await engine.readNote(GENUS)).version); });

  // ---- Gauss–Bonnet, and what Iso wrote in it
  const proof = ["## Proof sketch", "Triangulate $M$", "That leaves the corners"], why = ["## Why each hypothesis", "**Oriented:**", "**Compact:**", "[[!where"], examples = ["## Examples", "A sphere of radius", "A torus has", "Further reading"];
  on(9, 0, () => write(BONNET, sans(BONNET, ...proof, ...why, ...examples)));
  on(8, 0, async () => {
    const p = await insert(BONNET, "Total curvature is topological", "sketch the proof", proof.map((p) => block(final(BONNET), p)).join("\n\n"),
      [{ name: "read_note", arguments: { id: GAUSSIAN } }, { name: "read_note", arguments: { id: EULER } }], { in: 7400, out: 330, usd: 0.0162 });
    await engine.keep(BONNET, p.proposal);
  });
  on(7, 0, () => write(COMPACT, final(COMPACT).split("\n\nIs it only")[0] + "\n"));
  on(6, 0, () => write(BONNET, sans(BONNET, ...examples)));
  on(5, 0, () => turn("is the total really the same for every triangulation?", [BONNET],
    { calls: [{ name: "read_note", arguments: { id: BONNET, section: "Proof sketch" } }, { name: "read_note", arguments: { id: EULER } }], usage: { in: 6100, out: 60, usd: 0.0079 } },
    { calls: [{ name: "ask_question", arguments: ISO_QUESTIONS.triangulation }], usage: { in: 8000, out: 90, usd: 0.0108 } },
    { text: "Not yet. The last step of the proof needs it, and your note on the Euler characteristic only states it. I have put it down as a question.", usage: { in: 8600, out: 40, cached: 6000, usd: 0.0061 } }));
  on(4, 0, () => write(BONNET, final(BONNET)));
  on(4, 30, () => write(TORUS, solution(final(TORUS)) + "\n"));
  on(3, 0, async () => { await write(TORUS, final(TORUS)); await engine.setDone(TORUS, true, (await engine.readNote(TORUS)).version); });
  on(3, 30, () => write(COMPACT, final(COMPACT)));

  // ---- the geodesic triangle, read by Iso
  on(2, 0, () => write(TRIANGLE, final(TRIANGLE)));
  on(2, 20, () => turn("check my solution", [TRIANGLE],
    { calls: [{ name: "read_note", arguments: { id: TRIANGLE } }, { name: "read_note", arguments: { id: BONNET } }], usage: { in: 6600, out: 60, usd: 0.0084 } },
    { calls: [{ name: "ask_question", arguments: ISO_QUESTIONS.disc }], usage: { in: 8900, out: 90, usd: 0.0114 } },
    { text: "The steps follow from Gauss–Bonnet, and the edges give $k_g = 0$ as you say. They lean on $\\chi(T) = 1$, which the solution does not show; I have put that as a question. I have not marked it.", usage: { in: 9400, out: 70, cached: 6200, usd: 0.0069 } }));
  on(2, 50, () => write(CORNERS, final(CORNERS)));

  // ---- the problems not begun, and the last questions
  const stated = [MOBIUS, SADDLE, EG_ONLY, CATENOID];
  stated.forEach((id, k) => on(1, k * 10, () => write(id, final(id))));
  on(1, 50, () => write(CYLINDER, solution(final(CYLINDER)) + "\n"));
  on(0, -90, async () => { await write(CYLINDER, final(CYLINDER)); await engine.setDone(CYLINDER, true, (await engine.readNote(CYLINDER)).version); });

  on(1, 55, async () => engine.saveScratchpad(BONNET, "Compact: I think it is only that the triangulation is finite. Check against the Möbius band, which is compact and still fails, so orientation must be a separate matter.", null));

  // ---- today: Iso's reading of you on Gauss–Bonnet
  on(0, -40, async () => {
    replies.push(
      { calls: [{ name: "read_note", arguments: { id: BONNET } }, { name: "read_note", arguments: { id: COMPACT } }], usage: { in: 5400, out: 60, usd: 0.0071 } },
      { calls: [{ name: "write_understanding", arguments: { id: BONNET, reading: READING } }], usage: { in: 7200, out: 150, cached: 4200, usd: 0.0103 } },
      { text: "I have written my reading of you on Gauss–Bonnet.", usage: { in: 7500, out: 20, cached: 7000, usd: 0.0037 } });
    const { turn: id } = await engine.converse({ mode: "ask", asked: "where do I stand on Gauss–Bonnet?", tier: "mid", given: [{ kind: "understanding", id: BONNET }] });
    await finished(id);
  });

  // In time order: the day, then the minute within it (as the first example's are).
  ops.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [day, minute, act] of ops) {
    t = day === 0 ? now + minute * MIN : now - day * DAY - 2 * 60 * MIN + minute * MIN;
    await act();
  }
  if (replies.length) throw new Error(`${replies.length} scripted replies were never asked for`);
  return { notes: Object.fromEntries(notes.files), own: Object.fromEntries(own.files), code };
}

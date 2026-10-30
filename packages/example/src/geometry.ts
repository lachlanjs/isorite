// The second example: notes on the differential geometry of surfaces, three weeks in, with its questions and
// problems (M12). Like the first it is made by driving the engine, over files in memory, with a clock set to each
// moment and a scripted agent (M25), so every journal, event and kept session is the engine's own.
//
// What it leaves: the surfaces and curvature understood or worked through; Gauss–Bonnet stated, with the agent's
// proof sketch untouched, your examples, and an open question of yours inside it; two open questions the agent
// asked back, which you kept; problems solved, problems stated and not begun, and one (the angles of a geodesic
// triangle) with a solution the agent has read; its reading of you on Gauss–Bonnet. Two links out of the base: to
// the web, and to code (one resolves, one does not).

import { blocks, SETTINGS_FILE, settingsText, GITATTRIBUTES } from "@isorite/core";
import { Engine, MemoryFiles, type Clock, type Given } from "@isorite/engine";
import { ScriptedAgent, insertAfter, type Call } from "./agent.ts";
import { block, drop, type Built, type Sources } from "./history.ts";

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

/** The questions the agent asked back in the history, by the title it gave; their ids are made from it. */
export const ISO_QUESTIONS = {
  triangulation: { title: "Why doesn't the total depend on the triangulation?", text: "The last step of the proof needs it, and Euler characteristic only states it.", about: [BONNET] },
  disc: { title: "What makes T a disc?", text: "You used χ(T) = 1. Does the triangle have to lie in one coordinate patch?", about: [TRIANGLE] },
};

/** The agent's answer to where you stand on Gauss–Bonnet, each sentence resting on what you can open. */
export const READING = `You can state it and use it: the [examples](/${BONNET}.md) are yours, and you [solved the torus](/${TORUS}.md). [The proof sketch](/${BONNET}.md) is still mine, untouched: you have not yet said it in your own words. [Where compactness is used](/${COMPACT}.md) is open, and so is [the triangle](/${TRIANGLE}.md), whose solution leans on a step not yet shown.`;

/** The notes as you wrote them, and the code beside them: made into a base with its history. */
export async function buildGeometry(sources: Sources, code: Record<string, string>, now = Date.now()): Promise<GeometryBuilt> {
  const final = (id: string): string => { const t = sources[`${id}.md`]; if (t === undefined) throw new Error(`no note ${id} in the example`); return t; };
  const notes = new MemoryFiles(), own = new MemoryFiles({ ".gitattributes": GITATTRIBUTES, [SETTINGS_FILE]: settingsText({ repository: GEOMETRY_REPOSITORY }) });
  let t = 0;
  const clock: Clock = { now: () => t++ };
  const engine = await Engine.open({ notes, own, clock, device: GEOMETRY_DEVICE, name: GEOMETRY_NAME, repository: () => new MemoryFiles(code) });
  const agent = new ScriptedAgent(engine, clock.now);
  const write = async (id: string, text: string) => {
    let version: string | null = null;
    try { version = (await engine.readNote(id)).version; } catch { /* a new note */ }
    return version === null ? engine.createNote(id, text) : engine.saveNote(id, { base: version, text });
  };
  const read = (id: string, section?: string): Call => ({ tool: "read_note", args: { id, ...(section ? { section } : {}) } });
  const given = (id: string): Given[] => [{ kind: "note", id }];
  /** A turn whose questions back you keep, each made a question note. */
  const keeping = async (...turn: Parameters<ScriptedAgent["turn"]>) => {
    for (const q of await agent.turn(...turn)) await engine.agentTake(q.id);
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

  // ---- Gauss–Bonnet, and what the agent wrote in it
  const proof = ["## Proof sketch", "Triangulate $M$", "That leaves the corners"], why = ["## Why each hypothesis", "**Oriented:**", "**Compact:**", "[[!where"], examples = ["## Examples", "A sphere of radius", "A torus has", "Further reading"];
  on(9, 0, () => write(BONNET, sans(BONNET, ...proof, ...why, ...examples)));
  on(8, 0, async () => {
    agent.begin("proof-sketch");
    const now = blocks((await engine.readNote(BONNET)).text).map((b) => b.text);
    await agent.turn("sketch the proof", [read(GAUSSIAN), read(EULER), insertAfter(BONNET, now, "Total curvature is topological", proof.map((p) => block(final(BONNET), p)).join("\n\n"))],
      `I sketched the proof in [Gauss–Bonnet](/${BONNET}.md), from [Gaussian curvature](/${GAUSSIAN}.md) and [the Euler characteristic](/${EULER}.md).`, given(BONNET));
  });
  on(7, 0, () => write(COMPACT, final(COMPACT).split("\n\nIs it only")[0] + "\n"));
  on(6, 0, () => write(BONNET, sans(BONNET, ...examples)));
  on(5, 0, () => { agent.begin("triangulation"); return keeping("is the total really the same for every triangulation?", [read(BONNET, "Proof sketch"), read(EULER), { tool: "ask_question", args: ISO_QUESTIONS.triangulation }],
    `Not yet. The last step of [the proof](/${BONNET}.md) needs it, and your note on [the Euler characteristic](/${EULER}.md) only states it. I have put it to you as a question.`, given(BONNET)); });
  on(4, 0, () => write(BONNET, final(BONNET)));
  on(4, 30, () => write(TORUS, solution(final(TORUS)) + "\n"));
  on(3, 0, async () => { await write(TORUS, final(TORUS)); await engine.setDone(TORUS, true, (await engine.readNote(TORUS)).version); });
  on(3, 30, () => write(COMPACT, final(COMPACT)));

  // ---- the geodesic triangle, read by the agent
  on(2, 0, () => write(TRIANGLE, final(TRIANGLE)));
  on(2, 20, () => { agent.begin("triangle"); return keeping("check my solution", [read(TRIANGLE), read(BONNET), { tool: "ask_question", args: ISO_QUESTIONS.disc }],
    `The steps follow from [Gauss–Bonnet](/${BONNET}.md), and the edges give $k_g = 0$ as you say. They lean on $\\chi(T) = 1$, which [the solution](/${TRIANGLE}.md) does not show; I have put that to you as a question. I have not marked it.`, given(TRIANGLE)); });
  on(2, 50, () => write(CORNERS, final(CORNERS)));

  // ---- the problems not begun, and the last questions
  const stated = [MOBIUS, SADDLE, EG_ONLY, CATENOID];
  stated.forEach((id, k) => on(1, k * 10, () => write(id, final(id))));
  on(1, 50, () => write(CYLINDER, solution(final(CYLINDER)) + "\n"));
  on(0, -90, async () => { await write(CYLINDER, final(CYLINDER)); await engine.setDone(CYLINDER, true, (await engine.readNote(CYLINDER)).version); });

  // ---- today: where you stand on Gauss–Bonnet, as the agent reads it from your notes
  on(0, -40, () => { agent.begin("where-i-stand"); return agent.turn("where do I stand on Gauss–Bonnet?", [read(BONNET), read(COMPACT)], READING, given(BONNET)); });

  // In time order: the day, then the minute within it (as the first example's are).
  ops.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [day, minute, act] of ops) {
    t = day === 0 ? now + minute * MIN : now - day * DAY - 2 * 60 * MIN + minute * MIN;
    await act();
  }
  return { notes: Object.fromEntries(notes.files), own: Object.fromEntries(own.files), code };
}

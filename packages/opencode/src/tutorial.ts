// The tutorial's model: what it answers to each prompt the tour fills in (`plugin/tour.ts`), as the agent in
// OpenCode and as Iso in the isorite server, both pointed at it. Anything else is answered once, plainly. The code
// it writes is in `tutorial/`, and runs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROMPTS, QUAD } from "../plugin/tour.ts";
import { lastAsked, type Reply, type Script } from "./scripted.ts";

export const UNSCRIPTED = "In this tutorial the model is scripted: it answers only what the tour asks. Pointed at a model of your own (ISORITE_GATEWAY_URL), isorite term answers anything.";

const code = (name: string) => readFileSync(new URL(`./tutorial/${name}`, import.meta.url), "utf8");

/** What the agent looks up before writing the simulation: the base, a search, the note found, and the note it
 *  requires, reached along its link. */
export const LOOKS: Reply[] = [
  { tool: "brief_base", args: {} },
  { tool: "search_notes", args: { query: "leapfrog" } },
  { tool: "read_note", args: { id: "simulation/the-main-loop" } },
  { tool: "read_note", args: { id: "/integrators/leapfrog.md", section: "Why it does not drift" } },
  { tool: "read_note", args: { id: "simulation/initial-conditions" } },
];

const QUESTION = "How is a body inserted, and what does each node keep? I don't have this straight yet.";
const INSERTED = "A body goes down from the root into the square that holds it; a leaf that already has one splits in four, and both go down again. Each node keeps its square, its mass and its centre of mass, counted as bodies pass through it on the way down.";

/** The script, for the example base whose notes are in `notes`. */
export function tutorialScript(notes: string): Script {
  return (request) => {
    // OpenCode names the session from its first prompt.
    if (JSON.stringify(request.messages.filter((m) => m.role === "system")).includes("title generator")) return { text: "Two bodies, stepped with leapfrog" };
    // Iso, asked in place in the note view: its requests carry no edit tool, as OpenCode's do.
    if (!request.tools.includes("edit")) return { text: "In 3D the same tree has eight children a node: an octree." };
    const asked = lastAsked(request).trim();
    // What the agent has done since the prompt: one tool result a step.
    const done = request.messages.slice(request.messages.findLastIndex((m) => m.role === "user")).filter((m) => m.role === "tool").length;
    if (asked.includes(PROMPTS.code)) {
      const steps: Reply[] = [...LOOKS, { tool: "write", args: { path: "sim.py", content: code("sim.py") } }];
      return steps[done] ?? { text: "sim.py steps the two-body orbit with leapfrog `[1]`, from the initial conditions in your notes `[2]`; it prints the energy drift, which stays tiny because leapfrog is symplectic.\n\n```isorite\n[1] integrators/leapfrog § Why it does not drift\n[2] simulation/initial-conditions\n```" };
    }
    if (asked.includes(PROMPTS.tree)) {
      const steps: Reply[] = [
        { tool: "read_note", args: { id: "algorithms/barnes-hut" } },
        { tool: "read_note", args: { id: QUAD } },
        { tool: "write", args: { path: "barnes_hut.py", content: code("barnes_hut.py") } },
        // OpenCode's own edit, on a note: made a proposal by the plugin.
        { tool: "edit", args: { path: join(notes, ...QUAD.split("/")) + ".md", oldString: QUESTION, newString: INSERTED } },
      ];
      return steps[done] ?? { text: "barnes_hut.py builds the quadtree and walks it with θ = 0.5 `[1]`. Your note on the quadtree asked how a body is inserted: my answer waits in it for you to keep or not `[2]`.\n\n```isorite\n[1] algorithms/barnes-hut\n[2] algorithms/the-quadtree\n```" };
    }
    return { text: UNSCRIPTED };
  };
}

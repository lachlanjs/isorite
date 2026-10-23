// The tutorial's model: what it answers to each prompt the tour fills in (`plugin/tour.ts`), as the agent in
// OpenCode, and as Iso in the isorite server, both pointed at it. Iso answers as it does in the browser's tutorial
// (`@isorite/example`), so that both tutorials can be walked on the one base. Anything else is answered once,
// plainly. The code the agent writes is in `tutorial/`, and runs.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tutorialAnswer } from "@isorite/example";
import { GOAL, PROMPTS } from "../plugin/tour.ts";
import { lastAsked, type Reply, type Request, type Script } from "./scripted.ts";

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

// The goal's last line, where the code that answers it now is: the agent's change to a note, which waits.
const WAS = "That is what [Barnes–Hut](/algorithms/barnes-hut.md \"uses\") is for.";
const NOW = "That is what [Barnes–Hut](/algorithms/barnes-hut.md \"uses\") is for: `barnes_hut.py` has it, at θ = 0.5.";

/** Iso, in the isorite server: answered as in the browser's tutorial, with only the tools it was offered. */
function iso(request: Request): Reply {
  const r = tutorialAnswer({ model: "scripted", messages: request.messages.map((m) => ({ role: m.role, content: m.content })), tools: request.tools.map((name) => ({ function: { name } })) });
  const calls = (r.calls ?? []).filter((c) => request.tools.includes(c.name));
  if (calls.length) return { calls, usage: r.usage };
  return { text: r.text ?? "", usage: r.usage };
}

/** The script, for the example base whose notes are in `notes`. */
export function tutorialScript(notes: string): Script {
  return (request) => {
    // OpenCode names the session from its first prompt.
    if (JSON.stringify(request.messages.filter((m) => m.role === "system")).includes("title generator")) return { text: "Two bodies, stepped with leapfrog" };
    // Iso, in the browser or asked in place in the note view: its requests carry no edit tool, as OpenCode's do.
    if (!request.tools.includes("edit")) return iso(request);
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
        { tool: "read_note", args: { id: "algorithms/the-quadtree" } },
        { tool: "write", args: { path: "barnes_hut.py", content: code("barnes_hut.py") } },
        // OpenCode's own edit, on a note: made through isorite by the plugin, entered and marked as the agent's.
        { tool: "edit", args: { path: join(notes, ...GOAL.split("/")) + ".md", oldString: WAS, newString: NOW } },
      ];
      return steps[done] ?? { text: "barnes_hut.py builds the quadtree and walks it with θ = 0.5 `[1]`. Your note on the goal now says where the code is, marked as mine `[2]`.\n\n```isorite\n[1] algorithms/barnes-hut\n[2] simulation/two-galaxies-colliding\n```" };
    }
    return { text: UNSCRIPTED };
  };
}

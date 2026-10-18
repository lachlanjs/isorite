// The tutorial's model: what it answers to each prompt the tour fills in (`plugin/tour.ts`), as the agent in
// OpenCode and as Iso in the isorite server, both pointed at it. Anything else is answered once, plainly.

import { join } from "node:path";
import { PROMPTS } from "../plugin/tour.ts";
import { lastAsked, type Reply, type Script } from "./scripted.ts";

export const UNSCRIPTED = "In this tutorial the model is scripted: it answers only what the tour asks. Pointed at a model of your own (ISORITE_GATEWAY_URL), isorite term answers anything.";

/** What the agent looks up when asked to check against the notes: the base, a search, a section, and a note the
 *  first rests on, reached along its link. */
export const LOOKS: Reply[] = [
  { tool: "brief_base", args: {} },
  { tool: "search_notes", args: { query: "mixing" } },
  { tool: "read_note", args: { id: "dmft/the-dmft-loop", section: "Mixing" } },
  { tool: "read_note", args: { id: "/dmft/self-consistency-condition.md" } },
];

const ANSWER = "Near the Mott transition the loop can swing between the metallic and the insulating solution, so replacing the self-energy outright each pass never settles. Your note on the loop says to mix `[1]`: keep part of the old self-energy.\n\n```isorite\n[1] dmft/the-dmft-loop § Mixing\n```";

/** The script, for the example base whose notes are in `notes`. */
export function tutorialScript(notes: string): Script {
  return (request) => {
    // OpenCode names the session from its first prompt.
    if (JSON.stringify(request.messages.filter((m) => m.role === "system")).includes("title generator")) return { text: "Why the loop does not converge" };
    // Iso, asked in place in the note view: its requests carry no edit tool, as OpenCode's do.
    if (!request.tools.includes("edit")) return { text: "Mixing half of the old self-energy damps the swing; Broyden's method goes further, adapting the weight from the passes before." };
    const asked = lastAsked(request).trim();
    // What the agent has done since the prompt: one tool result a step.
    const done = request.messages.slice(request.messages.findLastIndex((m) => m.role === "user")).filter((m) => m.role === "tool").length;
    if (asked.includes(PROMPTS.ask)) return LOOKS[done] ?? { text: ANSWER };
    if (asked.includes(PROMPTS.fix)) {
      const steps: Reply[] = [
        // OpenCode's own edit, on a note: made a proposal by the plugin.
        { tool: "edit", args: { path: join(notes, "dmft", "the-dmft-loop.md"), oldString: "Keep part of the old self-energy:", newString: "Keep part of the old self-energy, half of it to begin with:" } },
        { tool: "propose_note_write", args: { note: "dmft/broyden-mixing.md", content: "---\ntype: Concept\ntitle: Broyden mixing\n---\n\nAdapts the mixing weight each pass, from the passes before.\n" } },
        // And a file of code, which is OpenCode's own business.
        { tool: "write", args: { path: "mixing.py", content: "MIX = 0.5  # of the new self-energy, each pass\n" } },
      ];
      return steps[done] ?? { text: "Done. The change to your note on the loop, and a new note on Broyden mixing, wait for you; mixing.py is written." };
    }
    return { text: UNSCRIPTED };
  };
}

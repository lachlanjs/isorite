// The notes an answer rests on, as the agent is asked to end an answer: a fenced block in the `isorite` language,
// a line a source, `[1] integrators/leapfrog § Kick`. The plugin draws them as the board does (`[1] the dmft loop
// § mixing`), and counts the notes they name as used.

/** What the agent is told, in the system prompt, about citing notes. */
export const CITING = "When your answer rests on notes of the knowledge base, cite each in your text as `[1]`, `[2]`, in backticks, and end the answer with a fenced code block in the language isorite holding a line a source: [1] the note's path, and § the section when you read one. For example:\n```isorite\n[1] integrators/leapfrog\n[2] physics/energy-conservation\n```";

export interface Source { n: string; note: string; section?: string }

/** The sources a block names, each with its number, its note (as an id, without a leading / or .md) and section. */
export function parseSources(block: string): Source[] {
  return block.split("\n").flatMap((line) => {
    const m = /^\s*\[(\d+)\]\s+([^§\s]+)\s*(?:§\s*(.*?))?\s*$/.exec(line);
    if (!m) return [];
    const note = m[2]!.replace(/^\/+/, "").replace(/\.md$/i, "");
    return [{ n: m[1]!, note, ...(m[3] ? { section: m[3] } : {}) }];
  });
}

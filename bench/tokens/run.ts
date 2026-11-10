// Static token-cost bench for isorite's agent harness: what is sent to the model for the system prompt, each tool
// definition, and the tool results of five fixed tasks on packages/example. Run: node bench/tokens/run.ts [--json]
// Tokens are estimated as chars/4 (no tokenizer is installed; pi uses the same estimate). Real BPE counts for English
// prose are ~10% higher; for JSON schemas and code, ~15-25% higher. Ratios between variants are what matter.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Engine, MemoryFiles } from "../../packages/engine/src/index.ts";
import { NodeFiles } from "../../packages/server/src/nodefiles.ts";
import { INSTRUCTIONS } from "../../packages/server/src/mcp-http.ts";
import { slimLook, slimTools } from "../../packages/server/src/pi/slim.ts";
import { INSTRUCTIONS_0_21_6 } from "./before.ts";
import { baseline } from "./baselines.ts";

export const tok = (s: string): number => Math.ceil(s.length / 4);
const here = dirname(fileURLToPath(import.meta.url));
const notes = join(here, "../../packages/example/notes");
const clock = { now: () => Date.parse("2026-10-18T09:00:00Z") };
const engine = await Engine.open({ notes: new NodeFiles(notes), own: new MemoryFiles(), clock, device: "bench", name: "example" });

const MODE = process.argv.includes("--before") ? "before" : "after";
const SYSTEM = MODE === "before" ? INSTRUCTIONS_0_21_6 : INSTRUCTIONS;
// What a provider receives for a tool: name, description and the schema, as compact JSON.
const defs = MODE === "before" ? await engine.agentTools() : slimTools(await engine.agentTools());
const toolTokens = defs.map((d) => ({ name: d.function.name, tokens: tok(JSON.stringify({ name: d.function.name, description: d.function.description, input_schema: d.function.parameters })) }));
const fixed = tok(SYSTEM) + toolTokens.reduce((n, t) => n + t.tokens, 0);

const raw = (tool: string, args: Record<string, unknown>) => engine.agentLook({ agent: "bench", session: "s", tool, args, asked: "bench" });
const look = async (tool: string, args: Record<string, unknown>) => (MODE === "before" ? await raw(tool, args) : await slimLook(raw, tool, args)).text;
const call = (tool: string, args: Record<string, unknown>) => tok(JSON.stringify({ name: tool, input: args }));

// Each task is the minimal tool-call sequence; its cost is the sum of calls made and results read. A write task
// also asks for the writing part of the brief where the tools offer it, as the system prompt tells the model to.
type Step = [string, Record<string, unknown>];
const brief = (part?: string): Step[] => (part && MODE === "before" ? [] : [["brief_base", part ? { part } : {}]]);
const TASKS: Record<string, Step[]> = {
  "find the note about softening": [...brief(), ["search_notes", { query: "softening" }]],
  "summarise leapfrog": [...brief(), ["outline_note", { id: "integrators/leapfrog" }], ["read_note", { id: "integrators/leapfrog" }]],
  "what links to energy-conservation": [...brief(), ["outline_note", { id: "physics/energy-conservation" }]],
  "add a line to units": [...brief(), ...brief("writing"), ["read_note", { id: "physics/units" }], ["edit_note", { note: "physics/units", oldString: "## ", newString: "A new line.\n\n## " }]],
  "question needing 3 notes (why leapfrog conserves energy)": [...brief(), ["search_notes", { query: "leapfrog energy" }], ["read_note", { id: "integrators/leapfrog" }], ["read_note", { id: "integrators/symplectic-integrators" }], ["read_note", { id: "physics/energy-conservation" }]],
};

const out: { task: string; calls: number; results: number; total: number }[] = [];
for (const [task, steps] of Object.entries(TASKS)) {
  let calls = 0, results = 0;
  for (const [tool, args] of steps) {
    calls += call(tool, args);
    try { results += tok(await look(tool, args)); } catch (e) { results += tok((e as Error).message); }
  }
  out.push({ task, calls, results, total: calls + results });
}
if (process.argv.includes("--json")) console.log(JSON.stringify({ mode: MODE, system: tok(SYSTEM), tools: toolTokens, fixed, tasks: out }, null, 1));
else {
  console.log(`mode: ${MODE}\nsystem prompt: ${tok(SYSTEM)} tok`);
  for (const t of toolTokens) console.log(`  tool ${t.name.padEnd(16)} ${t.tokens}`);
  console.log(`fixed prefix (system + ${toolTokens.length} tools): ${fixed} tok\n`);
  for (const t of out) console.log(`${t.task.padEnd(58)} calls ${String(t.calls).padStart(4)}  results ${String(t.results).padStart(6)}  total ${String(t.total).padStart(6)}`);
  if (process.argv.includes("--baselines")) await baseline(tok);
}

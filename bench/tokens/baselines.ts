// Baselines: pi's stock coding agent (measured from node_modules, same estimator), and Claude Code (published figures).
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const notes = join(here, "../../packages/example/notes");

export async function baseline(tok: (s: string) => number): Promise<void> {
  const pkg = join(here, "../../node_modules/@earendil-works/pi-coding-agent");
  const { buildSystemPrompt } = await import(pathToFileURL(join(pkg, "dist/core/system-prompt.js")).href);
  const { createCodingToolDefinitions } = await import(pathToFileURL(join(pkg, "dist/core/tools/index.js")).href);
  const defs = createCodingToolDefinitions(notes) as unknown as { name: string; description: string; parameters: unknown; promptSnippet?: string; promptGuidelines?: string[] }[];
  const system: string = buildSystemPrompt({ cwd: notes, selectedTools: defs.map((d) => d.name), toolSnippets: Object.fromEntries(defs.map((d) => [d.name, d.promptSnippet ?? d.description])), toolGuidelines: Object.fromEntries(defs.map((d) => [d.name, d.promptGuidelines ?? []])) });
  const tools = defs.map((d) => tok(JSON.stringify({ name: d.name, description: d.description, input_schema: d.parameters })));
  console.log(`\npi stock coding agent (read, bash, edit, write): system ${tok(system)} + tools ${tools.reduce((a, b) => a + b, 0)} (${defs.map((d, i) => `${d.name} ${tools[i]}`).join(", ")}) = ${tok(system) + tools.reduce((a, b) => a + b, 0)} tok`);

  // The same tasks as a coding agent does them: shell and file reads, whole files, no index.
  const file = (p: string) => readFileSync(join(notes, p), "utf8");
  const all = readdirSync(notes, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".md"));
  const grep = (word: string) => all.filter((f) => new RegExp(word, "i").test(file(f))).map((f) => `${f}:${(file(f).split("\n").find((l) => new RegExp(word, "i").test(l)) ?? "").slice(0, 160)}`).join("\n");
  const bash = (cmd: string, out: string) => tok(JSON.stringify({ name: "bash", input: { command: cmd } })) + tok(out);
  const read = (p: string) => tok(JSON.stringify({ name: "read", input: { path: p } })) + tok(file(p));
  const tasks: Record<string, number> = {
    "find the note about softening": bash("grep -ril softening .", grep("softening")),
    "summarise leapfrog": read("integrators/leapfrog.md"),
    "what links to energy-conservation": bash("grep -rn 'energy-conservation' .", grep("energy-conservation")),
    "add a line to units": read("physics/units.md") + tok(JSON.stringify({ name: "edit", input: { path: "physics/units.md", edits: [{ oldText: "## ", newText: "A new line.\n\n## " }] } })) + 20,
    "question needing 3 notes": bash("grep -ril leapfrog .", grep("leapfrog")) + read("integrators/leapfrog.md") + read("integrators/symplectic-integrators.md") + read("physics/energy-conservation.md"),
  };
  console.log("pi stock, per task (calls + results, no knowledge of notes' structure; the system prompt and tools are extra):");
  for (const [t, n] of Object.entries(tasks)) console.log(`  ${t.padEnd(40)} ${n}`);
  console.log("\nClaude Code (not measured here; published/observed): system prompt ~2.5-3.5k tok, built-in tool schemas ~9-17k tok depending on version (Task, Bash, Edit, Read, Write, Grep, Glob, TodoWrite, WebFetch and others), before CLAUDE.md, MCP and skills.");
}

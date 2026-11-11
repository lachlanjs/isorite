// What the base's tools cost a model, trimmed where the engine's own text is more than a read needs (token efficiency,
// docs/research/token-efficiency.md). The engine's `agentTools` and `agentLook` stay whole, as tests and /api/agent/look
// use them; the two ways an agent is given the tools (pi's, and MCP) pass them through here.
//
// - brief_base answers with the base's map and the person's own instructions; how notes are kept and written, and how an
//   artifact is made, are asked for (`part`), since they are about 1,400 tokens an agent that only reads never uses.
// - A tool's description says once what the engine's text says twice.
// - A note read whole is cut where it would be taken for the model's window, with the way to read the rest.

import type { ToolDef } from "@isorite/engine";

/** The parts of the brief that are asked for, by the heading each begins with. */
const PARTS: Record<string, string[]> = {
  writing: ["# Their knowledge base", "# Keeping it well", "# Writing and teaching"],
  artifacts: ["# Artifacts"],
};
/** Paragraphs the engine appends to the brief without a heading of their own: they stay in whatever is asked. */
/** The brief's line on how to look: the system prompt says it already. */
const HOW_TO_LOOK = /^To look: search_notes by the words/;
const ALWAYS = [/^The person has switched off agents' changes/, /^Other knowledge bases lent to you/];
/** A note read whole, as text: past this it is cut. About 6,000 tokens. */
export const MAX_NOTE_CHARS = 24_000;

const SHORTER: Record<string, string> = {
  brief_base: "The base's islands (folders), and the person's instructions for it. Call it first, once. part=writing before writing or teaching; part=artifacts before making a page.",
  edit_note: "Replace oldString with newString in a note, as the edit tool does. Written at once under your name, marked for the person, who can undo it. Use this, never a file edit, for notes.",
  write_note: "Write a whole note at folder/name (lower case, hyphens), frontmatter (type, title) included: a new one, or one written anew. Written at once under your name, as edit_note.",
};

/** The tools as a model is given them. */
export function slimTools(defs: ToolDef[]): ToolDef[] {
  return defs.map((d) => {
    const f = d.function, description = SHORTER[f.name];
    if (f.name === "brief_base") {
      const parameters = f.parameters as { properties?: Record<string, unknown> };
      return { ...d, function: { ...f, description: description!, parameters: { ...parameters, properties: { ...parameters.properties, part: { type: "string", enum: ["writing", "artifacts", "all"] } } } } };
    }
    return description ? { ...d, function: { ...f, description } } : d;
  });
}

/** The brief as asked for: the map, and the person's instructions, unless a part is named. */
export function slimBrief(text: string, part: unknown): string {
  const paragraphs = text.split("\n\n");
  if (part === "all") return text;
  const asked = typeof part === "string" ? PARTS[part] : undefined;
  if (typeof part === "string" && !asked) return text;
  let section = "";
  const out: string[] = [];
  for (const p of paragraphs) {
    const heading = p.startsWith("# ") ? p.split("\n")[0]! : null;
    if (heading) section = heading;
    else if (ALWAYS.some((r) => r.test(p))) section = "";
    // A part asked for is those sections alone; otherwise the map, the instructions, and the rest not set aside.
    const aside = Object.values(PARTS).flat().some((h) => section.startsWith(h));
    const wanted = asked ? asked.some((h) => section.startsWith(h)) : !aside && !HOW_TO_LOOK.test(p);
    if (wanted) out.push(p);
  }
  if (asked) return out.join("\n\n");
  return out.join("\n\n") + "\n\n(part=writing: how notes are kept and written, and how to teach; part=artifacts: how a page is made.)";
}

/** A tool's answer as a model is given it. */
export function slimResult(tool: string, args: Record<string, unknown>, text: string): string {
  if (tool === "read_note" && text.length > MAX_NOTE_CHARS) {
    const cut = text.lastIndexOf("\n", MAX_NOTE_CHARS);
    return `${text.slice(0, cut > 0 ? cut : MAX_NOTE_CHARS)}\n\n[Cut here: ${text.length - Math.max(cut, 0)} more characters. outline_note lists the headings; read_note with section= reads one.]`;
  }
  void args;
  return text;
}

/** One look-up, through the engine, as a model is given it. */
export async function slimLook(look: (tool: string, args: Record<string, unknown>) => Promise<{ text: string }>, tool: string, args: Record<string, unknown>): Promise<{ text: string }> {
  const { part, ...rest } = args;
  const { text } = await look(tool, tool === "brief_base" ? rest : args);
  return { text: tool === "brief_base" ? slimBrief(text, part) : slimResult(tool, args, text) };
}

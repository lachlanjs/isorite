// What is pasted into an agent that isorite does not run (M36, step 3): the tray as a block of text that names what
// was chosen and tells the agent to read it through isorite's own tools. The agent can then find the notes, which a
// quoted passage alone cannot do (and which may have been edited since it was quoted). Pure, so it is easy to test.

import type { Part } from "./tray.svelte.ts";

const quote = (t: string): string => t.trim().split("\n").map((l) => `> ${l}`).join("\n");

/** The block for `parts`, or "" when there are none. `question` goes after it, if given. */
export function handoffText(parts: readonly Part[], question = ""): string {
  if (!parts.length) return "";
  const notes = parts.filter((p) => p.kind === "note");
  const folders = parts.filter((p) => p.kind === "folder");
  const passages = parts.filter((p): p is Extract<Part, { kind: "passage" }> => p.kind === "passage");
  const out = ["From my isorite knowledge base. Read what I name with the isorite tools (read_note, outline_note, search_notes), not from this message alone: the notes may have changed since I chose them."];
  if (notes.length) out.push(`Notes (read_note by id; outline_note first for a long one):\n${notes.map((p) => `- ${p.title} (${p.id})`).join("\n")}`);
  if (folders.length) out.push(`Islands (search_notes with "under" set to the island's path, or brief_base for the whole base):\n${folders.map((p) => `- ${p.title} (${p.id})`).join("\n")}`);
  if (passages.length) {
    out.push(`Passages I selected, quoted as they were when I chose them. Read the note for the current text before relying on a quote:\n\n${passages.map((p) => `From ${p.title} (${p.id}):\n${quote(p.text)}`).join("\n\n")}`);
  }
  if (question.trim()) out.push(question.trim());
  return out.join("\n\n");
}

// The Understanding note (M10): one for each note of the base, among isorite's own files at understanding/<note>.md.
// It holds Iso's reading of your understanding of the note, which Iso writes, and your scratchpad, which Iso does
// not write. There is no score: what it rests on is in the notes themselves.

export const UNDERSTANDING_PREFIX = "@understanding/", UNDERSTANDING_DIR = "understanding";
export const isUnderstandingId = (id: string): boolean => id.startsWith(UNDERSTANDING_PREFIX);
export const understandingId = (note: string): string => UNDERSTANDING_PREFIX + note;

const READING = "## Iso's reading", PAD = "## Scratchpad";

/** The two parts of an Understanding note's file. A file in another shape is read as all scratchpad. */
export function parseUnderstanding(text: string | null): { reading: string; scratchpad: string } {
  if (!text) return { reading: "", scratchpad: "" };
  const body = text.replace(/^---\n[\s\S]*?\n---\n/, "");
  const r = body.indexOf(READING), p = body.indexOf(PAD);
  if (r < 0 && p < 0) return { reading: "", scratchpad: body.trim() };
  const reading = r < 0 ? "" : body.slice(r + READING.length, p > r ? p : undefined).trim();
  const scratchpad = p < 0 ? "" : body.slice(p + PAD.length, r > p ? r : undefined).trim();
  return { reading, scratchpad };
}

/** An Understanding note's file, from its parts. */
export function understandingText(note: string, title: string, parts: { reading: string; scratchpad: string }): string {
  return `---\ntype: Understanding\ntitle: ${JSON.stringify(`Understanding · ${title}`)}\nof: ${note}\n---\n\n${READING}\n\n${parts.reading.trim()}\n\n${PAD}\n\n${parts.scratchpad.trim()}\n`;
}

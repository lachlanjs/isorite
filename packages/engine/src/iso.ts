// What Iso is told, for each form of request. The limit on where its text may
// go is not here: it is in the form (docs/architecture.md, section 4). These
// words only say what to write.

import { moments, pending, type Entry } from "@isorite/core";
import { ROUNDS } from "./loop.ts";
import type { Message, Tier } from "./provider.ts";

/** The point in the note where new text is asked for. Not part of the note. */
export const HERE = "⟦HERE⟧";

const WHO = `You are Iso, the companion in isorite, an app for understanding a subject by
writing it down. The person is writing a note in their own knowledge base: a
folder of Markdown notes with links between them. They have asked you for
something at one place in the note they have open.`;

const INSERT = `# What to write

- Reply with the text that goes at the point marked ${HERE} in their note, and
  nothing else. No preamble, no closing remark, no "here is", no mention of
  the mark. What you reply is laid into the note exactly as you write it, for
  them to keep, edit or remove.
- If they ask a question, the reply is still text for that point: answer it
  as prose that could stand in the note.
- Write as the note is written: its language, its notation, its level, its
  person. Plain words. Short: one to three paragraphs unless more is asked
  for. No heading unless one is asked for.
- Do not repeat what the note already says around the point.
- The base is theirs and may be small. Where it does not hold what is asked,
  write from what you know of the subject, and be exact. Never invent a note,
  a link or a quotation.`;

const FORMAT = `# How notes work here

- A link to a note is [its title](/its/path.md), with the path exactly as a
  tool or the note gave it. Link only to notes that exist. A link may say how
  this note stands to that one, as the link's title, in double quotes:
  [Entropy](/basics/entropy.md "requires").
  "requires": this note cannot be understood without that one;
  "uses": it relies on that one for a fact, an example or a proof;
  "see also": a pointer onward.
  Give a kind when it is clear which; a link with none counts as "uses".
- Maths is LaTeX between dollar signs: $p(x)$ in a line, and a displayed
  equation as a paragraph of its own, with $$ alone on the line before it
  and $$ alone on the line after.
- Ordinary Markdown otherwise. No HTML.`;

const LOOKUP = (rounds: number, meaning: boolean) => `# Looking things up

Before you reply you may look things up in their knowledge base with the
tools. Nothing has been looked up for you: below there is only the note.

- Look up only what the request needs. A request about wording needs nothing
  looked up: reply at once.
- For anything the base may already say, look first, so that what you write
  agrees with their notes and links to them. search_notes finds notes by
  their words; outline_note shows a note's headings and what it links to;
  read_note reads one section. Prefer one section to a whole note. Follow a
  note's links when what you need is one step on from it.${meaning ? `
- find_similar finds notes by meaning, in other words than theirs. It is
  second: use it when search_notes and the links of the notes in hand have
  not found what you need.` : ""}
- You may call several tools at once. You have ${rounds} rounds of looking up
  at most; then reply, with what you have.
- Say nothing between lookups: no "let me check". Only the reply is shown.`;

/** Roughly how many tokens a text is: four characters each, good to about a tenth. */
export const estimate = (text: string): number => Math.ceil(text.length / 4);

/** One part of what is sent, as the header's breakdown names it. */
export interface Part { name: "instructions and tools" | "study record" | "your prompts and Iso's answers" | "this note" | "linked notes"; detail: string; tokens: number }

/** This session's earlier requests in a note, as asked and as answered, with what became of each. */
export function conversation(entries: readonly Entry[], session: string): string {
  const open = new Set(pending(entries).map((p) => p.id));
  const fate = new Map(moments(entries).filter((m) => m.asked !== undefined).map((m) => [m.ids[0]!, m.what]));
  const out: string[] = [];
  for (const e of entries) {
    if (e.kind !== "proposal" || e.session !== session) continue;
    const text = e.form === "insert" ? e.text : e.blocks.map((b) => b.new).join("\n\n");
    const became = open.has(e.id) ? "It is still in the note, not yet kept." : fate.get(e.id) === "kept" ? "They kept it." : "They removed it.";
    out.push(`They asked: ${e.asked}\n\nYou wrote:\n\n${text}\n\n${became}`);
  }
  return out.join("\n\n---\n\n");
}

export interface Asked {
  tier: Tier;
  meaning: boolean;
  title: string;
  id: string;
  /** The note's text with the point marked. */
  marked: string;
  /** What Iso has offered in this note that is not kept yet, so it does not write it again. */
  unkept: string[];
  conversation: string;
  asked: string;
}

/** The messages for new text at a point, and what they hold, part by part. */
export function insertMessages(a: Asked): { messages: Message[]; parts: Part[] } {
  const system = [WHO, INSERT, FORMAT, LOOKUP(ROUNDS[a.tier], a.meaning)].join("\n\n");
  const note = `# Their note: ${a.title} (/${a.id}.md)\n\n${a.marked}`
    + (a.unkept.length ? `\n\n# Text you offered in this note that they have not kept yet\n\nIt is not part of the note. Do not write it again.\n\n${a.unkept.join("\n\n---\n\n")}` : "");
  const earlier = a.conversation ? `# Earlier in this session, in this note\n\n${a.conversation}` : "";
  const request = `# What they ask now\n\n${a.asked}`;
  return {
    messages: [
      // The instructions do not change within a session: a provider that caches is asked to keep them.
      { role: "system", content: [{ text: system, cache: true }] },
      { role: "user", content: [earlier, note, request].filter(Boolean).join("\n\n") },
    ],
    parts: [
      { name: "instructions and tools", detail: "", tokens: estimate(system) + 500 },
      { name: "study record", detail: "nothing yet", tokens: 0 },
      { name: "your prompts and Iso's answers", detail: "", tokens: estimate(earlier) },
      { name: "this note", detail: a.title, tokens: estimate(note) + estimate(request) },
      { name: "linked notes", detail: "", tokens: 0 },
    ],
  };
}

/** Iso's reply as the text of a proposal: what a model adds around it against its instructions is taken off. */
export function replyText(reply: string): string {
  let text = reply.replaceAll(HERE, "").replace(/^\s*\n/, "").trimEnd();
  // A reply wrapped whole in a Markdown fence.
  const fenced = /^```(?:markdown|md)?\n([\s\S]*)\n```$/.exec(text.trim());
  if (fenced) text = fenced[1]!;
  return text.trim();
}

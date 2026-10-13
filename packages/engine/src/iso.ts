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

/** The marks round the k-th paragraph they chose, counted from 1. Not part of the note. */
export const OPEN = (k: number): string => `⟦${k}⟧`, CLOSE = (k: number): string => `⟦/${k}⟧`;

const REWRITE = (n: number) => `# What to write

- They have marked ${n === 1 ? "one paragraph" : `${n} paragraphs`} of their note${n === 1 ? `, between ${OPEN(1)} and ${CLOSE(1)}` : `, each between a pair of marks: ${OPEN(1)} and ${CLOSE(1)}, ${OPEN(2)} and ${CLOSE(2)}, and so on`}.
  Rewrite ${n === 1 ? "it" : "them"} as they ask. Nothing else in the note can be changed, by you or by this request.
- Reply with each paragraph you change, whole, between its own marks:
  ${OPEN(1)}
  the paragraph as it should now read
  ${CLOSE(1)}
  Leave out a paragraph you would not change. To take a paragraph out of the
  note, give its marks with nothing between them.
- Only what is between the marks is read. No preamble, no explanation, no
  closing remark: they are thrown away.
- Change only what the request calls for. Everything else in a paragraph
  comes back exactly as it is: the same words, the same links, the same maths.
- A "paragraph" here is a block of the note: it may be a heading, a list, a
  displayed equation or a code block. Give back the same kind of block unless
  asked for another.
- Write as the note is written: its language, its notation, its level.
- The base is theirs and may be small. Where it does not hold what is asked,
  write from what you know of the subject, and be exact. Never invent a note,
  a link or a quotation.`;

const NOTE = `# What to write

- They have not asked for text at a place in a note. They have written a note
  *for you*: what they understand, what they do not, and what they want from
  you. It is not in their knowledge base. Write the note they ask for, to go
  into the base in its place.
- Reply with the note's text and nothing else: Markdown, with no frontmatter
  and no title line (the title is theirs, and is added). No preamble, no
  closing remark addressed to them.
- Write it as a note of theirs: their notation, their level, their language,
  plain words. As long as the matter needs and no longer. Headings only where
  the note is long enough to need them.
- Where their own account is right, build on it in their terms. Where it is
  wrong or incomplete and they ask to be told, say so in the note, plainly,
  at the place it matters.
- Rest it on the notes they linked: read what you need of them, agree with
  them, and link to them where the new note leans on them.
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

/** One earlier request of this session: what was asked, what Iso wrote, and what became of it. */
export interface Exchange { id: string; note: string; text: string }

/** This session's requests in one note's journal, after the entry `since` (the conversation was cleared there). */
export function exchanges(note: string, title: string, entries: readonly Entry[], session: string, since = ""): Exchange[] {
  const open = new Set(pending(entries).map((p) => p.id));
  const fate = new Map(moments(entries).filter((m) => m.asked !== undefined).map((m) => [m.ids[0]!, m.what]));
  const out: Exchange[] = [];
  for (const e of entries) {
    if (e.kind !== "proposal" || e.session !== session || e.id <= since) continue;
    const text = e.form === "insert" ? e.text : e.blocks.map((b) => b.new).filter(Boolean).join("\n\n");
    const became = open.has(e.id) ? "It is still waiting in the note, not yet kept." : fate.get(e.id) === "kept" ? "They kept it." : "They removed it.";
    out.push({ id: e.id, note, text: `In ${title} (/${note}.md) they asked${e.form === "rewrite" ? ", of paragraphs they chose" : ""}: ${e.asked}\n\nYou wrote:\n\n${text}\n\n${became}` });
  }
  return out;
}

/** The most of the conversation and of the note that is sent, in tokens. Past these, the oldest exchanges and the
 *  parts of the note furthest from the place asked about are left out, and Iso is told so. */
export const CONVERSATION_BUDGET = 6000, NOTE_BUDGET = 12000;
/** An exchange older than the last few is cut to this many characters of what Iso wrote. */
const OLD_EXCHANGE = 400;

/** The session's exchanges as they are sent: in order, the newest whole, older ones shortened, the oldest left
 *  out when there is no room. */
export function conversation(all: readonly Exchange[], budget = CONVERSATION_BUDGET): string {
  const sorted = [...all].sort((a, b) => (a.id < b.id ? -1 : 1));
  const kept: string[] = [];
  let room = budget;
  const shortened = (text: string): string => {
    const at = text.indexOf("You wrote:\n\n") + 12, end = text.lastIndexOf("\n\n");
    return end - at > OLD_EXCHANGE ? text.slice(0, at + OLD_EXCHANGE).trimEnd() + " […]" + text.slice(end) : text;
  };
  for (let k = sorted.length - 1; k >= 0; k--) {
    // The last three whole where there is room; anything older, or too long for what room is left, shortened.
    let text = sorted[k]!.text;
    if (sorted.length - 1 - k >= 3 || estimate(text) > room) text = shortened(text);
    if (estimate(text) > room) { kept.unshift(`[${k + 1} earlier ${k === 0 ? "exchange" : "exchanges"} of this session left out for length.]`); break; }
    room -= estimate(text);
    kept.unshift(text);
  }
  return kept.join("\n\n---\n\n");
}

/** A long note cut to fit: the lines round the places that matter are kept whole, the headings everywhere, and
 *  each stretch left out is said to be. `keep` is the lines (from 0) that must be there. */
export function windowed(lines: readonly string[], keep: readonly number[], budget = NOTE_BUDGET): string {
  const whole = lines.join("\n");
  if (estimate(whole) <= budget || !keep.length) return whole;
  const shown = new Set<number>(keep);
  let used = keep.reduce((n, k) => n + estimate(lines[k] ?? "") + 1, 0);
  // Outwards from the kept lines, a line at a time on each side, until the budget is spent.
  let lo = Math.min(...keep) - 1, hi = Math.max(...keep) + 1;
  for (let k = Math.min(...keep); k <= Math.max(...keep); k++) if (!shown.has(k)) { shown.add(k); used += estimate(lines[k]!) + 1; }
  while (used < budget && (lo >= 0 || hi < lines.length)) {
    for (const k of [hi, lo]) {
      if (k < 0 || k >= lines.length || used >= budget) continue;
      shown.add(k); used += estimate(lines[k]!) + 1;
    }
    lo--; hi++;
  }
  const out: string[] = [];
  let skipped = 0;
  // The frontmatter is always sent: the note's title and what it says of itself.
  const front = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
  const flush = () => { if (skipped) out.push(`[… ${skipped} ${skipped === 1 ? "line" : "lines"} of the note not shown …]`); skipped = 0; };
  for (const [k, line] of lines.entries()) {
    if (shown.has(k) || /^#{1,6}\s/.test(line) || k <= front) { flush(); out.push(line); }
    else skipped++;
  }
  flush();
  return out.join("\n");
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
  /** How many exchanges the conversation holds, and what Iso read for them: for the breakdown. */
  moments?: number;
  linked?: { notes: number; tokens: number };
}

/** The messages for new text at a point, and what they hold, part by part. */
export function insertMessages(a: Asked): { messages: Message[]; parts: Part[] } {
  const system = [WHO, INSERT, FORMAT, LOOKUP(ROUNDS[a.tier], a.meaning)].join("\n\n");
  const note = `# Their note: ${a.title} (/${a.id}.md)\n\n${a.marked}`
    + (a.unkept.length ? `\n\n# Text you offered in this note that they have not kept yet\n\nIt is not part of the note. Do not write it again.\n\n${a.unkept.join("\n\n---\n\n")}` : "");
  const earlier = a.conversation ? `# Earlier in this session\n\n${a.conversation}` : "";
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
      { name: "your prompts and Iso's answers", detail: a.moments ? `${a.moments} ${a.moments === 1 ? "moment" : "moments"}` : "", tokens: estimate(earlier) },
      { name: "this note", detail: a.title, tokens: estimate(note) + estimate(request) },
      { name: "linked notes", detail: a.linked?.notes ? `${a.linked.notes} read` : "", tokens: a.linked?.tokens ?? 0 },
    ],
  };
}

export interface AskedRewrite extends Omit<Asked, "marked"> {
  /** The note's text with each chosen paragraph between its marks. */
  marked: string;
  count: number;
}

/** The messages for a rewrite of chosen paragraphs. */
export function rewriteMessages(a: AskedRewrite): { messages: Message[]; parts: Part[] } {
  const system = [WHO, REWRITE(a.count), FORMAT, LOOKUP(ROUNDS[a.tier], a.meaning)].join("\n\n");
  const note = `# Their note: ${a.title} (/${a.id}.md)\n\n${a.marked}`;
  const earlier = a.conversation ? `# Earlier in this session\n\n${a.conversation}` : "";
  const request = `# What they ask now, of the marked ${a.count === 1 ? "paragraph" : "paragraphs"}\n\n${a.asked}`;
  return {
    messages: [{ role: "system", content: [{ text: system, cache: true }] }, { role: "user", content: [earlier, note, request].filter(Boolean).join("\n\n") }],
    parts: [
      { name: "instructions and tools", detail: "", tokens: estimate(system) + 500 },
      { name: "study record", detail: "nothing yet", tokens: 0 },
      { name: "your prompts and Iso's answers", detail: a.moments ? `${a.moments} ${a.moments === 1 ? "moment" : "moments"}` : "", tokens: estimate(earlier) },
      { name: "this note", detail: a.title, tokens: estimate(note) + estimate(request) },
      { name: "linked notes", detail: a.linked?.notes ? `${a.linked.notes} read` : "", tokens: a.linked?.tokens ?? 0 },
    ],
  };
}

/** A rewrite's reply, taken apart: the new text for each of the `count` paragraphs (null where it left one as it
 *  was), and whether it wrote anything outside the marks, which is never used. The limit on what a rewrite can
 *  touch is here, not in what it was told. */
export function parseRewrite(reply: string, count: number): { blocks: (string | null)[]; outside: boolean } {
  const blocks: (string | null)[] = Array.from({ length: count }, () => null);
  let rest = reply, found = 0;
  for (const m of reply.matchAll(/⟦(\d+)⟧[ \t]*\n?([\s\S]*?)\n?[ \t]*⟦\/\1⟧/g)) {
    const k = Number(m[1]) - 1;
    rest = rest.replace(m[0], "");
    if (k < 0 || k >= count) continue; // marks for a paragraph that was not chosen
    blocks[k] = m[2]!.replace(/^\n+|\s+$/g, "");
    found++;
  }
  // One paragraph, and a reply with no marks at all: the reply is that paragraph.
  if (!found && count === 1 && !/⟦\/?\d+⟧/.test(reply) && reply.trim()) return { blocks: [replyText(reply)], outside: false };
  return { blocks, outside: rest.replace(/⟦\/?\d+⟧/g, "").trim() !== "" };
}

/** The most of the notes linked from a note for Iso that is sent with it, in tokens: the rest it reads with its tools. */
export const LINKED_BUDGET = 8000;

export interface AskedNote {
  tier: Tier;
  meaning: boolean;
  title: string;
  /** What they wrote for Iso. */
  body: string;
  /** The notes it links to, as far as there was room: each with its text. */
  linked: { id: string; title: string; text: string }[];
  conversation: string;
  moments?: number;
}

/** The messages for a note written for Iso. */
export function noteMessages(a: AskedNote): { messages: Message[]; parts: Part[] } {
  const system = [WHO.replace("They have asked you for\nsomething at one place in the note they have open.", "This time they have written to you at length."), NOTE, FORMAT, LOOKUP(ROUNDS[a.tier], a.meaning).replace("below there is only the note.", "below there is what they wrote, and the notes they linked.")].join("\n\n");
  const linked = a.linked.length ? `# The notes they linked\n\n${a.linked.map((l) => `## ${l.title} (/${l.id}.md)\n\n${l.text}`).join("\n\n")}` : "";
  const earlier = a.conversation ? `# Earlier in this session\n\n${a.conversation}` : "";
  const note = `# What they wrote for you, under the title "${a.title}"\n\n${a.body}`;
  return {
    messages: [{ role: "system", content: [{ text: system, cache: true }] }, { role: "user", content: [earlier, linked, note].filter(Boolean).join("\n\n") }],
    parts: [
      { name: "instructions and tools", detail: "", tokens: estimate(system) + 500 },
      { name: "study record", detail: "nothing yet", tokens: 0 },
      { name: "your prompts and Iso's answers", detail: a.moments ? `${a.moments} ${a.moments === 1 ? "moment" : "moments"}` : "", tokens: estimate(earlier) },
      { name: "this note", detail: a.title, tokens: estimate(note) },
      { name: "linked notes", detail: a.linked.length ? `${a.linked.length} sent` : "", tokens: estimate(linked) },
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

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

/** The marks round the k-th passage they chose, counted from 1, and round Iso's word on what it changed. Not part of the note. */
export const OPEN = (k: number): string => `⟦${k}⟧`, CLOSE = (k: number): string => `⟦/${k}⟧`;
export const SAY_OPEN = "⟦note⟧", SAY_CLOSE = "⟦/note⟧";

const REWRITE = (n: number) => `# What to write

- They have marked ${n === 1 ? "one passage" : `${n} passages`} of their note${n === 1 ? `, between ${OPEN(1)} and ${CLOSE(1)}` : `, each between a pair of marks: ${OPEN(1)} and ${CLOSE(1)}, ${OPEN(2)} and ${CLOSE(2)}, and so on`}.
  A passage is whatever they chose: a few words inside a sentence, a
  sentence, a formula, a code block, several paragraphs. Rewrite ${n === 1 ? "it" : "them"} as they
  ask. Nothing else in the note can be changed, by you or by this request.
- Reply with each passage you change, between its own marks:
  ${OPEN(1)}the passage as it should now read${CLOSE(1)}
  What you give is put exactly where the old passage was, between the same
  neighbours. So give only what was between the marks, rewritten: not the
  words before or after it, and no quotation marks or labels round it.
  Leave out a passage you would not change. To take a passage out of the
  note, give its marks with nothing between them.
- After the passages, between ${SAY_OPEN} and ${SAY_CLOSE}, say to them in one to
  three plain sentences what you changed and why, or why you changed
  nothing. They read this beside the note and may keep it or not. If they
  asked something the passages do not answer, answer it here.
- Nothing outside these marks is read.
- Change only what the request calls for. Everything else in a passage comes
  back exactly as it is: the same words, the same links, the same maths.
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

/** How notes are written, for any request that writes or quotes them. */
export const FORMAT_RULES = FORMAT;

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
export interface Part { name: "instructions and tools" | "your prompts and Iso's answers" | "this note" | "linked notes" | "earlier in this conversation" | "what you gave" | "your understanding" | "code links broken" | "their instructions" | "notes Iso read" | "your message"; detail: string; tokens: number }

/** One earlier request of this session: what was asked, what Iso wrote, and what became of it. */
export interface Exchange { id: string; note: string; text: string }

/** This session's requests in one note's journal, after the entry `since` (the conversation was cleared there). */
export function exchanges(note: string, title: string, entries: readonly Entry[], session: string, since = ""): Exchange[] {
  const open = new Set(pending(entries).map((p) => p.id));
  const fate = new Map(moments(entries).filter((m) => m.asked !== undefined).map((m) => [m.ids[0]!, m.what]));
  const out: Exchange[] = [];
  for (const e of entries) {
    if (e.kind !== "proposal" || e.session !== session || e.id <= since) continue;
    const text = e.form === "insert" ? e.text : e.regions.map((r) => `${r.old.text.trim()}\n→ ${r.new.trim() || "(taken out)"}`).join("\n\n");
    const became = open.has(e.id) ? "It is still waiting in the note, not yet kept." : fate.get(e.id) === "kept" ? "They kept it." : "They removed it.";
    out.push({ id: e.id, note, text: `In ${title} (/${note}.md) they asked${e.form === "rewrite" ? ", of passages they chose" : ""}: ${e.asked}\n\nYou wrote:\n\n${text}\n\n${became}` });
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
  /** How many exchanges the conversation holds: for the breakdown. */
  moments?: number;
  /** The notes this note links to that are sent with it (I3), as `linkedSection` writes them. */
  linked?: { id: string; title: string; text: string }[];
  /** False: Iso has no tools this time, and answers from what is sent. */
  lookup?: boolean;
}

/** The notes a note links to, as they are sent with a request in it. */
export function linkedSection(linked: readonly { id: string; title: string; text: string }[], intro = "The notes this note links to"): string {
  return linked.length ? `# ${intro}\n\n${linked.map((l) => `## ${l.title} (/${l.id}.md)\n\n${l.text}`).join("\n\n")}` : "";
}

const NO_LOOKUP = `# Looking things up

You have no tools this time: they chose what you are sent. Answer from it, and
say plainly what you would need to look up to say more.`;

/** The messages for new text at a point, and what they hold, part by part. */
export function insertMessages(a: Asked): { messages: Message[]; parts: Part[] } {
  const system = [WHO, INSERT, FORMAT, a.lookup === false ? NO_LOOKUP : looked(a)].join("\n\n");
  const linked = linkedSection(a.linked ?? []);
  const note = `# Their note: ${a.title} (/${a.id}.md)\n\n${a.marked}`
    + (a.unkept.length ? `\n\n# Text you offered in this note that they have not kept yet\n\nIt is not part of the note. Do not write it again.\n\n${a.unkept.join("\n\n---\n\n")}` : "");
  const earlier = a.conversation ? `# Earlier in this session\n\n${a.conversation}` : "";
  const request = `# What they ask now\n\n${a.asked}`;
  return {
    messages: [
      // The instructions do not change within a session: a provider that caches is asked to keep them.
      { role: "system", content: [{ text: system, cache: true }] },
      { role: "user", content: [earlier, linked, note, request].filter(Boolean).join("\n\n") },
    ],
    parts: inPlaceParts(a, system, earlier, linked, note, request),
  };
}

/** The look-up instructions for a request in place, saying what is sent below it. */
const looked = (a: Asked): string => LOOKUP(ROUNDS[a.tier], a.meaning).replace("below there is only the note.", a.linked?.length ? "below there is the note, and\nthe notes it links to that they chose to send." : "below there is only the note.");

function inPlaceParts(a: Asked, system: string, earlier: string, linked: string, note: string, request: string): Part[] {
  return [
    { name: "instructions and tools", detail: a.lookup === false ? "no tools" : "", tokens: estimate(system) + (a.lookup === false ? 0 : 500) },
    { name: "your prompts and Iso's answers", detail: a.moments ? `${a.moments} ${a.moments === 1 ? "moment" : "moments"}` : "", tokens: estimate(earlier) },
    { name: "this note", detail: a.title, tokens: estimate(note) + estimate(request) },
    { name: "linked notes", detail: a.linked?.length ? `${a.linked.length} sent` : "", tokens: estimate(linked) },
  ];
}

export interface AskedRewrite extends Omit<Asked, "marked"> {
  /** The note's text with each chosen passage between its marks. */
  marked: string;
  count: number;
}

/** The messages for a rewrite of chosen paragraphs. */
export function rewriteMessages(a: AskedRewrite): { messages: Message[]; parts: Part[] } {
  const system = [WHO, REWRITE(a.count), FORMAT, a.lookup === false ? NO_LOOKUP : looked(a)].join("\n\n");
  const linked = linkedSection(a.linked ?? []);
  const note = `# Their note: ${a.title} (/${a.id}.md)\n\n${a.marked}`;
  const earlier = a.conversation ? `# Earlier in this session\n\n${a.conversation}` : "";
  const request = `# What they ask now, of the marked ${a.count === 1 ? "passage" : "passages"}\n\n${a.asked}`;
  return {
    messages: [{ role: "system", content: [{ text: system, cache: true }] }, { role: "user", content: [earlier, linked, note, request].filter(Boolean).join("\n\n") }],
    parts: inPlaceParts(a, system, earlier, linked, note, request),
  };
}

/** A rewrite's reply, taken apart: the new text for each of the `count` passages (null where it left one as it
 *  was), what it says about them, and whether it wrote anything outside the marks, which is never used. The limit
 *  on what a rewrite can touch is here, not in what it was told. */
export function parseRewrite(reply: string, count: number): { regions: (string | null)[]; say: string; outside: boolean } {
  const regions: (string | null)[] = Array.from({ length: count }, () => null);
  let rest = reply, found = 0, say = "";
  const said = /⟦note⟧([\s\S]*?)(?:⟦\/note⟧|$)/.exec(reply);
  if (said) { say = said[1]!.trim(); rest = rest.replace(said[0], ""); }
  for (const m of rest.matchAll(/⟦(\d+)⟧([\s\S]*?)⟦\/\1⟧/g)) {
    const k = Number(m[1]) - 1;
    rest = rest.replace(m[0], "");
    if (k < 0 || k >= count) continue; // marks for a passage that was not chosen
    regions[k] = m[2]!;
    found++;
  }
  // One passage, and a reply with no marks at all: the reply is that passage.
  if (!found && !said && count === 1 && !/⟦\/?\w+⟧/.test(reply) && reply.trim()) return { regions: [replyText(reply)], say: "", outside: false };
  return { regions, say, outside: rest.replace(/⟦\/?\w+⟧/g, "").trim() !== "" };
}

/** A passage's new text, set between the same neighbours as the old: it keeps the old one's space and line
 *  breaks at either end, whatever the model put round what it wrote. An empty one takes the passage out. */
export function fitted(old: string, text: string): string {
  const core = text.trim();
  if (!core) return "";
  return /^\s*/.exec(old)![0] + core + /\s*$/.exec(old)![0];
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

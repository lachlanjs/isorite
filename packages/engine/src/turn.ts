// A conversation with Iso in its own pane (M10): what a turn is, how it is kept, and what Iso is told in each mode.
// The conversation is kept in .isorite/, one file each, `conversations/<id>.jsonl`, a line per turn, per thing
// that happened in it and per ending, only ever added to, like a journal. What Iso changes in a note is in that
// note's journal; the conversation names the entry.

import type { Cost } from "@isorite/core";
import { FORMAT_RULES, estimate, type Exchange, type Part } from "./iso.ts";
import { ROUNDS } from "./loop.ts";
import type { Step } from "./lookup.ts";
import type { Message, Tier, ToolDef } from "./provider.ts";

/** What Iso may do (M12: worked out in the app from the switches in Iso's pane): read only, change the notes, or
 *  change and run the project, which is the terminal's (M11). Conversations from before M12 may name a fourth,
 *  "understand"; it is read as ask. */
export const MODES = ["ask", "write", "build"] as const;
export type Mode = (typeof MODES)[number];

/** Something you gave Iso: a note, a folder, or a passage of a note. */
export type Given =
  | { kind: "note"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "passage"; id: string; text: string }
  /** The note's Understanding note: Iso's reading of you. Given, Iso asks before it explains, and may rewrite it. */
  | { kind: "understanding"; id: string };

/** One thing that happened in a turn, in order. */
export type TurnItem =
  /** What Iso said. Kept whole when the turn ends; streamed as `iso-text` while it is written. */
  | { kind: "text"; text: string }
  /** Something it looked up. */
  | { kind: "look"; step: Step }
  /** A note it changed: the entry in the note's journal, and how many lines came and went. */
  | { kind: "change"; note: string; entry: string; why: "edit" | "create" | "move" | "delete" | "restore"; added: number; removed: number; to?: string; title: string }
  /** It asks before doing something; `answer` is yours once given. */
  | { kind: "permission"; id: string; tool: string; note: string; what: string; answer?: Decision }
  /** A note it wants you to look at. */
  | { kind: "point"; note: string; why: string }
  /** You undid the turn's changes: the notes put back, and those that had changed since and were left. */
  | { kind: "undone"; notes: string[]; left: string[] }
  /** A question Iso asks back (M12), about notes of the base: a question note once `made`, by Iso where it may
   *  change the notes, or by you from the turn. */
  | { kind: "question"; id: string; title: string; text: string; about: string[]; made?: string }
  /** Your own answers, joined by Iso into a remark for a note (M12): yours once you insert it (`taken`). */
  | { kind: "offer"; id: string; note: string; text: string; taken?: boolean };

const ITEMS: readonly string[] = ["text", "look", "change", "permission", "point", "undone", "question", "offer"];

export type Decision = "once" | "always" | "reject";

export interface Turn {
  id: string;
  conversation: string;
  at: string;
  /** The session it belongs to, as journal entries do: what it cost is the session's. */
  session?: string;
  mode: Mode;
  asked: string;
  given: Given[];
  tier: Tier;
  items: TurnItem[];
  state: "running" | "done" | "stopped" | "failed";
  message?: string;
  cost?: Cost;
}

/** One line of a conversation's file. */
export type TurnLine =
  | ({ kind: "turn" } & Omit<Turn, "items" | "state" | "message" | "cost">)
  | { kind: "item"; turn: string; item: TurnItem }
  | { kind: "answer"; turn: string; permission: string; decision: Decision }
  /** A question made a note, or an offer inserted, by you. */
  | { kind: "taken"; turn: string; item: string; note: string }
  | { kind: "end"; turn: string; state: Exclude<Turn["state"], "running">; message?: string; cost?: Cost };

export const CONVERSATIONS_DIR = "conversations";
export const conversationPath = (id: string): string => `${CONVERSATIONS_DIR}/${id}.jsonl`;

/** A conversation's turns from its file, oldest first. A line that cannot be read is passed over. */
export function readTurns(text: string): Turn[] {
  const turns = new Map<string, Turn>();
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let line: TurnLine;
    try { line = JSON.parse(raw) as TurnLine; } catch { continue; }
    if (line.kind === "turn") {
      const { kind: _, ...t } = line;
      // Understand mode, before M12, could change nothing in the notes: as Ask mode now.
      turns.set(t.id, { ...t, mode: (MODES as readonly string[]).includes(t.mode) ? t.mode : "ask", items: [], state: "running" });
      continue;
    }
    const t = turns.get(line.turn);
    if (!t) continue;
    // Items of kinds there are no longer (what Understand mode recorded, before M12) are passed over.
    if (line.kind === "item") { if (ITEMS.includes(line.item.kind)) t.items.push(line.item); }
    else if (line.kind === "answer") { for (const i of t.items) if (i.kind === "permission" && i.id === line.permission) i.answer = line.decision; }
    else if (line.kind === "taken") { for (const i of t.items) if (i.kind === "question" && i.id === line.item) i.made = line.note; else if (i.kind === "offer" && i.id === line.item) i.taken = true; }
    else { t.state = line.state; if (line.message) t.message = line.message; if (line.cost) t.cost = line.cost; }
  }
  // A turn never ended (the program stopped while Iso worked) was stopped.
  return [...turns.values()].map((t) => (t.state === "running" ? { ...t, state: "stopped" as const } : t)).sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ------------------------------------------------------------ what Iso is told

const WHO = `You are Iso, the companion in isorite, an app for understanding a subject by
writing it down. The person keeps a knowledge base: a folder of Markdown notes
with links between them. They are talking with you in isorite's Iso pane,
beside their notes and the Atlas, the map of their base. What you look up and
what you change is shown to them there as you do it.`;

/** What isorite is, as the notes on disk have it (docs/format.md). The example is loaded by core in a test, so
 *  what Iso is told stays what isorite reads. */
export const ISORITE = `# Their knowledge base

- A note is a Markdown file with frontmatter: \`type\` (Concept, Question or
  Problem), \`title\`, and a \`description\` of one line. Its id is its path
  without .md, as basics/entropy, and it is linked as /basics/entropy.md.
- A link says what it is by its title: "requires" (it cannot be understood
  without the other), "uses" (it draws on it), "see also". A link with no title
  is "uses". The Atlas draws the base from these links.
- A question note is an open question, \`about\` the notes it asks of. A
  problem note is practice that \`uses\` notes. Theirs alone to mark:
  \`resolved\` or \`solved\`, with the day. \`[[!name]]\` alone on a line
  embeds one in a note.
- Every change you make is marked as yours, in the note's history, and they
  can undo it.

For example, a question note (made up, not one of theirs):

\`\`\`markdown
---
type: Question
title: Why is entropy largest when all outcomes are equally likely?
about: [basics/entropy]
---

It follows from [surprise](/basics/surprise.md "requires"), but how?
\`\`\``;

/** How a knowledge base is kept well: what Iso does in it, and suggests. */
export const PRACTICE = `# Keeping it well

- One idea a note, with a title that names the idea and a description that
  says it in a line.
- Before you write a note, look for one that holds the idea already, by its
  words and its headings. If a note, or a section of one, says it, extend that
  note or point them to it, and say why. Make a second note only if they ask
  for it after that.
- A new note goes in the folder of the notes beside it, and links what it rests
  on with "requires" and what it draws on with "uses".
- A note that holds two ideas, or two that hold one, is theirs to split or
  merge: suggest it, do not do it unasked.
- An open question marks where their understanding stops. Leave it open.`;

/** How Iso helps them learn, in every mode. */
export const LEARNING = `# Their learning

- Their notes are in their words. Put no words in them they did not ask for.
- Explain in their notation, at the level of their notes.
- When they ask you to explain or teach something, find out where they stand
  first: reply with one short question about it, in a few lines at most, and
  stop. Explain once they have answered. When they ask for a fact, a check or
  a change, just answer.
- Prefer a question back, or a problem to try, to a summary.
- Check a solution; never solve it for them.`;

const ASK = `# Ask mode: what you may do

You read their notes and answer. You cannot change anything in this mode: no
note, no folder.

- Answer what they ask, in plain prose. Short: a few sentences to a few
  paragraphs, unless more is asked for. Markdown and maths are shown as they
  are in their notes.
- Rest on their notes where the base says something: look first, and link to
  the notes you used, so they can open them. Where the base does not hold what
  is asked, answer from what you know of the subject, exactly, and say that
  their notes do not cover it.
- When one of their notes would help them and they may not know it, point it
  out with point_to_note. Use it sparingly: one or two notes.
- Never invent a note, a link or a quotation.`;

const WRITE = `# Write mode: what you may do

You may change their knowledge base: edit notes, make new ones, move them and
delete them. What you change goes into their notes at once. They see every
change marked as yours, and can undo it.

- Do what they ask, and only that. Change the least that does it: edit the
  passage that needs it with edit_note, not the whole note. Keep their words,
  links, maths and voice wherever the request does not call for a change.
- Look before you write: read the part of the note you change, and the notes
  it rests on, so what you write agrees with the base and links to it.
- A new note (write_note) is written as one of theirs: frontmatter with type
  and title, their notation, their level, plain words, linked to the notes it
  rests on.
- Moving or deleting a note is asked of them before it happens. Do it only
  when they asked for it.
- When you are done, say in a sentence or two what you changed and why. Do not
  repeat the text you wrote: they see it in the note.
- Never invent a note, a link or a quotation.`;

const UNDERSTANDING = `# Their understanding

Below, for each note in hand, is your reading of their understanding of it so
far, from its Understanding note.

- Start from where they are: do not explain what they have shown they know; go
  to what they have not yet shown, and ask about that first.
- At the end of a conversation about a note, or when your reading of them has
  changed, rewrite your reading with write_understanding: a few plain
  sentences on what they can do with the note and what they have not yet
  shown. It is theirs to read. Rest each sentence on evidence they can open,
  linked: what they wrote in a note, a question of theirs open or resolved,
  a problem solved or not. Say nothing the evidence does not show.
- Never invent a note, a link or a quotation.`;

const ASKING = (write: boolean) => `# Asking back, and their own answers

- Where a question to them would do more than an answer (what is unclear in
  a note, a step left unstated, a case not yet thought through), ask it with
  ask_question: a short title in their words, a line or two of body, and the
  notes it is about.${write ? " It is made a question note in their base." : " They can make it a question note in their base."}
  One or two at most. Not for what you could simply tell them.
- Where they have answered something in what they wrote to you that a note
  of theirs lacks, offer it with offer_text rather than telling them to add
  it: their own sentences, joined lightly, nothing of yours added. They
  insert it as theirs, or not.
- Where they say how they want their notes kept, or you kept (a notation, a
  level, a way of working), offer it as a line for their AGENTS.md: offer_text
  with the id AGENTS.md, in their words.`;

const CHECKING = `# Checking a solution

A problem of theirs is in hand, with what they have written towards solving it.
Check it, step by step.

- Say what holds, plainly, and where a step does not follow, say which and
  why.
- Where the solution leans on something it does not state, ask about it with
  ask_question rather than supplying it.
- Never say it is solved, and never change whether it is marked solved: that
  is theirs alone. Do not mention marking.`;

const MODE_RULES: Record<Exclude<Mode, "build">, string> = { ask: ASK, write: WRITE };

const LOOKING = (rounds: number, meaning: boolean, lookup: boolean) => lookup ? `# Looking things up

- Look up only what the request needs. search_notes finds notes by their
  words; outline_note shows a note's headings and links; read_note reads one
  section. Prefer a section to a whole note. Follow links one step at a time.${meaning ? `
- find_similar finds notes by meaning, when their words have not found them.` : ""}
- What is under "Notes you read earlier" is in hand already, as you read it:
  do not read it again. A note "set aside" can be read again if you need it.
- You may call several tools at once, over ${rounds} rounds at most; then reply.
- Say nothing between tool calls. Only the reply is shown.` : `# Looking things up

They chose what you are sent and asked you not to look further: you have no
tools for searching or reading. Answer from what is below, and say plainly what
you would need to look at to say more.`;

/** What a compaction is told (M15): to pick, as typed fields, what of the earlier turns still matters. The
 *  briefing is written from them in code (briefingText). */
export const COMPACT = `You sum up the earlier turns of a conversation in isorite, between a person and
Iso, about their knowledge base of notes. What you write stands for those turns
from now on: Iso will be sent it instead of them.

Answer with one JSON object and nothing else:
{"settled": [], "open": [], "preferences": [], "notes": []}

- settled: what was asked and answered or decided that still matters, a
  sentence each, in the terms they used.
- open: threads not finished: a question not answered, a change not made, a
  doubt raised.
- preferences: what they said they want from Iso or for their notes (a
  notation, a level, a way of working), in their words.
- notes: the ids of the notes the talk turned on (as basics/entropy), eight at
  most.

Four items at most in each list, and none where there are none. Never add what
was not said.`;

const str = { type: "string" } as const;
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });

export const POINT_TO_NOTE = fn("point_to_note", "Point the person to one of their notes: it is marked on their Atlas, with why. For a note that would help them that they may not know of.",
  { id: { ...str, description: "The note's id or path." }, why: { ...str, description: "Why, in a short sentence to them." } }, ["id", "why"]);
export const EDIT_NOTE = fn("edit_note", "Replace one passage of a note with new text. `old` must be exactly as it is in the note, and must occur in it once: read it first. Give enough of it to be unique. An empty `new` takes the passage out.",
  { id: { ...str, description: "The note's id or path." }, old: { ...str, description: "The passage as it is now, exactly." }, new: { ...str, description: "What it becomes." } }, ["id", "old", "new"]);
export const WRITE_NOTE = fn("write_note", "Make a new note, or write a note's whole text anew. For a new note give its whole file: frontmatter (type, title) then the body. Prefer edit_note for a change to a note that exists.",
  { id: { ...str, description: "The note's id: folder/name, lower case with hyphens. A new folder is made for it." }, text: { ...str, description: "The note's whole file." } }, ["id", "text"]);
export const MOVE_NOTE = fn("move_note", "Move or rename a note. Links to it are changed to match. They are asked first.",
  { id: str, to: { ...str, description: "Its new id: folder/name." } }, ["id", "to"]);
export const DELETE_NOTE = fn("delete_note", "Delete a note. They are asked first. Its history stays.", { id: str }, ["id"]);
export const WRITE_UNDERSTANDING = fn("write_understanding", "Rewrite your reading of their understanding of one note: a few plain sentences on what they can do with it and what they have not yet shown, each resting on evidence linked as [their words](/id.md), [a question](/id.md) or [a problem](/id.md). Replaces the reading you had.",
  { id: { ...str, description: "The note's id." }, reading: str }, ["id", "reading"]);
export const ASK_QUESTION = fn("ask_question", "Ask them a question back, kept as an open question in their base, about one or more of their notes.",
  { title: { ...str, description: "The question, short, ending in a question mark." }, text: { ...str, description: "A line or two on what is asked, or empty." }, about: { type: "array", items: str, description: "The ids of the notes it is about." } }, ["title", "text", "about"]);
export const OFFER_TEXT = fn("offer_text", "Offer them their own answers, lightly joined, to insert at the end of a note as their writing. Only their words.",
  { id: { ...str, description: "The note's id, or AGENTS.md for a line of their instructions for the base." }, text: { ...str, description: "The passage, in Markdown." } }, ["id", "text"]);

/** The tools each mode adds to looking things up. */
export const MODE_TOOLS: Record<Exclude<Mode, "build">, ToolDef[]> = {
  ask: [POINT_TO_NOTE, ASK_QUESTION, OFFER_TEXT],
  write: [EDIT_NOTE, WRITE_NOTE, MOVE_NOTE, DELETE_NOTE, POINT_TO_NOTE, ASK_QUESTION, OFFER_TEXT],
};

/** A turn's own tools: its mode's, and with an Understanding note given, the one that rewrites Iso's reading. */
export function turnTools(mode: Exclude<Mode, "build">, sent: readonly Sent[]): ToolDef[] {
  return [...MODE_TOOLS[mode], ...(sent.some((s) => s.kind === "understanding") ? [WRITE_UNDERSTANDING] : [])];
}

/** A note, folder or passage as it is sent: what was given, read now. */
export type Sent =
  /** A note; a problem says so (`of`); the questions about it still open go with it (`open`). */
  | { kind: "note"; id: string; title: string; text: string; of?: "question" | "problem"; open?: { id: string; title: string }[] }
  | { kind: "folder"; id: string; notes: { id: string; title: string; description: string }[] }
  | { kind: "passage"; id: string; title: string; text: string }
  /** Iso's reading of their understanding of a note (its Understanding note). */
  | { kind: "understanding"; id: string; title: string; reading: string }
  /** A note Iso read earlier in the conversation, as it read it: the sections, or all of it (M15). */
  | { kind: "read"; id: string; title: string; text: string; sections: string[] | "whole" };

export function sentText(s: Sent): string {
  if (s.kind === "note") {
    const open = s.open?.length ? `\n\nOpen questions about it:\n${s.open.map((q) => `- ${q.title} (/${q.id}.md)`).join("\n")}` : "";
    return `## ${s.of === "problem" ? "A problem: " : s.of === "question" ? "A question: " : ""}${s.title} (/${s.id}.md)\n\n${s.text}${open}`;
  }
  if (s.kind === "passage") return `## A passage they chose in ${s.title} (/${s.id}.md)\n\n${s.text.split("\n").map((l) => `> ${l}`).join("\n")}`;
  if (s.kind === "read") return `## ${s.title} (/${s.id}.md)${s.sections === "whole" ? "" : `, ${s.sections.length === 1 ? "the section" : "the sections"} ${s.sections.map((x) => `"${x}"`).join(", ")}`}\n\n${s.text}`;
  if (s.kind === "folder") return `## The folder ${s.id || "at the top of the base"}: its notes\n\n${s.notes.map((n) => `- ${n.title} (/${n.id}.md)${n.description ? `: ${n.description}` : ""}`).join("\n") || "(empty)"}`;
  return `## Their understanding of ${s.title} (/${s.id}.md)\n\nYour reading so far: ${s.reading || "none yet."}`;
}

/** An earlier turn as it is sent: in the shape `conversation()` shortens. */
export function turnExchange(t: Turn): Exchange {
  const text = t.items.filter((i) => i.kind === "text").map((i) => i.text).join("\n\n").trim();
  const changed = t.items.flatMap((i) => (i.kind === "change" ? [`${i.why === "create" ? "made" : i.why === "delete" ? "deleted" : i.why === "move" ? "moved" : "changed"} ${i.title} (/${i.note}.md)`] : []));
  const asked = t.items.flatMap((i) => (i.kind === "question" ? [`You asked them: ${i.title}${i.made ? ` (/${i.made}.md)` : ""}.`] : i.kind === "offer" ? [`You offered them a passage for /${i.note}.md, which they ${i.taken ? "inserted" : "have not inserted"}.`] : []));
  const gave = t.given.filter((g) => g.kind !== "understanding").map((g) => (g.kind === "passage" ? `a passage of /${g.id}.md` : `/${g.id}${g.kind === "note" ? ".md" : "/"}`));
  return {
    id: t.id, note: "",
    text: `In ${t.mode} mode they asked${gave.length ? `, giving you ${gave.join(", ")}` : ""}: ${t.asked}\n\nYou wrote:\n\n${text || "(nothing)"}\n\n${changed.length ? `You ${changed.join("; ")}.` : t.state === "done" ? "" : `The turn was ${t.state}.`}${asked.length ? `\n\n${asked.join("\n")}` : ""}`.trim(),
  };
}

export interface AskedTurn {
  mode: Exclude<Mode, "build">;
  tier: Tier;
  meaning: boolean;
  lookup: boolean;
  earlier: Turn[];
  /** Briefings that stand for earlier turns (compaction), as written, oldest first. */
  briefings?: string[];
  sent: Sent[];
  /** Notes Iso read earlier and set aside (aged off, or switched off): one line each, to be read again if needed. */
  aside?: { id: string; title: string }[];
  /** The base's own instructions (AGENTS.md at the top of the notes), when on. */
  agents?: string;
  asked: string;
  /** Code links broken since Iso was last told (Q27). */
  broken?: { id: string; title: string; href: string }[];
}

/** The messages for a turn, and what they hold, part by part. */
export function turnMessages(a: AskedTurn): { messages: Message[]; parts: Part[] } {
  const understood = a.sent.filter((s) => s.kind === "understanding");
  const checking = a.sent.some((s) => s.kind === "note" && s.of === "problem");
  // In layers, the same for every turn but the mode's and the parts given: so the provider's cache holds.
  const system = [WHO, ISORITE, PRACTICE, LEARNING, MODE_RULES[a.mode], ASKING(a.mode === "write"), ...(checking ? [CHECKING] : []), ...(understood.length ? [UNDERSTANDING] : []), FORMAT_RULES, LOOKING(ROUNDS[a.tier], a.meaning, a.lookup)].join("\n\n");
  // Every earlier turn that is on, whole, after the briefings that stand for the ones before them: nothing is
  // shortened or left out here that the person did not switch off.
  const briefed = a.briefings?.length ? `# Earlier in this conversation, summed up\n\n${a.briefings.join("\n\n---\n\n")}` : "";
  const talk = a.earlier.map((t) => turnExchange(t).text).join("\n\n---\n\n");
  const earlier = [briefed, talk ? `# Earlier in this conversation\n\n${talk}` : ""].filter(Boolean).join("\n\n");
  const given = a.sent.filter((s) => s.kind !== "understanding" && s.kind !== "read"), reads = a.sent.filter((s) => s.kind === "read");
  const gave = given.length ? `# What they gave you\n\n${given.map(sentText).join("\n\n")}` : "";
  const held = reads.length ? `# Notes you read earlier in this conversation\n\n${reads.map(sentText).join("\n\n")}` : "";
  const aside = a.aside?.length ? `# Read earlier, set aside\n\n${a.aside.map((n) => `- ${n.title} (/${n.id}.md)`).join("\n")}` : "";
  const agents = a.agents?.trim() ? `# Their instructions for this knowledge base (AGENTS.md)\n\n${a.agents.trim()}` : "";
  const known = understood.length ? `# Their understanding, as you have recorded it\n\n${understood.map(sentText).join("\n\n")}` : "";
  const broken = a.broken?.length ? `# Code links that no longer resolve\n\nSince you were last told, these links in their notes point to files no longer in their repository. Mention it only where it bears on what they ask.\n\n${a.broken.map((b) => `- in ${b.title} (/${b.id}.md): ${b.href}`).join("\n")}` : "";
  const request = `# What they ask now\n\n${a.asked}`;
  return {
    // In the order least likely to change first, so the provider's cache holds as far as it can.
    messages: [{ role: "system", content: [{ text: system, cache: true }] }, { role: "user", content: [agents, earlier, known, gave, held, aside, broken, request].filter(Boolean).join("\n\n") }],
    parts: [
      { name: "instructions and tools", detail: `${a.mode} mode${checking ? ", checking" : ""}${a.lookup ? "" : ", no look-ups"}`, tokens: estimate(system) + (a.lookup ? 500 : 0) + turnTools(a.mode, a.sent).length * 120 },
      { name: "earlier in this conversation", detail: a.earlier.length ? `${a.earlier.length} ${a.earlier.length === 1 ? "turn" : "turns"}` : "", tokens: estimate(earlier) },
      ...(agents ? [{ name: "their instructions" as const, detail: "AGENTS.md", tokens: estimate(agents) }] : []),
      { name: "what you gave", detail: given.length ? `${given.length} ${given.length === 1 ? "part" : "parts"}` : "nothing", tokens: estimate(gave) },
      ...(reads.length || aside ? [{ name: "notes Iso read" as const, detail: `${reads.length} in hand${a.aside?.length ? `, ${a.aside.length} set aside` : ""}`, tokens: estimate(held) + estimate(aside) }] : []),
      ...(understood.length ? [{ name: "your understanding" as const, detail: `${understood.length} ${understood.length === 1 ? "note" : "notes"}`, tokens: estimate(known) }] : []),
      ...(broken ? [{ name: "code links broken" as const, detail: `${a.broken!.length}`, tokens: estimate(broken) }] : []),
      { name: "your message", detail: "", tokens: estimate(request) },
    ],
  };
}

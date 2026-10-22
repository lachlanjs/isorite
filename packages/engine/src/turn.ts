// A conversation with Iso in its own pane (M10): what a turn is, how it is kept, and what Iso is told in each mode.
// The conversation is kept in the study base, one file each, `conversations/<id>.jsonl`, a line per turn, per thing
// that happened in it and per ending, only ever added to, like a journal. What Iso changes in a note is in that
// note's journal; the conversation names the entry.

import type { Cost } from "@isorite/core";
import { FORMAT_RULES, conversation, estimate, windowed, type Exchange, type Part } from "./iso.ts";
import { ROUNDS } from "./loop.ts";
import type { Step } from "./lookup.ts";
import type { Message, Tier, ToolDef } from "./provider.ts";

/** What Iso may do. Build needs a project and a shell, and is the terminal's (M11). */
export const MODES = ["ask", "write", "build", "understand"] as const;
export type Mode = (typeof MODES)[number];

/** Something you gave Iso: a note, a folder, or a passage of a note. */
export type Given =
  | { kind: "note"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "passage"; id: string; text: string };

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
  /** It recorded something of your understanding of a note (Understand mode). */
  | { kind: "understood"; note: string; event: string; by: number; why: string };

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
    if (line.kind === "turn") { const { kind: _, ...t } = line; turns.set(t.id, { ...t, items: [], state: "running" }); continue; }
    const t = turns.get(line.turn);
    if (!t) continue;
    if (line.kind === "item") t.items.push(line.item);
    else if (line.kind === "answer") { for (const i of t.items) if (i.kind === "permission" && i.id === line.permission) i.answer = line.decision; }
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

const UNDERSTAND = `# Understand mode: what you may do

You help them understand: what is in their notes, what changed in them, or
something they want to understand more deeply. You do not change their notes.
You keep a record of their understanding, note by note, in their study base.

- Start from where they are. Below, for each note in hand, is your reading of
  their understanding of it so far and what changed it. Use it: do not explain
  what they have shown they know; go to what they have not yet shown.
- Ask before you explain, where a question would show you where they stand.
  One question at a time. Short turns.
- When they show understanding, or a gap, record it with
  record_understanding: how far this turn is evidence that their
  understanding of the note differs from what you had (-1, -0.5, 0, 0.5 or 1)
  and why, in one plain sentence to them. At most once a note a turn.
- At the end of a conversation about a note, or when your reading of them has
  changed, rewrite your reading with write_understanding: a few plain
  sentences on what they can do with the note and what they have not yet
  shown. It is theirs to read.
- Never invent a note, a link or a quotation.`;

const MODE_RULES: Record<Exclude<Mode, "build">, string> = { ask: ASK, write: WRITE, understand: UNDERSTAND };

const LOOKING = (rounds: number, meaning: boolean, lookup: boolean) => lookup ? `# Looking things up

- Look up only what the request needs. search_notes finds notes by their
  words; outline_note shows a note's headings and links; read_note reads one
  section. Prefer a section to a whole note. Follow links one step at a time.${meaning ? `
- find_similar finds notes by meaning, when their words have not found them.` : ""}
- You may call several tools at once, over ${rounds} rounds at most; then reply.
- Say nothing between tool calls. Only the reply is shown.` : `# Looking things up

They chose what you are sent and asked you not to look further: you have no
tools for searching or reading. Answer from what is below, and say plainly what
you would need to look at to say more.`;

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
export const RECORD_UNDERSTANDING = fn("record_understanding", "Record evidence of their understanding of one note from this turn: how far it differs from what you had, and why.",
  { id: { ...str, description: "The note's id." }, by: { type: "number", enum: [-1, -0.5, 0, 0.5, 1] }, why: { ...str, description: "One plain sentence, to them." } }, ["id", "by", "why"]);
export const WRITE_UNDERSTANDING = fn("write_understanding", "Rewrite your reading of their understanding of one note: a few plain sentences on what they can do with it and what they have not yet shown. Replaces the reading you had.",
  { id: { ...str, description: "The note's id." }, reading: str }, ["id", "reading"]);

/** The tools each mode adds to looking things up. */
export const MODE_TOOLS: Record<Exclude<Mode, "build">, ToolDef[]> = {
  ask: [POINT_TO_NOTE],
  write: [EDIT_NOTE, WRITE_NOTE, MOVE_NOTE, DELETE_NOTE, POINT_TO_NOTE],
  understand: [RECORD_UNDERSTANDING, WRITE_UNDERSTANDING, POINT_TO_NOTE],
};

/** A note, folder or passage as it is sent: what was given, read now. */
export type Sent =
  | { kind: "note"; id: string; title: string; text: string }
  | { kind: "folder"; id: string; notes: { id: string; title: string; description: string }[] }
  | { kind: "passage"; id: string; title: string; text: string }
  /** Iso's reading of their understanding of a note, and what changed it (Understand mode). */
  | { kind: "understanding"; id: string; title: string; reading: string; events: string[]; squares: number };

export function sentText(s: Sent): string {
  if (s.kind === "note") return `## ${s.title} (/${s.id}.md)\n\n${windowed(s.text.split("\n"), [0])}`;
  if (s.kind === "passage") return `## A passage they chose in ${s.title} (/${s.id}.md)\n\n${s.text.split("\n").map((l) => `> ${l}`).join("\n")}`;
  if (s.kind === "folder") return `## The folder ${s.id || "at the top of the base"}: its notes\n\n${s.notes.map((n) => `- ${n.title} (/${n.id}.md)${n.description ? `: ${n.description}` : ""}`).join("\n") || "(empty)"}`;
  return `## Their understanding of ${s.title} (/${s.id}.md): ${s.squares} of 6 squares\n\nYour reading so far: ${s.reading || "none yet."}\n\nWhat changed it, newest first:\n${s.events.map((e) => `- ${e}`).join("\n") || "- nothing yet"}`;
}

/** An earlier turn as it is sent: in the shape `conversation()` shortens. */
export function turnExchange(t: Turn): Exchange {
  const text = t.items.filter((i) => i.kind === "text").map((i) => i.text).join("\n\n").trim();
  const changed = t.items.flatMap((i) => (i.kind === "change" ? [`${i.why === "create" ? "made" : i.why === "delete" ? "deleted" : i.why === "move" ? "moved" : "changed"} ${i.title} (/${i.note}.md)`] : []));
  const gave = t.given.map((g) => (g.kind === "passage" ? `a passage of /${g.id}.md` : `/${g.id}${g.kind === "note" ? ".md" : "/"}`));
  return {
    id: t.id, note: "",
    text: `In ${t.mode} mode they asked${gave.length ? `, giving you ${gave.join(", ")}` : ""}: ${t.asked}\n\nYou wrote:\n\n${text || "(nothing)"}\n\n${changed.length ? `You ${changed.join("; ")}.` : t.state === "done" ? "" : `The turn was ${t.state}.`}`.trim(),
  };
}

export interface AskedTurn {
  mode: Exclude<Mode, "build">;
  tier: Tier;
  meaning: boolean;
  lookup: boolean;
  earlier: Turn[];
  sent: Sent[];
  asked: string;
}

/** The messages for a turn, and what they hold, part by part. */
export function turnMessages(a: AskedTurn): { messages: Message[]; parts: Part[] } {
  const system = [WHO, MODE_RULES[a.mode], FORMAT_RULES, LOOKING(ROUNDS[a.tier], a.meaning, a.lookup)].join("\n\n");
  const talk = conversation(a.earlier.map(turnExchange));
  const earlier = talk ? `# Earlier in this conversation\n\n${talk}` : "";
  const understood = a.sent.filter((s) => s.kind === "understanding");
  const given = a.sent.filter((s) => s.kind !== "understanding");
  const gave = given.length ? `# What they gave you\n\n${given.map(sentText).join("\n\n")}` : "";
  const known = understood.length ? `# Their understanding, as you have recorded it\n\n${understood.map(sentText).join("\n\n")}` : "";
  const request = `# What they ask now\n\n${a.asked}`;
  return {
    messages: [{ role: "system", content: [{ text: system, cache: true }] }, { role: "user", content: [earlier, known, gave, request].filter(Boolean).join("\n\n") }],
    parts: [
      { name: "instructions and tools", detail: `${a.mode} mode${a.lookup ? "" : ", no look-ups"}`, tokens: estimate(system) + (a.lookup ? 500 : 0) + MODE_TOOLS[a.mode].length * 120 },
      { name: "earlier in this conversation", detail: a.earlier.length ? `${a.earlier.length} ${a.earlier.length === 1 ? "turn" : "turns"}` : "", tokens: estimate(earlier) },
      { name: "what you gave", detail: given.length ? `${given.length} ${given.length === 1 ? "part" : "parts"}` : "nothing", tokens: estimate(gave) },
      ...(a.mode === "understand" ? [{ name: "your understanding" as const, detail: `${understood.length} ${understood.length === 1 ? "note" : "notes"}`, tokens: estimate(known) }] : []),
      { name: "your message", detail: "", tokens: estimate(request) },
    ],
  };
}

// A conversation with the agent in its own pane (M10, until M25 retired the agent's loop): what a turn was, and how it is kept,
// to be read. The conversation is in .isorite/, one file each, `conversations/<id>.jsonl`, a line per turn, per
// thing that happened in it and per ending. What the agent changed in a note is in that note's journal; the conversation
// names the entry. Kept here too: what an agent is told of the base, and the tools isorite gives any agent that
// came from the agent (M25): asking back, offering text, and artifacts.

import type { Cost } from "@isorite/core";
import type { Step, ToolDef } from "./lookup.ts";

/** The tier a turn was asked on, when isorite called a model itself. */
export type Tier = "low" | "mid" | "max";

/** What the agent may do (M12: worked out in the app from the switches in the Agent pane): read only, change the notes, or
 *  change and run the project, which is the terminal's (M11). Conversations from before M12 may name a fourth,
 *  "understand"; it is read as ask. */
export const MODES = ["ask", "write", "build"] as const;
export type Mode = (typeof MODES)[number];

/** Something you gave the agent: a note, a folder, or a passage of a note. */
export type Given =
  | { kind: "note"; id: string }
  | { kind: "folder"; id: string }
  | { kind: "passage"; id: string; text: string };
const GIVEN: readonly string[] = ["note", "folder", "passage"];

/** One thing that happened in a turn, in order. */
export type TurnItem =
  /** What the agent said. Kept whole when the turn ends; streamed as `iso-text` while it is written. */
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
  /** A question the agent asks back (M12), about notes of the base: a question note once `made`, by the agent where it may
   *  change the notes, or by you from the turn. */
  | { kind: "question"; id: string; title: string; text: string; about: string[]; made?: string }
  /** Your own answers, joined by the agent into a remark for a note (M12): yours once you insert it (`taken`). */
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
      // Understand mode, before M12, could change nothing in the notes: as Ask mode now. An Understanding note given,
      // before M24, is passed over.
      turns.set(t.id, { ...t, mode: (MODES as readonly string[]).includes(t.mode) ? t.mode : "ask", given: (t.given ?? []).filter((g) => GIVEN.includes(g.kind)), items: [], state: "running" });
      continue;
    }
    const t = turns.get(line.turn);
    if (!t) continue;
    // Items of kinds there are no longer (what Understand mode recorded, before M12), and the agent's writes to an
    // Understanding note (before M24), are passed over.
    if (line.kind === "item") { if (ITEMS.includes(line.item.kind) && !(line.item.kind === "change" && line.item.note.startsWith("@understanding/"))) t.items.push(line.item); }
    else if (line.kind === "answer") { for (const i of t.items) if (i.kind === "permission" && i.id === line.permission) i.answer = line.decision; }
    else if (line.kind === "taken") { for (const i of t.items) if (i.kind === "question" && i.id === line.item) i.made = line.note; else if (i.kind === "offer" && i.id === line.item) i.taken = true; }
    else { t.state = line.state; if (line.message) t.message = line.message; if (line.cost) t.cost = line.cost; }
  }
  // A turn never ended (the program stopped while the agent worked) was stopped.
  return [...turns.values()].map((t) => (t.state === "running" ? { ...t, state: "stopped" as const } : t)).sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ------------------------------------------------------------ what an agent is told

/** What isorite is, as the notes on disk have it (docs/format.md). The example is loaded by core in a test, so
 *  what the agent is told stays what isorite reads. */
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
- A problem of several steps is several problem notes, each linked to the one
  before it as "requires", in an island of their own when they belong
  together. A problem has no steps inside it.
- Files beside the notes that are not notes (data, documents, pictures,
  artifacts) are linked as any note is: [runs](/simulation/runs.csv).
- Code in their repository is linked as [the step](code:sim/step.py#leapfrog):
  the path from the repository's root, then a name (\`#leapfrog\`, or
  \`#Class.method\`) or lines (\`#L40-L52\`). Prefer a name: it still finds the
  code when it moves. Look in the file for the name before you write it; a name
  that is not there marks the link broken. \`![the step](code:sim/step.py#leapfrog)\`
  shows that code in the note, where it is read.
- Frontmatter is YAML: put a value in quotes when it holds a colon, as
  \`title: "Gauss: Bonnet"\` and \`description: "Why: the proof"\`.
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

/** How a knowledge base is kept well: what the agent does in it, and suggests. */
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

/** How the agent helps them learn, in every mode. */
export const LEARNING = `# Their learning

- Their notes are in their words. Put no words in them they did not ask for.
- Explain in their notation, at the level of their notes.
- When they ask you to explain or teach something, find out where they stand
  first: reply with one short question about it, in a few lines at most, and
  stop. Explain once they have answered. When they ask for a fact, a check or
  a change, just answer.
- Prefer a question back, or a problem to try, to a summary.
- Where they stand shows in their notes: what they wrote, their open questions,
  the problems they have solved and not. Where you find it stops, offer it to
  them as a question to keep (ask_question) or a problem to try.
- Check a solution; never solve it for them.`;

/** Building an artifact (M23, plan-m23 §3.7): in stages, so a small model's window holds it. This much always; the
 *  recipe and the kit's reference only from artifact_recipe. */
export const ARTIFACTS = `# Artifacts

An artifact is an HTML page beside their notes that isorite shows working: a
dashboard of their data, a comparison, a simulation, an explorable
explanation, a 3D model's viewer. Make one when they ask for something to see
or try; not for what an answer or a note says as well.

1. artifact_recipe with the recipe nearest what they asked: dashboard,
   compare, simulation, explorable or viewer. It gives a complete working
   artifact and the kit's reference. Start from the recipe and change what it
   marks; keep the rest.
2. read_data for every data file it will read. Use the columns as given.
3. write_artifact with the whole file. It is checked and run. If it reports a
   problem, fix that and write the whole file again.
4. Say in a sentence what it shows, linked: [what it shows](/folder/name.html).
   Link it from the note it belongs to if they want it there.`;

const str = { type: "string" } as const;
const fn = (name: string, description: string, properties: Record<string, unknown>, required: string[]): ToolDef => ({ type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false } } });

export const ASK_QUESTION = fn("ask_question", "Ask them a question back, kept as an open question in their base, about one or more of their notes.",
  { title: { ...str, description: "The question, short, ending in a question mark." }, text: { ...str, description: "A line or two on what is asked, or empty." }, about: { type: "array", items: str, description: "The ids of the notes it is about." } }, ["title", "text", "about"]);
export const READ_DATA = fn("read_data", "A data file's shape: its columns with their types and ranges, the row count and the first rows. Read it before writing anything that uses the file, so the column names are real.",
  { path: { ...str, description: "The file's path in the base: folder/name.csv." } }, ["path"]);
export const ARTIFACT_RECIPE = fn("artifact_recipe", "A recipe for an artifact: a complete working one to start from, the kit's reference, and the rules write_artifact checks. dashboard: numbers, charts and a table of one data file. compare: two data files side by side. simulation: a model with parameters and play. explorable: inputs, derived numbers and linked views. viewer: a 3D model.",
  { name: { type: "string", enum: ["dashboard", "compare", "simulation", "explorable", "viewer"] } }, ["name"]);
export const WRITE_ARTIFACT = fn("write_artifact", "Write an artifact: a whole HTML file on the kit. The title, description and uses given here are written into it. It is checked, and run where it can be; the result says what to fix. Nothing is written while a rule is broken.",
  { path: { ...str, description: "Where: folder/name.html, beside the notes it belongs to." }, title: str, description: { ...str, description: "One sentence: what it shows, and what can be done with it." },
    uses: { type: "array", items: str, description: "The data or model files it reads, relative to it (runs.csv). Those its markup and script name are added." }, html: { ...str, description: "The whole file." } }, ["path", "title", "description", "uses", "html"]);
export const READ_ARTIFACT = fn("read_artifact", "An artifact's whole file, to change it and write it again.", { path: { ...str, description: "folder/name.html" } }, ["path"]);
export const OFFER_TEXT = fn("offer_text", "Offer them their own answers, lightly joined, to insert at the end of a note as their writing. Only their words.",
  { id: { ...str, description: "The note's id, or AGENTS.md for a line of their instructions for the base." }, text: { ...str, description: "The passage, in Markdown." } }, ["id", "text"]);

// The tutorial's parts and their steps, over the example base (nbody-notes: a developer's notes on an N-body
// simulation, three weeks in): what each step says, where it opens, what it lights, the prompt it fills in for you,
// and what you do that moves it on. A step with neither `until` nor `check` waits for "next". Each part stands on
// its own, so they can be taken in any order; a step that reads differently on a phone says so in `phone`.

import type { EngineEvent } from "@isorite/engine";
import { BH, COST, DIRECT, GALAXY, LAW, LEAP, LOOP, PROMPTS, QUAD, SOFT, SYMP } from "@isorite/example";
import { app, noteHref } from "$lib/app.svelte.ts";

export interface Step {
  title: string;
  text: string;
  /** Opened on entering the step: an address in the app (after the #), or a way to find one. */
  go?: string | (() => Promise<string>);
  /** What is lit, everything else dimmed. */
  target?: string;
  /** Put in Iso's prompt when it opens empty. */
  fill?: string;
  /** Moves on when the engine says this. */
  until?: (e: EngineEvent) => boolean;
  /** Or when this holds, looked at a few times a second. */
  check?: () => boolean;
  /** A place to go on to, after the text. */
  link?: { href: string; text: string };
  /** What differs on a phone, where there are no keys and no pointer to hover. */
  phone?: Partial<Omit<Step, "phone">>;
}

export interface Part {
  key: string;
  title: string;
  /** One line, on the list of parts. */
  about: string;
  steps: Step[];
}

const EXERCISE = "@study/algorithms/the-cost-of-direct-summation";
const BASE = 18; // the example's notes, before you add any

const settled = (note: string) => (e: EngineEvent) => e.type === "journal" && e.id === note && (e.entry.kind === "discard" || (e.entry.kind === "change" && e.entry.why === "keep"));
const kept = (note: string) => (e: EngineEvent) => e.type === "journal" && e.id === note && e.entry.kind === "change" && e.entry.why === "keep";
const done = (note: string | ((id: string) => boolean)) => (e: EngineEvent) => e.type === "iso-done" && (typeof note === "string" ? e.note === note : note(e.note));
const here = (hash: string) => () => decodeURIComponent(location.hash).startsWith(hash);
const has = (selector: string) => () => document.querySelector(selector) !== null;
const chosen = (note: string) => () => document.querySelector(`[data-note="${note}"]`)?.classList.contains("at") ?? false;
const titled = (pattern: RegExp) => app.listing.notes.find((n) => pattern.test(n.title));

// The note you make in part A, as it is moved and then deleted: whatever was not there when the tutorial began.
const ORIGINAL = new Set<string>();
/** Note what the base holds, once, before anything is made in it. */
export function remember(): void { if (!ORIGINAL.size) for (const n of app.listing.notes) ORIGINAL.add(n.id); }
const yours = () => app.listing.notes.filter((n) => ORIGINAL.size && !ORIGINAL.has(n.id));

export const PARTS: Part[] = [
  {
    key: "A", title: "Your notes", about: "The base as a bundle of linked Markdown notes: the Atlas, writing, links, frontmatter, and new, moved and deleted notes.",
    steps: [
      { go: "/atlas", target: ".atlas-world", title: "This is the Atlas",
        text: "nbody-notes: a developer's notes on an N-body simulation, three weeks in. Each block is a note, in its folder: physics, integrators, algorithms, the simulation itself. The lines are links between them." },
      { go: "/atlas", target: `[data-note="${LEAP}"]`, check: chosen(LEAP), title: "What a note rests on",
        text: "Click Leapfrog. What it requires lights up, all the way back to Newton's law, and so does what builds on it.",
        phone: { text: "Tap Leapfrog. What it requires lights up, all the way back to Newton's law, and so does what builds on it." } },
      { target: `[data-note="${LEAP}"]`, check: here(`#/n/${LEAP}`), title: "Open it",
        text: "Click it again to open the note.", phone: { text: "Tap it again to open the note." } },
      { go: `/n/${LEAP}`, target: ".cm-content", title: "A note is Markdown",
        text: "Click into the code block, or the line with the link. Its Markdown shows on the lines you touch and hides again when you leave. $…$ is maths; Ctrl+B, Ctrl+I and Ctrl+K make bold, italics and a link; Ctrl+S saves, though it saves by itself.",
        phone: { text: "Tap into the code block, or the line with the link. Its Markdown shows on the lines you touch and hides again when you leave. $…$ is maths. It saves by itself." } },
      { target: ".cm-content", title: "Links, and their kind",
        text: "A link to another note is a Markdown link. Type [[ and a few letters of a title to make one. Its kind is the link's title: requires, uses, or see also. Alt+L on a link sets it, and the Atlas draws requires strongest.",
        phone: { text: "A link to another note is a Markdown link. Type [[ and a few letters of a title to make one. Its kind is the link's title: requires, uses, or see also; the button beside a link sets it." } },
      { target: ".cm-content", check: here(`#/n/${SYMP}`), title: "Follow a link",
        text: "Ctrl and click (⌘ on a Mac) the link to symplectic.",
        phone: { go: "/atlas", target: `[data-note="${SYMP}"]`, text: "On a phone, the Atlas is the way between notes: tap Symplectic integrators, then tap it again." } },
      { go: `/n/${SYMP}`, check: has(".details"), title: "Its frontmatter",
        text: "Above the text, details shows the note's frontmatter: its type, a one-line description, and tags. source shows the whole file, frontmatter and all. Open details." },
      { go: "/notes", target: '[data-tour="new-note"]', check: () => yours().length > 0, title: "A new note, in a new folder",
        text: "Make a note: new note, a title (say Plummer sphere), and a folder that is not there yet (say galaxies). A folder is made when a note is put in it." },
      { check: () => yours().length > 0 && yours().every((n) => n.id.startsWith("simulation/")), title: "Move it",
        text: "In the new note's details, change its path to simulation/ and its name, and press Enter. The note moves; links to it would follow. Its old folder, now empty, is gone." },
      { check: () => ORIGINAL.size > 0 && yours().length === 0 && app.listing.notes.length === BASE, title: "Delete it",
        text: "In details, delete. You are told first which notes link to it, since their links would be left broken. Its history is kept." },
      { title: "That is the base",
        text: "nbody-notes is a folder of Markdown files in git: any editor opens it, and isorite notices what changed outside it. Next, Iso, in part B." },
    ],
  },
  {
    key: "B", title: "Iso, in your notes", about: "Asking in place, rewriting a selection, keeping or not, the timeline, what Iso is sent, and a note for Iso.",
    steps: [
      { go: `/n/${QUAD}`, target: ".cm-content", fill: PROMPTS.insert, until: done(QUAD), title: "Ask Iso in place",
        text: "The quadtree is a stub with a question in it. Click at the end of the question and press Ctrl+Enter. The prompt is filled in: press Enter, and watch what Iso looks up.",
        phone: { text: "The quadtree is a stub with a question in it. Tap at the end of the question, then ask Iso here, at the foot of the screen. The prompt is filled in: send it." } },
      { target: ".between[data-proposal]", until: settled(QUAD), title: "Keep it, or not",
        text: "Iso read your notes before answering. Its answer waits between the dotted lines: it is not in the note until you keep it. Keep it, edit it first, or remove it." },
      { go: `/n/${BH}`, target: ".cm-content", fill: PROMPTS.rewrite, until: done(BH), title: "Rewrite a selection",
        text: "Select the paragraph that begins TODO, and press Ctrl+Enter. Iso may change only what you selected. The prompt is filled in: press Enter.",
        phone: { text: "Select the paragraph that begins TODO (hold on a word, then drag), and tap ask Iso here. Iso may change only what you selected. The prompt is filled in: send it." } },
      { target: ".cm-content", until: kept(BH), title: "Keep the change",
        text: "The old text is struck through and Iso's stands beside it. Keep it." },
      { target: ".bar .count", check: has('[role="dialog"][aria-label="Context"]'), title: "What Iso is sent",
        text: "The count in the header is what Iso would be sent from this note: the note, those it links, what you asked before, and what this session has cost. Click it to see it part by part. Here Iso is scripted, so nothing is spent.",
        phone: { text: "The count in the header is what Iso would be sent from this note: the note, those it links, what you asked before, and what this session has cost. Tap it to see it part by part. Here Iso is scripted, so nothing is spent." } },
      { go: `/n/${BH}`, target: 'button[aria-label="timeline"]', check: has(".timeline"), title: "Every change is kept",
        text: "Open the timeline, the clock beside the title. Squares are your changes, diamonds Iso's. Point at a mark to see what it changed.",
        phone: { text: "Open the timeline, the clock beside the title. Squares are your changes, diamonds Iso's." } },
      { target: ".timeline", check: has(".atbar"), title: "The note as it was",
        text: "Click the first mark, to see the note as it was first written.", phone: { text: "Tap the first mark, to see the note as it was first written." } },
      { target: ".atbar", check: () => !document.querySelector(".atbar"), title: "Step through it",
        text: "← and → step from moment to moment. The curved arrow restores the note to this point, as a new change; the other comes back to now.",
        phone: { text: "Tap another mark to step to it. The curved arrow restores the note to this point, as a new change; the other comes back to now." } },
      { go: "/atlas", target: ".atlas-world", check: here("#/draft/"), title: "A note for Iso",
        text: "Hold on open ground to start a note for Iso: a question, answered from your notes, that becomes a note when you keep it. Hold on a note to start from it, linked.",
        phone: { text: "Press and hold on open ground to start a note for Iso: a question, answered from your notes, that becomes a note when you keep it. Hold on a note to start from it, linked." } },
      { go: async () => `/draft/${((await app.api.drafts()).find((d) => d.title.includes("Close encounters"))?.id ?? "").slice("@draft/".length)}`,
        until: (e) => e.type === "iso-start" && e.note.startsWith("@draft/"), title: "Send it",
        text: "Here is one you wrote yesterday and did not send, with the notes it rests on linked. Send it to Iso, and watch the Atlas." },
      { until: done((id) => id.startsWith("@draft/")), title: "What Iso reads",
        text: "Iso's path through your base is drawn as it reads: found by words (dashed), by meaning (dotted), or along a link. This is its context: what it reads, it is sent." },
      { check: () => titled(/^Close encounters/) !== undefined, title: "Keep it as a note",
        text: "When Iso is done, open the note, read the answer, and keep it in physics. It is a note of your base now, linked to what it rests on: found again by you, by Iso, and by the agent in the terminal, as an answer in a chat is not." },
      { title: "Iso, in short",
        text: "Iso writes only where you ask, and only what you keep goes in. It reads your notes to answer, and you can see what it read and what it costs. Part C puts this to work on the project." },
    ],
  },
  {
    key: "C", title: "An evening on the project", about: "Parts A and B together: from the goal back to what it rests on, a question answered, a plan written with Iso and linked in.",
    steps: [
      { go: `/n/${GALAXY}`, target: ".cm-content", title: "The goal",
        text: "Two galaxies colliding, at N = 5000: where the tidal tails start to look right, and where direct summation is too slow. This evening's work is to get there with Barnes–Hut." },
      { go: "/atlas", target: `[data-note="${GALAXY}"]`, check: () => chosen(GALAXY)() && Boolean(app.atlas?.chain), title: "What it rests on",
        text: "Choose Two galaxies colliding, then [ whole chain ] in the status line: everything it rests on, back to Newton's law. That is the reading list for tonight." },
      { go: `/n/${COST}`, target: ".cm-content", fill: PROMPTS.speed, until: done(COST), title: "How much faster?",
        text: "In Cost and accuracy, put the cursor after the last paragraph and press Ctrl+Enter. The prompt is filled in: send it.",
        phone: { text: "In Cost and accuracy, tap after the last paragraph, then ask Iso here. The prompt is filled in: send it." } },
      { target: ".between[data-proposal]", until: settled(COST), title: "Keep what is useful",
        text: "Iso checked its arithmetic against your notes, and says to measure. Keep it, or edit it down first." },
      { go: "/atlas", target: `[data-note="${BH}"]`, check: here("#/draft/"), title: "Plan the octree",
        text: "The simulation is 3D, and the quadtree is 2D. Hold on Barnes–Hut to start a note for Iso from it, linked.",
        phone: { text: "The simulation is 3D, and the quadtree is 2D. Press and hold on Barnes–Hut to start a note for Iso from it, linked." } },
      { until: (e) => e.type === "iso-start" && e.note.startsWith("@draft/"), title: "Ask it",
        text: `Give it the title The octree, and write: ${PROMPTS.octree} Then send it.` },
      { check: () => titled(/octree/i) !== undefined, title: "Keep it in algorithms",
        text: "When Iso is done, open the note and keep it in algorithms." },
      { go: `/n/${LOOP}`, target: ".cm-content", check: () => /octree/i.test(document.querySelector(".cm-content")?.textContent ?? ""), title: "Link it in",
        text: "The main loop is where it will be used. At the end of the first paragraph, type [[oct and choose the octree." },
      { go: async () => { const n = titled(/octree/i); return n ? noteHref(n.id).split("#").at(-1)! : `/n/${LOOP}`; }, target: '[data-tour="send"]', title: "Hand it on",
        text: "The code is the agent's work, in the terminal. send to agent puts this note in its next prompt: part E." },
    ],
  },
  {
    key: "D", title: "Study", about: "The study base, how understanding is shown, an exercise marked, Iso's read of you, and what to study next.",
    steps: [
      { go: "/atlas", target: ".atlas-world", title: "Two bases",
        text: "Beside each folder of notes stands a dark-headed folder of exercises. They are the study base: a repository of its own. Your notes are yours to share or publish; what you know, and what you got wrong, stays with you." },
      { go: `/n/${LAW}`, target: ".margin", title: "What you understand",
        text: "The six squares in the margin are Iso's read of how well you know this note, from the exercises you have done. On the Atlas they are four steps: dotted not reached, filled opened, worked through, and a double edge understood. Newton's law is understood." },
      { go: "/study", target: ".list", title: "What to study next",
        text: "Every exercise, in the order Iso would take them: due first, then never tried, then the fewest squares. A few are due: Iso would like to see them again." },
      { go: `/n/${EXERCISE}`, target: ".cm-content", until: done(EXERCISE), title: "An exercise",
        text: "An exercise is written: a question, then your working under Working. This is yesterday's. Select the last line, mark it as your answer, and send it for marking." },
      { target: ".cm-content", check: () => has(".cm-iso-right")() && !has(".cm-iso-wrong")() && !has('[aria-label="Iso is marking"]')(), title: "Wrong, and where",
        text: "Iso marks what is right and what is wrong, and says nothing more unless you ask. The pairs were counted twice; the third law halves them. Change the last line to 0.04 s, mark it as your answer again, and send it." },
      { target: ".bar .squares", title: "The squares moved",
        text: "Right, and unaided: direct summation is now opened, one square of six. Click the squares for Iso's reason for each move, and wind back if it rates you too highly.",
        phone: { text: "Right, and unaided: direct summation is now opened, one square of six. Tap the squares for Iso's reason for each move, and wind back if it rates you too highly." } },
      { go: "/atlas", target: `[data-note="${DIRECT}"]`, title: "And on the map",
        text: "Its block has moved from dotted to opened." },
      { go: `/n/${SOFT}`, target: ".margin", check: () => decodeURIComponent(location.hash).includes("@study/physics/"), title: "Ask for an exercise",
        text: "From a note's margin, + an exercise asks Iso for one on it. Ask for one on softening, send it, and keep it: it is filed in the study base, beside physics." },
      { go: "/study", target: ".list", title: "Keep coming back",
        text: "An answer right moves the notes it tests up; leave them, and they fall due, and then slip a square. The list says what is due. That is the whole of studying here." },
    ],
  },
  {
    key: "E", title: "In the terminal", about: "The agent in OpenCode, with your notes as its tools. Outlined here; walked through with isorite --tutorial.",
    steps: [
      { title: "isorite in the terminal",
        text: "For work that needs more than notes: code. isorite term runs OpenCode, an agent that edits code, with your base beside it. To walk through it on your machine, with OpenCode 2 installed: isorite --tutorial." },
      { title: "It looks before it codes",
        text: "The agent has your base as tools: brief_base, search_notes, find_similar, outline_note and read_note. Asked to write Barnes–Hut, it reads your notes on it first, and cites them." },
      { go: "/atlas", target: ".atlas-world", title: "Watched from here",
        text: "While it works, this Atlas follows it: what it found and read is drawn as Iso's path is, and what it used." },
      { title: "Its changes to notes wait",
        text: "propose_note_edit and propose_note_write: what the agent would change in your notes waits for you, as Iso's does, under its name. Its changes to code are OpenCode's own, which asks before it writes." },
      { go: `/n/${LOOP}`, target: '[data-tour="send"]', title: "From here to there",
        text: "send to agent puts a note, or a passage of it, in the agent's next prompt. In the terminal, /note opens a note and /atlas shows what it requires and what builds on it." },
      { title: "Its tour, replayed", link: { href: "#/terminal", text: "isorite in the terminal: its tour, replayed" },
        text: "Every screen of the terminal's tour, as OpenCode drew it." },
    ],
  },
];

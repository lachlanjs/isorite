// The tutorial's parts and their steps, over the example base (nbody-notes: a developer's notes on an N-body
// simulation, three weeks in): what each step says, where it opens, what it lights, the prompt it fills in for you,
// and what you do that moves it on. A step with neither `until` nor `check` waits for "next". Each part stands on
// its own, so they can be taken in any order; a step that reads differently on a phone says so in `phone`. Served
// by isorite --tutorial, beside the terminal's tour, a part may read differently again (`local`).

import type { EngineEvent } from "@isorite/engine";
import { BH, COST, DIRECT, ENERGY, GALAXY, LAW, LEAP, LOOP, PROMPTS, QUAD, SOFT } from "@isorite/example";
import { app, noteHref } from "$lib/app.svelte.ts";

export interface Step {
  title: string;
  text: string;
  /** Opened on entering the step: an address in the app (after the #), or a way to find one. */
  go?: string | (() => Promise<string>);
  /** What is lit, everything else dimmed: every element the selector matches, or the function returns, lit as one
   *  (a chosen note, its links and the notes at their ends; a form and what it is about). */
  target?: string | (() => Element[]);
  /** Put in Iso's prompt when it opens empty. */
  fill?: string;
  /** Moves on when the engine says this. */
  until?: (e: EngineEvent) => boolean;
  /** Or when this holds, looked at a few times a second. */
  check?: () => boolean;
  /** A wrong move the step watches for, looked at as `check` is: what the step wanted, in a line, or null. */
  wrong?: () => string | null;
  /** A place to go on to, after the text. */
  link?: { href: string; text: string };
  /** What differs on a phone, where there are no keys and no pointer to hover. */
  phone?: Partial<Omit<Step, "phone">>;
}

export interface Part {
  key: string;
  title: string;
  /** What the section is for, on the list of sections. */
  about: string;
  steps: Step[];
  /** An earlier version, until the section is rewritten: shown as such on the list. */
  earlier?: boolean;
  /** As it is beside the terminal, served by isorite --tutorial, where that differs. */
  local?: Pick<Part, "about" | "steps">;
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

// The text of the notes a step reads, kept current from the engine's events, for checks that look a few times a
// second; and as each was when the tutorial began.
const texts = new Map<string, string>(), first = new Map<string, string>();
function read(id: string): void {
  void app.api.readNote(id).then((n) => { texts.set(id, n.text); if (!first.has(id)) first.set(id, n.text); }, () => texts.delete(id));
}
const textOf = (id: string): string => { if (!texts.has(id)) { texts.set(id, ""); read(id); } return texts.get(id) ?? ""; };
const original = (id: string): string => { textOf(id); return first.get(id) ?? ""; };
let listening = false;
function listen(): void { if (!listening && app.api) { listening = true; app.on((e) => { if (e.type === "note-changed" && texts.has(e.id)) read(e.id); }); } }
const count = (text: string, pattern: RegExp) => { listen(); return text.match(pattern)?.length ?? 0; };
const links = (text: string, to: string) => count(text, new RegExp(`\\]\\(/${to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.md`, "g"));
/** The chosen note on the Atlas and what is lit with it: lit as one, its links and the notes at their ends (T5). */
const lit = (): Element[] => (app.atlas?.chosenId ? [...document.querySelectorAll(".atlas-world [data-note]:not(.dim)")] : []);
/** Whether L1's first step has seen you inside integrators, and its timeline step the note as it was. */
let inside = false, looked = false;

// The note you make in L1, as it is moved and then deleted: whatever was not there when the tutorial began.
const ORIGINAL = new Set<string>();
/** Note what the base holds, once, before anything is made in it. */
export function remember(): void { if (!ORIGINAL.size) for (const n of app.listing.notes) ORIGINAL.add(n.id); }
const yours = () => app.listing.notes.filter((n) => ORIGINAL.size && !ORIGINAL.has(n.id));

export const PARTS: Part[] = [
  {
    key: "L1", title: "The isorite knowledge base", about: "Understand the basics of using an isorite knowledge base, editing Markdown, and linking notes together.",
    steps: [
      { go: "/atlas", target: `[data-folder="integrators"]`, check: () => { if (app.atlas?.here === "integrators") inside = true; return inside && app.atlas?.here === ""; }, title: "This is the Atlas",
        text: "nbody-notes: a developer's notes on an N-body simulation. Each block is a note, and each bubble a folder, nested as the folders are. The lines are links: each says what a note requires or builds on. The notes' text is not here. Click inside the integrators bubble to step into it, then click open ground to step back out.",
        phone: { text: "nbody-notes: a developer's notes on an N-body simulation. Each block is a note, and each bubble a folder, nested as the folders are. The lines are links. Tap inside the integrators bubble to step into it, then ↑ out at the top." } },
      { go: "/atlas", target: `[data-note="${LEAP}"]`, check: chosen(LEAP), title: "What a note rests on",
        wrong: () => (app.atlas?.chosenId && app.atlas.chosenId !== LEAP ? `That is ${app.atlas.chosen}. Choose Leapfrog, in integrators.` : null),
        text: "Click Leapfrog. What it requires lights up, back along the chain to Newton's law, and so does what builds on it.",
        phone: { text: "Tap Leapfrog. What it requires lights up, back along the chain to Newton's law, and so does what builds on it." } },
      { target: lit, check: here(`#/n/${LEAP}`), title: "Open it",
        text: "Click Leapfrog again. It opens beside the Atlas: the atlas and note switch at the top right shows both, and either half turns its view off.",
        phone: { text: "Tap Leapfrog again to open it. The atlas and note tabs at the foot switch between the two." } },
      { go: `/n/${LEAP}`, target: ".cm-content", check: () => count(textOf(LEAP), /\*\*[^*\n]+\*\*/g) > count(original(LEAP), /\*\*[^*\n]+\*\*/g), title: "A note is Markdown",
        text: "Its Markdown shows on the lines you touch and hides when you leave them. Select a word and press Ctrl+B to make it bold. There is no saving to do: every change is kept as you type.",
        phone: { text: "Its Markdown shows on the lines you touch and hides when you leave them. Make a word bold: type ** on each side of it. There is no saving to do: every change is kept as you type." } },
      { target: ".cm-content", check: () => links(textOf(LEAP), ENERGY) > links(original(LEAP), ENERGY), title: "Link a note",
        text: "At the end of the last paragraph, type [[ener and choose Energy and its conservation. A link to another note is a Markdown link to its file." },
      { target: () => [...lit(), ...document.querySelectorAll("path.grown")], title: "The link, on the Atlas",
        text: "The Atlas drew the new link as it was made: a line from Leapfrog to Energy and its conservation, in physics. The Atlas makes room for what changes, and keeps close to how it was.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "The Atlas has the new link: a line from Leapfrog to Energy and its conservation, in physics. The Atlas makes room for what changes, and keeps close to how it was." } },
      { go: `/n/${LEAP}`, target: ".cm-content", check: () => /\]\(\/physics\/energy-conservation\.md "requires"\)/.test(textOf(LEAP)), title: "Its kind",
        text: "A link's kind is its title: requires, uses, or see also. Put the cursor in the new link, press Alt+L, and choose requires.",
        phone: { text: "A link's kind is its title: requires, uses, or see also. Tap the button beside the new link and choose requires." } },
      { target: lit, title: "The kind, on the Atlas",
        text: "requires is drawn strongest. Energy and its conservation now lights with what Leapfrog rests on.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "requires is drawn strongest. Energy and its conservation now lights with what Leapfrog rests on." } },
      { go: `/n/${LEAP}`, target: () => [...document.querySelectorAll('button[aria-label="timeline"], .timeline, .atbar')], check: () => { if (has(".atbar")()) looked = true; return looked && !has(".atbar")(); }, title: "Every change is kept",
        text: "Open the timeline, the clock beside the title. Each mark is a change: squares are yours. Click the first mark to see the note as it was before today, then the arrow at the right of the bar to come back to now.",
        phone: { text: "Open the timeline, the clock beside the title. Each mark is a change: squares are yours. Tap the first mark to see the note as it was before today, then the arrow at the right of the bar to come back to now." } },
      { go: `/n/${LEAP}`, target: ".cm-content", check: here(`#/n/${ENERGY}`), title: "Follow the link",
        wrong: () => { const at = decodeURIComponent(location.hash).match(/^#\/n\/([^?]+)/)?.[1]; return at && at !== LEAP && at !== ENERGY ? "That is another note. Go back, and follow the link to Energy and its conservation." : null; },
        text: "Ctrl and click (⌘ on a Mac) the link to Energy and its conservation.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "On a phone the Atlas is the way between notes: tap Energy and its conservation, then tap it again." } },
      { go: `/n/${ENERGY}`, target: () => [...document.querySelectorAll('.tools, .details')], check: () => /^tags:/m.test(textOf(ENERGY)) && !/^tags:/m.test(original(ENERGY)), title: "Its details",
        text: "A note begins with frontmatter: its type, a one-line description, and tags. Open details above the text and give it a tag, say energy." },
      { go: "/notes", target: () => [...document.querySelectorAll('[data-tour="new-note"], form.new')], check: () => yours().some((n) => n.dir === "galaxies"),
        wrong: () => { const n = yours().find((x) => x.dir !== "galaxies"); return n ? `It went into ${n.dir || "the top of the base"}. Redo, and type galaxies as its folder.` : null; },
        title: "A new note, in a new folder",
        text: "This is the list of notes; the base's name at the top left opens it. Make a note: new note, the title Plummer sphere, and the folder galaxies, which is not there yet. A folder is made when a note is put in it. Watch the Atlas when it opens." },
      { target: () => [...document.querySelectorAll(".details, .tools, .atlas-pane")], check: () => yours().length > 0 && yours().every((n) => n.dir === "simulation"), title: "Move it",
        wrong: () => { const n = yours().find((x) => x.dir !== "galaxies" && x.dir !== "simulation"); return n ? `It went into ${n.dir || "the top of the base"}. Choose simulation.` : null; },
        text: "In the new note's details, change its folder: type sim and choose simulation from the suggestions. The note moves, and galaxies, now empty, is gone." },
      { target: () => [...document.querySelectorAll(".details, .tools")], check: () => ORIGINAL.size > 0 && yours().length === 0 && app.listing.notes.length === BASE, title: "Delete it",
        text: "In details, delete. You are told first which notes link to it, since their links would be left broken. Its history is kept." },
      { title: "That is the base",
        text: "nbody-notes is a folder of Markdown files in git: any editor opens it, and isorite notices what changed outside it. Next, Iso, in L2." },
    ],
  },
  {
    key: "L2", title: "Iso", earlier: true, about: "Iso is an agent who is aware of your isorite knowledge base. Learn how to work with Iso to explore and edit it.",
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
        text: "Iso writes only where you ask, and only what you keep goes in. It reads your notes to answer, and you can see what it read and what it costs. E1 puts this to work on the project." },
    ],
  },
  {
    key: "E1", title: "Knowledge work with isorite", earlier: true, about: "isorite provides a home for structured project knowledge work. This walkthrough shows how isorite can be used in an example knowledge base on an N-body simulation.",
    steps: [
      { go: `/n/${GALAXY}`, target: ".cm-content", title: "The goal",
        text: "Two galaxies colliding, at N = 5000: where the tidal tails start to look right, and where direct summation is too slow. This evening's work is to get there with Barnes–Hut." },
      { go: "/atlas", target: `[data-note="${GALAXY}"]`, check: chosen(GALAXY), title: "What it rests on",
        text: "Choose Two galaxies colliding: what it requires is lit, and a click on one of those steps back to it, and on, back to Newton's law. That is the reading list for tonight." },
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
        text: "The code is the agent's work, in the terminal. send to agent puts this note in its next prompt: L4." },
    ],
  },
  {
    key: "L3", title: "The study base", earlier: true, about: "Designed to help you pay back cognitive debt, isorite comes equipped with didactic tools. Learn how to work with Iso to build understanding of your knowledge base through targeted exercises.",
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
  { key: "E2", title: "Learning with isorite", steps: [],
    about: "How isorite gets you up to speed quickly, on the same N-body simulation project." },
  {
    key: "L4", title: "The terminal interface", earlier: true, about: "Iso shares a common substrate of understanding with you as you build together. Extending the familiar OpenCode 2, learn to use isorite's terminal and web interfaces jointly.",
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
    local: {
      about: "The agent in OpenCode, in the terminal beside this page, with your notes as its tools; this page follows it.",
      steps: [
        { title: "The terminal beside this page",
          text: "The terminal you ran isorite --tutorial in is this part: its own card leads, a step at a time. This page follows it. Keep the Atlas open where you can see both." },
        { go: "/atlas", target: ".atlas-world", until: (e) => e.type === "agent-done", title: "Watched from here",
          text: "In the terminal, ask the agent for code, as its card says. It looks in your notes first: watch its path drawn here as it reads, found by words, by meaning, or along a link." },
        { go: `/n/${GALAXY}`, title: "Its changes to notes wait here too",
          text: "When the agent would change a note, the change waits in the note, here as in the terminal, under its name. Keep it in either; the other sees it." },
        { go: `/n/${LOOP}`, target: '[data-tour="send"]', until: (e) => e.type === "agent-sent", title: "From here to there",
          text: "send to agent puts this note, or a passage of it, in the agent's next prompt. Send it, and look for it in the terminal under from you." },
        { title: "On your own notes",
          text: "In your project's folder: isorite term <your base>, and the browser at the address it gives. isorite serve <your base> opens the browser alone." },
      ],
    },
  },
  { key: "E3", title: "Building with isorite", steps: [],
    about: "Putting it all together: rewrite the N-body simulation to use the Barnes–Hut algorithm, with structured agentic awareness of the project." },
];

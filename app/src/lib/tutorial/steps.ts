// The tutorial's parts and their steps, over the example base (nbody-notes: a developer's notes on an N-body
// simulation, three weeks in): what each step says, where it opens, what it lights, the prompt it fills in for you,
// and what you do that moves it on. A step with neither `until` nor `check` waits for "next". Each part stands on
// its own, so they can be taken in any order; a step that reads differently on a phone says so in `phone`. Served
// by isorite --tutorial, beside the terminal's tour, a part may read differently again (`local`).

import type { EngineEvent } from "@isorite/engine";
import { BH, COST, ENERGY, GALAXY, LEAP, LOOP, PROMPTS, QUAD, SOFT } from "@isorite/example";
import { app, noteHref } from "$lib/app.svelte.ts";
import { converse } from "$lib/converse.svelte.ts";
import { panes } from "$lib/panes.svelte.ts";
import { tray } from "$lib/tray.svelte.ts";

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

const BASE = 18; // the example's notes, before you add any

// Turns in Iso's pane (M10), as they begin: the mode, what was asked, and whether an Understanding note went with it.
const turns = new Map<string, { mode: string; asked: string; understanding: boolean }>();
let undone = 0;
const turnBegun = (mode: string, asked: RegExp) => (e: EngineEvent) => e.type === "iso-start" && e.place.form === "turn" && e.place.mode === mode && asked.test(e.asked.toLowerCase());
const turnDone = (mode: string, asked: RegExp, also: (t: { understanding: boolean }) => boolean = () => true) => (e: EngineEvent) => {
  if (e.type !== "iso-done") return false;
  const t = turns.get(e.request);
  return !!t && t.mode === mode && asked.test(t.asked.toLowerCase()) && also(t);
};
/** L2's writes in Barnes–Hut, counted so its undo step can see the TODO answered again. */
let todoWrites = 0;
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
function listen(): void {
  if (listening || !app.api) return;
  listening = true;
  app.on((e) => {
    if (e.type === "note-changed" && texts.has(e.id)) read(e.id);
    if (e.type === "iso-start" && e.place.form === "turn") turns.set(e.request, { mode: e.place.mode, asked: e.asked, understanding: e.place.given.some((g) => g.kind === "understanding") });
    if (e.type === "iso-item" && e.item.kind === "undone") undone++;
    if (turnDone("write", /todo/)(e)) todoWrites++;
  });
}
const count = (text: string, pattern: RegExp) => { listen(); return text.match(pattern)?.length ?? 0; };
const links = (text: string, to: string) => count(text, new RegExp(`\\]\\(/${to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.md`, "g"));
/** With a note chosen, the whole Atlas is lit (T5): the Atlas dims what is not joined to the note itself, and so its
 *  links, the chain back along them, and the notes at their ends all stay in view. */
const lit = (): Element[] => (app.atlas?.chosenId ? [...document.querySelectorAll(".atlas")] : []);
/** Whether L1's timeline step has seen the note as it was. */
let looked = false;
/** L1's first step: another layout tried, and back to the one you had (counted, however quickly it was done). */
let layoutFrom = "", layoutChanges = 0;
const layoutRound = (): boolean => panes.layoutChanges > layoutChanges && panes.layout === layoutFrom;
/** The scratchpad of the Understanding note open, saved. */
const padSaved = () => document.querySelector('[data-pane="note"] .u h2 .state')?.textContent === "saved";
/** Stepped into a folder and out again, however it was done: clicked into, scrolled or pinched. In, when the Atlas
 *  says it is in the folder or the folder fills half the Atlas; out, when it no longer is and the folder is back
 *  near the size it was first seen at. */
function steppedIn(folder: string): () => boolean {
  let inside = false, first = 0;
  return () => {
    const f = document.querySelector(`[data-folder="${folder}"]`)?.getBoundingClientRect(), a = document.querySelector(".atlas")?.getBoundingClientRect();
    if (!f || !a?.width) return false;
    const share = Math.max(f.width / a.width, f.height / a.height);
    first ||= share;
    if (app.atlas?.here === folder || share > Math.max(0.5, first * 1.6)) inside = true;
    return inside && app.atlas?.here !== folder && share < first * 1.3;
  };
}

const ISO = '[data-pane="iso"]';
// The note you make in L1, as it is moved and then deleted: whatever was not there when the tutorial began.
const ORIGINAL = new Set<string>();
/** Note what the base holds, once, before anything is made in it. */
export function remember(): void {
  listen();
  if (!ORIGINAL.size) for (const n of app.listing.notes) ORIGINAL.add(n.id);
  layoutFrom = panes.layout; layoutChanges = panes.layoutChanges;
}
const yours = () => app.listing.notes.filter((n) => ORIGINAL.size && !ORIGINAL.has(n.id));

export const PARTS: Part[] = [
  {
    key: "L1", title: "The isorite knowledge base", about: "Understand the basics of an isorite knowledge base in its three panes: the note, the Atlas, and Iso. Edit Markdown, link notes, and see the links on the Atlas.",
    steps: [
      { go: "/atlas", target: '[data-pane="note"] [data-settings="note"], [role="dialog"][aria-label="Note settings"]', check: layoutRound, title: "Three panes",
        text: "The Note pane is for thinking and writing, the Atlas for connecting, Iso for building and talking. The layouts are in the Note pane's settings, at the right of its header: try another, then come back to this one.",
        phone: { go: "/notes", target: 'nav[aria-label="Panes"]', check: () => panes.focus === "atlas", text: "The Note pane is for thinking and writing, the Atlas for connecting, Iso for building and talking. On a phone they are the tabs at the foot: tap Atlas." } },
      { go: "/atlas", target: `[data-folder="integrators"]`, check: steppedIn("integrators"), title: "This is the Atlas",
        text: "Each block is a note, each bubble a folder, each line a link. Step into integrators: click inside it, or scroll in. Then click open ground to step out.",
        phone: { text: "Each block is a note, each bubble a folder, each line a link. Tap inside integrators to step in, then ↑ out at the top." } },
      { go: "/atlas", target: `[data-note="${LEAP}"]`, check: chosen(LEAP), title: "What a note rests on",
        wrong: () => (app.atlas?.chosenId && app.atlas.chosenId !== LEAP ? `That is ${app.atlas.chosen}. Choose Leapfrog, in integrators.` : null),
        text: "Click Leapfrog. What it requires, and what builds on it, light up.",
        phone: { text: "Tap Leapfrog. What it requires, and what builds on it, light up." } },
      { target: lit, check: here(`#/n/${LEAP}`), title: "Open it",
        text: "Click Leapfrog again. It opens in the Note pane.",
        phone: { text: "Tap Leapfrog again. It opens in the Note pane, and the Note tab comes forward." } },
      { go: `/n/${LEAP}`, target: '[data-pane="note"] .cm-content', check: () => count(textOf(LEAP), /\*\*[^*\n]+\*\*/g) > count(original(LEAP), /\*\*[^*\n]+\*\*/g), title: "A note is Markdown",
        text: "Select a word and press Ctrl+B. Changes save as you type: the dot in the Note pane's header says so.",
        phone: { text: "Make a word bold: type ** on each side of it. Changes save as you type." } },
      { target: '[data-pane="note"] .cm-content', check: () => links(textOf(LEAP), ENERGY) > links(original(LEAP), ENERGY), title: "Link a note",
        text: "At the end of the last paragraph, type [[ener and choose Energy and its conservation." },
      { target: () => [...lit(), ...document.querySelectorAll("path.grown")], title: "The link, on the Atlas",
        text: "Watch the Atlas: the new link is drawn from Leapfrog to Energy and its conservation.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "On the Atlas, the new link runs from Leapfrog to Energy and its conservation." } },
      { go: `/n/${LEAP}`, target: '[data-pane="note"] .cm-content', check: () => /\]\(\/physics\/energy-conservation\.md "requires"\)/.test(textOf(LEAP)), title: "Its kind",
        text: "Click in the new link, press Alt+L, and choose Requires.",
        phone: { text: "Tap the button beside the new link and choose Requires." } },
      { target: lit, title: "The kind, on the Atlas",
        text: "On the Atlas, requires is drawn strongest.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "On the Atlas, requires is drawn strongest." } },
      { go: `/n/${LEAP}`, target: () => [...document.querySelectorAll('button[aria-label="timeline"], .timeline, .atbar')], check: () => { if (has(".atbar")()) looked = true; return looked && !has(".atbar")(); }, title: "Every change is kept",
        text: "Click the timeline button by the title, then its first mark: the note as it was. The → at the right of the bar brings you back.",
        phone: { text: "Tap the timeline button by the title, then its first mark: the note as it was. The → at the right of the bar brings you back." } },
      { go: `/n/${LEAP}`, target: '[data-pane="note"] .cm-content', check: here(`#/n/${ENERGY}`), title: "Follow the link",
        wrong: () => { const at = decodeURIComponent(location.hash).match(/^#\/n\/([^?]+)/)?.[1]; return at && at !== LEAP && at !== ENERGY ? "That is another note. Go back, and follow the link to Energy and its conservation." : null; },
        text: "Ctrl+click (⌘ on a Mac) the link to Energy and its conservation.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "Tap Energy and its conservation on the Atlas, then tap it again." } },
      { go: `/n/${ENERGY}`, target: '[data-pane="note"] button[aria-label="All notes"], [data-pane="note"] .tree', check: here(`#/n/${SOFT}`), title: "All the notes",
        text: "The icon by the settings, in the Note pane's header, opens every note. Type soft to find Softening, and open it." },
      { go: `/n/${SOFT}`, target: () => [...document.querySelectorAll('[data-pane="note"] .tools, [data-pane="note"] .details')], check: () => /^tags:/m.test(textOf(SOFT)) && !/^tags:/m.test(original(SOFT)), title: "Its details",
        text: "Open details above the text and add a tag, say numerics." },
      { go: "/atlas", target: `[data-folder="physics"]`, check: () => titled(/^plummer sphere$/i)?.dir === "physics",
        wrong: () => { const n = titled(/^plummer sphere$/i); return n && n.dir !== "physics" ? `It went into ${n.dir || "the top of the base"}. Redo, and hold inside physics.` : null; },
        title: "A new note, where you hold",
        text: "On the Atlas, press and hold inside physics until a note's icon is marked, and let go. An untitled note opens with its title chosen: type Plummer sphere, and press Enter." },
      { target: () => [...document.querySelectorAll('[data-pane="note"] .details, [data-pane="note"] .tools')], check: () => yours().length > 0 && yours().every((n) => n.dir === "galaxies"), title: "Move it",
        wrong: () => { const n = yours().find((x) => x.dir !== "physics" && x.dir !== "galaxies"); return n ? `It went into ${n.dir || "the top of the base"}. Type galaxies: a new folder is made for it.` : null; },
        text: "In details, change its folder to galaxies, a folder the base does not have yet: it is made for the note." },
      { target: () => [...document.querySelectorAll('[data-pane="note"] .details, [data-pane="note"] .tools')], check: () => ORIGINAL.size > 0 && yours().length === 0 && app.listing.notes.length === BASE, title: "Delete it",
        text: "In details, click delete, then confirm." },
      { title: "That is the base",
        text: "The base is a folder of Markdown files: any editor opens them. Next, Iso, in L2." },
    ],
  },
  {
    key: "L2", title: "Iso", about: "Iso is an agent who knows your knowledge base. Talk with it in its own pane: ask, give it notes and passages, and let it write, with every change marked and undoable.",
    steps: [
      { go: `/n/${QUAD}`, target: `${ISO}`, fill: PROMPTS.insert, until: turnBegun("ask", /inserted/), title: "Ask Iso",
        text: "Iso has a pane of its own. In Ask mode, the speech bubble in its header, it reads your notes and changes nothing. Your question from the quadtree is written in its box: press Enter.",
        phone: { text: "Iso has a pane of its own: tap its tab. In Ask mode, the speech bubble, it reads your notes and changes nothing. Your question from the quadtree is written in its box: send it with the arrow." } },
      { target: () => [...document.querySelectorAll(`.atlas, ${ISO}`)], until: turnDone("ask", /inserted/), title: "Watch it read",
        text: "The Atlas comes up in its Iso lens: what Iso reads is numbered in order, as it reads it. In Iso's pane, each note it read opens with a click.",
        phone: { target: ISO, text: "Each note Iso reads is said in its pane as it reads it. The Atlas tab turns gold: there, what it read is numbered in order." } },
      { go: `/n/${QUAD}`, target: () => [...document.querySelectorAll(`[data-note="${BH}"], [data-pane="note"] .cm-content`)], check: () => tray.parts.some((p) => p.kind === "note" && p.id === BH) && tray.parts.some((p) => p.kind === "passage" && p.id === QUAD), title: "Give Iso a note, and a passage",
        text: "Iso answers from what it finds. To give it what you mean: hold Barnes–Hut on the Atlas (or drag it onto Iso's pane). Then select a sentence of the quadtree, and click send to Iso beside it.",
        phone: { text: "Iso answers from what it finds. To give it what you mean: on the Atlas, hold Barnes–Hut and choose Give to Iso. Then select a sentence of the quadtree, and tap send to Iso under it." } },
      { target: `${ISO} .ctx, ${ISO} .context`, check: () => converse.view === "context" && converse.off.length > 0 && !tray.parts.some((p) => p.kind === "passage"), title: "What Iso is sent",
        text: "The icon by Iso's modes counts what you gave: click it. Here is what Iso is sent, part by part, each with its size. Switch off your first question, and take the sentence out with its ×." },
      { go: `/n/${BH}`, target: () => [...document.querySelectorAll(`${ISO} .mode[data-mode="write"], #iso-box`)], fill: PROMPTS.rewrite, until: turnDone("write", /todo/), title: "Let it write",
        text: "Click the Context icon again for the conversation. Switch to Write mode: the quill, or Shift+Tab in Iso's box. In Write mode Iso changes your notes. Barnes–Hut is open, with its TODO; the request is written for you: send it." },
      { target: () => [...document.querySelectorAll(`${ISO} .change, [data-pane="note"] .cm-content`)], title: "Its words, marked",
        text: "The change went straight into the note, and the note came up in its Iso lens (◆ in its header): Iso's words are marked. On the Atlas, the note it changed is marked too. The change in Iso's pane opens it again whenever you like." },
      { target: () => [...document.querySelectorAll(`${ISO} button[aria-label="Undo this turn's changes"], [data-pane="note"] .cm-content`)], check: () => undone > 0 && todoWrites >= 2 && !/TODO:/.test(textOf(BH)), title: "Undo, and again",
        text: "Under Iso's reply, ↺ puts back everything the turn changed: the TODO is back. Then send the request again, and leave the answer this time." },
      { title: "Iso, in short",
        text: "In Ask mode Iso reads; in Write mode it writes, and every change it makes is marked and can be undone. What it is sent is yours to choose. Next: L3, your understanding." },
    ],
  },
  {
    key: "E1", title: "Knowledge work with isorite", earlier: true, about: "isorite provides a home for structured project knowledge work. This walkthrough shows how isorite can be used in an example knowledge base on an N-body simulation.",
    steps: [
      { go: `/n/${GALAXY}`, target: '[data-pane="note"] .cm-content', title: "The goal",
        text: "Two galaxies colliding, at N = 5000: where the tidal tails start to look right, and where direct summation is too slow. This evening's work is to get there with Barnes–Hut." },
      { go: "/atlas", target: `[data-note="${GALAXY}"]`, check: chosen(GALAXY), title: "What it rests on",
        text: "Choose Two galaxies colliding: what it requires is lit, and a click on one of those steps back to it, and on, back to Newton's law. That is the reading list for tonight." },
      { go: `/n/${COST}`, target: ISO, fill: PROMPTS.speed, until: turnDone("ask", /faster/), title: "How much faster?",
        text: "Cost and accuracy is open. In Ask mode (the speech bubble), ask Iso how much faster Barnes–Hut is at N = 5000: the question is written for you." },
      { target: ISO, title: "Checked against your notes",
        text: "Iso checked its arithmetic against direct summation and Barnes–Hut, and says to measure, as your note says." },
      { target: ISO, fill: PROMPTS.octreeWrite, until: turnDone("write", /octree/), title: "Plan the octree",
        text: "The simulation is 3D, and the quadtree is 2D. In Write mode (the quill), ask Iso to write a note on the octree, in algorithms: the request is written for you." },
      { target: `${ISO} .change`, check: () => here("#/n/algorithms/the-octree")(), title: "Its note",
        text: "Iso made The octree. Click it in Iso's pane to open it: it is one of your notes now, linked to the quadtree and Barnes–Hut." },
      { go: `/n/${LOOP}`, target: '[data-pane="note"] .cm-content', check: () => /octree/i.test(document.querySelector('[data-pane="note"] .cm-content')?.textContent ?? ""), title: "Link it in",
        text: "The main loop is where it will be used. At the end of the first paragraph, type [[oct and choose the octree." },
      { go: async () => { const n = titled(/octree/i); return n ? noteHref(n.id).split("#").at(-1)! : `/n/${LOOP}`; }, target: '[data-tour="send"]', title: "Hand it on",
        text: "The code is the agent's work, in the terminal. send to agent puts this note in its next prompt: L4." },
    ],
  },
  {
    key: "L3", title: "Understanding", about: "isorite keeps track of your understanding, note by note, so you can see where you stand and how it grew. Iso uses it: in Understand mode it starts from where you are.",
    steps: [
      { go: "/atlas", target: '[data-pane="atlas"] .lens[data-lens="understand"], .atlas', check: () => panes.lens.atlas === "understand", title: "Where you stand",
        text: "Switch the Atlas to its Understand lens, ◇ in its header. Each note shows where you stand with it, from dotted, not reached, to a double edge, understood; and the study folders appear, with your exercises." },
      { go: `/n/${LEAP}`, target: '[data-pane="note"] .lens[data-lens="understand"], [data-pane="note"] .u', check: () => panes.lens.note === "understand" && padSaved(), title: "Your Understanding note",
        text: "Every note has an Understanding note: switch Leapfrog to its Understand lens, ◇ in the Note pane's header. Iso's reading of you, what changed it, and a scratchpad only you see. Write a line in the scratchpad." },
      { target: () => [...document.querySelectorAll(`${ISO} .mode[data-mode="understand"], #iso-box`)], fill: PROMPTS.understand, until: turnDone("understand", /bounded|leapfrog/), title: "Understand mode",
        text: "In Iso's pane, switch to Understand mode: the sprig. Your Understanding note of Leapfrog now goes with what you ask (the Context icon shows it). The question is written for you: send it. Iso asks you something back." },
      { target: ISO, fill: PROMPTS.answer, until: turnDone("understand", /backwards|retrace|reverse/), title: "Answer it",
        text: "Answer Iso's question: an answer is written for you, or say it your own way, with backwards in it. Iso records what it saw, and rewrites its reading of you." },
      { target: '[data-pane="note"] .u', title: "What changed it",
        text: "In Leapfrog's Understand lens: Iso's reading is new, and what changed it has a new line, with Iso's reason. You can see how your understanding grew, and why." },
      { target: `${ISO} .ctx, ${ISO} .context`, until: turnDone("understand", /bounded|leapfrog/, (t) => !t.understanding), title: "Without it",
        text: "Open the Context icon and take your Understanding of Leapfrog out with its ×. Then ask the first question again: Iso starts from the beginning, as it would for anyone." },
      { title: "Understanding, in short",
        text: "Iso keeps a reading of your understanding, note by note, from what you say and do; it is yours to read, and to take out of what Iso is sent. Your notes are yours to share; your understanding stays in your study base." },
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
        text: "edit_note and write_note: what the agent changes in your notes is written at once under its name, its words marked as Iso's are in Write mode, and undone the same way. Its changes to code are OpenCode's own, which asks before it writes." },
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

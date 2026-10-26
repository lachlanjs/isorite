// The tutorial's parts and their steps, over the example base (nbody-notes: a developer's notes on an N-body
// simulation, three weeks in): what each step says, where it opens, what it lights, the prompt it fills in for you,
// and what you do that moves it on. A step with neither `until` nor `check` waits for "next". Each part stands on
// its own, so they can be taken in any order; a step that reads differently on a phone says so in `phone`. Served
// by isorite --tutorial, beside the terminal's tour, a part may read differently again (`local`).

import type { EngineEvent } from "@isorite/engine";
import { BH, BONNET, COMPACT, COST, ENERGY, GALAXY, GEOMETRY_PROMPTS, LEAP, LOOP, PROBLEMS, PROMPTS, QUAD, SOFT } from "@isorite/example";
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
  /** On the geometry example's base, not the N-body simulation's: the page is loaded again with it. */
  base?: "geometry";
  /** An earlier version, until the section is rewritten: shown as such on the list. */
  earlier?: boolean;
  /** As it is beside the terminal, served by isorite --tutorial, where that differs. */
  local?: Pick<Part, "about" | "steps">;
}

const BASE = 18 + PROBLEMS.length; // the example's notes and its problems, before you add any

// Turns in Iso's pane (M10), as they begin: the mode, what was asked, and whether an Understanding note went with it.
const turns = new Map<string, { mode: string; asked: string; understanding: boolean }>();
let undone = 0;
const turnBegun = (mode: string, asked: RegExp) => (e: EngineEvent) => e.type === "iso-start" && e.place.form === "turn" && e.place.mode === mode && asked.test(e.asked.toLowerCase());
const turnDone = (mode: string, asked: RegExp, also: (t: { understanding: boolean }) => boolean = () => true) => (e: EngineEvent) => {
  if (e.type !== "iso-done") return false;
  const t = turns.get(e.request);
  return !!t && t.mode === mode && asked.test(t.asked.toLowerCase()) && also(t);
};
/** A turn of any kind that ends, when it was asked something that matches. */
const turnDoneAny = (asked: RegExp) => (e: EngineEvent) => e.type === "iso-done" && asked.test(turns.get(e.request)?.asked.toLowerCase() ?? "");
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
      { go: `/n/${LEAP}`, target: () => [...document.querySelectorAll('[data-pane="note"] .sw[data-switch="timeline"], .timeline, .atbar')], check: () => { if (has(".atbar")()) looked = true; return looked && !has(".atbar")(); }, title: "Every change is kept",
        text: "Switch on the timeline in the Note pane's header, then click its first mark: the note as it was. The → at the right of the bar brings you back.",
        phone: { text: "Switch on the timeline in the Note pane's header, then tap its first mark: the note as it was. The → at the right of the bar brings you back." } },
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
        text: "Iso has a pane of its own. With the quill in its header off, it reads your notes and changes nothing. Your question from the quadtree is written in its box: press Enter.",
        phone: { text: "Iso has a pane of its own: tap its tab. With the quill in its header off, it reads your notes and changes nothing. Your question from the quadtree is written in its box: send it with the arrow." } },
      { target: () => [...document.querySelectorAll(`[data-pane="atlas"] .sw[data-switch="context"], ${ISO}`)], until: turnDone("ask", /inserted/), title: "Watch it read",
        text: "Switch on Iso's context, the diamond in the Atlas's header: what Iso reads is numbered on the map in order, as it reads it. In Iso's pane, each note it read opens with a click.",
        phone: { target: ISO, text: "Each note Iso reads is said in its pane as it reads it. On the Atlas, with the diamond in its header on, what it read is numbered in order." } },
      { go: `/n/${QUAD}`, target: () => [...document.querySelectorAll(`[data-note="${BH}"], [data-pane="note"] .cm-content`)], check: () => tray.parts.some((p) => p.kind === "note" && p.id === BH) && tray.parts.some((p) => p.kind === "passage" && p.id === QUAD), title: "Give Iso a note, and a passage",
        text: "Iso answers from what it finds. To give it what you mean: hold Barnes–Hut on the Atlas (or shift+click it, or drag it onto Iso's pane). Then select a sentence of the quadtree, and click send to Iso beside it.",
        phone: { text: "Iso answers from what it finds. To give it what you mean: on the Atlas, hold Barnes–Hut and choose Give to Iso. Then select a sentence of the quadtree, and tap send to Iso under it." } },
      { target: `${ISO} .ctx, ${ISO} .context`, check: () => converse.view === "context" && !!converse.report?.rows?.some((r) => r.kind === "turn" && !r.on) && !tray.parts.some((p) => p.kind === "passage"), title: "What Iso is sent",
        text: "The icon in Iso's header counts what you gave: click it. Here is what Iso is sent, part by part, each with its size: the notes you gave and the ones it read, the conversation, and what is always sent. Click your first question to leave it out, and take the sentence out with its ×." },
      { go: `/n/${BH}`, target: () => [...document.querySelectorAll(`${ISO} .sw[data-switch="notes"], #iso-box`)], fill: PROMPTS.rewrite, until: turnDone("write", /todo/), title: "Let it write",
        text: "Click the Context icon again for the conversation. Switch on the quill in Iso's header: Iso may change your notes. Barnes–Hut is open, with its TODO; the request is written for you: send it." },
      { target: () => [...document.querySelectorAll(`[data-pane="note"] .sw[data-switch="provenance"], [data-pane="note"] .cm-content`)], title: "Its words, marked",
        text: "The change went straight into the note. Switch on provenance, the half-filled square in the Note pane's header: Iso's words are marked." },
      { target: () => [...document.querySelectorAll(`${ISO} button[aria-label="Undo this turn's changes"], [data-pane="note"] .cm-content`)], check: () => undone > 0 && todoWrites >= 2 && !/TODO:/.test(textOf(BH)), title: "Undo, and again",
        text: "Under Iso's reply, ↺ puts back everything the turn changed: the TODO is back. Then send the request again, and leave the answer this time." },
      { title: "Iso, in short",
        text: "With the quill off Iso reads; on, it writes, and every change it makes is marked and can be undone. What it is sent is yours to choose. Next: L3, questions and problems." },
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
        text: "Cost and accuracy is open. With the quill off, ask Iso how much faster Barnes–Hut is at N = 5000: the question is written for you." },
      { target: ISO, title: "Checked against your notes",
        text: "Iso checked its arithmetic against direct summation and Barnes–Hut, and says to measure, as your note says." },
      { target: ISO, fill: PROMPTS.octreeWrite, until: turnDone("write", /octree/), title: "Plan the octree",
        text: "The simulation is 3D, and the quadtree is 2D. With the quill on, ask Iso to write a note on the octree, in algorithms: the request is written for you." },
      { target: `${ISO} .change`, check: () => here("#/n/algorithms/the-octree")(), title: "Its note",
        text: "Iso made The octree. Click it in Iso's pane to open it: it is one of your notes now, linked to the quadtree and Barnes–Hut." },
      { go: `/n/${LOOP}`, target: '[data-pane="note"] .cm-content', check: () => /octree/i.test(document.querySelector('[data-pane="note"] .cm-content')?.textContent ?? ""), title: "Link it in",
        text: "The main loop is where it will be used. At the end of the first paragraph, type [[oct and choose the octree." },
    ],
  },
  {
    key: "L3", base: "geometry", title: "Questions and problems", about: "Open questions and problems are notes of their own, beside the notes they are about. See who wrote what, follow them on the Atlas, let Iso ask you back and put your own answers together, and read how Iso reads you. On notes about the geometry of surfaces.",
    steps: [
      { go: `/n/${BONNET}`, target: () => [...document.querySelectorAll('[data-pane="note"] .sw[data-switch="provenance"], [data-pane="note"] .cm-content')], check: () => panes.on.provenance, title: "Whose words",
        text: "These are notes on the geometry of surfaces. Gauss–Bonnet is open. Switch on provenance, the half-filled square in the Note pane's header: the proof sketch is Iso's, untouched, and the examples are yours." },
      { target: () => [...document.querySelectorAll('[data-pane="note"] .sw[data-switch="timeline"], .timeline')], check: () => panes.on.timeline, title: "Every change is kept",
        text: "Switch on the timeline, beside it: each mark is a moment in the note's life, Iso's sketch among them." },
      { target: ".cm-lp-embed", check: here(`#/n/${COMPACT}`), title: "A question in a note",
        text: "After Compact: stands a question of yours, embedded. Click it: it opens as a note of its own.",
        phone: { text: "After Compact: stands a question of yours, embedded. Tap it: it opens as a note of its own." } },
      { go: "/atlas", target: ".atlas a.n.question", check: chosen(COMPACT), title: "Questions on the Atlas",
        text: "Open questions are blocks on the Atlas with a ? in the notch, each beside what it is about. Click Where is compactness used?: its note lights, and the note it asks about.",
        phone: { text: "Open questions are blocks on the Atlas with a ? in the notch, each beside what it is about. Tap Where is compactness used?: its note lights, and the note it asks about." } },
      { target: () => [...document.querySelectorAll('[data-pane="atlas"] .sw[data-switch="web"], [data-pane="atlas"] .sw[data-switch="code"], .sat')], check: () => panes.on.web && panes.on.code, title: "Links out of the base",
        text: "Switch on web and code in the Atlas's header: links to a page and to code stand beside their note as small blocks. geodesics.jl is struck through: it is not in the repository." },
      { go: "/atlas", target: `[data-note="${BONNET}"]`, check: () => tray.parts.some((p) => p.kind === "note" && p.id === BONNET), title: "Give Iso the note",
        text: "Hold Gauss–Bonnet on the Atlas (or drag it onto Iso's pane). Its open questions go with it.",
        phone: { text: "On the Atlas, hold Gauss–Bonnet and choose Give to Iso. Its open questions go with it." } },
      { target: ISO, fill: GEOMETRY_PROMPTS.back, until: turnDoneAny(/compactness is used|compactness used/), title: "Iso asks you back",
        text: "Gauss–Bonnet is in Iso's context with its question. The request is written for you: send it. Given an open question, Iso asks before it explains." },
      { target: ISO, fill: GEOMETRY_PROMPTS.remark, until: turnDoneAny(/answers on compactness/), title: "Your answers, put together",
        text: "Under Where is compactness used? are two answers of yours. Ask Iso to put them together: the request is written for you." },
      { target: () => [...document.querySelectorAll(`${ISO} [data-offer]`)], check: () => count(textOf(BONNET), /\*\*Compact:\*\*/g) >= 2, title: "Inserted as yours",
        text: "Iso offers the remark in your words. The arrow inserts it at the end of Gauss–Bonnet, as yours: Iso's offer is not in the note until you say." },
      { go: `/n/${BONNET}`, target: '[data-tour="understanding"], [data-pane="note"] .u', check: () => panes.understanding, title: "How Iso reads you",
        text: "Open Gauss–Bonnet's Understanding note, the sprig in the Note pane's header. Each sentence of Iso's reading rests on something you can open: your examples, the torus you solved, the question still open." },
      { go: `/n/${COMPACT}`, target: '[data-tour="understanding"], [data-pane="note"] .titlerow', check: () => /^resolved:/m.test(textOf(COMPACT)), title: "Resolve it",
        text: "Your remark is in the note. Close the Understanding note with the sprig, then press the ✓ in the question's title row: it resolves it, yours to press and never Iso's." },
      { title: "Questions and problems, in short",
        text: "A question or a problem is a note with a type, kept beside the notes it is about. Iso asks you back, checks a solution without marking it, and offers your own answers for you to insert. Resolving and solving are yours." },
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
        text: "edit_note and write_note: what the agent changes in your notes is written at once under its name, its words marked as Iso's are, and undone the same way. Its changes to code are OpenCode's own, which asks before it writes." },
      { title: "From here to there",
        text: "In the terminal, /note opens a note and /atlas shows what it requires and what builds on it." },
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
        { title: "On your own notes",
          text: "In your project's folder: isorite term <your base>, and the browser at the address it gives. isorite serve <your base> opens the browser alone." },
      ],
    },
  },
  { key: "E3", title: "Building with isorite", steps: [],
    about: "Putting it all together: rewrite the N-body simulation to use the Barnes–Hut algorithm, with structured agentic awareness of the project." },
];

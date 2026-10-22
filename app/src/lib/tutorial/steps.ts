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
/** Notes where Iso's text was removed, and where it was kept: for steps that name removing as a wrong move. */
const removed = new Set<string>(), keptIn = new Set<string>();
function listen(): void {
  if (listening || !app.api) return;
  listening = true;
  app.on((e) => {
    if (e.type === "note-changed" && texts.has(e.id)) read(e.id);
    if (e.type === "journal" && e.entry.kind === "discard") removed.add(e.id);
    if (e.type === "journal" && e.entry.kind === "change" && e.entry.why === "keep") keptIn.add(e.id);
  });
}
const count = (text: string, pattern: RegExp) => { listen(); return text.match(pattern)?.length ?? 0; };
const links = (text: string, to: string) => count(text, new RegExp(`\\]\\(/${to.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.md`, "g"));
/** With a note chosen, the whole Atlas is lit (T5): the Atlas dims what is not joined to the note itself, and so its
 *  links, the chain back along them, and the notes at their ends all stay in view. */
const lit = (): Element[] => (app.atlas?.chosenId ? [...document.querySelectorAll(".atlas")] : []);
/** Whether L1's timeline step has seen the note as it was. */
let looked = false;
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

// The note you make in L1, as it is moved and then deleted: whatever was not there when the tutorial began.
const ORIGINAL = new Set<string>();
/** Note what the base holds, once, before anything is made in it. */
export function remember(): void { listen(); if (!ORIGINAL.size) for (const n of app.listing.notes) ORIGINAL.add(n.id); }
const yours = () => app.listing.notes.filter((n) => ORIGINAL.size && !ORIGINAL.has(n.id));

export const PARTS: Part[] = [
  {
    key: "L1", title: "The isorite knowledge base", about: "Understand the basics of using an isorite knowledge base, editing Markdown, and linking notes together.",
    steps: [
      { go: "/atlas", target: `[data-folder="integrators"]`, check: steppedIn("integrators"), title: "This is the Atlas",
        text: "Each block is a note, each bubble a folder, each line a link. Step into integrators: click inside it, or scroll in. Then click open ground to step out.",
        phone: { text: "Each block is a note, each bubble a folder, each line a link. Tap inside integrators to step in, then ↑ out at the top." } },
      { go: "/atlas", target: `[data-note="${LEAP}"]`, check: chosen(LEAP), title: "What a note rests on",
        wrong: () => (app.atlas?.chosenId && app.atlas.chosenId !== LEAP ? `That is ${app.atlas.chosen}. Choose Leapfrog, in integrators.` : null),
        text: "Click Leapfrog. What it requires, and what builds on it, light up.",
        phone: { text: "Tap Leapfrog. What it requires, and what builds on it, light up." } },
      { target: lit, check: here(`#/n/${LEAP}`), title: "Open it",
        text: "Click Leapfrog again. It opens beside the Atlas.",
        phone: { text: "Tap Leapfrog again to open it. The tabs at the foot switch between the note and the Atlas." } },
      { go: `/n/${LEAP}`, target: ".cm-content", check: () => count(textOf(LEAP), /\*\*[^*\n]+\*\*/g) > count(original(LEAP), /\*\*[^*\n]+\*\*/g), title: "A note is Markdown",
        text: "Select a word and press Ctrl+B. Changes save as you type.",
        phone: { text: "Make a word bold: type ** on each side of it. Changes save as you type." } },
      { target: ".cm-content", check: () => links(textOf(LEAP), ENERGY) > links(original(LEAP), ENERGY), title: "Link a note",
        text: "At the end of the last paragraph, type [[ener and choose Energy and its conservation." },
      { target: () => [...lit(), ...document.querySelectorAll("path.grown")], title: "The link, on the Atlas",
        text: "Watch the Atlas: the new link is drawn from Leapfrog to Energy and its conservation.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "On the Atlas, the new link runs from Leapfrog to Energy and its conservation." } },
      { go: `/n/${LEAP}`, target: ".cm-content", check: () => /\]\(\/physics\/energy-conservation\.md "requires"\)/.test(textOf(LEAP)), title: "Its kind",
        text: "Click in the new link, press Alt+L, and choose Requires.",
        phone: { text: "Tap the button beside the new link and choose Requires." } },
      { target: lit, title: "The kind, on the Atlas",
        text: "On the Atlas, requires is drawn strongest.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "On the Atlas, requires is drawn strongest." } },
      { go: `/n/${LEAP}`, target: () => [...document.querySelectorAll('button[aria-label="timeline"], .timeline, .atbar')], check: () => { if (has(".atbar")()) looked = true; return looked && !has(".atbar")(); }, title: "Every change is kept",
        text: "Click the timeline button by the title, then its first mark: the note as it was. The → at the right of the bar brings you back.",
        phone: { text: "Tap the timeline button by the title, then its first mark: the note as it was. The → at the right of the bar brings you back." } },
      { go: `/n/${LEAP}`, target: ".cm-content", check: here(`#/n/${ENERGY}`), title: "Follow the link",
        wrong: () => { const at = decodeURIComponent(location.hash).match(/^#\/n\/([^?]+)/)?.[1]; return at && at !== LEAP && at !== ENERGY ? "That is another note. Go back, and follow the link to Energy and its conservation." : null; },
        text: "Ctrl+click (⌘ on a Mac) the link to Energy and its conservation.",
        phone: { go: "/atlas", target: `[data-note="${ENERGY}"]`, text: "Tap Energy and its conservation on the Atlas, then tap it again." } },
      { go: `/n/${ENERGY}`, target: () => [...document.querySelectorAll('.tools, .details')], check: () => /^tags:/m.test(textOf(ENERGY)) && !/^tags:/m.test(original(ENERGY)), title: "Its details",
        text: "Open details above the text and add a tag, say energy." },
      { go: "/notes", target: () => [...document.querySelectorAll('[data-tour="new-note"], form.new')], check: () => yours().some((n) => n.dir === "galaxies"),
        wrong: () => { const n = yours().find((x) => x.dir !== "galaxies"); return n ? `It went into ${n.dir || "the top of the base"}. Redo, and type galaxies as its folder.` : null; },
        title: "A new note, in a new folder",
        text: "The base's name, top left, opens this list. Click new note: title Plummer sphere, folder galaxies. The folder is made for it." },
      { target: () => [...document.querySelectorAll(".details, .tools, .atlas-pane")], check: () => yours().length > 0 && yours().every((n) => n.dir === "simulation"), title: "Move it",
        wrong: () => { const n = yours().find((x) => x.dir !== "galaxies" && x.dir !== "simulation"); return n ? `It went into ${n.dir || "the top of the base"}. Choose simulation.` : null; },
        text: "In details, change its folder: type sim and choose simulation." },
      { target: () => [...document.querySelectorAll(".details, .tools")], check: () => ORIGINAL.size > 0 && yours().length === 0 && app.listing.notes.length === BASE, title: "Delete it",
        text: "In details, click delete, then confirm." },
      { title: "That is the base",
        text: "The base is a folder of Markdown files: any editor opens them. Next, Iso, in L2." },
    ],
  },
  {
    key: "L2", title: "Iso", about: "Iso is an agent who is aware of your isorite knowledge base. Learn how to work with Iso to explore and edit it.",
    steps: [
      { go: `/n/${QUAD}`, target: ".cm-content", until: (e) => e.type === "iso-start" && e.note === QUAD, title: "Ask in the text",
        text: "The last paragraph is a question. Click in it and press Ctrl+Enter.",
        phone: { text: "The last paragraph is a question. Tap in it, then ask Iso here at the foot." } },
      { target: () => [...document.querySelectorAll(".atlas, .between")], until: done(QUAD), title: "Watch it read",
        text: "On the Atlas, what Iso reads is drawn as it reads it: found by words, by meaning, or along a link.",
        phone: { target: ".seed", text: "Iso reads your notes first. The strip at the foot counts them; tap it to see them on the Atlas, and come back with the note tab." } },
      { target: ".between[data-proposal]", until: kept(QUAD), title: "Keep it",
        wrong: () => (removed.has(QUAD) && !keptIn.has(QUAD) ? "You removed it. Go back two steps, and ask again." : null),
        text: "Iso's answer waits between the dotted lines. It is not in the note until you keep it." },
      { go: `/n/${BH}`, target: ".cm-content", fill: PROMPTS.rewrite, until: done(BH), title: "Rewrite a selection",
        wrong: () => { const p = [...document.querySelectorAll(".cm-iso-picked")].map((e) => e.textContent ?? "").join(" "); return p && !/TODO/.test(p) ? "That selection has no TODO in it. Select the paragraph that begins TODO." : null; },
        text: "On to Barnes–Hut, which uses the quadtree. Select the paragraph that begins TODO and press Ctrl+Enter. The prompt is filled in: press Enter.",
        phone: { text: "On to Barnes–Hut, which uses the quadtree. Select the paragraph that begins TODO, then ask Iso here. The prompt is filled in: send it." } },
      { target: () => [...document.querySelectorAll(".cm-content, .changes")], until: kept(BH), title: "Keep the change",
        wrong: () => (removed.has(BH) && !keptIn.has(BH) ? "You removed it. Go back a step, and ask again." : null),
        text: "The old text is struck through, Iso's beside it. Keep it." },
      { target: () => [...document.querySelectorAll('.bar .count, [role="dialog"][aria-label="Context"]')], check: has('[role="dialog"][aria-label="Context"] .item.off'), title: "What Iso is sent",
        text: "Click the count in the header: what Iso is sent from this note. Switch off one of the notes it links to.",
        phone: { text: "Tap the count in the header: what Iso is sent from this note. Switch off one of the notes it links to." } },
      { go: `/n/${BH}`, target: () => [...document.querySelectorAll('.atlas [data-folder="physics"], .naming')], check: () => titled(/^close encounters$/i)?.dir === "physics",
        wrong: () => { const n = titled(/^close encounters$/i); return n && n.dir !== "physics" ? `It went into ${n.dir || "the top of the base"}. Redo, and hold inside physics.` : null; },
        title: "A note to ask in",
        text: "On the Atlas, press and hold inside physics until a new note is marked, let go, and call it Close encounters.",
        phone: { go: "/atlas", text: "On the Atlas, press and hold inside physics until a new note is marked, let go, and call it Close encounters." } },
      { target: ".cm-content", until: done((id) => id === titled(/^close encounters$/i)?.id), title: "Ask in it",
        text: `Write ${PROMPTS.close} Then press Ctrl+Enter in it.`,
        phone: { text: `Write ${PROMPTS.close} Then ask Iso here.` } },
      { target: ".between[data-proposal]", until: (e) => kept(titled(/^close encounters$/i)?.id ?? "")(e), title: "Keep it",
        text: "Keep the answer. It is part of a note of your base now: found again by you, by Iso, and by the agent in the terminal." },
      { title: "Iso, in short",
        text: "Iso writes only where you ask, and only what you keep goes in. Next: E1 puts it to work on the project." },
    ],
  },
  {
    key: "E1", title: "Knowledge work with isorite", earlier: true, about: "isorite provides a home for structured project knowledge work. This walkthrough shows how isorite can be used in an example knowledge base on an N-body simulation.",
    steps: [
      { go: `/n/${GALAXY}`, target: ".cm-content", title: "The goal",
        text: "Two galaxies colliding, at N = 5000: where the tidal tails start to look right, and where direct summation is too slow. This evening's work is to get there with Barnes–Hut." },
      { go: "/atlas", target: `[data-note="${GALAXY}"]`, check: chosen(GALAXY), title: "What it rests on",
        text: "Choose Two galaxies colliding: what it requires is lit, and a click on one of those steps back to it, and on, back to Newton's law. That is the reading list for tonight." },
      { go: `/n/${COST}`, target: ".cm-content", until: done(COST), title: "How much faster?",
        text: `In Cost and accuracy, write a new last paragraph: ${PROMPTS.speed} Then press Ctrl+Enter in it.`,
        phone: { text: `In Cost and accuracy, write a new last paragraph: ${PROMPTS.speed} Then ask Iso here.` } },
      { target: ".between[data-proposal]", until: settled(COST), title: "Keep what is useful",
        text: "Iso checked its arithmetic against your notes, and says to measure. Keep it, or edit it down first." },
      { go: "/atlas", target: `[data-folder="algorithms"]`, check: () => titled(/octree/i)?.dir === "algorithms", title: "Plan the octree",
        text: "The simulation is 3D, and the quadtree is 2D. Hold inside algorithms, let go, and call the new note The octree." },
      { target: ".cm-content", until: done((id) => id === titled(/octree/i)?.id), title: "Ask it",
        text: `Write ${PROMPTS.octree} Then press Ctrl+Enter in it.`,
        phone: { text: `Write ${PROMPTS.octree} Then ask Iso here.` } },
      { target: ".between[data-proposal]", until: (e) => kept(titled(/octree/i)?.id ?? "")(e), title: "Keep it",
        text: "Keep the answer: the plan is a note in algorithms now." },
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

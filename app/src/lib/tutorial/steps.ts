// The tutorial's steps (the Tour-* boards, taken further): what each says, where it opens, what it lights, the prompt
// it fills in for you, and what you do that moves it on. A step with neither `until` nor `check` waits for "next".

import type { EngineEvent } from "@isorite/engine";
import { PROMPTS } from "@isorite/example";
import { app } from "$lib/app.svelte.ts";

export interface Step {
  /** Which of SECTIONS it belongs to: the card's segments. */
  section: number;
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
}

export const SECTIONS = ["the atlas", "Iso in a note", "a note for Iso", "the timeline", "an exercise", "study", "keys"];

const SC = "dmft/self-consistency-condition", SOLVER = "impurity-problems/impurity-solver", MOTT = "lattice-models/mott-transition", WEISS = "dmft/weiss-field", BETHE = "@study/dmft/the-bethe-lattice";
const settled = (note: string) => (e: EngineEvent) => e.type === "journal" && e.id === note && (e.entry.kind === "discard" || (e.entry.kind === "change" && e.entry.why === "keep"));
const kept = (note: string) => (e: EngineEvent) => e.type === "journal" && e.id === note && e.entry.kind === "change" && e.entry.why === "keep";
const done = (note: string | ((id: string) => boolean)) => (e: EngineEvent) => e.type === "iso-done" && (typeof note === "string" ? e.note === note : note(e.note));
const here = (hash: string) => () => decodeURIComponent(location.hash).startsWith(hash);
const has = (selector: string) => () => document.querySelector(selector) !== null;

export const STEPS: Step[] = [
  { section: 0, go: "/atlas", target: ".atlas-world", title: "This is the Atlas",
    text: "A base on dynamical mean-field theory, six weeks into being built. Each block is a note, in its folder. Its edge shows where you stand: dotted is not reached yet, double is understood. The dark-headed folders beside them hold the exercises." },
  { section: 0, go: "/atlas", target: `[data-note="${SC}"]`, check: () => document.querySelector(`[data-note="${SC}"]`)?.classList.contains("at") ?? false, title: "What a note rests on",
    text: "Click the self-consistency condition. What it requires lights up, all the way back, and what builds on it too." },
  { section: 0, target: `[data-note="${SC}"]`, check: here(`#/n/${SC}`), title: "Open it",
    text: "Click it again to open the note. Maths and links read as you wrote them; Ctrl and a click follows a link." },
  { section: 1, go: `/n/${SC}`, target: ".between[data-proposal]", until: settled(SC), title: "Iso writes in your note",
    text: "Four minutes before you arrived, Iso was asked for the Bethe lattice form. Its answer waits between the dotted lines: it is not in the note until you keep it. Keep it, edit it first, or remove it." },
  { section: 1, go: `/n/${SOLVER}`, target: ".cm-content", fill: PROMPTS.insert, until: done(SOLVER), title: "Ask Iso anywhere",
    text: "This note is a stub with a question in it. Click at the end of the question and press Ctrl+Enter (on a phone, ask Iso here). The prompt is filled in for you: press Enter, and watch what Iso looks up." },
  { section: 1, target: ".between[data-proposal]", until: settled(SOLVER), title: "Keep, edit or remove",
    text: "Iso read your notes before answering. Keep what is useful; you can edit it first, or remove it. Either way it stays in the note's history." },
  { section: 1, go: `/n/${MOTT}`, target: ".cm-content", fill: PROMPTS.rewrite, until: done(MOTT), title: "Rewrite a passage",
    text: "Select the paragraph that begins TODO, then press Ctrl+Enter. Iso may change only what you selected. The prompt is filled in: press Enter." },
  { section: 1, target: ".cm-content", until: kept(MOTT), title: "Keep the change",
    text: "The old text is struck through and Iso's stands beside it. Keep it." },
  { section: 1, target: ".bar .count", check: has('[role="dialog"][aria-label="Context"]'), title: "What Iso is sent, and what it costs",
    text: "The header counts what Iso would be sent from this note, and what this session has cost. Click the count to see it part by part. Here Iso is scripted, so nothing is spent." },
  { section: 2, go: "/atlas", target: ".atlas-world", check: here("#/draft/"), title: "Hold to start a note",
    text: "Hold on open ground to write to Iso. Hold on a note to start from it, linked." },
  { section: 2, go: async () => `/draft/${((await app.api.drafts()).find((d) => d.title.includes("infinite dimensions"))?.id ?? "").slice("@draft/".length)}`,
    until: (e) => e.type === "iso-start" && e.note.startsWith("@draft/"), title: "A note for Iso, waiting",
    text: "A new note opens like this. Here is the one you wrote yesterday and did not send, with the notes it rests on linked. Send it to Iso, and watch it on the map." },
  { section: 2, until: done((id) => id.startsWith("@draft/")), title: "Iso's path",
    text: "Iso's path through your base is drawn as it reads: what it found by words, by meaning, and by following links." },
  { section: 2, check: () => app.listing.notes.some((n) => n.title.startsWith("Why DMFT is exact")), title: "Keep it as a note",
    text: "Open the note when Iso is done, read the answer, and keep it in the dmft folder. It becomes a note of your base, its history saying who wrote what." },
  { section: 3, go: `/n/${WEISS}`, target: 'button[aria-label="timeline"]', check: has(".timeline"), title: "Every change is kept",
    text: "Open the timeline with the button beside the title. Squares are your changes, diamonds Iso's. Point at a mark to see what it changed." },
  { section: 3, target: ".timeline", check: has(".atbar"), title: "The note as it was",
    text: "Click the first mark to see the note as you first wrote it." },
  { section: 3, target: ".atbar", check: () => !document.querySelector(".atbar"), title: "Step through it",
    text: "← and → step from moment to moment. The curved arrow restores the note to this point, as a new change you can undo the same way; the other comes back to now." },
  { section: 4, go: `/n/${BETHE}`, target: ".cm-content", until: done(BETHE), title: "An exercise is a note too",
    text: "Iso set this one yesterday and you wrote some working. Select your last line, mark it as your answer, then send it for marking." },
  { section: 4, target: ".cm-content", check: () => has(".cm-iso-right")() && !has(".cm-iso-wrong")() && !has('[aria-label="Iso is marking"]')(), title: "Wrong, and where",
    text: "Iso marks what is right and what is wrong, and says nothing more unless you ask. Δ is read off upside down: change the last line to Δ = t² G, mark it as your answer again, and send it." },
  { section: 4, target: ".bar .squares", title: "The squares moved",
    text: "Right, and unaided: the self-consistency condition is now opened, one square of six. Click the squares for Iso's reason for each move, and wind back if it rates you too highly." },
  { section: 4, go: "/atlas", target: `[data-note="${SC}"]`, title: "And on the map",
    text: "Its block's edge has moved from dotted to opened." },
  { section: 5, go: "/study", target: ".list", title: "Study",
    text: "Every exercise in one list: never tried first, then what is due. Some of yours are due again: Iso would like to see them once more." },
  { section: 5, go: `/n/${WEISS}`, target: ".margin", check: () => decodeURIComponent(location.hash).includes("@study/dmft/what-the-weiss-field"), title: "Ask for an exercise",
    text: "A note's margin shows Iso's read of you, the exercises that test it, and a way to ask for one. Ask for an exercise on the Weiss field, send it to Iso, and keep it." },
  { section: 6, title: "A few keys",
    text: "Nothing on screen names them, so here they are once. In a note: Ctrl+Enter asks Iso where the cursor is; Ctrl+S saves. On the Atlas: Escape lets a choice go, + and − zoom, 0 shows the whole map, c changes the grid, w draws the whole chain. With the timeline open: ← and → step, Escape comes back to now." },
  { section: 6, title: "That is isorite, so far",
    text: "The base is yours to try anything on; a reload starts it again. Outside the tutorial, isorite runs on your own notes, with Iso on your own provider key." },
];

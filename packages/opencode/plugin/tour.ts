// The tour of isorite in the terminal (`isorite --tutorial`): what each step says, the prompt it fills in for
// you, and what you do that moves it on, read from what the plugin already knows. A step with no `until` waits
// for /next. On the example base, as the browser's tutorial is (`app/src/lib/tutorial/steps.ts`): the agent
// writing code from your notes first, then what the terminal shares with the browser.

/** The prompts the tour fills in, word for word: the tutorial's model answers these. */
export const PROMPTS = {
  code: "write sim.py: two bodies on a circular orbit, stepped with leapfrog, as my notes say",
  tree: "add Barnes–Hut to the code, as my notes describe it, and note where it is",
} as const;

/** What the plugin knows that a step can wait on. */
export interface TourState {
  /** The page shown: "splash", "home", "session", "note", or another plugin page's name. */
  page: string;
  /** Turns of the agent's that have ended, and the notes now in play. */
  turns: number;
  inPlay: number;
  atlasOpen: boolean;
  /** The note shown, its changes waiting, and whether a moment of its timeline is shown. */
  note: string;
  waiting: number;
  past: boolean;
  /** Iso's answers to asking in place, and notes sent to the agent from the terminal. */
  isoAnswers: number;
  sent: number;
}

export interface TourStep {
  title: string;
  text: string;
  /** Put in the prompt when the step begins, if it is empty. */
  fill?: string;
  /** Moves on when this holds of what the plugin knows, given what held when the step began. */
  until?: (now: TourState, began: TourState) => boolean;
}

export const GOAL = "simulation/two-galaxies-colliding";

export const TOUR: TourStep[] = [
  { title: "isorite in the terminal",
    text: "OpenCode, an agent that writes code, with your notes beside it: a developer's notes on an N-body simulation, and an empty folder for the code. The browser that opened is the other half, on the same notes. The model is scripted. Press enter to open.",
    until: (s) => s.page !== "splash" },
  { title: "Ask for code", fill: PROMPTS.code,
    text: "The prompt is filled in. Press enter. Before it writes, the agent looks in your notes: by words, by meaning, and along their links. OpenCode asks before it writes a file: allow it.",
    until: (s, b) => s.turns > b.turns && s.inPlay > 0 },
  { title: "Notes in play",
    text: "On the right: what it found, what it reached from there, and what it used, in gold. Its answer cites your notes, [1] and the section. In the browser, the Atlas draws the same path as it goes. Type /next.",
  },
  { title: "More, from your notes", fill: PROMPTS.tree,
    text: "Press enter. It reads your notes on Barnes–Hut and the quadtree, writes the code, and adds to your note on the goal where the code now is. The code is OpenCode's, as always; what it would change in a note waits for you.",
    until: (s, b) => s.turns > b.turns },
  { title: "isorite's tools",
    text: "What it used are isorite's: brief_base, search_notes, find_similar, outline_note and read_note to look, propose_note_edit and propose_note_write to suggest. And two commands: /atlas and /note. Type /next.",
  },
  { title: "One note's atlas",
    text: "Type /atlas barnes hut. Beside the chat: what the note requires, on the left, and what builds on it, on the right.",
    until: (s) => s.atlasOpen },
  { title: "Open the note",
    text: "Type /note two galaxies. A note in the terminal: who wrote each paragraph in the gutter, maths as source, links underlined.",
    until: (s) => s.page === "note" && s.note === GOAL },
  { title: "Keep it, or not",
    text: "The agent's change waits between dotted lines. [k] keeps it, [e] edits it first, [r] removes it; [n] goes to the next.",
    until: (s) => s.page === "note" && s.waiting === 0 },
  { title: "Ask Iso here",
    text: "↑ and ↓ choose a paragraph; [/] asks Iso, isorite's own agent, to write after it. Its answer waits for you the same way.",
    until: (s, b) => s.isoAnswers > b.isoAnswers },
  { title: "Every change is kept",
    text: "[t] lists the note's history. Choose a moment to see the note as it was then; [q] comes back to now.",
    until: (s) => s.past },
  { title: "Send it to the agent",
    text: "[s] sends the paragraph the cursor is on to the agent, with what you want of it. It waits under \"from you\" for your next prompt.",
    until: (s, b) => s.sent > b.sent },
  { title: "That is the terminal",
    text: "On your own base: isorite term <base>. Point it at a model with ISORITE_GATEWAY_URL, or use OpenCode's own. /tour hides this card, /next closes it.",
  },
];

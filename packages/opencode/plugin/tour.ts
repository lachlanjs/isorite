// The tour of isorite in the terminal (`isorite tutorial term`): what each step says, the prompt it fills in for
// you, and what you do that moves it on, read from what the plugin already knows. A step with no `until` waits
// for /next. As the browser's tutorial does (`app/src/lib/tutorial/steps.ts`), on the example base about DMFT.

/** The prompts the tour fills in, word for word: the tutorial's model answers these. */
export const PROMPTS = {
  ask: "why does my loop not converge? check it against my notes",
  fix: "fix the loop: mix half the old self-energy, and note Broyden mixing",
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

export const LOOP = "dmft/the-dmft-loop";

export const TOUR: TourStep[] = [
  { title: "isorite in the terminal",
    text: "OpenCode, with your knowledge base beside it. This tour uses an example base on DMFT and a scripted model: nothing is sent anywhere. Press enter to open.",
    until: (s) => s.page !== "splash" },
  { title: "Ask about your notes", fill: PROMPTS.ask,
    text: "The prompt is filled in. Press enter, and watch the agent look your notes up: by words, by meaning, and along their links.",
    until: (s, b) => s.turns > b.turns && s.inPlay > 0 },
  { title: "Notes in play",
    text: "On the right: what it found, what it reached from there, and what it used, in gold. Its answer cites your notes, [1] and its section. Type /next.",
  },
  { title: "One note's atlas",
    text: "Type /atlas the dmft loop. Beside the chat: what the note requires, on the left, and what builds on it, on the right. In the browser, the whole map follows the agent.",
    until: (s) => s.atlasOpen },
  { title: "Changes to notes wait", fill: PROMPTS.fix,
    text: "Ask it to change your notes. Edits to code are OpenCode's, and it asks before it writes a file: allow it. Edits to notes wait for you to keep them.",
    until: (s, b) => s.turns > b.turns },
  { title: "Open the note",
    text: "Type /note the dmft loop. A note in the terminal: who wrote each paragraph in the gutter, maths as source, links underlined.",
    until: (s) => s.page === "note" && s.note === LOOP },
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

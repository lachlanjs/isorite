// Where the tutorial is: the section (-1 while the sections are listed), the step within it, which steps' objectives
// were met (by section key), whether it was left, and a wrong move the step has seen. For the page's life.

import type { Snapshot } from "./redo.ts";

export const tour = $state({
  part: -1, at: 0, left: false,
  /** Section key -> the steps whose objective was met. */
  ticks: {} as Record<string, number[]>,
  /** What a wrong move did, in a line, while it stands. */
  mistake: "",
});

/** The base as the step found it, for redo (T3). Not reactive: only redo reads it. */
export const begun: { snap: Promise<Snapshot> | null } = { snap: null };

export function tick(key: string, at: number): void {
  // Through the state, not the array assigned: a plain array put in state is copied, and a push on it is lost.
  tour.ticks[key] ??= [];
  if (!tour.ticks[key].includes(at)) tour.ticks[key].push(at);
}

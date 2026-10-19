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
  const t = (tour.ticks[key] ??= []);
  if (!t.includes(at)) t.push(at);
}

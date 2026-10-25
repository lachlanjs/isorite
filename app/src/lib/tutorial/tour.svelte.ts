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

// A section on the other example base loads the page again: where the tutorial is carries across, for the tab's life.
const KEPT = "isorite.tour";
export function keep(part: number, at: number): void {
  try { sessionStorage.setItem(KEPT, JSON.stringify({ part, at, left: false, ticks: tour.ticks })); } catch { /* not kept */ }
}
/** Where the tutorial was before the page was loaded again, once; whether it was in a section. */
export function resume(): boolean {
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEPT) ?? "null") as { part: number; at: number; left: boolean; ticks: Record<string, number[]> } | null;
    sessionStorage.removeItem(KEPT);
    if (!kept) return false;
    Object.assign(tour, { part: kept.part, at: kept.at, left: kept.left, ticks: kept.ticks });
    return kept.part >= 0;
  } catch { return false; }
}

/** The base as the step found it, for redo (T3). Not reactive: only redo reads it. */
export const begun: { snap: Promise<Snapshot> | null } = { snap: null };

export function tick(key: string, at: number): void {
  // Through the state, not the array assigned: a plain array put in state is copied, and a push on it is lost.
  tour.ticks[key] ??= [];
  if (!tour.ticks[key].includes(at)) tour.ticks[key].push(at);
}

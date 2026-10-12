// How well a note is understood: a number worked out from the study record,
// and never kept anywhere else. Change the rule here and every note's number
// changes with it; nothing on disk has to be converted.
//
// The number is a level from 0 to 6, which is the row of six squares. It is
// also a place on the recall curve: evidence at level n holds for INTERVALS[n-1]
// days, after which the note is due, and after twice that it has lapsed and
// shows one square fewer until it is tested again.
//
//   attempt, right            one level up (half, if you marked it yourself)
//   attempt, partly           holds its level, and counts as seen today
//   attempt, wrong            one level down
//   wind-back                 one level down: you told Iso it rated you too highly
//
// An exercise that tests several notes moves each of them, and shows the lowest.

import type { LearnerEvent } from "./record.ts";

export const LEVELS = 6;
/** Days that evidence at each level holds, from level 1. */
export const INTERVALS = [1, 3, 7, 16, 35, 80] as const;
const DAY = 86_400_000;

export type Result = "right" | "partly" | "wrong";

/** An exercise attempted and marked. `tests` are the notes it bears on; `by` is who marked it. */
export interface AttemptEvent extends LearnerEvent {
  event: "attempt";
  exercise: string;
  tests: string[];
  result: Result;
  by: string;
}
export interface WindBackEvent extends LearnerEvent {
  event: "wind-back";
  note: string;
}

export interface Understanding {
  /** 0 to 6, as the evidence left it; halves are possible. */
  level: number;
  /** The squares to fill: the level, rounded down, less one if it has lapsed. */
  squares: number;
  /** The same reading in the Atlas's four steps: 0 not reached, 1 opened, 2 worked through, 3 understood. */
  step: 0 | 1 | 2 | 3;
  due: boolean;
  lapsed: boolean;
  /** When it was last tested, as a time, or null. */
  last: number | null;
  /** The events the number rests on, oldest first. */
  evidence: string[];
}

const clamp = (x: number): number => Math.max(0, Math.min(LEVELS, x));
export const stepOf = (squares: number): 0 | 1 | 2 | 3 => (squares <= 0 ? 0 : squares <= 2 ? 1 : squares <= 4 ? 2 : 3);

/** Every note the record bears on, with its understanding as of `now`. Events must be in time order (as readRecord and mergeRecords give them). */
export function understanding(events: readonly LearnerEvent[], now = Date.now()): Map<string, Understanding> {
  const state = new Map<string, { level: number; last: number | null; evidence: string[] }>();
  const at = (note: string) => { let s = state.get(note); if (!s) state.set(note, (s = { level: 0, last: null, evidence: [] })); return s; };
  for (const e of events) {
    const when = Date.parse(String(e.at));
    if (Number.isNaN(when) || when > now) continue;
    if (e.event === "attempt" && Array.isArray(e.tests)) {
      const a = e as AttemptEvent, own = a.by === "you";
      for (const note of a.tests) {
        const s = at(note);
        s.level = clamp(s.level + (a.result === "right" ? (own ? 0.5 : 1) : a.result === "wrong" ? -1 : 0));
        s.last = when; s.evidence.push(e.id);
      }
    } else if (e.event === "wind-back" && typeof e.note === "string") {
      const s = at(e.note);
      s.level = clamp(s.level - 1); s.evidence.push(e.id);
    }
  }
  const out = new Map<string, Understanding>();
  for (const [note, s] of state) {
    const whole = Math.floor(s.level), holds = whole ? INTERVALS[whole - 1]! * DAY : 0;
    const age = s.last === null ? 0 : now - s.last;
    const due = whole > 0 && age > holds, lapsed = whole > 0 && age > 2 * holds;
    const squares = Math.max(0, whole - (lapsed ? 1 : 0));
    out.set(note, { level: s.level, squares, step: stepOf(squares), due, lapsed, last: s.last, evidence: s.evidence });
  }
  return out;
}

/** What an exercise shows: the lowest reading among the notes it tests (none tested yet reads as nothing). */
export function lowest(readings: Map<string, Understanding>, tests: readonly string[]): Pick<Understanding, "squares" | "step" | "due"> {
  let squares = tests.length ? LEVELS : 0, due = false;
  for (const t of tests) { const u = readings.get(t); squares = Math.min(squares, u?.squares ?? 0); due ||= !!u?.due; }
  return { squares, step: stepOf(squares), due };
}

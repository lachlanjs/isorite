// A conversation's working set (M15): what is in Iso's hand for the next turn, worked out in code from the
// conversation's file. The turns are there already; beside them go lines that switch a part on or off, briefings
// that stand for earlier turns (compaction), and what the provider counted against what was estimated.
//
// The principle of age-off: the base is where context is put away. A note Iso read can be read again, so leaving
// it out loses nothing; it is left as a pointer. What cannot be had again by reading (what you gave, your
// passages, the turns themselves) never ages off.

import type { Cost } from "@isorite/core";
import type { Turn } from "./turn.ts";

/** A note Iso read and has not used for this many turns is set aside. */
export const AGE_OFF = 3;

/** What a compaction picked from the turns it stands for, as typed fields; the briefing is written from them. */
export interface Briefing {
  id: string;
  at: string;
  /** The turns it stands for, in this conversation (none for one carried into a new conversation). */
  turns: string[];
  settled: string[];
  open: string[];
  preferences: string[];
  /** The notes the talk turned on, by id. */
  notes: string[];
  /** The conversation it was carried from ("a new conversation from here"). */
  from?: string;
  cost?: Cost;
}

/** A line of a conversation's file about its working set. `part` is `r:<note>` (a note Iso read), `t:<turn>` or
 *  `b:<briefing>`; `at` is how many turns there were when it was switched. */
export type HandLine =
  | { kind: "context"; part: string; on: boolean; at: number }
  | ({ kind: "briefing" } & Briefing)
  | { kind: "counted"; turn: string; estimated: number; counted: number };

/** The lines about the working set in a conversation's file, in order. Turns' own lines are passed over. */
export function readHand(text: string): HandLine[] {
  const out: HandLine[] = [];
  for (const raw of text.split("\n")) {
    if (!raw.trim()) continue;
    let line: { kind?: unknown };
    try { line = JSON.parse(raw) as { kind?: unknown }; } catch { continue; }
    if (line.kind === "context" || line.kind === "briefing" || line.kind === "counted") out.push(line as HandLine);
  }
  return out;
}

/** A note Iso read: the sections it read (or all of it), and the last turn it was used in, from 0. */
export interface Held { id: string; sections: string[] | "whole"; used: number; on: boolean; aged: boolean }

export interface Hand {
  /** The notes Iso read, in the order it first read them. */
  held: Held[];
  /** Each earlier turn, on or not, and the briefing that stands for it, if one does. */
  turns: { id: string; on: boolean; under?: string }[];
  briefings: { briefing: Briefing; on: boolean }[];
  /** What the provider counts for what isorite estimates, from the last turn it said; null before. */
  ratio: number | null;
}

const LINK = /\]\(\/([^)\s#]+?)\.md(?:#[^)\s]*)?(?:\s+"[^"]*")?\)/g;

/** The working set of a conversation, from its turns (oldest first) and the lines beside them. */
export function handOf(turns: readonly Turn[], lines: readonly HandLine[], age = AGE_OFF): Hand {
  // What Iso read, and the last turn each was used in: read again, linked in what it wrote, or changed.
  const held = new Map<string, { sections: Set<string> | "whole"; used: number }>();
  turns.forEach((t, k) => {
    const used = new Set<string>();
    for (const i of t.items) {
      if (i.kind === "look" && i.step.tool === "read_note" && i.step.opened && !i.step.failed) {
        const h = held.get(i.step.opened) ?? { sections: new Set<string>(), used: k };
        if (!i.step.section) h.sections = "whole";
        else if (h.sections !== "whole") h.sections.add(i.step.section);
        held.set(i.step.opened, h);
        used.add(i.step.opened);
      } else if (i.kind === "text") for (const m of i.text.matchAll(LINK)) used.add(m[1]!);
      else if (i.kind === "change") { used.add(i.note); if (i.to) used.add(i.to); }
    }
    for (const id of used) { const h = held.get(id); if (h) h.used = k; }
  });

  // The switches, the last for each part deciding; and when each was last switched, in lines.
  const switched = new Map<string, { on: boolean; at: number; line: number }>();
  const briefings: Briefing[] = [];
  let ratio: number | null = null;
  lines.forEach((l, n) => {
    if (l.kind === "context") switched.set(l.part, { on: l.on, at: l.at, line: n });
    else if (l.kind === "briefing") { const { kind: _, ...b } = l; briefings.push(b); switched.delete(`b:${b.id}`); }
    else if (l.counted > 0 && l.estimated > 0) ratio = l.counted / l.estimated;
  });

  const count = turns.length;
  const out: Held[] = [...held].map(([id, h]) => {
    const s = switched.get(`r:${id}`);
    // Switched back on, it counts as used then: it ages off from there.
    const used = s?.on ? Math.max(h.used, s.at - 1) : h.used, aged = count - 1 - used >= age;
    return { id, sections: h.sections === "whole" ? "whole" : [...h.sections], used, on: s ? s.on && !aged : !aged, aged: aged && !(s && !s.on) };
  });

  const bOn = briefings.map((b) => ({ briefing: b, on: switched.get(`b:${b.id}`)?.on ?? true }));
  const briefingLine = new Map(lines.flatMap((l, n) => (l.kind === "briefing" ? [[l.id, n] as const] : [])));
  const turnsOut = turns.map((t) => {
    const s = switched.get(`t:${t.id}`);
    const cover = [...bOn].reverse().find((b) => b.briefing.turns.includes(t.id));
    // A briefing that is on stands for its turns, unless one was switched on again after it was made.
    const covered = cover?.on && !(s && s.line > briefingLine.get(cover.briefing.id)! && s.on);
    return { id: t.id, on: covered ? false : (s?.on ?? true), ...(cover ? { under: cover.briefing.id } : {}) };
  });
  return { held: out, turns: turnsOut, briefings: bOn, ratio };
}

/** A briefing as it is sent and shown: written in code from what the compaction picked. */
export function briefingText(b: Briefing, title: (id: string) => string): string {
  const list = (head: string, items: string[]) => (items.length ? `${head}\n${items.map((x) => `- ${x}`).join("\n")}` : "");
  return [
    list("Settled:", b.settled),
    list("Still open:", b.open),
    list("What they said they want:", b.preferences),
    b.notes.length ? `The notes it turned on: ${b.notes.map((id) => `[${title(id)}](/${id}.md)`).join(", ")}` : "",
  ].filter(Boolean).join("\n\n") || "Nothing was settled or left open.";
}

// The timeline's words, for what is read out and for the one line shown with a chosen moment. The timeline itself
// shows marks only.

import { agentName } from "./agents.ts";
import type { Moment } from "./journal.ts";

const WHAT: Record<Moment["what"], string> = {
  wrote: "wrote the note", found: "found", edited: "edited", kept: "kept", offered: "offered", discarded: "removed",
  restored: "restored an earlier version", "changed elsewhere": "changed elsewhere", marked: "marked",
};

/** Who did what: "you edited", "Iso · “give the Bethe lattice form” · kept", "Iso marked: partly". */
export function describe(m: Moment): string {
  const who = m.who === "you" ? "you" : m.who === "external" ? "outside isorite" : m.who.startsWith("agent:") ? agentName(m.who) : "Iso";
  if (m.what === "marked") return `Iso marked: ${m.result ?? "done"}`;
  if (m.asked !== undefined) return `${who} · “${m.asked.length > 80 ? m.asked.slice(0, 80) + "…" : m.asked}” · ${m.what === "offered" ? "not kept yet" : WHAT[m.what]}`;
  if (m.who === "external") return m.what === "found" ? "found as it was, outside isorite" : "changed outside isorite";
  return `${who} ${WHAT[m.what]}`;
}

/** How long ago, in the largest whole unit. */
export function ago(at: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(at)) / 1000);
  const [n, unit] = s < 90 ? [0, "now"] : s < 5400 ? [Math.round(s / 60), "minute"] : s < 129600 ? [Math.round(s / 3600), "hour"] : [Math.round(s / 86400), "day"];
  return unit === "now" ? "just now" : `${n} ${unit}${n === 1 ? "" : "s"} ago`;
}

/** A moment is named by its last entry: the one the note is shown at. */
export const momentKey = (m: Moment): string => m.ids.at(-1)!;

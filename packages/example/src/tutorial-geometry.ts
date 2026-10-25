// The tutorial's Iso on the geometry example: what it answers to the two requests its section walks through.
// Anything else is answered once, plainly, with what this Iso is.

import type { Reply, Request } from "./scripted.ts";
import { BONNET, COMPACT } from "./geometry.ts";
import { UNSCRIPTED } from "./tutorial.ts";

/** The prompts the section fills in, word for word. */
export const GEOMETRY_PROMPTS = {
  /** With Gauss–Bonnet given: Iso asks you back. */
  back: "where is compactness used in the proof?",
  /** With Gauss–Bonnet given: your own answers joined into the remark. */
  remark: "put my answers on compactness together as a remark for the note",
} as const;

/** The remark Iso offers: your two answers under the question, said as one. */
export const REMARK = "**Compact:** the proof adds one local formula for each triangle, so it needs finitely many triangles, and only a compact surface has a finite triangulation. It is not what fails for the Möbius band, which is compact: there it is the orientation.";

const asked = (r: Request): string => (r.messages.filter((m) => m.role === "user").map((m) => String(m.content)).join("\n\n").split(/# What they ask(?: now)?[^\n]*\n\n/).at(-1) ?? "").trim().toLowerCase();
const tools = (r: Request): number => r.messages.filter((m) => m.role === "tool").length;

export function geometryAnswer(r: Request): Reply {
  const q = asked(r), n = tools(r);
  if (/compactness (is )?used/.test(q)) {
    if (n === 0) return { calls: [{ name: "read_note", arguments: { id: BONNET, section: "Proof sketch" } }, { name: "read_note", arguments: { id: COMPACT } }], usage: { in: 5300, out: 60, usd: 0.0064 } };
    if (n === 2) return { calls: [{ name: "ask_question", arguments: { title: "What does the sum over the triangles need?", text: "The proof adds the local formula over every triangle. If there were infinitely many, what would that sum be?", about: [BONNET] } }], usage: { in: 7600, out: 80, usd: 0.0097 } };
    return { text: "Before I say: the proof adds one formula for every triangle of a triangulation. What does that sum need in order to be a sum? I have put it as a question about the note.", usage: { in: 8100, out: 60, cached: 5600, usd: 0.0068 } };
  }
  if (q.includes("answers on compactness")) {
    if (n === 0) return { calls: [{ name: "read_note", arguments: { id: COMPACT } }, { name: "read_note", arguments: { id: BONNET, section: "Why each hypothesis" } }], usage: { in: 5600, out: 60, usd: 0.0066 } };
    if (n === 2) return { calls: [{ name: "offer_text", arguments: { id: BONNET, text: REMARK } }], usage: { in: 7900, out: 120, cached: 5000, usd: 0.0101 } };
    return { text: "I joined your two answers under the question into one remark, in your words. Insert it into the note if it says what you meant.", usage: { in: 8300, out: 40, cached: 7800, usd: 0.0049 } };
  }
  return { text: UNSCRIPTED, usage: { in: 4000, out: 40, usd: 0.0049 } };
}

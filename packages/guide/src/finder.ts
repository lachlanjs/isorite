// The guide's finder (M16, Q74): Iso where there is no model, on the public site and in a guide with no provider set
// up. It is no model and says so. It answers through the engine as a provider would, so a turn is an ordinary
// turn: it searches the guide with search_notes, reads the note that matches best, and answers with that note's
// description and links to the next few. With the switch to edit the notes on, it adds a "see also" link to the
// note you gave it, which is marked as Iso's and undone with the turn, as any of Iso's changes is.

/** What a request to the provider carried, as far as the finder reads it. */
export interface FinderRequest {
  messages: { role: string; content: unknown }[];
  tools?: { function: { name: string } }[];
}
/** Its answer: text, or tool calls to make first. It costs nothing. */
export interface FinderReply {
  text?: string;
  calls?: { name: string; arguments: Record<string, unknown> }[];
  usage: { in: number; out: number; usd: number };
}

export const NOT_A_MODEL = "I'm the guide's finder, not a model: I answer with the notes that match what you ask. With a model of your own, Iso answers anything: see [Starting a base](/your-own-base/starting-a-base.md).";

const textOf = (content: unknown): string =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((c) => (typeof c === "string" ? c : String((c as { text?: unknown }).text ?? ""))).join("\n") : String(content ?? "");

/** A hit of search_notes, as the engine writes it: `- Title (/id.md), Type: description`. */
interface Hit { id: string; title: string; type: string; description: string }
function hitsOf(result: string): Hit[] {
  const out: Hit[] = [];
  for (const m of result.matchAll(/^- (.+?) \(\/([^)\s]+)\.md\), ([A-Za-z]+)(?:: (.*))?$/gm)) out.push({ title: m[1]!, id: m[2]!, type: m[3]!.toLowerCase(), description: (m[4] ?? "").trim() });
  return out;
}

/** The first note given whole (not a passage): its id and its file as it was sent. */
function givenNote(user: string): { id: string; title: string; text: string } | null {
  const gave = /# What they gave you\n\n([\s\S]*?)(?=\n# [A-Z]|$)/.exec(user)?.[1];
  if (!gave) return null;
  for (const part of gave.split(/^(?=## )/m)) {
    const m = /^## (?:A problem: |A question: )?(.+?) \(\/([^)\s]+)\.md\)\n\n([\s\S]*)$/.exec(part.trim() + "\n");
    if (m && !part.startsWith("## A passage") && !part.startsWith("## The folder")) return { title: m[1]!, id: m[2]!, text: m[3]!.replace(/\n\nOpen questions about it:\n[\s\S]*$/, "") };
  }
  return null;
}

/** The fewest last lines of `text` that occur in it once: where a line is added after them. */
function tail(text: string): string | null {
  const lines = text.replace(/\s+$/, "").split("\n");
  for (let k = 1; k <= lines.length; k++) {
    const t = lines.slice(-k).join("\n");
    if (t.trim() && text.indexOf(t) === text.lastIndexOf(t)) return t;
  }
  return null;
}

const link = (h: Hit) => `[${h.title}](/${h.id}.md)`;
const FREE = { in: 0, out: 0, usd: 0 };

/** The finder's answer to one request. */
export function finderAnswer(r: FinderRequest): FinderReply {
  const system = textOf(r.messages.find((m) => m.role === "system")?.content);
  // Summing up a conversation (M15) asks for its fields as JSON: the finder keeps none.
  if (/^You sum up the earlier turns/.test(system)) return { text: '{"settled": [], "open": [], "preferences": [], "notes": []}', usage: FREE };
  const user = textOf(r.messages.find((m) => m.role === "user")?.content);
  const asked = (user.split(/# What they ask now\n\n/).at(-1) ?? "").trim();
  const tools = new Set((r.tools ?? []).map((t) => t.function.name));
  const results = r.messages.filter((m) => m.role === "tool").map((m) => textOf(m.content));
  const first = !/# Earlier in this conversation/.test(user);
  const said = (lines: string[]) => ({ text: [...(first ? [NOT_A_MODEL] : []), ...lines].join("\n\n"), usage: FREE });

  // Search first, with what was asked.
  if (!results.length) return tools.has("search_notes") && asked ? { calls: [{ name: "search_notes", arguments: { query: asked } }], usage: FREE } : said(["Ask me about isorite, and I'll find the notes on it."]);
  const searched = results.find((t) => t.startsWith("- ") || t.startsWith("No notes match")) ?? "";
  const given = givenNote(user);
  const hits = hitsOf(searched).filter((h) => h.id !== given?.id);
  if (!hits.length) return said(["Nothing in the guide matches that. Try other words, or start from [Start here](/start-here.md)."]);
  // A concept answers; a problem is what to try, named after it.
  const concepts = hits.filter((h) => h.type !== "problem"), problem = hits.find((h) => h.type === "problem");
  const best = concepts[0] ?? hits[0]!;
  // Then read the note that matches best, so it is in hand as Iso's reads are.
  const read = results.some((t) => t.startsWith(`# ${best.title} (/${best.id}.md)`) || /is in hand already/.test(t));
  if (!read && tools.has("read_note")) return { calls: [{ name: "read_note", arguments: { id: best.id } }], usage: FREE };
  // With the notes switch on and a note given, a "see also" link to it, at the note's end.
  const edited = results.find((t) => /^Changed |^That passage/.test(t));
  const end = given ? tail(given.text) : null;
  if (tools.has("edit_note") && given && end && !edited) {
    return { calls: [{ name: "edit_note", arguments: { id: given.id, old: end, new: `${end}\n\nSee also [${best.title}](/${best.id}.md "see also").` } }], usage: FREE };
  }
  const answer = [`The note that answers it best is ${link(best)}${best.description ? `: ${best.description.replace(/\.?$/, ".")}` : "."}`];
  const also = concepts.filter((h) => h !== best).slice(0, 2);
  if (also.length) answer.push(`See also ${also.map(link).join(" and ")}.`);
  if (problem && problem !== best) answer.push(`To try it: ${link(problem)}.`);
  if (edited?.startsWith("Changed ")) answer.push(`I added a link to ${link(best)} at the end of [${given!.title}](/${given!.id}.md), marked as mine: undo the turn to take it out.`);
  return said(answer);
}

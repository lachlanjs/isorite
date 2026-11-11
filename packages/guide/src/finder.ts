// The guide's finder (M16, Q74; an agent of its own since M25): on the public site, where no agent of yours can be
// attached, it stands in for one. It is no model and says so. It works through the engine as any agent works
// through isorite's MCP, so its turn is an ordinary agent's turn: it searches the guide with search_notes, reads the
// note that matches best, and answers with that note's description and links to the next few.

import type { Api } from "@isorite/engine";

export const NOT_A_MODEL = "I'm the guide's finder, not a model: I answer with the notes that match what you ask. With your own agent attached, it answers anything: see [Your own agent](tutorial:agents/your-own-agent.md).";

/** A hit of search_notes, as the engine writes it: `- Title (/id.md), Type: description`. */
interface Hit { id: string; title: string; type: string; description: string }
function hitsOf(result: string): Hit[] {
  const out: Hit[] = [];
  for (const m of result.matchAll(/^- (.+?) \(\/([^)\s]+)\.md\), ([A-Za-z]+)(?:: (.*))?$/gm)) out.push({ title: m[1]!, id: m[2]!, type: m[3]!.toLowerCase(), description: (m[4] ?? "").trim() });
  return out;
}

/** A call the finder made, as the pane draws it. */
export interface FinderCall { tool: string; title: string; note?: string }

const link = (h: Hit) => `[${h.title}](/${h.id}.md)`;

/** The finder's turn: what was asked, looked up through the engine under the agent `finder` (its steps on the
 *  Atlas), and its reply. `first`: the first turn of its session, which says what it is. `given`: notes given from
 *  the pane, passed over as answers. */
export async function finderTurn(api: Pick<Api, "agentLook" | "agentStatus">, session: string, asked: string, { first = false, given = [] as string[] } = {}): Promise<{ calls: FinderCall[]; reply: string }> {
  const calls: FinderCall[] = [], agent = "finder";
  const said = (lines: string[]) => [...(first ? [NOT_A_MODEL] : []), ...lines].join("\n\n");
  await api.agentStatus(agent, session, true);
  try {
    if (!asked.trim()) return { calls, reply: said(["Ask me about isorite, and I'll find the notes on it."]) };
    const found = await api.agentLook({ agent, session, tool: "search_notes", args: { query: asked } });
    calls.push({ tool: "search_notes", title: asked });
    const hits = hitsOf(found.text).filter((h) => !given.includes(h.id));
    if (!hits.length) return { calls, reply: said(["Nothing in the guide matches that. Try other words, or start from [Start here](tutorial:general/start-here.md)."]) };
    // A concept answers; a problem is what to try, named after it.
    const concepts = hits.filter((h) => h.type !== "problem"), problem = hits.find((h) => h.type === "problem");
    const best = concepts[0] ?? hits[0]!;
    await api.agentLook({ agent, session, tool: "read_note", args: { id: best.id } });
    calls.push({ tool: "read_note", title: best.id, note: best.id });
    const answer = [`The note that answers it best is ${link(best)}${best.description ? `: ${best.description.replace(/\.?$/, ".")}` : "."}`];
    const also = concepts.filter((h) => h !== best).slice(0, 2);
    if (also.length) answer.push(`See also ${also.map(link).join(" and ")}.`);
    if (problem && problem !== best) answer.push(`To try it: ${link(problem)}.`);
    return { calls, reply: said(answer) };
  } finally {
    await api.agentStatus(agent, session, false);
  }
}

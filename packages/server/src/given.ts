// What is given from the pane (notes, folders, passages) and how an agent is told it. The pane's host (isorite's own
// agent, `pi/host.ts`) keeps what it has been given once a session, by `givenKey`, and sends the rest before the next prompt.

import type { Given } from "@isorite/engine";

/** What a part given from the pane is known by, so it is given a session once: `g:<kind>:<id>`, a passage by a
 *  short hash of its text. */
export function givenKey(g: Given): string {
  if (g.kind !== "passage") return `g:${g.kind}:${g.id}`;
  let h = 5381;
  for (let i = 0; i < g.text.length; i++) h = ((h * 33) ^ g.text.charCodeAt(i)) >>> 0;
  return `g:passage:${g.id}:${h.toString(36)}`;
}

/** What was given from the pane, as the agent is told it: notes and folders by name, for the agent to read with
 *  isorite's tools, and passages as they are. */
export function given(asked: string, parts: Given[], title: (id: string) => string): string {
  const notes = parts.filter((p) => p.kind === "note").map((p) => `- ${title(p.id)} (${p.id})`);
  const folders = parts.filter((p) => p.kind === "folder").map((p) => `- the folder ${p.id}`);
  const passages = parts.flatMap((p) => (p.kind === "passage" ? [`From ${title(p.id)} (${p.id}):\n${p.text.split("\n").map((l) => "> " + l).join("\n")}`] : []));
  const out = [asked.trim()];
  if (notes.length || folders.length) out.push(`From my knowledge base (read them with read_note, or outline_note first):\n${[...notes, ...folders].join("\n")}`);
  if (passages.length) out.push(passages.join("\n\n"));
  return out.join("\n\n");
}

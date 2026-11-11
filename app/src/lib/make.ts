// New questions and problems (M12): an untitled one beside the note it is about or uses, opened in the Note pane
// with its title chosen, to type over (as V6's untitled notes are).

import { app } from "./app.svelte.ts";
import { panes } from "./panes.svelte.ts";

/** The first of `base`, `base-2`, `base-3`… free under `dir`, and its number. */
export function untitled(dir: string, base: string, free: (id: string) => boolean): { slug: string; n: number } {
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base}-${n}`;
    if (free([dir, name].filter(Boolean).join("/"))) return { slug: name, n };
  }
}

/** Make an untitled question about the note, or problem using it, and open it. Its id. */
export async function makeKind(kind: "question" | "problem", about: string): Promise<string> {
  const ids = app.listing.notes.map((n) => n.id), dir = about.split("/").slice(0, -1).join("/");
  const t = untitled(dir, `untitled-${kind}`, (id) => !ids.includes(id));
  const id = [dir, t.slug].filter(Boolean).join("/"), name = `Untitled ${kind}${t.n === 1 ? "" : ` ${t.n}`}`;
  await app.api.createNote(id, `---\ntype: ${kind === "question" ? "Question" : "Problem"}\ntitle: ${JSON.stringify(name)}\n${kind === "question" ? "about" : "uses"}: [${about}]\n---\n\n`);
  await app.refresh();
  panes.fresh = id;
  await panes.open(id, true);
  return id;
}

/** A new skill's SKILL.md (the skills base, docs/format.md): its name is its folder's, its description the sentence the agent matches requests against. */
export const skillText = (name: string): string =>
  `---\nname: ${name}\ndescription: Say when to use this skill, in a sentence the agent can match a request against.\n---\n\nWhat the agent is to do, in Markdown. Scripts and other files it needs go in this folder.\n`;

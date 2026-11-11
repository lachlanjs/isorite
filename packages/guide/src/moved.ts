// Where the guide's notes were before 0.27 moved them into six islands: an address on the site that names an old id
// (`#/n/atlas/the-switches`) still opens the note it was, by this map from the old id to the new. A note that was merged
// into another maps to the one that took it in.

/** The old id of a note of the guide, and the id it has now. */
export const MOVED: Readonly<Record<string, string>> = {
  "start-here": "general/start-here",
  "solve-this-one": "general/solve-this-one",
  "your-notes": "general/your-notes",
  "atlas/the-switches": "general/the-switches",
  "notes/a-note-is-markdown": "editing/markdown",
  "notes/diagrams-and-code": "editing/diagrams-and-code",
  "notes/every-change-is-kept": "editing/every-change-is-kept",
  "notes/write-in-your-notes": "editing/write-in-your-notes",
  "notes/go-back-a-version": "editing/go-back-a-version",
  "agent/agent-writes-marked": "editing/every-change-is-kept",
  "out-of-the-base/web-and-code-links": "notes/web-and-code-links",
  "questions-and-problems/why-markdown-links": "notes/why-markdown-links",
  "notes/islands": "atlas/make-islands-and-notes",
  "notes/make-move-delete": "atlas/make-move-delete",
  "questions-and-problems/questions": "atlas/questions-and-problems",
  "questions-and-problems/problems": "atlas/questions-and-problems",
  "questions-and-problems/resolve-a-question": "atlas/resolve-a-question",
  "questions-and-problems/ask-a-question": "atlas/resolve-a-question",
  "your-own-base/starting-a-base": "bases/starting-a-base",
  "your-own-base/keeping-a-base-well": "bases/keeping-a-base-well",
  "terminal/memory": "bases/memory",
  "terminal/the-global-base": "bases/the-global-base",
  "agent/the-skills-base": "bases/the-skills-base",
  "terminal/let-the-agent-remember": "bases/let-the-agent-remember",
  "agent/agent": "agents/the-agent-pane",
  "agent/in-hand": "agents/the-agent-pane",
  "agent/send-an-image": "agents/the-agent-pane",
  "questions-and-problems/how-the-agent-reads-you": "agents/the-agent-pane",
  "agent/ask-the-agent": "agents/ask-the-agent",
  "agent/give-it-notes": "agents/give-it-notes",
  "agent/artifacts": "agents/artifacts",
  "agent/agents-md": "agents/agents-md",
  "agent/write-agents-md": "agents/let-it-write",
  "agent/skills": "agents/skills",
  "agent/the-tutor": "agents/the-tutor",
  "terminal/your-own-agent": "agents/your-own-agent",
  "agent/let-it-write": "agents/let-it-write",
  // Not moved, named here so the map is the whole story: atlas/the-atlas, atlas/lenses, atlas/find-what-it-rests-on,
  // notes/links-and-their-kinds, notes/link-your-notes and notes/a-notes-details keep their ids.
};

/** An address (`#/n/<old id>`, or with `#/b/tutorial` before it) with a moved note's id put right; null where it names no moved note. */
export function movedHash(hash: string): string | null {
  const m = /^(#\/(?:b\/tutorial\/)?n\/)([^?#]+)([?#].*)?$/.exec(hash);
  if (!m) return null;
  let id = m[2]!;
  try { id = decodeURIComponent(id); } catch { /* left as it is */ }
  const now = MOVED[id];
  return now ? `${m[1]}${now}${m[3] ?? ""}` : null;
}

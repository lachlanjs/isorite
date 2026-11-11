// The guide's own lens (docs/lenses.md): a path through its notes for a first hour, in the order to read them. Written to
// the base's `.isorite/lenses/` where it is not already (the guide is the person's to change, so it is never written over).

/** The guide's lenses, by file name within `.isorite/lenses/`. */
export const GUIDE_LENSES: Record<string, string> = {
  "first-hour.toml": `title = "A first hour"

[[islands]]
name = "look"
title = "Look"
notes = ["/start-here.md", "/atlas/the-atlas.md", "/atlas/find-what-it-rests-on.md"]

[[islands]]
name = "write"
title = "Write"
notes = ["/notes/a-note-is-markdown.md", "/notes/write-in-your-notes.md", "/notes/link-your-notes.md", "/notes/links-and-their-kinds.md"]

[[islands]]
name = "ask"
title = "Ask"
notes = ["/agent/agent.md", "/agent/ask-the-agent.md", "/agent/give-it-notes.md"]
match = ["kind:question"]
`,
};

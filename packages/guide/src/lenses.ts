// The guide's own lens (docs/lenses.md): a tour of isorite, a step at a time, in the order a newcomer gets up to speed. Each
// step is an island titled as what you do, listing the notes to read in order and ending in the questions and problems to
// work out. Written to the base's `.isorite/lenses/` where it is not already (the guide is the person's to change, so it
// is never written over).

/** The guide's lenses, by file name within `.isorite/lenses/`. */
export const GUIDE_LENSES: Record<string, string> = {
  "tour.toml": `title = "Tour"

[[islands]]
name = "find-your-way"
title = "Find your way"
notes = ["/general/start-here.md", "/general/find-your-way.md", "/general/the-switches.md", "/atlas/the-atlas.md", "/general/solve-this-one.md", "/atlas/find-what-it-rests-on.md"]

[[islands]]
name = "write-a-note"
title = "Write a note"
notes = ["/editing/markdown.md", "/editing/shortcuts.md", "/editing/diagrams-and-code.md", "/editing/every-change-is-kept.md", "/general/your-notes.md", "/editing/write-in-your-notes.md", "/editing/go-back-a-version.md"]

[[islands]]
name = "link-your-notes"
title = "Link your notes"
notes = ["/notes/a-notes-details.md", "/notes/links-and-their-kinds.md", "/notes/web-and-code-links.md", "/notes/link-your-notes.md", "/notes/why-markdown-links.md"]

[[islands]]
name = "shape-the-map"
title = "Shape the map"
notes = ["/atlas/the-click-hold-menu.md", "/atlas/make-islands-and-notes.md", "/atlas/hide-and-unhide.md", "/atlas/make-move-delete.md"]

[[islands]]
name = "mark-where-you-stop"
title = "Mark where you stop"
notes = ["/atlas/questions-and-problems.md", "/atlas/resolve-a-question.md"]

[[islands]]
name = "regroup-the-notes"
title = "Regroup the notes"
notes = ["/atlas/lenses.md", "/atlas/use-a-lens.md"]

[[islands]]
name = "ask-the-agent"
title = "Ask the agent"
notes = ["/agents/the-agent-pane.md", "/agents/artifacts.md", "/agents/ask-the-agent.md", "/agents/give-it-notes.md", "/agents/what-a-pointer-sends.md"]

[[islands]]
name = "set-up-your-own"
title = "Set up your own"
notes = ["/bases/starting-a-base.md", "/agents/your-own-agent.md", "/agents/agents-md.md", "/bases/keeping-a-base-well.md", "/agents/let-it-write.md"]

[[islands]]
name = "work-across-bases"
title = "Work across bases"
notes = ["/bases/the-base-switcher.md", "/bases/the-global-base.md", "/bases/memory.md", "/bases/where-it-belongs.md", "/bases/let-the-agent-remember.md"]

[[islands]]
name = "be-taught"
title = "Be taught"
notes = ["/agents/skills.md", "/bases/the-skills-base.md", "/agents/the-tutor.md", "/agents/get-taught.md"]
`,
};

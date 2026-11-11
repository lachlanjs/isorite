---
type: Concept
title: The global base
tags: [bases, links, agent]
description: A base isorite keeps for what holds across all your bases, which any note can link to.
---

The global base is kept at `~/.local/share/isorite/global/` and made the first time isorite runs. It is for knowledge that holds across bases: conventions you want everywhere, a glossary, the people you work with. Its [AGENTS.md](/agents/agents-md.md "uses") says so, and is yours to change.

It is the first name in the [base switcher](/bases/the-base-switcher.md "see also"), cannot be renamed or taken out, and is [lent](/bases/memory.md "see also") to the agent while it has notes: the agent reads and writes it with `base: "global"`, its words [marked as its own](/editing/every-change-is-kept.md "uses") and kept in the global base's own journal.

Any note in any base can link to one of its notes, by its id after `global:`:

```md
[naming](global:conventions/naming.md "see also")
```

On the Atlas the link is a small mark beside the note, drawn whatever the switches say. Press it and the global base opens at that note. A mark with a dashed rose edge is a link to a note that is not there. Renaming a global note changes links to it only in the global base: `isorite check` in a base lists the ones that no longer reach a note.

Here, the mark beside this note opens [the naming convention](global:conventions/naming.md "see also") in the example Global base.

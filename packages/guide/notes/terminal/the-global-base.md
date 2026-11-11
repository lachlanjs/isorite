---
type: Concept
title: The global base
tags: [bases, links, agent]
description: A base isorite keeps for what holds across all your bases, which any note can link to.
---

The global base is a base of its own, kept at `~/.local/share/isorite/global/` and made the first time isorite runs. It is for knowledge that holds across bases: conventions you want everywhere, a glossary, the people you work with. Its [AGENTS.md](/agent/agents-md.md "uses") says so, and is yours to change.

It is always the first name in the base switcher, above your own bases. It cannot be renamed or taken out, and it is [lent](/terminal/memory.md "see also") to the agent while it has notes: the agent reads and writes it with `base: "global"`, its words [marked as its own](/agent/agent-writes-marked.md "uses") and kept in the global base's own journal.

Any note in any base can link to one of its notes:

```md
[naming](global:conventions/naming.md "see also")
```

The note's id follows `global:`, and `.md` ends it. On the Atlas the link is a small mark beside the note, drawn whatever the switches say. Press it and the global base opens at that note, in this tab. A mark with a dashed rose edge is a link to a note that is not there.

Renaming a global note changes the links to it only in the global base. Links from your other bases are not followed: `isorite check` in a base lists the ones that no longer reach a note.

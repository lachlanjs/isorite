---
type: Concept
title: Lenses
tags: [atlas, interface]
description: A lens groups the notes into islands of its own, without moving a file.
---

The Atlas draws your folders as islands, and that stays the default: pick Islands in its header and you are back. A lens is another grouping of the same notes, kept in a file, so a note can sit in "Open questions" on one map and in "Combat" on another while it stays in its folder on disk.

A lens is a short TOML file in `.isorite/lenses/`, one a lens, committed with the notes. The one that comes with this guide is `tour.toml`:

```toml
title = "Tour"
[[islands]]
name = "find-your-way"
title = "Find your way"
notes = ["/general/start-here.md", "/general/find-your-way.md"]
```

Each `[[islands]]` is a group. Its `notes` are listed by id, as a link writes them, and its `match` rules choose more: `kind:question`, `tag:combat`, `path:/combat/**`, `links-to:/combat/index.md`, and a leading `-` takes notes out. An island may hold islands.

**One home, and ghosts.** A note that more than one island holds is drawn once, in the first of them: its home. Elsewhere it is a ghost, a dashed tag, and choosing the note draws a dotted line to its ghosts. A note no island holds goes to an island called Elsewhere, last.

**Order.** Islands, and the notes an island lists, keep the order of the file, and the note list follows it, so a lens can be a path to read in order, as the tour is.

Hidden notes stay hidden in every lens. A lens never moves a file: moving a note in isorite changes the names in the lens file to match, and `isorite check` tells you where they no longer do. Your agent can read a lens and search within one island. [The Atlas](/atlas/the-atlas.md "requires") draws the folders as islands; [making islands](/atlas/make-islands-and-notes.md "see also") says how.

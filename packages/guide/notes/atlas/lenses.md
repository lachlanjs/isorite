---
type: Concept
title: Lenses
tags: [atlas, interface]
description: A lens groups the notes into islands of its own, without moving a file, and the Atlas and the list can show the base through it.
---

The Atlas draws your folders, and that stays the default: pick Folders in its header and you are back. A lens is another way to group the same notes, kept in a file, so that a note can sit in "Open questions" on one map and in "Combat" on another while it stays in its folder.

A lens is a short TOML file in `.isorite/lenses/`, one file a lens, committed with the notes. This is the one that comes with this guide, `first-hour.toml`:

```toml
title = "A first hour"
[[islands]]
name = "look"
title = "Look"
notes = ["/start-here.md", "/atlas/the-atlas.md"]
```

Each `[[islands]]` is a group. Its `notes` are listed by id, as a link writes them, and its `match` rules choose more: `kind:question`, `tag:combat`, `path:/combat/**`, `links-to:/combat/index.md`, and a leading `-` takes notes out (`-tag:old`). An island may hold islands. Its `title` is what is shown, if it should differ from its `name`.

**One home, and ghosts.** A note that more than one island holds is drawn once, in the first of them in the file: its home. In the others it is a ghost, a dashed tag that stands for it. Choose or point at a note and a dotted line runs to its ghosts. A note that no island holds goes to an island called Elsewhere, last, so no note goes missing from a lens.

**Order.** Islands, and the notes an island lists, keep the order of the file. The note list follows it when a lens is chosen, so a lens can be a path to read in order, as the one here is. Notes an island chooses by rule come after the ones it lists, by name.

Hidden notes stay hidden in every lens. A lens never moves a file: moving a note in isorite changes the names in the lens file to match, and `isorite check` tells you where they no longer do (`--fix` follows renames git recorded, `--strict` fails on notes in no island, which suits a pipeline).

Your agent can read a lens with `read_lens` and search within one island. A lens is yours to write by hand, or to ask the agent to write. Editing lenses on the map is not built yet.

The folders are still where notes live: [the Atlas](/atlas/the-atlas.md "requires") draws them, and [folders](/notes/folders.md "see also") says how they are made.

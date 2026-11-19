---
type: Concept
title: Lenses
tags: [atlas, interface]
description: A lens groups the notes into islands of its own, without moving a file.
---

The Atlas draws your folders as islands, and that stays the default: pick Islands in its header and you are back. A lens is another grouping of the same notes, kept in a file, so a note can sit in "Open questions" on one map and in "Combat" on another while it stays in its folder on disk.

**Made in the app.** The Atlas's settings, at the right of its header, hold the lenses. Type a name under new lens and it is made and shown. For the lens shown, its title and its file's name are fields, and it can be deleted (the notes stay). Its islands are listed as the file nests them: type over a name to rename it, move it up or down, give it an island inside it, or remove it. Each has its rules in one plain field under its name, `tag:combat path:/combat/**`. A note's menu in the list puts it in an island, or takes it out of the one it is in; on the map, hold a note, take the blue tag, and put it down in another island, or in Elsewhere to take it out. A note an island holds by a rule is taken out by a rule that leaves it out, `-path:/combat/old.md`.

A lens is a short TOML file in `.isorite/lenses/`, one a lens, committed with the notes. The one that comes with this guide is `tour.toml`:

```toml
title = "Tour"
[[islands]]
name = "find-your-way"
title = "Find your way"
notes = ["/general/start-here.md", "/general/find-your-way.md"]
```

Each `[[islands]]` is a group. Its `notes` are listed by id, as a link writes them, and its `match` rules choose more: `kind:question`, `tag:combat`, `path:/combat/**`, `links-to:/combat/index.md` (what links to it), `linked-from:/combat/index.md` (what it links to), and a leading `-` takes notes out. An island holds notes; `type:picture` or `type:code` makes it hold pictures or code instead, and a file listed by its path is held as it is. An island may hold islands.

**One home, and ghosts.** A note that more than one island holds is drawn once, in the first of them: its home. Elsewhere it is a ghost, a dashed tag, and choosing the note draws a dotted line to its ghosts. A note no island holds goes to an island called Elsewhere, last.

**Order.** Islands, and the notes an island lists, keep the order of the file, and the note list follows it, so a lens can be a path to read in order, as the tour is.

**Hidden, lens by lens.** With a lens shown, the grey tag hides in that lens alone, and says which. A lens hides what the base hides until you hide or show something in it: then it keeps a list of its own, `hidden = [...]` at the top of its file, and a note can be off one map and on another. Its settings list what it hides, each with a way back, and can give it the base's list again. A folder you hide does not hide a note the lens lists by name.

A lens never moves a file: moving a note in isorite changes the names in the lens file to match, and `isorite check` tells you where they no longer do. Every change to a lens made in isorite is kept, as a note's is. Your agent can read a lens, search within it or one island, and change it under its own name: ask it to make a lens of what you are learning, an island a goal. [The Atlas](/atlas/the-atlas.md "requires") draws the folders as islands; [making islands](/atlas/make-islands-and-notes.md "see also") says how.

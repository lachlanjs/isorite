---
type: Concept
title: Links and their kinds
tags: [notes, links]
description: A link joins two notes, and says how one stands on the other.
---

A link is a Markdown link to another note's file, from the base's top:

```markdown
[Leapfrog](/integrators/leapfrog.md "requires")
```

The word in quotes is the link's kind:

- **requires**: this note cannot be understood without that one. Read that one first.
- **uses**: this note draws on that one, but stands without it.
- **see also**: related, no more. A link with no kind is one of these.

[The Atlas](/atlas/the-atlas.md "see also") is drawn from the kinds: what a note requires stands before it, and the links are lines. So a kind is worth choosing: it is how the map, and your agent, know what rests on what.

Type `[[` and the start of a title to link a note, and set its kind with the button beside the link. A link to a note that is not there is struck through. Links to the web and to code are [links out of the base](/notes/web-and-code-links.md "see also").

A note moved or renamed in isorite takes its links with it: every link to it is rewritten. An address from before the move (in a note written elsewhere, an agent's reply, a bookmark) still opens it, through the record each note keeps of its moves, and the note says quietly where it was asked for. An address of a note that was deleted says so, and offers the notes of the same name. isorite's agent is told, at the start of its next turn, which of the notes it had read or linked moved or went, and your own agent's tools find a moved note by its old path.

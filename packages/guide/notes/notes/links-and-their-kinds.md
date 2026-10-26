---
type: Concept
title: Links and their kinds
description: A link joins two notes, and says how one stands on the other.
---

A link is a Markdown link to another note's file, from the base's top:

```markdown
[Leapfrog](/integrators/leapfrog.md "requires")
```

The word in quotes is the link's kind, and says how this note stands on the other:

- **requires**: this note cannot be understood without that one. Read that one first.
- **uses**: this note draws on that one, but stands without it.
- **see also**: related, no more. A link with no kind is one of these.

The kinds are what [the Atlas](/atlas/the-atlas.md "see also") is drawn from: notes are placed so that what a note requires stands before it, and the links are lines between them. So a link's kind is worth choosing: it is how the map, and Iso, know what rests on what.

Type `[` and the start of a note's title to link it, or follow a link with a click. A link to a note that is not there is shown struck through.

Links to the web and to code are [links out of the base](/out-of-the-base/web-and-code-links.md "see also").

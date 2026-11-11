---
type: Concept
title: A note is Markdown
tags: [editing, markdown]
description: A note is a Markdown file, written as you read it.
---

Every note is a Markdown file in the base's folder, and the folder is the base: open it in any editor, keep it in git, copy it away. isorite keeps its own records beside the notes, in `.isorite/`.

The Note pane shows Markdown as it reads, and its marks only on the line you are writing in:

- `**bold**` and `*italic*`, `# headings`, lists and `> quotes`.
- Maths between dollars, `$E = mc^2$` in a line or `$$…$$` on its own, as $\int_0^1 x\,dx = \tfrac12$.
- Code in backticks and fenced blocks, and [diagrams and pictures](/editing/diagrams-and-code.md "see also").

A line of the file is a line as you read it: a single newline breaks the line there, as it does in the Agent pane, and the file keeps the newline as you wrote it. A table, an equation or a diagram wider than the pane scrolls sideways in its own box, and the text around it goes on wrapping.

A PDF beside your notes opens in the Note pane, in the browser's own viewer; "open in a new tab" gives it a tab of its own.

There is nothing to save: what you type is kept as you type it, and [every change is kept](/editing/every-change-is-kept.md "see also"). The text is sized in the browser's units, so zooming the page rewraps it.

Notes are joined by [links](/notes/links-and-their-kinds.md "see also").

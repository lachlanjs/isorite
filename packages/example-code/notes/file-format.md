---
type: Concept
title: The file format
tags: [tally, storage]
description: What a tasks file looks like, and what is free in it.
---

One task to a line: `[ ]` or `[x]`, a space, then words. A word `+name` is a tag and a word `due:YYYY-MM-DD` is the due day; the rest is the text. See [the example file](/tasks.example.txt "see also").

Any line that does not start with a box is not a task. It is kept where it is, so a heading or a comment typed by hand stays through every save.

[parse.ts](/src/parse.ts "uses") is the only code that reads or writes this format, and [parsing](/notes/parse.md "see also") says why it is kept to one place. [The shape of a task](/notes/task.md "uses") is what a line becomes.

The format is [a decision](/notes/decisions/plain-text.md "see also").

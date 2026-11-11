---
type: Concept
title: Parsing
tags: [tally, parse]
description: Why a line becomes a task in one pure module.
---

[parse.ts](/src/parse.ts "uses") has two functions, `parseLine` and `formatLine`, and they are each other's inverse. They take strings and return values: no file, no clock, no printing. That makes them the easiest module to test, and [their tests](/test/parse.test.ts "uses") are only a few lines.

`parseLine` returns null for a line that is not a task, instead of throwing. A file written by hand is expected to hold such lines, so [the store](/notes/store.md "see also") keeps them rather than treating them as errors.

`formatLine` always writes tags and the due day after the text, whatever order they were typed in. Two lines that mean the same then look the same, and a change to one task shows as a change to one line.

It reads [the file format](/notes/file-format.md "requires") and returns [a task](/notes/task.md "uses"). [The add command](/notes/commands.md "see also") reuses it to read what a person typed.

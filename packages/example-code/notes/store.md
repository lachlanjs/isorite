---
type: Concept
title: The store
tags: [tally, storage]
description: Why the store holds lines, not tasks, and saves by renaming.
---

[store.ts](/src/store.ts "uses") is the only module that touches the file. It reads every line once, changes them in memory, and writes them back only when told to `save`.

It holds lines, not tasks. A line that is not a task (a heading, a blank line) is carried through untouched, which is what makes [editing the file by hand](/notes/file-format.md "requires") safe. The cost is that the tasks are re-read from the lines each time they are asked for. With a few hundred tasks that costs nothing, and there is no second copy to keep in step.

`save` writes a temporary file and renames it over the real one, a [decision](/notes/decisions/save-by-rename.md "requires") that a crash leaves the old file whole.

A missing file is an empty list, so the first `add` needs no setup. [Ids](/notes/decisions/ids-by-position.md "uses") are positions among the tasks.

It uses [parsing](/notes/parse.md "requires") for every line and is used by [the commands](/notes/commands.md "see also"). [Its tests](/test/store.test.ts "uses") use a temporary file each.

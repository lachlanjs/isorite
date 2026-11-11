---
type: Concept
title: Rendering
tags: [tally, output]
description: The one module that decides how output looks.
---

[render.ts](/src/render.ts "uses") turns tasks into lines. Nothing else formats output, so a change to how a task looks is a change to one file.

A list is sorted here, not in the store: open before done, earliest due first, tasks with no day last, and the file's order among equals. The file is never re-sorted, so [the person's own order](/notes/file-format.md "see also") stays.

`today` is a parameter. A function that read the clock could not be tested against a fixed date, and [the render tests](/test/render.test.ts "uses") depend on one to say what is overdue.

The ids it prints are those [the store](/notes/store.md "uses") gave, even when the list is filtered, so they can be typed into `done`.

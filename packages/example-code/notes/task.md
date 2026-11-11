---
type: Concept
title: The task
tags: [tally, model]
description: The one type every module shares.
---

A task is four fields: done, text, tags and a due day. [task.ts](/src/task.ts "uses") holds the type and nothing else, so every seam can import it without importing another.

The due day is a string, not a Date. Strings in the form YYYY-MM-DD sort in date order and compare with `<`, so [rendering](/notes/render.md "uses") needs no clock beyond today's date, which [main](/notes/main.md "see also") passes in.

A task has no id. Its id is [its place in the file](/notes/decisions/ids-by-position.md "see also"), worked out by [the store](/notes/store.md "see also").

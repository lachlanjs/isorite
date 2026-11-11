---
type: Decision
title: Ids are positions
tags: [tally, decision]
description: A task's id is its place in the file, and changes when one above it goes.
---

A task is named by its place among the tasks, counting from 1. There is no id written in the file, so a line stays clean and anyone can add a task by hand without choosing one.

The cost is that ids shift: remove task 2 and the old 3 is now 2. Every command prints the ids it means right now, and [list](/notes/commands.md "see also") is cheap, so the mistake of acting on a stale id is a small one, and is [worth a question](/notes/practice/hand-edits-and-ids.md "see also").

[The store](/notes/store.md "uses") works the id out in `lineOf`, counting only lines that [parse](/notes/parse.md "uses"), so a comment above a task does not shift it.

The alternative is an id written on each line. It would not shift, but [the file](/notes/file-format.md "requires") would no longer be one a person writes freehand.

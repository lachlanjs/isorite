---
type: Decision
title: Tasks in a plain text file
tags: [tally, decision]
description: Why a text file and not a database or JSON.
---

Tasks are kept in a text file, one to a line, and not in JSON or a database.

A person can read it, edit it, search it with grep, keep it in git and mend it after a mistake. A line is a unit that diffs well: one change to a task is one changed line, which JSON written on one line, or in a different order, would not give.

The cost is that [the format](/notes/file-format.md "requires") has to be parsed by hand, and a line cannot hold a newline. That is accepted: tasks are short.

[The store](/notes/store.md "see also") keeps lines it does not understand, because a format meant for people will collect things a program did not plan for. [parse.ts](/src/parse.ts "uses") is the one place that knows the format.

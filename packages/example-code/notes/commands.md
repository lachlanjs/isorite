---
type: Concept
title: The commands
tags: [tally, commands]
description: What a command is, and what it is kept from doing.
---

[commands.ts](/src/commands.ts "uses") has one small function for each of `add`, `done`, `remove` and `list`. Each takes the store, the arguments and today's date, and returns the lines to print.

A command does not print and does not save. [Printing is main's](/notes/main.md "see also"), which is why [a test can read the result](/notes/practice/why-commands-return-lines.md "see also") without capturing output. Saving is main's too, decided by the one set of names that write, so a command that only reads cannot touch the file by mistake.

`add` reads its words with [the same parser as the file](/notes/parse.md "requires"), so `+home` and `due:` work when typed with no further syntax.

Showing is [rendering](/notes/render.md "requires"); the choice of what to show (open only, one tag) is made here, the layout there. Everything is done through [the store](/notes/store.md "requires").

[Its tests](/test/commands.test.ts "uses") run whole commands against a temporary file.

---
type: Concept
title: Arguments
tags: [tally, commands]
description: Why the arguments are read by hand.
---

[args.ts](/src/args.ts "uses") turns what was typed into a command name, some words and two flags. With two flags a parser library would be larger than the problem, which is part of why [tally has no dependencies](/notes/decisions/no-dependencies.md "see also").

It does not know what any command means. `add` takes the words as a task and `done` takes the first as a number, but that is [for the commands](/notes/commands.md "see also") to decide. A flag that needs a value and has none is a [UsageError](/src/errors.ts "uses").

With no command at all it means `list`, so a bare `tally` shows what is open.

[Its tests](/test/args.test.ts "uses") pass arrays, not a process, because the function takes the words as a parameter instead of reading them from the process.

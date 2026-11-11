---
type: Concept
title: How a command flows
tags: [tally, flow]
description: One request, from the words typed to the line printed.
---

Take `tally done 2`.

1. [main.ts](/src/main.ts "uses") hands the words to [args.ts](/src/args.ts "uses"), which returns the command `done` and the words `["2"]`.
2. It looks `done` up in [commands.ts](/src/commands.ts "uses") and opens the [store](/notes/store.md "requires") on the tasks file.
3. The command asks the store to update task 2. The store finds the line, [parses it](/notes/parse.md "uses"), changes it and [formats it](/notes/parse.md "uses") again, in memory.
4. The command returns `["done 2"]`. Because `done` is in the set of commands that write, main saves the store, which replaces the file in one step.
5. main prints the lines and sets the exit code.

A mistake at any step is a [UsageError](/src/errors.ts "uses"), caught in main and printed as a message. [Why the command returns lines](/notes/practice/why-commands-return-lines.md "see also") rather than printing them is worth a question.

The same path is run by [the command tests](/test/commands.test.ts "uses"), without a process.

---
type: Concept
title: The entry point
tags: [tally, commands]
description: The one place that touches the process.
---

[main.ts](/src/main.ts "uses") has a function, `run`, that takes the arguments, the environment and today's date and returns lines and an exit code. Beneath it, a block that runs only when the file is the command calls `run` with the real process and prints.

Everything with a side effect on the process (arguments, environment, the clock, the exit code) is in that block or passed to `run` from it. [The command tests](/test/commands.test.ts "uses") call `run` directly, and one [test of the real command](/test/cli.test.ts "uses") starts a process to show the block works.

`run` catches [UsageError](/src/errors.ts "uses") and turns it into a message with exit code 1. Any other error is a bug and is allowed to show its stack.

It joins [the arguments](/notes/args.md "uses"), [the commands](/notes/commands.md "requires") and [the store](/notes/store.md "requires"), in the order [shown](/notes/how-a-command-flows.md "see also").

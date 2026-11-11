---
type: Concept
title: Overview
tags: [tally, start]
description: What tally is and how its pieces fit.
---

tally is a task tracker that keeps its tasks in a text file you can also edit by hand. It is about 200 lines of TypeScript with no dependencies, small enough to hold in your head.

It is cut into four seams, each a module that knows one thing: [parsing](/notes/parse.md "requires") knows what a line looks like, [the store](/notes/store.md "requires") knows the file, [the commands](/notes/commands.md "requires") know what a person can ask for, and [rendering](/notes/render.md "requires") knows what is printed. [main](/notes/main.md "requires") joins them and is the only part that touches the process.

[A command's path](/notes/how-a-command-flows.md "see also") follows one request through all four. [The file format](/notes/file-format.md "see also") is what sits on disk, and [the tests](/notes/tests.md "see also") say what each seam promises.

Why it is plain text, and why it has no dependencies, are [decisions](/notes/decisions/plain-text.md "see also"). Two [questions](/notes/practice/why-commands-return-lines.md "see also") and [a problem](/notes/practice/add-an-edit-command.md "see also") are there to work through.

The code starts at [main.ts](/src/main.ts "uses"), and [the README](/README.md "see also") says how to run it.

How the modules and notes are named is a convention that holds across projects, so it lives in the global base: [naming](global:conventions/naming.md "see also").

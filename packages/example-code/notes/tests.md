---
type: Concept
title: The tests
tags: [tally, tests]
description: One test file for each seam, and one for the whole.
---

The tests use `node:test` and run with `node --test`. There is one file for each seam: [parse](/test/parse.test.ts "uses"), [store](/test/store.test.ts "uses"), [args](/test/args.test.ts "uses") and [render](/test/render.test.ts "uses"), then [commands](/test/commands.test.ts "uses") for a whole request without a process, and [cli](/test/cli.test.ts "uses") for one real run.

The seams are why this is easy. Parsing and rendering take values and return values; the store takes a path, and a test gives it a temporary one; the commands return lines instead of printing. None of the tests mocks anything.

A test file names what a module promises, so reading one is a quick way to meet [the module](/notes/overview.md "see also") before reading it.

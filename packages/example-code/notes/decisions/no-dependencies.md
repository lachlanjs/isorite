---
type: Decision
title: No dependencies
tags: [tally, decision]
description: Why nothing beyond node is used, and no build step.
---

tally imports only `node:` modules, and Node 24 runs its `.ts` files directly. There is nothing to install and nothing to build: clone it and run `node src/main.ts`.

For a program this size a dependency would cost more than it gave. [The argument reader](/notes/args.md "see also") is thirty lines where a library would be a tree of packages. The TypeScript is only what Node can erase: types, no enums, imports that end in `.ts`.

[package.json](/package.json "uses") is private and lists no dependencies. It is not an npm workspace of isorite, so installing isorite never installs or tests tally.

[The tests](/notes/tests.md "see also") use the same rule, with `node:test` in place of a test framework.

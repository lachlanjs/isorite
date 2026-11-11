---
type: Question
title: Why do commands return lines instead of printing them?
about: [notes/commands, notes/main]
---

Look at [commands.ts](/src/commands.ts "uses") and [main.ts](/src/main.ts "uses"). Every command ends with a `return` of strings and main does the printing.

What would the tests in [commands.test.ts](/test/commands.test.ts "uses") have to do if the commands called `console.log` themselves? What else would be harder to change?

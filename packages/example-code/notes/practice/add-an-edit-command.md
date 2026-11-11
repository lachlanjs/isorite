---
type: Problem
title: Add an edit command
uses: [notes/commands, notes/store, notes/parse]
---

Add `tally edit 2 new words +tag`, which replaces the text and tags of task 2 and keeps whether it is done and its due day.

Change as little as you can: [the commands](/notes/commands.md "uses") should gain one function, and [the store](/notes/store.md "uses") should need nothing new. Add it to the set of commands that write, and add a test beside [the others](/test/commands.test.ts "uses"). `node --test` must pass.

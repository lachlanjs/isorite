---
type: Concept
title: tally
description: A plain-text task tracker, and how to run it.
---

# tally

A plain-text task tracker. Tasks live one to a line in `tasks.txt`:

```
[ ] write the tutorial +docs due:2026-12-01
[x] buy stamps +home
```

```
node src/main.ts add call the plumber +home due:2026-11-20
node src/main.ts list [--all] [--tag home]
node src/main.ts done 1
node src/main.ts remove 2
```

`TALLY_FILE` names another file. Node 24 runs the `.ts` files as they are, and there is nothing to install. `node --test` runs the tests.

This folder is also an isorite base: the notes beside the code explain why it is shaped so. Start at `notes/overview.md`.

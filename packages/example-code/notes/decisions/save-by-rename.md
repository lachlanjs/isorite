---
type: Decision
title: Save by renaming
tags: [tally, decision]
description: Why the file is written whole to a temporary name and renamed.
---

`save` writes the whole file to `tasks.txt.tmp`, then renames it over `tasks.txt`. A rename in one directory is a single step on the systems Node runs on, so the file is the old one or the new one, never half of each.

Writing in place would be shorter, and a crash or full disk partway through would leave a file with half its tasks gone. For a file a person keeps, that is the failure to rule out.

It does not guard against two commands at once, which could still lose one change. [The store](/notes/store.md "see also") reads the file when opened and writes it all on save, so the window is short, and [a question](/notes/practice/hand-edits-and-ids.md "see also") asks what happens when the file is edited by hand in that window.

The code is `save` in [store.ts](/src/store.ts "uses").

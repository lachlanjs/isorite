---
type: Question
title: What if the file is edited while a command runs?
about: [notes/store, notes/decisions/ids-by-position]
---

A person has `tasks.txt` open in an editor and runs `tally done 3`, saves a change in the editor, then the command saves.

Follow it through [the store](/notes/store.md "uses"): when is the file read, and when written? Which change is lost, and does [saving by renaming](/notes/decisions/save-by-rename.md "see also") help? What would it take to notice?

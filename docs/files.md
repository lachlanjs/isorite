# Files in the base

Plan and record for code and other files that sit in the notes folder. Nothing here changes what a note is.

## What is there today

The engine's `walk` (`packages/engine/src/engine.ts`) lists the base through the `Files` port (`list`, per folder), reads every `.md` and records every other file as a path with no text. It skips only names that begin with a dot. The bundle keeps those paths in `files`. `mapModel` already puts each one on the Atlas in its folder, `citeKind` gives it a kind (artifact, picture, data, document, other), and the Note pane opens it (`FilePage`). The Files switch (Alt+I) shows them and is off by default; the hidden list already hides a file by its path. Code in the base has no kind of its own (it reads as "other"), nothing is ignored but dotfiles, and `mapModel` is quadratic in the number of pictures.

Satellites stay for what is not in the base: links to the web, `code:` links into the repository, and pictures a note shows from the repository. They are drawn beside the note that links to them.

## What a file item is

A path, a kind by extension, no links of its own, and a title from its file name. A new kind, code (`.ts`, `.py`, `.rs`, `.sh`, `.css`, `.toml`, `.yaml` and the like), joins artifact, picture, data, document and other. Code and small data are read as text; the server answers a code file as `text/plain`.

## What is ignored

`node_modules`, `__pycache__` and dotfiles are never walked. The base's top `.gitignore` is respected for simple patterns (a name, `dir/`, `*.ext`, `/path`; comments and negations are left out; nested `.gitignore` files are not read). A file over 20 MB (`MAX_FILE_BYTES`) is not an item. A file over 256 kB is listed but not shown as text.

## Hidden by default

A file is not on the Atlas until a switch shows it: the Files switch for pictures, data, documents and others, the Code switch (Alt+K, which also draws links to code) for code files, the Artifacts switch as before. Once shown, one is hidden by the existing hidden list, by its path, or a folder's path for all in it. No new grammar in `hidden.txt`: a `!path` form for un-hiding one file among hidden ones was left out, since the switches already choose by kind.

## On the Atlas

A file sits in its folder's region, as a note does, with its kind's glyph (code is the angle brackets). A link from a note to a file in the base joins them by a route. A link to a file outside the base is still a satellite.

An image dropped on a note, or on the Atlas, is saved as a file item beside the note (`Engine.addImage`, `POST /api/image`): the kind is read from the bytes, the name is made safe and not taken, and it is journalled under its own path. See `docs/format.md`.

## In the Note pane

Read-only. Code is a monospace block with its lines, in the notes' code colours; a picture is the image; data as before; a file too big to show says its size.

## What agents see

Nothing changes for agents: search, `brief_base` and the MCP tools index notes alone, so code files and the hidden are in none of them. An agent that wants the code reads it with its own tools or through a `code:` link. Giving agents the files is a decision for a later change (the skills base will want it), and is not guessed here.

## Performance at 10,000 files

`docs/research/performance.md` found `mapModel` super-linear. Files add two costs: `mapModel` filtered every file per picture (quadratic), now indexed by folder once; and the map report carries every file. Switched off, the app drops them before layout, so the layout cost is the notes' alone. The walk adds one `stat` per non-Markdown file, concurrent per folder. Measured below.

## Measured

10,000 code files in 500 folders and 200 notes, in memory: open 0.35 s, `map()` 0.55 s, a 1.5 MB map report. The report carries every file whether or not its switch is on; leaving them out of it until asked is the next step if that weighs, and not done here.

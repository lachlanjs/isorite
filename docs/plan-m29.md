# Milestone 29: the notes you handle, and code that stays linked

Begun 2026-11-02, from Lachlan's notes taken using isorite at work beside omp (`screenshots/notes-to-self.png`). This milestone takes the notes about handling notes, and one about code links. The look of the app (Tern's style, the Atlas icons, read mode, the lustre pulse) is the next milestone, M30; the terminal's feel and the "performative learning" idea wait for a talk.

## What was found

- Deleting and moving a note both exist (`deleteNote`, `moveNote`, with a confirm that names the notes linking to it). They are hard to find: Delete is in the Note settings menu, and moving is the folder field in the note's details. The gap is where they are, not that they are missing.
- Folders are made only as a note is made in them (a typed name in the new-note form); there is no way to make, rename or move one.
- An agent's unquoted colon in frontmatter (`title: Foo: bar`) is invalid YAML. The core reads strictly (it is held to OKF's conformance fixtures), so such a note shows as an error and its title is lost.

## Decided

- **The core stays strict; the repair is on write.** What an agent saves is mended before it is written (`repairFrontmatter`: only a plain top-level value the parser refused is put in quotes). What you type is never rewritten under you. A note already broken is mended by the same function, offered where `isorite check` reports it.
- **Code links name what they mean, not only where.** A link may carry a symbol (a function, method or class) beside, or instead of, a line range, so that it holds when the code moves; it is shown in place as an embed of that code.

## Built

- `repairFrontmatter` (`packages/core/src/frontmatter.ts`), applied by the engine's `put` for every writer that is not you; `core/test/repair.test.ts`, and an agent test that a colon is quoted and the title read.

## To build

- Delete and move where the notes are: a menu on each note in the list and on its page, with Delete (confirmed, names who links to it, moved to a trash folder that can be restored) and "Move to…".
- Folders: a new folder from a folder's row, inline; moving a note by drag in the list.
- "Send to Iso" says what it sends and where it arrives, in the terminal and in the pane.
- Code links by symbol, shown as an embed.
- A "fix this note" for notes already broken by a colon.

## Built: code links by symbol (shown in place)

- `code:path#name` and `code:path#Class.method` as well as `#L40-L52` (`codeTarget`, `symbol`). The symbol is found by its name in the file as it is now (`packages/core/src/symbol.ts`: Python by indentation, brace languages by matching braces, with doc comments, decorators and attributes above taken in), so the link need not change when the code moves. No parser; where the finder is not enough a link names lines. Found in py, js/ts, go, rs, java, kt, cs, c/cpp, swift, php, scala, dart, zig, svelte and vue; not yet Ruby or Lua (`unsupported`, said so in the note).
- `engine.code(href)` and `GET /api/code?href=` give the lines (at most 120 shown), or why not: no repository, no file, no symbol, unsupported, too large. A symbol no longer in its file is a **broken link** as a missing file is (struck through; the agent is told once).
- `![the step](code:sim/step.py#leapfrog)` shows the code in the note (`CodeEmbed.svelte`), coloured by the file's language, with the file, symbol and lines it covers today, read again when the window is come back to. An embed of code is a link out of the note on the Atlas.
- Tests: `core/test/symbol.test.ts`, `engine/test/code-symbols.test.ts` (including that the same link finds the code after it moved), `app/tests/code-embed.spec.ts`.
- Left: a symbol's *copy* in a note that goes stale on purpose (a pinned version); Ruby and Lua; a picker for symbols when writing the link (`code:` completes the path and then the symbols in it).

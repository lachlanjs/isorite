# isorite: plan for the first slice

Written 2026-10-13 for approval. Nothing is built until this is approved, and each milestone below gets its own short plan and approval before its branch is opened.

Sources: `ISORITE_DOC.md`, `ISORITE_CONTEXT.md`, and the two decisions boards in the design artifact (https://claude.ai/artifact/Bh1SFQUWZGy1RBUFK4BSJC). Where they disagree, the boards are newer and are followed; section 7 lists the places.

## 1. What the slice is

Decided on the boards:

- **In:** one knowledge base and its study base; the editor with notes for Iso, kept and discarded; the Atlas with study folders; one exercise kind; the timeline; desktop browser only.
- **Out:** the terminal, mobile, sound, the tours, settings beyond a provider key.
- **Then:** a week of use on DMFT before anything is added.

## 2. Decisions I need before milestone 0

These fix what is written to disk, so they are expensive to change later. Each has my recommendation.

| # | Question | Recommendation |
|---|---|---|
| 1 | Which exercise kind is the one in the slice? | **Written response.** It is the kind the document argues other tools lack, and it exercises Iso's marking. Multiple choice is cheaper but tests none of that. |
| 2 | Exercises only in the study base? (a "my call" row) | Yes. |
| 3 | Understanding derived from study-record events, never stored as a number? (a "my call" row) | Yes. |
| 4 | The squares belong to a note, not an exercise? (a "my call" row) | Yes. An exercise that tests two notes shows the lower. |
| 5 | The study base names its knowledge base in its own `isorite.toml`? (a "my call" row) | Yes. |
| 6 | Leave the MCP server and search by meaning in rdstudio until they are needed? | Yes. This departs from "copy on the first day". Neither is used by the slice, the embedding model adds 49 MB, and both would be renamed and carried untested. Iso gets keyword search, outlines, sections and links. |
| 7 | Browser tests in TypeScript (`@playwright/test`) instead of Python? | Yes. It removes Python and `uv` from the repository entirely. |
| 8 | What the DMFT base starts from. `~/Repositories/dmft` holds one overview note; building a base by web research is not in the slice. | Write the base in the application during the week, with Iso. That is the product's own claim, so the week should test it. If the Atlas needs shape on day one, I can draft about 25 short notes outside the application, marked generated and unverified. Your call. |

Not blocking, decided by default unless you object: the name is lower case (`isorite`) in packages, commands and the interface; Iso is capitalised.

## 3. The repository

- `git init` in `/home/lachlanjs/isorite`, branch `main`, no remote.
- npm workspaces, Node 24, TypeScript 6, vitest, as in rdstudio.

```
packages/core     @isorite/core   pure functions, files in as text
packages/server   isorite         the command, the HTTP server (Hono, OpenAPI), Iso
app               @isorite/app    SvelteKit single-page app, Svelte 5
bench/            the Atlas layout benchmark, its fixtures and baselines
fixtures/         conformance bundles
docs/             the two documents, this plan, format.md, decisions.md
```

- The Atlas layout (`nested.js`, `router.js`, `cells.js`, their tests) moves into `packages/core`, unchanged, so a later terminal view reads the same layout data.
- Final names from the first line. No `rdstudio`, `axis`, `teacher` or old token names anywhere.

## 4. What is written to disk

To be specified in `docs/format.md` in milestone 0 and implemented in the core with tests.

**Knowledge base.** OKF notes, as rdstudio reads them. isorite writes nothing of its own into it: no fences, no comments, no journal.

**Study base,** a separate repository beside it:

```
isorite.toml                    which knowledge base this studies (path, remote, root commit)
.gitattributes                  *.jsonl merge=union
journal/<note path>.jsonl       one file per note, only ever added to
record/<device>.jsonl           what you did: attempts, marks, wind-backs
study/<folder path>/<name>.md   exercises; the folder path mirrors the folder studied
```

- **A study folder** is the folder in `study/` with the same path as a knowledge-base folder. The Atlas draws it as that folder's sibling. No configuration is needed to pair them.
- **A journal entry** is one JSON line: an id (ULID), when, session, who (`you`, `iso:<model>`, `agent:<name>`), what was asked, the change as line hunks, and hashes of the note before and after. The first entry for a note holds its full text, so any earlier state is rebuilt by replay.
- **Unkept text** is a journal entry of kind `proposal`. A later `keep` or `discard` entry settles it. What is pending is worked out by reading the journal; the note's file changes only on keep.
- **Where a proposal sits** is stored as the text around it, not as an offset. If the note changes so the place cannot be found, the proposal is shown at the note's foot as unplaced, never dropped.
- **Your own saves** in a row are one entry. A change made outside isorite is found on the next read and entered as external.
- **Understanding** is computed from `record/` events. Six squares are the fine reading; the Atlas block edge is the same value in four steps.

## 5. Milestones

Each is a branch, merged to `main` with `--no-ff`. Each ends with tests passing, the screens looked at in a browser at 1280 px on both grounds, and a short write-up of what was built and what was not checked.

**M0. Repository, core, formats.**
- The repository as in section 3; the two documents moved to `docs/`; the boards' decisions transcribed to `docs/decisions.md`.
- Carried over with tests: the core (parsing, lint, graph, keyword search, record), the conformance fixtures, the Atlas layout and its benchmark.
- New in the core, with tests: the journal (append, replay, pending proposals, placing a proposal), the study base's layout and `isorite.toml`, understanding from events.
- Commands: `isorite check <base>`, `isorite study init <base>`.
- Done when: all tests pass; the benchmark reproduces rdstudio's recorded numbers (53% straight, 25 crossings on the 225-note fixture); `isorite check` runs on `~/Repositories/dmft/knowledge`.

**M1. The shell, and writing a note.**
- Server: reads a base and its study base; reads and writes notes; writes journal entries for your saves; typed routes, generated client.
- Style: tokens under final names with malachite, the cut-corner CSS (layered backgrounds, not `clip-path`), the three faces, a parts page.
- Shell: the header (path, the atlas / notes / study switch), the notes list.
- Editor: CodeMirror live preview and the link control carried over; maths with KaTeX.
- Done when: a DMFT note with maths and typed links can be written and reopened, and its journal shows your edits as entries.

**M2. Iso in the note.**
- Carried over: the agent loop, the lookup tools, the provider adapters behind one interface (OpenRouter, any OpenAI-compatible endpoint), cost accounting, the check on quotations.
- A prompt in the note: Iso's text arrives between dotted rules as a proposal; keep, edit, remove.
- A note for Iso: a draft outside the base, linked notes chosen, sent, reviewed, kept as a note or discarded.
- The header's token count and cost, and the breakdown popup.
- A provider key setting, the only setting.
- Done when: both work against a real model on DMFT; a test shows the note's file is byte-identical until keep; closing the browser mid-proposal and returning shows the proposal again.
- A simplification to confirm then: the slice has two kinds in a note, new text at a point and a rewrite of selected paragraphs. An answer you do not want in the note is simply removed, and stays in the history.

**M3. The Atlas.**
- Layout from the core, in a worker, cached with a version number.
- Drawing rewritten as Svelte components over SVG: folders, blocks, trunks, detail by zoom, the block edge for understanding.
- Selecting a note lights what it requires and what builds on it.
- Study folders as flagged sibling folders, with the title band and the grown mark.
- Iso's path drawn live while it reads. Hold on the map to start a note for Iso; pick linked notes on the map.
- Done when: the DMFT base and rdstudio's 225-note fixture both draw; pan and zoom frame times are measured on the fixture and reported; the link layer moves to canvas only if that number is poor.

**M4. One exercise, the record, the squares.**
- An exercise is a plain note in a study folder: what it tests, the question, your working, the line marked as your answer.
- Iso makes one when asked from a study folder, as a proposal you keep.
- Sent for marking: lines marked right or wrong. Iso says nothing more unless asked in the note.
- Each attempt is a record event. The header shows the squares for what the exercise tests, with wind back.
- Done when: an exercise can be made, attempted, marked and reattempted on DMFT, and the squares and the Atlas edge move accordingly.

**M5. The timeline.**
- In the note's margin: the moments in order, the note as it was at each, what was asked, restore to a point (itself an entry).
- On the Atlas: this session's moments, each lighting the note it touched.
- Done when: every entry made in M1 to M4 appears and can be stepped through.

**Then stop, and use it for a week.**

## 6. Not in the slice, on purpose

- Recall reviews and a review queue. The squares move on exercise attempts and wind-backs only; the recall curve is added after the week if missed.
- Suggested links, the session tour, lenses other than understanding, study paths, artifacts, Mermaid.
- The other five exercise kinds.
- Streaks and daily goals (none, per the boards).
- First run beyond two commands and a key field. The logo menu is not drawn yet; the key field sits behind the logo with nothing else.
- Empty, error and offline states get plain text, not designed screens.

## 7. Where this follows the boards over `ISORITE_DOC.md`

| The document | The boards, followed here |
|---|---|
| Unkept text is in the file from the moment it arrives | Never in the file; in the journal, laid over the note |
| A seed stays in the note, folded | The prompt leaves the note on keep and stays in its history |
| The base-to-study-base mapping is in `~/.config` | In the study base's `isorite.toml` (recommended, row 5) |
| Study documents are marks on notes, not blocks | Study folders are sibling folders on the map |
| Cost at the seed's foot | Token count and cost in the header |

I would update `ISORITE_DOC.md` to match in M0, as a commit of its own that you can read as a diff. Say if you would rather edit it yourself.

## 8. Risks

- **Placing a proposal after the note has changed** is the one new mechanism with no predecessor in rdstudio. It gets the most tests in M0.
- **The overlay in CodeMirror** (text that is shown and editable, and is not in the document being saved) is the hardest interface work. If it fights the live preview, the fallback is a block widget that is read-only until "edit" is pressed.
- **SVG at scale** is measured in M3, not assumed.
- **Scope.** Five milestones is already more than rdstudio shipped between two uses. Anything that turns up during the build and is not in section 5 goes on a list for after the week.

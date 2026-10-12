# isorite: plan for the first slice

Written 2026-10-13 for approval. Nothing is built until this is approved, and each milestone below gets its own short plan and approval before its branch is opened.

Sources: `ISORITE_DOC.md`, `ISORITE_CONTEXT.md`, and the two decisions boards in the design artifact (https://claude.ai/artifact/Bh1SFQUWZGy1RBUFK4BSJC). Where they disagree, the boards are newer and are followed; section 7 lists the places.

## 1. What the slice is

Decided on the boards:

- **In:** one knowledge base and its study base; the editor with notes for Iso, kept and discarded; the Atlas with study folders; one exercise kind; the timeline; desktop browser only.
- **Out:** the terminal, mobile, sound, the tours, settings beyond a provider key.
- **Then:** a week of use on information theory. What comes next is decided from that and from `docs/architecture.md`.

## 2. Decided on 2026-10-13

Lachlan's answers to the questions this section first asked.

| # | Question | Decided |
|---|---|---|
| 1 | The one exercise kind in the slice | Written response. |
| 2 | Exercises | Only in the study base. |
| 3 | Understanding | A number, and always derived from the study record's events. Never edited or stored as the source of truth. |
| 4 | The squares | Belong to a note. An exercise that tests two notes shows the lower. |
| 5 | Which base a study base studies | Named in the study base's own `isorite.toml`. |
| 6 | Search by meaning | **In the slice,** carried over from rdstudio: "fairly fundamental to Iso's ability to get information". The MCP server still waits for the terminal milestone. |
| 7 | Browser tests | TypeScript (`@playwright/test`). No Python in the repository. |
| 8 | The trial subject | **Information theory,** which Lachlan knows well, so faults in the tool are easier to tell from gaps in the subject. Starting a base from nothing is tested afterwards. |

Also said: testing matters, and so does working out the complex parts of the architecture and how the moving parts fit, since much cannot be tested properly until those exist. So milestone 0 writes `docs/architecture.md`, covering every part in `ISORITE_DOC.md` including those outside the slice (sync, the terminal, mobile, sound), with the interfaces between them. The slice is then built against those interfaces and not around them.

The name is lower case (`isorite`) in packages, commands and the interface; Iso is capitalised.

The repository exists (`main`, with a remote `origin` on GitHub). Nothing is pushed unless Lachlan says so.

## 3. The repository

- `/home/lachlanjs/isorite`, branch `main`. Milestone branches are local; never pushed unless told.
- npm workspaces, Node 24, TypeScript 6, vitest, as in rdstudio.

```
packages/core     @isorite/core     pure functions, files in as text
packages/engine   @isorite/engine   notes, the journal's writer, Iso, search; against ports, never Node (from M1)
packages/server   isorite           the command and the HTTP server (Hono, OpenAPI): the engine's Node adapter
app               @isorite/app      SvelteKit single-page app, Svelte 5 (from M1)
bench/            the Atlas layout benchmark, its fixtures and baselines
fixtures/         conformance bundles
docs/             the two documents, this plan, architecture.md, format.md, decisions.md
```

The engine as a package of its own is proposed in `architecture.md` section 1 and is to be confirmed in the plan for M1.

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
- `docs/architecture.md`: every part and the interfaces between them, the parts outside the slice included.
- Carried over with tests: the core (parsing, lint, graph, keyword search, record), the conformance fixtures, the Atlas layout and its benchmark.
- New in the core, with tests: the journal (append, replay, pending proposals, placing a proposal), the study base's layout and `isorite.toml`, understanding from events.
- Commands: `isorite check <base>`, `isorite study init <base>`.
- Done when: all tests pass; the benchmark reproduces rdstudio's recorded numbers (53% straight, 25 crossings on the 225-note fixture); `isorite check` runs on a real base.

**M1. The shell, and writing a note.**
- Server: reads a base and its study base; reads and writes notes; writes journal entries for your saves; typed routes, generated client.
- Style: tokens under final names with malachite, the cut-corner CSS (layered backgrounds, not `clip-path`), the three faces, a parts page.
- Shell: the header (path, the atlas / notes / study switch), the notes list.
- Editor: CodeMirror live preview and the link control carried over; maths with KaTeX.
- Done when: a note with maths and typed links can be written and reopened, and its journal shows your edits as entries.

**M2. Iso in the note.**
- Carried over: search by meaning (the bundled `bge-small` model, its cache by fingerprint, its retrieval measure), offered to Iso as a second tool beside keyword search.
- Carried over: the agent loop, the lookup tools, the provider adapters behind one interface (OpenRouter, any OpenAI-compatible endpoint), cost accounting, the check on quotations.
- A prompt in the note: Iso's text arrives between dotted rules as a proposal; keep, edit, remove.
- A note for Iso: a draft outside the base, linked notes chosen, sent, reviewed, kept as a note or discarded.
- The header's token count and cost, and the breakdown popup.
- A provider key setting, the only setting.
- Done when: both work against a real model on the information theory base; a test shows the note's file is byte-identical until keep; closing the browser mid-proposal and returning shows the proposal again.
- A simplification to confirm then: the slice has two kinds in a note, new text at a point and a rewrite of selected paragraphs. An answer you do not want in the note is simply removed, and stays in the history.

**M3. The Atlas.**
- Layout from the core, in a worker, cached with a version number.
- Drawing rewritten as Svelte components over SVG: folders, blocks, trunks, detail by zoom, the block edge for understanding.
- Selecting a note lights what it requires and what builds on it.
- Study folders as flagged sibling folders, with the title band and the grown mark.
- Iso's path drawn live while it reads. Hold on the map to start a note for Iso; pick linked notes on the map.
- Done when: the information theory base and rdstudio's 225-note fixture both draw; pan and zoom frame times are measured on the fixture and reported; the link layer moves to canvas only if that number is poor.

**M4. One exercise, the record, the squares.**
- An exercise is a plain note in a study folder: what it tests, the question, your working, the line marked as your answer.
- Iso makes one when asked from a study folder, as a proposal you keep.
- Sent for marking: lines marked right or wrong. Iso says nothing more unless asked in the note.
- Each attempt is a record event. The header shows the squares for what the exercise tests, with wind back.
- Done when: an exercise can be made, attempted, marked and reattempted on information theory, and the squares and the Atlas edge move accordingly.

**M5. The timeline.**
- In the note's margin: the moments in order, the note as it was at each, what was asked, restore to a point (itself an entry).
- On the Atlas: this session's moments, each lighting the note it touched.
- Done when: every entry made in M1 to M4 appears and can be stepped through.

**Then use it for a week** on information theory, and plan the next parts from the architecture document and what the week showed.

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
- **Search by meaning** adds a 34 MB model and about 49 MB of packages, and embedding is slow in a browser. In the slice it runs in the server only.
- **SVG at scale** is measured in M3, not assumed.
- **Scope.** Anything that turns up during the build and is not in section 5 goes on a list for after the week.

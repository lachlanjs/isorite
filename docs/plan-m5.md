# Milestone 5: the timeline, and a tutorial over an example base

Written 2026-10-18, revised the same day with Lachlan's answers (section 4). Branch: `m5-timeline`. Nothing is built until Lachlan approves this.

M5 is the last milestone of the first slice (`plan-first-slice.md` §5). It also delivers the tutorial Lachlan asked for on 2026-10-18. The tutorial is a walk through every feature of isorite, done over an example knowledge base that a person is partway through building. Iso's replies are scripted into it. It is published as a static site on the project's GitHub Pages, so it needs no server, no key and no cost.

## 0. Where isorite stands

| | What it is | State |
|---|---|---|
| M0 | Repository, core, file formats, architecture | merged |
| M1 | The shell, the notes list, writing a note (live preview, maths, links), your saves in the journal | merged |
| M2 | Iso in a note (a prompt, then keep, edit or remove), notes for Iso, search by meaning, the header's tokens and cost, the key | merged |
| M3 | The Atlas: both bases, what a note rests on, Iso's path drawn live, starting notes for Iso on the map | merged |
| M4 | Study: written exercises, Iso's marking and judged moves, the squares, the study page, signing in for a key | merged |
| **M5** | **The timeline; the example base; the tutorial** | **this plan** |
| M6 | The terminal on OpenCode 2 (`plan-m6.md`) | straight after M5, possibly in a cloud session |
| then | A week of use on information theory | Lachlan |

**Done when:**
- Every entry made in M1 to M4 appears on the timeline and can be stepped through. That covers your edits, Iso's text whether kept, removed or not yet settled, changes made outside isorite, markings and restores.
- The tutorial, built as a static site, walks through every feature over the example base, with Iso's scripted replies, both offline and in a local preview of the Pages build.

## 1. The boards followed

| Board | What it settles |
|---|---|
| `Desktop-Editor` | The note's timeline in the left margin, level with the title, one row per moment. A blue square marks your changes. A gold diamond marks Iso's: filled once kept, outlined while not yet settled. Pointing at a moment marks the paragraphs it changed with a soft background and a 3 px bar on the left, lattice for yours and growth for Iso's. **Not followed:** the board's words beside each mark ("you edited", "Iso · …"). Lachlan wants the symbols only, so the timeline takes as little room as possible (section 4, answer 3). |
| `Atlas-Timeline` | On the Atlas: this session's moments, and pointing at one draws a 2.5 px outline round the block it touched, in lattice or growth. The status line says "point at a moment to see the note it touched". **Not followed:** each row's words and note title. The marks stand alone here too. |
| `Mobile-Timeline` | On a phone, the timeline is a narrow column on the `g1` ground beside the note. With symbols only, it is about 44 px wide rather than 150 px. |
| `Tour-1` … `Tour-6` | The tutorial's look. A coach card 340 px wide: growth edge, "a short tour" with step segments, a serif heading at 23 px, one or two sentences, `next` and a way out. The part being shown is lit and everything else is dimmed to 80%. The boards' six steps are where the tutorial starts. It goes further, as section 2 lists. |
| `Decisions-Design` | The timeline is in the note's margin on desktop, at the side on a phone, and on the Atlas. There are no key hints on desktop or phone: the tutorial names the keys once, as `Tour-6` does. |
| `ISORITE_DOC.md` §The timeline | Moments are evenly spaced, because order matters and the time between them does not. Selecting one shows the note as it was after it, with the change marked and what was asked. From there you can step forward or back, or restore the note to that point. A restore is itself a new entry. Another agent's moment is a diamond. |

## 2. What you will be able to do

**The timeline in a note**
1. A small icon button opens or closes the timeline. It has no words. It sits faint at the top of the left margin, beside the title, and grows clear on hover, much like the editor's other quiet controls. The icon is a short vertical line with three marks on it, drawn in the same strokes as the logo. Whether the timeline is open is remembered on this device. It starts closed.
2. The timeline is a column of marks only: squares for your changes and diamonds for Iso's, evenly spaced, oldest at the top.
3. Pointing at a mark marks the paragraphs it changed in today's text. For one of Iso's marks, what was asked also shows in a small label beside it while you point. That label is the only text, and it goes when you stop pointing. A paragraph deleted since then is not marked.
4. Clicking a mark shows the note as it was just after that moment. The text is read-only, the change is marked, and for Iso's moments what was asked is shown above. ← and → step through the moments. Two icon buttons in the same quiet style sit at the top of the note: restore to here, and back to now. Their names show on hover and are given to screen readers. A restore writes that text back as a new entry.
5. On an exercise, markings appear as moments too, with their own mark: the square of the result, as the study page draws it.

**The timeline on the Atlas**
6. The Atlas shows this session's moments, across every note, as a column of marks at the right. Pointing at one outlines the block it touched and shows the note's title in the status line. Clicking it opens the note at that moment.

**The tutorial**
7. The tutorial is a static build of the app, `npm run build:tutorial`, written to `site/`. It is meant for the project's GitHub Pages. It runs the real engine in the browser, over the example base held in memory, with a scripted provider in place of a model. Nothing is sent anywhere, and a reload starts it over.
8. It walks through using every feature, one step at a time, each in a coach card as on the `Tour-*` boards. Each step asks you to do the thing, rather than only showing it, and moves on when you have done it.
   1. The Atlas: blocks, their edges, folders, the study folders beside them.
   2. Selecting a note: what it requires and what builds on it.
   3. A note: reading it, its maths and links, following a link.
   4. Writing in a note: an edit is saved.
   5. Asking Iso in a note. The prompt is filled in for you. Iso's scripted reply arrives between the dotted rules, then you keep it, edit it or remove it.
   6. A rewrite: choose passages, Iso rewrites them, keep one region.
   7. The header's tokens and cost, opened.
   8. Holding on the Atlas to start a note for Iso, picking the notes it rests on from the map, and watching Iso's path while it reads.
   9. Reviewing that note and keeping it.
   10. The timeline: point at moments, step back, restore, and back to now.
   11. An exercise: write working, mark the answer, send it for marking, and see the marks, the squares and the Atlas's edge move.
   12. Winding back, and the reason for each move.
   13. The study page, and asking Iso for an exercise from a note's margin.
   14. A few keys (`Tour-6`).
9. If you type a prompt the script does not know, Iso answers once that in the tutorial it only answers the prompts it walks you through. Nothing breaks.
10. You can leave the tutorial at any step and keep using the example base freely, with the scripted Iso.

**The example base**
11. The base is 22 notes on dynamical mean-field theory, in four folders, the same notes and folders as on the boards. It is written to look like a person's base partway through being built. Some notes are full, some thin, one is a stub with a question in it, and one is a note for Iso not yet sent. The study base has the history that would give that: two weeks of sessions, your edits, Iso's text kept and removed, one reply not yet settled, a change made outside isorite, a restore, five exercises with attempts marked right, partly and wrong, and understanding at every level, matching the boards' block edges.
12. The same base can be written to disk with `isorite example <folder>` and served locally like any base. That is useful for trying things by hand, and it is how its history is checked.

## 3. What is built

### In the core
- `moments()` already exists (`packages/core/src/journal.ts`). It gains:
  - `who` for another agent;
  - "since removed";
  - a marking's result.
- `touched(entries, moment)` gives the line ranges a moment changed, carried forward through later hunks into today's text. A line deleted later drops out.
- `sessionMoments(journals)` gives the current session's moments across many notes, oldest first. A session is a run of changes with no gap longer than 30 minutes (`ISORITE_DOC.md`). Where entries already carry a session id, it is used.
- `examples/dmft/` holds the notes, plus `history.ts`: the example's history as entries, with times relative to when it is built. It is pure data and functions, so both the server and the browser can make the base from it.

### In the engine and the server
- `Api.version(id, entry)`: the note's text just after an entry. This uses `replay(entries, upTo)`, which already exists.
- `Api.restore(id, entry, base)`: writes that text as a `change` with `why: restore` and `to: entry`, both already in `format.md`. Like a save, it refuses with a conflict if the note has moved on.
- `Api.timeline()`: the current session's moments, for the Atlas.
- `isorite example <folder>`.

### The tutorial build
- `memoryFiles()`: the engine's `Files` port over a map in memory.
- `scriptedHttp(script)`: the engine's `Http` port, answering requests to the provider from the tutorial's script. A script entry is a prompt the tutorial fills in, plus Iso's reply as it streams, its tool calls (so the path draws on the Atlas), its tokens and its cost. Marking and exercise replies are scripted the same way.
- Search by meaning in the browser: the embedding model, about 34 MB, is too heavy for Pages. The tutorial's Iso uses keyword search and scripted "meaning" steps whose results were worked out when the site was built. The tutorial says so in one line at that step.
- `localApi(engine)`: the app's `Api` called in-process instead of over HTTP. The app already talks only to `Api`, so no screen changes for the tutorial.
- `tutorial/`: the coach card, the dimming, and the steps as data (`steps.ts`). Each step names the part to light by a `data-tour` attribute, what you are asked to do, and the event that ends the step.
- `npm run build:tutorial` uses SvelteKit's static adapter with a base path for Pages, and writes to `site/`.
- A GitHub Actions workflow to publish `site/` to Pages, **written but not pushed**. Lachlan pushes it, or says I may, when ready.

### In the app
- `Timeline.svelte`: the margin, its marks, pointing, selecting, stepping, restore and back to now, for desktop and phone.
- The icon buttons: the timeline, restore and back to now. They are faint until pointed at, with `aria-label` and a hover title, and no bracketed text.
- `NoteEditor`: a read-only mode for showing a version, and the marks for touched paragraphs.
- `AtlasTimeline.svelte`: the session's marks on the Atlas, and the outline.

## 4. Lachlan's answers (2026-10-18)

| # | Question | Answer |
|---|---|---|
| 1 | The example's subject | DMFT, as on the boards (as proposed). |
| 2 | How the timeline is opened on desktop | An icon button, with no `[ … ]` text. |
| 3 | On a phone | The same, and unobtrusive. |
| 4 | The marks | Symbols only, with no words beside each moment, so the timeline takes little room. |
| 5 | The tour | No general tour inside the app. Instead, a tutorial as on the boards that walks through using every feature over an example base being built by a person, with Iso's prompts and replies scripted, served on GitHub Pages. |
| 6 | Restoring while Iso's text is not settled | Explained below; the proposal stands unless Lachlan says otherwise. |

On 6: Iso's reply sits between the dotted rules until you keep it or remove it. Until then it is in the journal, not in the note's file. What happens to such a reply if you restore the note to an earlier version? **Proposed:** it stays between its rules, where it was, and you can still keep or remove it. If the paragraph it sat beside is gone in the restored text, it shows at the note's foot, as already happens when its place disappears.

## 5. Order of work

1. **The example base.** The notes, `history.ts` and `isorite example`, with tests that the history replays, that every journal's hashes match its file, and that the squares come out as intended.
2. **The core and the engine.** `touched`, `sessionMoments`, `version`, `restore` and `timeline`, with tests.
3. **The timeline in a note**, desktop and phone, with browser tests over the example base: every kind of moment appears and can be stepped through.
4. **The timeline on the Atlas**, with browser tests.
5. **The engine in the browser.** `memoryFiles`, `scriptedHttp`, `localApi`, and the static build. A browser test runs the app on the example base with no server.
6. **The tutorial.** The steps, the script of Iso's replies, and a browser test that walks every step of the built site.
7. **The boards and the write-up.** Screenshots beside `Desktop-Editor`, `Atlas-Timeline`, `Mobile-Timeline` and `Tour-1` to `Tour-6` at their sizes on both grounds, with the differences fixed or listed. Section 10, `architecture.md` and the memory file updated. Lachlan approves the merge.

## 6. How it is checked

- Unit tests:
  - `touched` (later edits, deletions, moves);
  - session boundaries;
  - restore (an entry, undone by restoring again, refusing on conflict);
  - the example's history;
  - the memory and scripted ports.
- Browser tests over the example base at desktop and phone sizes, and the whole tutorial on the static build.
- **No real-model calls.** It costs nothing on your key.

## 7. Risks

- **Marking today's text from an old moment.** Hunks are line-based, so a paragraph rewritten since then is marked as a whole: coarse, but honest.
- **The engine in the browser.** It was written for this (against ports), but it has never been run there. Search by meaning cannot come along at its real size, so the tutorial scripts it.
- **The tutorial depends on screens drawn by other code.** It finds parts by `data-tour` attributes, not by CSS classes. Its browser test walks every step, so a later milestone that breaks a step is caught.
- **GitHub Pages needs the remote.** The site is built and previewed locally. Publishing waits for Lachlan.

## 8. Not in this milestone

- The session tour with Iso's account of each change.
- "What changed while I was away".
- The timeline on the phone's Atlas.
- The terminal (`plan-m6.md`).

# Milestone 5: the timeline, an example base, and the tour

Written 2026-10-18 for approval. Branch: `m5-timeline`. Nothing is built until Lachlan approves this.

M5 is the last milestone of the first slice (`plan-first-slice.md` §5). On 2026-10-18 Lachlan also asked for two more things. The first is an example base that is halfway through. The second is a tutorial, so that Lachlan can keep track of what isorite does as it is built. Both are in this plan because they depend on each other. The timeline needs a history to step through. The example base supplies one, and the tour is given over the example base.

## 0. Where isorite stands

| | What it is | State |
|---|---|---|
| M0 | Repository, core, file formats, architecture | merged |
| M1 | The shell, the notes list, writing a note (live preview, maths, links), your saves in the journal | merged |
| M2 | Iso in a note (a prompt, then keep, edit or remove), notes for Iso, search by meaning, the header's tokens and cost, the key | merged |
| M3 | The Atlas: both bases, what a note rests on, Iso's path drawn live, starting notes for Iso on the map | merged |
| M4 | Study: written exercises, Iso's marking and judged moves, the squares, the study page, signing in for a key | merged |
| **M5** | **The timeline; an example base; the tour** | **this plan** |
| then | A week of use on information theory | Lachlan |
| M6 | The terminal (OpenCode 2), scoped in `plan-m6.md` | after the week, or before it if Lachlan prefers |

**Done when:**
- Every entry made in M1 to M4 appears on the timeline and can be stepped through: your edits, Iso's proposals (kept, removed or still waiting), changes made outside isorite, markings and restores.
- `isorite example <folder>` makes the example base and its study base, partway through, in a folder you choose.
- The tour runs over the example base and shows each part that has been built.

## 1. The boards followed

| Board | What it settles |
|---|---|
| `Desktop-Editor` | The note's timeline in the left margin, at `left: 72px; top: 64px; width: 250px`, level with the title. One row per moment: a blue square for yours ("you wrote the note", "you edited"); a gold diamond for Iso's, followed by what was asked in quotation marks, filled once kept and outlined while waiting. Pointing at a moment marks the paragraphs it changed with a soft background and a 3 px bar on the left: lattice for yours, growth for Iso's. With nothing pointed at, the latest Iso moment is marked. |
| `Atlas-Timeline` | On the Atlas, at the right: "this session · N moments". Each row has its mark, what happened, and the note's title on the right. Pointing at a row draws a 2.5 px outline round the block it touched, in lattice or growth. The status line says "point at a moment to see the note it touched". |
| `Mobile-Timeline` | On a phone, the timeline is a 150 px column on the `g1` ground beside the note, with rows 56 px tall, "swipe back to close", and "tap a moment to see the note as it was". |
| `Tour-1` … `Tour-6` | The tour. A coach card 340 px wide: growth edge, "a short tour" with six segments, a serif heading at 23 px, one or two sentences, `next` and `[ skip the tour ]`. The part being shown is lit and everything else is dimmed to 80%. Steps: the Atlas; hold to start a note; Iso in a note; the timeline; an exercise; a few keys. |
| `Decisions-Design` | The timeline is in the note's margin on desktop, swiped in on a phone, and on the Atlas. Pointing at a moment shows what it changed. There are no key hints on desktop or phone, so the keys are listed once, in the tour's last step. |
| `ISORITE_DOC.md` §The timeline | Moments are evenly spaced, because the order matters and the time between them does not. Selecting one shows the note as it was after it, with the change marked and what was asked. From there you can step forward or back, or restore the note to that point; a restore is itself a new entry. Another agent's moment is a diamond with its name. |

Not followed: the session tour from `ISORITE_DOC.md` ("what you did in the last session", with Iso's account of each step written by a cheap model). It costs money for every change and was left out of the slice on purpose. The tour here is the first-run tour on the `Tour-*` boards.

## 2. What you will be able to do

**The timeline in a note**
1. Show or hide the timeline beside any note. On desktop it sits in the left margin. Whether it is shown is remembered on this device. It starts hidden, as `ISORITE_DOC.md` says ("off by default").
2. Point at a moment to see what it changed: the paragraphs it touched are marked in today's text. A paragraph that has since been deleted is not marked, and the row says "since removed".
3. Click a moment to see the note as it was just after it. The text is read-only, the change is marked, and what was asked appears above it. ← and → (or `[ earlier ]` and `[ later ]`) step through the moments. `[ restore to here ]` writes that text back as a new entry. `[ back to now ]` returns to the note as it is.
4. On an exercise, markings also appear as moments: "Iso marked: partly".

**The timeline on the Atlas**

5. The Atlas shows this session's moments across every note at the right, as on `Atlas-Timeline`. Pointing at a row outlines the note's block, and clicking it opens the note at that moment.

**The example base**

6. `isorite example ~/somewhere` writes `dmft-notes/` and `dmft-notes-study/`. The base is 22 notes on dynamical mean-field theory in four folders, the same notes and folders as on the boards, so screenshots can be compared with them directly. Its study base is halfway through:
   - two weeks of sessions;
   - your edits;
   - Iso's proposals, some kept, some removed and one still waiting;
   - a change made outside isorite;
   - a restore;
   - five exercises with attempts, marked right, partly and wrong;
   - understanding at every level from "not reached" to "understood", matching the board's block edges.
7. `isorite serve ~/somewhere/dmft-notes` opens it like any base. It is yours to change, and running the command again into a new folder gives a fresh copy.

**The tour**

8. The first time isorite opens on a base, it offers "a short tour". You can also start it at any time from the logo menu ("take the tour"). It has six steps, as on the boards. Each one opens the screen it describes on the base that is open, and lights the part it names. `[ skip the tour ]` ends it, and that choice is remembered on this device.
9. A seventh step, "where isorite stands", lists what each milestone has built and what has not been built yet, from a list kept in the repository (`app/src/lib/tour/built.ts`). From now on, **every milestone adds its own tour step, or updates one, and adds whatever the example base needs to show it.** The tour and the example then keep up with the build, and opening them is how you catch up.

## 3. What is built

### In the core
- `moments()` already exists (`packages/core/src/journal.ts`). It gains:
  - `who` for another agent;
  - `since removed`;
  - the result of a marking.
- `touched(entries, moment)`: the line ranges a moment changed, carried forward through later hunks into today's text, so pointing at a moment can mark today's paragraphs. A line deleted later drops out.
- `sessionMoments(journals, now)`: the moments of the current session across many notes, oldest first. A session is a run of changes with no gap longer than 30 minutes (`ISORITE_DOC.md`). Journal entries already carry a session id, which is used where it is present.
- `example.ts`: the example's history written as entries, with time stamps relative to the moment it is made. It produces no files: the server writes them.

### In the engine and the server
- `Api.version(id, entry)`: the note's text just after an entry. This is `replay(entries, upTo)`, which already exists.
- `Api.restore(id, entry, base)`: write that text to the note as a `change` with `why: restore` and `to: entry` (`format.md` already defines both fields). Like a save, it refuses with a conflict if the note has moved on since `base`. Proposals still waiting stay waiting, placed by their text as always.
- `Api.timeline()`: the current session's moments across the base and the study base, for the Atlas. It reads only the journals changed in the last day, so it stays cheap.
- `isorite example <folder>`: copies `examples/dmft-notes/` (plain Markdown, committed in the repository), creates the study base, and writes the journals and the record from `example.ts`. It refuses if the folder already holds something.

### In the app
- `Timeline.svelte`: the margin. It has the rows, pointing at a moment, the selected moment, stepping, restore and back to now. On a phone it is a column beside the note, opened from the note's header.
- `NoteEditor`: a read-only mode for showing a version, and a mark layer for touched paragraphs (`overlays.ts` already lays marks over text).
- `AtlasTimeline.svelte`: the session list on the Atlas, and the outline on the block being pointed at.
- `tour/`: the coach card, the dimming and the steps (one file of data, `steps.ts`). The tour moves between screens with the router, waits for the part to be drawn, then lights it.
- The logo menu gains "take the tour".

### The example's notes
- 22 notes, as on the boards:
  - dmft: infinite dimensions, local self-energy, cavity construction, lattice to impurity map, Weiss field, self-consistency condition, the DMFT loop;
  - lattice models: tight binding, Hubbard model, density of states, Mott transition;
  - impurity problems: Anderson impurity model, hybridisation function, impurity solver;
  - many-body basics: second quantisation, Green's function, Matsubara frequencies, self-energy, spectral function, Dyson equation, quasiparticle weight.
- Short, correct and linked by `requires`, as the boards' routes show.
- I write them. Lachlan should glance over the physics, since a wrong example is worse than none.

## 4. Choices for Lachlan

| # | Choice | I recommend |
|---|---|---|
| 1 | The example's subject | **DMFT, as on the boards**, so every screen can be compared with its board as it stands. The alternative, a second information theory base, would be confused with your own. |
| 2 | How the timeline is opened on desktop | A `[ timeline ]` item in the status line, plus `t` when the cursor is not in the text (the key `Tour-6` names). `t` cannot work while you are typing in a note. |
| 3 | Swiping on a phone | **A button in the note's header** for now. A swipe from the left edge clashes with the browser's own "back" gesture, so I would try it on a real phone before committing to it. |
| 4 | When the tour is offered | **The first time a base is opened on a device**, and from the logo menu at any time. |
| 5 | "Where isorite stands" in the tour | **Yes**, kept up to date by each milestone. |
| 6 | Restoring a version while a proposal is waiting | **Restore, and leave the proposal waiting.** If its place has gone, it is shown as unplaced, as already happens. |

## 5. Order of work

1. **The example base.** The notes, `example.ts`, `isorite example`, and tests that the history replays, every journal's hashes match its file, and the squares come out as intended. Everything after this is tested against it.
2. **The core and the engine.** `touched`, `sessionMoments`, `version`, `restore` and `timeline`, with tests. A restore is checked to be an entry, to be undoable by restoring again, and to refuse when the note has moved on.
3. **The timeline in a note**, desktop and phone, with browser tests: every kind of moment from M1 to M4 appears and can be stepped through.
4. **The timeline on the Atlas**, with browser tests.
5. **The tour**, with a browser test that walks all seven steps over the example base.
6. **The boards and the write-up.** Screenshots beside `Desktop-Editor`, `Atlas-Timeline`, `Mobile-Timeline` and `Tour-1` to `Tour-6` at their sizes on both grounds, measured, with the differences fixed or listed. Section 10, `architecture.md`, and the memory file updated. Lachlan approves the merge.

## 6. How it is checked

- Unit tests:
  - `touched` (including later edits, deletions and moves);
  - session boundaries;
  - restore (as an entry, again, and on conflict);
  - the example's history replaying cleanly.
- Browser tests over the example base, at desktop and phone sizes, on both grounds.
- **No real-model calls.** Nothing in M5 asks Iso, so it costs nothing on your key.

## 7. Risks

- **Marking today's text from an old moment.** Hunks are line-based, so a paragraph rewritten in place since then is marked as a whole. That is honest, but coarse.
- **The tour depends on screens drawn by other code.** It finds each part by an attribute (`data-tour="…"`), not by a CSS class, so it does not break when styling changes.
- **The example's history ages.** It is written relative to the moment it is made, so "this session" on the Atlas has something in it for a day. After that the base looks like a base you have come back to, which is also worth seeing.

## 8. Not in this milestone

- The session tour with Iso's account of each change.
- "What changed while I was away" (for teams).
- The timeline on the phone's Atlas (still open on `Decisions-Design`).
- The terminal (`plan-m6.md`).

# Milestone 8: L1, the knowledge base, and the tutorial's mechanics

Written 2026-10-20. Branch `m8-l1`. The tutorial replaces the week of use (decided 2026-10-19), and the tutorial's
sections are planned and approved one at a time on the refinement page (`.refine/`, served on port 4780). This plan
is the build behind L1's approved objectives. Its items are numbered as on the page; the page holds Lachlan's own
words for each, and the readings they agreed.

## 1. What is built

**The tutorial's mechanics (T1–T8).** These are used by every later section.

| Item | Change | Where |
|---|---|---|
| T1 | The section cards on the start card look clickable at rest (an edge, the key in the accent) and highlight on hover and focus. | `Tutorial.svelte` |
| T2 | A step's objective ticks when its `check`/`until` is met, not when "next" is pressed. A step with neither is read-only and ticks on next. The start card shows each section's ticks ("7 of 14"). | `Tutorial.svelte`, `tour.svelte.ts` |
| T3 | **back** goes to the previous step without changing the base. **redo** puts the base back as it was when the step began (Q2). | the same, with a snapshot in `redo.ts` |
| T4 | A step may name the wrong moves it watches for (`wrong: () => string \| null`). A wrong move gets one line saying what the step wanted, with redo beside it. | `steps.ts` |
| T5 | The lit area is the union of every element a step names, so a chosen note, its links and the notes at their ends stay lit, as does a form the step uses. | `Tutorial.svelte` |
| T6 | The lit area follows the page every frame with no easing. Easing is only kept when the step's target changes. | `Tutorial.svelte` |
| T7 | No diamond beside the section's name. Done sections and steps show ticks (T2). | `Tutorial.svelte` |
| T8 | A step that moves to another note says so in its text. | `steps.ts` |

How redo works (T3): when a step begins, the tutorial reads every note of the base through the Api and keeps the
texts. On redo it compares the base with that copy. A note made since is deleted, a note deleted since is made
again, a moved note is moved back, and a changed note is saved with its old text. Each of these is an ordinary
change in the journal, so the timeline still tells the truth. This goes through the Api, so it works both in the
page's own engine and against `isorite --tutorial`'s server.

**Editing (K1–K3, B1).**
- **K1:** Ctrl+S goes from the tutorial's text and from the key help. L1 says that saving is automatic.
- **K2:** a folder field with suggestions as you type, as `[[` gives for notes. It is used in the new-note form and in details' path, replacing the browser's `datalist`. Typing a folder that does not exist is allowed, and is shown as "new folder".
- **K3:** on the Atlas, a note that has just been made fades in at its place after the rest has moved to the new layout. A new link is drawn as a line growing from one end to the other. A moved note fades out at its old place and in at its new one.
- **B1:** the `[ whole chain ]` toggle and its `w` key go.

**The views (V1, V2, V5).**
- **V1:** the Atlas and the note side by side on a desktop, Atlas on the left and note on the right, with a draggable divider whose width is remembered. The Atlas stays mounted in the shell, so it keeps its state while notes open beside it. The header's switch has two halves, **atlas** and **note**, and follows Lachlan's table:

  | Shown | atlas pressed | note pressed |
  |---|---|---|
  | note | atlas and note | atlas |
  | atlas | note | atlas and note |
  | atlas and note | note | atlas |

  If nothing is open yet, note opens the last note opened (Q5). On a first visit it opens the chosen note, and is greyed out until a note is chosen. On a phone (600 px and under) the two halves switch between the views.
- **V2:** the base's name beside the logo opens the list of notes, which replaces both views. The switch's highlight slides between atlas, note and both as it changes. **Study** loses its place in the switch. Until V3 makes learning a mode, study is reached by an icon button in the header. This is a named departure: V3 and V4 replace it.
- **V5:** when the base changes, a floorplanned folder's search starts from the arrangement it had (its sequence pair, with new blocks put at the end) and cools from a low temperature. What was placed well stays put, and the search still improves it. When there is no previous layout, nothing changes. A note-only folder is laid out in layers, which is deterministic, and stays as it is.

**L1 itself.** The 14 objectives as approved, in `steps.ts` as section L1. The old parts A–E stay reachable under the new section list until their sections are rewritten. The start card takes Lachlan's text and the new section list (L1, L2, E1, L3, E2, L4, E3), and sections not yet rewritten are marked "coming".

## 2. Not in this round

- I1–I6 (Iso), S1–S3 (study), V3 and V4 (learn as a mode, folder notes). These are proposals for later rounds.
- The phone's "Iso read 4 notes" strip (I6) comes with L2, since it is about Iso.
- K4 (Ctrl+S as a timeline checkpoint) is parked.

## 3. How it is checked

- `npm test`, `npm run check`, and the browser tests (`npx playwright test`), with the tutorial's tests rewritten for L1. They walk every objective, a wrong move, and a redo, on desktop and phone sizes.
- A layout test for V5: the same base with one note added keeps most blocks where they were (a measured share), while a fresh layout of the changed base is still as good by the bench's measures.
- Screenshots of each L1 step, desktop and phone, posted to the refinement page with each item's result. Anything not checked is listed there.
- The tutorial site rebuilt and published to GitHub Pages once Lachlan says so.

## 4. Order of work

1. The mechanics (T1–T8, with redo).
2. B1, K1, K2.
3. The views (V1, V2).
4. V5 and K3 on the Atlas.
5. L1's steps and the start card.
6. Tests, screenshots, results on the page.

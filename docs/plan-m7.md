# Milestone 7: the tutorial, rewritten around an N-body simulation (draft)

Written 2026-10-18 at Lachlan's asking, as a draft for him to answer (§7) before anything is built. Branch: `ccr-077f1863-dguc6x`.

## 1. What is asked

The tutorial in five parts, each one usable on its own, on desktop and on a phone, over one small project most developers can follow:

- **A. The knowledge base.** isorite as an editor of a bundle of linked notes: Markdown, the Atlas and links, new notes, rearranging notes and folders, deleting notes, frontmatter.
- **B. Iso on the base.** Selections, asking in place, rewriting a selection, keeping and removing, the timeline, what Iso is sent (and seeing it on the Atlas), and a note for Iso that becomes a note of the base.
- **C. A project.** One run of work on the example project that uses A and B together.
- **D. Study.** The study base beside the knowledge base, how understanding is shown, exercises, Iso's read of you, what it recommends, on the same project.
- **E. The terminal.** `isorite --tutorial` locally; GitHub Pages gives an outline and the replay. Agentic coding first, and the features that repeat the browser's last.

**The aim afterwards:** Lachlan uses the tutorial to refine the interface. Refine what exists, and add no features.

## 2. What exists today, against the list

This is an inventory of the code on 2026-10-18. Rows marked **no** or **partial** are the gray areas, answered in §7.

| Item | Exists | How (desktop / phone) |
|---|---|---|
| Markdown editing, maths, `[[` to link | yes | Live preview and KaTeX. `[[` completes a title into a Markdown link. Alt-L sets a link's kind (requires, uses, see also). |
| Following a link | partial | Desktop: Ctrl+click. Phone: **no way in the editor**; the Atlas is the only way to move between notes. |
| The Atlas: choosing, requires and builds on, whole chain | yes | Tap or click a note, then again to open it. `[ whole chain ]` is in the status line. Pinch and drag work on touch. |
| A new note | yes | The notes page: "new note", or + beside a folder. |
| A new folder | partial | Only by typing a new folder name when making a note. |
| Moving or renaming a note or folder | **no** | The title can change, but the file cannot. No Api, no UI. |
| Deleting a note | **no** | Only notes for Iso (drafts) can be discarded. |
| Frontmatter | yes | "details" shows type, tags and description; "source" shows the whole file. |
| Asking Iso in place, rewriting a selection | yes | Desktop: Ctrl+Enter. Phone: the "ask Iso here" field. Rewrite mode on both. |
| Keep, edit, remove | yes | Buttons on each change, plus keep all and remove all. |
| The timeline | yes | The clock beside the title. ← and → step through it; restore and back to now. The Atlas's session timeline is hidden on phones. |
| What Iso is sent | yes | The count in the header opens a dialog. Iso's path is drawn on the Atlas. |
| A note for Iso, kept as a note | yes | Start one by holding on the Atlas (works on touch), or from the notes page. Send it, then keep it in a folder. |
| Study base and knowledge base | yes | The study base is a separate repository; its `@study/` folders are drawn beside the base's folders. |
| How understanding is shown | yes | Six squares in the note's margin. Four steps on the Atlas: dotted, filled, double edge. |
| Exercise types | **partial** | There is one kind, `written`. Write working, mark a part as the answer, send it for marking. |
| Iso's read of you | yes | Click the squares for Iso's reasons; wind back. On a phone, wind back is inside the panel. |
| Recommendations | partial | The study list orders exercises: due first, then never tried, then fewest squares. There is also an exercise's `next`. Nothing else is called a recommendation. |
| Terminal: OpenCode's agent, `/atlas`, `/note`, the note view, notes in play | yes | Built in M6. |
| Terminal: "special isorite skills" | partial | The plugin adds seven tools (`brief_base`, `search_notes`, `find_similar`, `outline_note`, `read_note`, `propose_note_edit`, `propose_note_write`) and four commands. It ships **no OpenCode skill files**. |

## 3. The example project: an N-body simulation

**Why this project:** the maths is high-school physics plus one good idea (Barnes–Hut), it fits on a page, and it grows naturally. Python with NumPy is the language most readers can read. The base is named `nbody-notes`, about 22 notes in four folders, written as a developer would write them.

| Folder | Notes |
|---|---|
| `physics/` | Newton's law of gravitation · The N-body problem · Energy and its conservation · Softening · Units (G = 1) |
| `integrators/` | Euler's method · Leapfrog (kick–drift–kick) · Symplectic integrators · Choosing the timestep |
| `algorithms/` | Direct summation, O(N²) · Centre of mass · The quadtree · Barnes–Hut and the opening angle θ · Cost and accuracy |
| `simulation/` | The main loop · Initial conditions (a two-body orbit, then a Plummer sphere) · Diagnostics: energy drift · Two galaxies colliding |

**Its history:** three weeks of work, made by driving the engine as `history.ts` does now.
- Week 1: the physics, and a two-body orbit with Euler's method that spirals outward.
- Week 2: leapfrog fixes the spiral; energy drift is measured.
- Week 3: N = 2000 is too slow; Barnes–Hut is begun.

Left open on purpose, for the tutorial to finish:
- a stub on the quadtree, with a question in it;
- a TODO in Barnes–Hut;
- a note for Iso, written and not sent, asking why leapfrog conserves energy over long runs when Euler does not;
- an exercise with wrong working: the cost of direct summation, with the factor ½ from Newton's third law missed.

The study base holds about eight exercises, spread across the four steps of understanding, so the Atlas shows all four.

## 4. The shape of the tutorial

- **A start card listing the five parts.** It replaces the first step. Each part starts on its own, at a known state of the base; the base is rebuilt when a part starts. A part's progress is kept in the page only; a reload starts again, as now.
- **One step list per part**, with the same card, spotlight and `until` and `check` conditions as now.
  - Steps that differ on a phone carry their own `phone` text and target, chosen at the 600px breakpoint. For example, "press Ctrl+Enter" becomes "tap ask Iso here".
  - Every step is walked by the tests at both widths.

**A. The knowledge base** (about 9 steps):
1. The Atlas as the map of the base.
2. Choosing a note: what it requires, and what builds on it.
3. Opening it.
4. Editing: Markdown and maths as you write.
5. Linking with `[[`, and setting the link's kind.
6. Following the link.
7. Details and source: the frontmatter.
8. A new note, in a new folder.
9. Moving and deleting: per §7, Q1.

**B. Iso** (about 9 steps):
1. Ask in place in the quadtree stub.
2. Watch what Iso looks up.
3. Keep, edit or remove.
4. Select the Barnes–Hut TODO and rewrite it.
5. Keep the change.
6. The context count: what Iso is sent.
7. Iso's path on the Atlas.
8. The timeline: step back, and restore.
9. Hold on the Atlas to write a note for Iso; send the waiting one; keep the answer as a note in `integrators/`. Why: the answer is filed and linked, not lost in a chat.

**C. A project** (about 8 steps): "make the collision run at N = 5000".
1. Read the chain from the main loop back to Barnes–Hut.
2. Ask Iso how θ trades accuracy for speed, in the Barnes–Hut note.
3. Rewrite the cost section.
4. Write a note for Iso, linked to three notes, to plan the octree for 3D.
5. Keep it.
6. Link it from the main loop.
7. Look back at the week on the Atlas's session timeline (desktop only).
8. Send the plan to the agent (pointing to E).

**D. Study** (about 9 steps):
1. The two bases, and why they are separate: notes are yours to share; the record of what you know is not.
2. The squares, and the four steps on the Atlas.
3. The study list.
4. Open the direct-summation exercise.
5. Mark your answer; Iso says it is wrong, and where.
6. Fix the ½; it is right, and the squares move.
7. Iso's reasons, and winding back.
8. Ask for an exercise from a note's margin.
9. What is due, and why.

**E. The terminal**, in `isorite --tutorial` (about 11 steps):
1. OpenCode as usual: ask the agent to add leapfrog to `sim.py`.
2. It looks up the notes first (`search_notes`, `read_note`); they show under notes in play, and on the Atlas in the browser.
3. Allow its edit to the code.
4. Its edit to a note waits for you.
5. Ask it to implement Barnes–Hut from your notes; it cites them.
6. `propose_note_write`: it writes down what it learned.
7. The isorite tools and commands, listed once.
8. `/atlas barnes hut`: what the note requires and what builds on it.
9. `/note` and keep the agent's change.
10. Ask Iso in place.
11. Send to the agent from the browser.

The GitHub Pages part E is the replay of these screens, re-recorded, and a line on how to run it locally.

## 5. Steps

1. **The example base:** `nbody-notes`, its notes and its history (`packages/example`). The DMFT base is retired or kept, per §7, Q3. Its tests follow.
2. **The scripted Iso and the scripted agent** for the N-body prompts (`packages/example/src/tutorial.ts`, `packages/opencode/src/tutorial.ts`).
3. **The tutorial's frame:** the start card with five parts, per-part steps, phone variants, and a rebuild when a part starts.
4. **Parts A and B,** walked at both widths.
5. **Parts C and D,** walked at both widths.
6. **Part E:** the terminal tour rewritten, the e2e test, and the replay re-recorded.
7. **The write-up:** README, `architecture.md`, and this file's "what was built".

## 6. How it is checked

- Every part is walked end to end by Playwright: desktop and phone, lapis and quartz, on the built site.
- The terminal tour's e2e test is run as in M6.
- Each part is also walked by me in a browser at both widths, with screenshots, since the walk tests prove the steps advance, not that they read well.

## 7. Questions for Lachlan

1. **Moving, renaming and deleting notes and folders do not exist.** The list asks the tutorial to teach them, and the aim says to add no features. Options:
   - add the smallest version (move or rename a note, and delete a note, in "details");
   - teach that the base is a folder of Markdown in git, changed with your own tools;
   - leave them out.
2. **Exercise "types":** there is one, `written`. Teach the one, or is a second kind wanted?
3. **The DMFT base:** retire it everywhere (tutorial, terminal tour, tests), or keep it for the engine's tests and add the N-body base beside it?
4. **Following a link on a phone:** there is no way to do it in the editor. Should the tutorial show the Atlas as the way, or is this a gap to fix?
5. **"Skills" in part E:** the plugin adds tools and commands, not OpenCode skill files. Teach those, or ship a skill (for example "check this code against my notes") as part of this?

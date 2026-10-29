# Milestone 12: understanding, in the notes themselves

Written 2026-10-25. It follows the understanding mockup Lachlan approved on 2026-10-25 ("much better, go ahead"). The mockup is https://claude.ai/artifact/KLr7fU9GrjpTYgxdcSX6oK (version 4), built from `.refine/understand/src.html`.

On the refinement page this is U7, which replaces U1–U6; Q36–Q46 and Q47–Q53 are answered (§8). This plan replaces M10's lenses and modes, and the study base of M4 and M10. Branch `m12-understanding`, from `main`.

**Design sources.** The mockup is the reference for every screen here. The mood boards are behind on all of it, so they are used only for tokens, type and spacing (`project/isorite.css`). Wherever the mockup is silent, the app keeps what it has now.

## 1. What is asked

isorite is a workspace for understanding, and the evidence of understanding is the notes themselves: who wrote them, what is still open, what has been worked through. Scores, levels and review queues are gone.

- **Switches instead of lenses and modes.** Each pane's header has icon switches, explained only by tooltips.
  - **Note:** provenance, and the timeline.
  - **Atlas:** one switch per extra kind: open questions, problems, web links, code links. Regular notes are always shown.
  - **Iso:** what Iso may do: edit the notes, edit project files, run commands. Iso has no purpose modes.
- **Open questions and problems are notes**, first-class, with their own kinds. They live in any folder.
  - Together they mark the edge of the knowledge base. They show Iso, and you, what you are most concerned with.
  - Only you resolve a question, and a problem is solved when you say so. Iso's check of a solution is advice; it leaves questions, not a mark.
  - `[[!name]]` embeds a question or problem in a note's text, where it shows as a callout.
- **Nothing comes back on its own.** No fog, no "when you're near", no due dates. Open questions stay on the Atlas until you resolve them.
- **The study base goes.** isorite's own files move into `.isorite/` inside the notes folder, committed with the notes. A command moves an existing study base there.
  - Kept: the journals, the conversations, and the Understanding notes.
  - Dropped: exercises, marking, the study record and the six squares.
- **The Atlas:**
  - Nodes are golden-ratio rectangles. Each title is fitted to its node once, and never laid out again on zoom.
  - Titles stay readable much further out, and the zoom is smooth.
  - A node's kind icon sits on its top edge.
- **Iso's usage** moves out from under the prompt into the header: one bar fills toward the model's context window, the other toward a spend cap.
- **No explanatory text around controls** (a standing rule since 2026-10-25). Tooltips, icons and placement do that work.

## 2. What is on disk

`docs/format.md` becomes **Format 2**. The "project mode" it proposes becomes the only mode.

```
~/notes/differential-geometry/            the notes, as now (OKF 0.2)
  global/gauss-bonnet.md
  global/where-is-compactness-used.md     type: Question
  global/angles-of-a-geodesic-triangle.md type: Problem
  .isorite/                               committed with the notes (Q42)
    journal/<note id>.jsonl               as now (format §3); entries with kind "marks" are no longer written
    conversations/<id>.jsonl              as now
    understanding/<note id>.md            Iso's reading and yours (§4.4)
    settings.toml                         the base's settings: its repository (F1, Q28), later more
```

- **A question:** `type: Question`, with `about:` listing the notes it asks about, as ids, and `resolved:`, which is a date or absent. The body is the question, then whatever you work out under it.
- **A problem:** `type: Problem`, with `uses:` as ids, and `solved:`, a date or absent. The body is the statement and the solution.
- **Why the `type` field, not `kind:`.** The mockup wrote `kind:`. But OKF already requires `type`, which is why exercises were `type: Exercise`. Reusing it keeps notes readable in other OKF tools (Q49).
- **Whose fields these are.** `resolved` and `solved` are written only by your switch in the note's title row, never by Iso: its tools refuse them. `about` and `uses` are ordinary frontmatter, which you or Iso may edit.
- **An embed:** `[[!name]]` on a line of its own, where `name` is the file name without `.md`. If two files share a name, the embed must give the path, as in `[[!global/name]]` (Q50).
  - It is the format's first syntax that isn't a Markdown link. Other editors show it as text, which is acceptable.
  - An embed also counts as an `about` (for a question) or a `uses` (for a problem), so the Atlas links it.
- **Web links** are ordinary Markdown links to `http(s)` addresses, as now. **Code links** use the scheme agreed in Q26: `[sim](code:src/sim.py#L40)`. It resolves against `repository` in `.isorite/settings.toml`, which `isorite term` fills in the first time (Q28).
- **Dropped from the format:** `record/<device>.jsonl`, `study/`, `isorite.toml` and the exercise frontmatter (§5 of the format), along with the old `.gitattributes`, which `.isorite/` keeps for its `.jsonl` files.

**Moving a study base:** `isorite migrate <study base>`.
- It copies `journal/`, `conversations/` and `understanding/` into the notes' `.isorite/`.
- It writes each study exercise as a `type: Problem` note in the matching folder of the notes. Its working becomes the solution, and `tests` becomes `uses`.
- It leaves the study base itself untouched, and says so.
- It refuses if `.isorite/` already has journals, unless given `--merge`. Journals merge as a union by id, as they do between devices.

The real `~/Repositories/information-theory-study` is never touched by me. The command is tested on copies, and Lachlan runs it on their own base when they choose.

**Old study bases:** `isorite serve` on a study base, or on notes with a study base beside them, stops and tells you to run `isorite migrate`.

## 3. The switches

`app/src/lib/panes.svelte.ts` loses `LENSES`, `MODES`, `lens`, `mode`, `stepLens`, `stepMode` and `want`, and gains switches. Each pane's switches are remembered per browser, as the lenses were.

| Pane | Switch | Icon | What it does |
|---|---|---|---|
| Note | provenance | split square | The marks the Note's Iso lens drew: Iso's untouched text in gold, your edits of Iso's text dotted, a share bar under the title |
| Note | timeline | marks | The timeline in the right margin, as now, opened by this switch instead of its own button |
| Atlas | questions, problems, web, code | ?, triangle, arrow, brackets | Each kind's nodes, laid out with the notes (§5). On by default: questions and problems |
| Atlas | Iso's context (Q48) | Iso's diamond | What the Atlas's Iso lens drew: what Iso is sent, what it changed, its path. A click on a note adds it to the context or takes it out |
| Iso | notes | quill | Iso may edit the notes. Off: Iso only reads and answers, as Ask mode did |
| Iso | files, run | file, prompt | Only in a base with a repository. Turns go to the terminal agent with its permissions set to match (Q47) |

- `PaneHead.svelte` draws the switches in a group after the pane's name, with the pane's actions at the right, ending in settings.
  - A switch that is on takes its colour and shows a 2px bar under the icon.
  - Each switch has a key: Alt+P and Alt+T in the Note pane, Alt+1–5 in the Atlas, Alt+N/F/R in Iso.
  - The phone swipe on a header (from M10) goes, since there is nothing to cycle through.
- **Removed:** Understand mode, and the Atlas's and Note's Understand lenses. The Understanding note opens from an action button (the sprig) in the Note header (§4.4).
- **Iso with no modes:** what Iso does follows from what it's given. Given an open question, it asks you back before it answers, which was Understand mode's way. This goes in Iso's system prompt and in `turn.ts`'s framing of a question part.
- **Write mode's behaviour stays,** shown and not gated, whenever the notes switch is on.

## 4. Questions, problems, and what goes

### 4.1 Kinds in the engine and core

- `bundle.ts` reads `type: Question` and `type: Problem`, their `about`, `uses`, `resolved` and `solved`, and `[[!name]]` embeds. Web and code links are kept as typed links.
- An embed that doesn't resolve is an issue (`embed-broken`), like a broken link. A code link whose file is gone is marked broken, and Iso and the terminal agent are told at their next turn (Q27).
- `graph.ts` gives the new kinds their edges for the layout: question → about, and problem → uses. They don't count toward a note's PageRank.

### 4.2 The Note pane

- **Title row:** a question or problem shows its kind's glyph before the title, and a ✓ switch after it. The switch resolves the question or marks the problem solved, with the date in the tooltip, and a second press reopens it. Under the title are its `about` or `uses` notes, as links.
- **Embeds:** a callout, rose and dashed when the question is Iso's. It turns malachite with a ✓ once resolved. A click opens the question.
- **The foot of a note** lists what links to it by kind (questions, problems, web, code), as glyph rows with no heading. This takes the place of the problem list in the first mockup.
- **New ones:** "New question" and "New problem" in the hold menu on the Atlas and in the Note's settings. Each makes an untitled note of that kind in the current folder, `about` or `uses` the note open, as V6's untitled notes do.

### 4.3 Iso

- A new tool, `ask_question`, makes a question note: its title, its body, and `about`. It needs the notes switch. With the switch off, Iso's reply lists the questions with a + beside each, and pressing + makes the note as yours (§3 of the mockup).
- **Checking a problem's solution:** a framing in `turn.ts`. Iso says what holds and leaves questions where the solution leans on something unstated. It never says solved, never marks, and never touches `solved`.
- **Iso's answers as your writing:** when Iso, asked to help with a question, joins your own answers into a remark, it offers it with an insert button. The insert puts the text in the note as yours (`who: you`), because it is your sentences, lightly joined. Iso's own words still go in as proposals, as now.
- **Context:** open questions are a part kind in the Context view. The questions about a note go with it when the note is given, and can be taken out, as `Choice` allows.

### 4.4 The Understanding note

It is kept (Q43), in `.isorite/understanding/<note id>.md`.
- Iso's reading cites its evidence as chips: your words or Iso's in the note, questions open or resolved, and problems solved or not.
- Your part is a section of the same page, edited in place (V10), and no longer a box.
- It is written by `write_understanding` as now. `record_understanding` goes, since there is no record.
- It opens from the sprig in the Note header, and goes into Iso's context as a removable chip when the note does.

### 4.5 What goes

- **Removed:**
  - `study.ts`, `record.ts`, `exercise.ts`, the levels in `understanding.ts`, and `studybase.ts`;
  - the engine's marking, `testsOf` and study ids (`STUDY_PREFIX`, `@study/`);
  - `ExerciseTag`, `AtlasStudyFolder` and `AtlasStudyItem`, the squares, and the exercise bar in the Note header;
  - "send to agent" (`SendToAgent.svelte`), as already planned;
  - `isorite study init`.
- **Tests:** the browser tests for the study base, exercises and marking are deleted, and so are the core tests of the removed modules. Their fixtures turn into problem notes where they still teach something.

## 5. The Atlas

`docs/atlas-layout.md` is read before any of this.

- **Nodes are golden rectangles:** `NOTE_W, NOTE_H` go from 18 × 5 cells to 13 × 8 (1.625), the same for every kind.
  - Titles are fitted once: up to four lines, measured in the map's font after the font loads, then an ellipsis.
  - A kind's glyph sits in a notch on the top edge, as a folder's name does on its frame.
  - The floorplan's shape cost and the layered layout's spacing are re-swept for the new blocks (§4 of the layout doc), and `LAYOUT_VERSION` goes to 12.
- **Laying out the kinds:**
  - Question and problem notes are files in folders, so they are placed in their own folder like any note. Their edge to the note they are about joins the layered layout, which keeps them beside it.
  - A question about a problem sits beside the problem.
  - Web and code links aren't files. They are drawn as satellite nodes beside their note, outside the layout's placing and routing (F1). There is one node per link (Q51; Q25 had chosen one per note).
  - Turning a kind's switch on or off lays the map out again, starting from the previous layout (V5). It moves in three beats, as M10b's re-layout does.
  - A resolved question leaves the map.
- **Zoom:**
  - The world is moved by one `transform` (translate and scale). The `--u` recalculation of every block on each tick goes, and strokes are non-scaling.
  - The wheel and a trackpad pinch set a goal zoom, and each frame eases toward it by ratio, about the pointer. A touch pinch follows the fingers directly.
  - `--fs` and `--lines` stop depending on the zoom. `LABELS_AT` is replaced by a rule: titles show while 12 map units are at least 4.5px on screen.
  - A "fit" action in the Atlas header shows the whole map.
- **Folders opening by zoom** (`OPEN_AT`) works as now. Only titles stop being laid out again on zoom.

## 6. Iso's usage gauge

- **Two 3px bars in Iso's header**, before its actions.
  - The top bar is gold and fills as the context reaches the model's window, from the provider's model list where it gives one, else 200k.
  - The bottom bar fills toward the spend cap, and turns rose past 80%.
  - The tooltip gives the figures.
- **The cap comes from the key where it can.**
  - With OpenRouter (Lachlan's note on Q52), the server asks `GET https://openrouter.ai/api/v1/key` with the key it already holds. The answer gives `limit`, `limit_remaining`, `limit_reset` (daily, weekly, monthly or none) and `usage_monthly`.
  - The bar then fills to the key's own limit, over the key's own period, and the tooltip names that period.
  - It is asked when the pane opens and after each turn, at most once a minute. The key never goes to the browser.
- **Otherwise,** for another provider or an OpenRouter key with no limit:
  - The cap is a setting in Iso's settings, `spend_cap` in `config.toml`, in dollars per calendar month (Q52), with no cap by default.
  - Spend is summed from the conversations' recorded costs.
  - With no cap at all, the bar shows this month's spend against the most spent in any month so far.
- **The quiet line under Iso's input** (tokens, tier, cost) goes. The tier moves into the context view, where it is chosen now.

## 7. Steps

Each step is a commit with its tests, as before. Svelte files go through `svelte-autofixer`.

| Step | What | Sections |
|---|---|---|
| 1 | `.isorite/` as the only home; Format 2; serve refuses old study bases; `isorite migrate` | 2 |
| 2 | The study base, exercises, marking, the record and the squares removed; tests pruned | 4.5 |
| 3 | Switches in the pane headers; lenses and modes removed; Iso's permissions; the terminal for files and run | 3 |
| 4 | Question and problem notes: core, embeds, the title-row switch, the note's foot, making new ones | 4.1, 4.2 |
| 5 | Iso: `ask_question`, checking a solution, inserting your answers, questions in the context; the Understanding note reworked | 4.3, 4.4 |
| 6 | Web and code links as kinds (F1), with `settings.toml` and broken code links | 2, 4.1 |
| 7 | The Atlas: golden nodes, fitted titles, glyph notches, the kinds laid out, the eased zoom, fit; the layout re-swept | 5 |
| 8 | Iso's usage gauge and spend cap | 6 |
| 9 | The tutorial brought in line; screenshots against the mockup; write-up in §9; results on the page | |

- **The tutorial (step 9):**
  - L1 and L2 are changed only where they name a lens or a mode.
  - L3 taught the study base, which is gone. It becomes "Questions and problems", walked on the differential geometry base from the mockup, added to `packages/example` as a second example.
  - T9–T11 and V11–V12 (M10d) stay for the next milestone unless they fall out of this one on the way (Q53 asks).
- **The real-model check** runs once, at step 5, on a temporary copy: a question asked back, a solution checked, and an Understanding note written. It should cost under $0.15, and I'll report the figure.

## 8. Answers (2026-10-25)

All seven were answered as recommended:
- **Q47:** files and run go to the terminal agent, with its permissions matching the switches.
- **Q48:** Iso's context is a fifth Atlas switch.
- **Q49:** `type: Question` and `type: Problem`.
- **Q50:** `[[!name]]` by file name, with the path only when two files share it.
- **Q51:** one node per web link, which replaces Q25's answer.
- **Q52:** a monthly cap, taken from the OpenRouter key's own limit where there is one (§6).
- **Q53:** M10d's items wait for the next milestone.

## 9. What was built

Steps 1–9, as committed on `m12-understanding`. Where it differs from the plan above:

- **The record is kept as a usage log.** Only what turns cost, and what was cleared from Iso's context.
- **Only the open note's Understanding note goes to Iso.**
- **New questions and problems** are made from the Atlas hold menu and the Note settings.
- **Turns don't flip switches,** except provenance, which opens when you open a change.
- **Blocks are 126 × 77** (the mockup's size), not 13 × 8 or 91 × 56. On the differential geometry base the map is about 38% larger in area than with the old 18 × 5 blocks, and more links ran backwards (14% against 9%).
- **The floorplan's `stay` cost** keeps a warm layout where it stood (adding one note had turned a third of the folders round).
- **E1's flake** was the test: its `finish()` matched "done" inexactly and pressed the section's own button in the list, which began the section again.
- **Real-model check** (step 5, on a temporary copy): 4 turns, $0.093 in all. It caught a slip in a written solution, made a question note, wrote an Understanding reading that links its evidence, and offered answers back in the person's own words. Two rules in Iso's instructions were tightened after it.

**Layout shape (step 7).** Swept on the 78-note differential geometry base, 6 seeds, golden blocks. Shape 1.4: line 40.5k ± 3.7k, bends 365, area 5.15M ± 0.83, back links 0.14 ± 0.17, straight highways 0.78. Shape 1.0: line 40.3k ± 1.3k, bends 377, area 4.77M ± 0.34, back 0.09 ± 0.04, straight 0.86. Shape 1.2 is about the same as 1.0. Area .005/.02, flow 2, bend 8 and cross 40 were no better. `PLAN_COSTS.shape` is now 1.0 (the whole map on a phone takes 1 / shape, so 1.0 too) and `LAYOUT_VERSION` is 14. The rdstudio base was not checked. `nested.js`'s own `SHAPE` (1.4), which sizes the simple packing rather than the floorplan, was not part of the sweep and is unchanged.

**Iso's usage gauge (step 8).** Two 3px bars in Iso's header: the context against the model's window (from OpenRouter's model list, else 200k), and spend against, in turn, the key's own limit and period (`GET /key`, asked at most once a minute, the key never leaves the server), the `provider.spend_cap` setting (dollars a calendar month, UTC), or the most spent in any month so far. The lines under Iso's box are gone: the tier moved into the Context view, and Build mode's model, tokens and cost are in the gauge's tooltip. Spend counts what the journals and records hold; the terminal agent's own spend is not in it. The path through OpenRouter's real `/key` was tested against a stubbed answer only.

**The second example (step 9).** `packages/example/geometry/`: eleven notes on surfaces, curvature and global geometry, six questions (two made by Iso), nine problems (four solved), a web link and two code links (one file is missing on purpose), and a small `code/` folder named by the base's `repository`. `buildGeometry` makes its history by driving the engine with a scripted Iso, as the first example's is made: Iso's proof sketch in Gauss–Bonnet, untouched; your examples; two questions Iso asked; a solution Iso read and did not mark; Iso's reading of you. `isorite example <folder> --geometry` writes it. Iso-made questions take their ids from their titles (`global/what-makes-t-a-disc`), not the mockup's.

L3 is now "Questions and problems" (twelve steps), on that base: whose words, the timeline, a question in a note, questions on the Atlas, links out, giving Iso a note, Iso asking back, your answers put together and inserted, Iso's reading, resolving. The tutorial site loads the page again with `?base=geometry` when a section needs the other base, carrying where the tutorial is in the tab's session storage; `isorite --tutorial` serves one base, so L3 is not offered beside the terminal. L1 and L2 name no lens or mode and were not changed beyond L2's closing line. The old L3 (Understanding) is gone; its Understanding-note step is folded into the new one.

**Not done:** T9–T11 and V11–V12 (Q53), the rdstudio layout check, and screenshots against the mockup (the mockup is not in the repository).

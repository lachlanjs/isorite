# Milestone 10: three panes, lenses, and Iso in its own pane

Written and approved 2026-10-22, after Lachlan's ideas for the panes (2026-10-22) and the mockup they approved ("way better",
<https://claude.ai/artifact/9c14LQNbXWyXFeL91LM6z7>, locally `.refine/mockup.html` at `localhost:4780/mockup`).
Branch `m10-panes`, started from `m9-l2`, so M9's engine work (each part of Iso's context chosen on its own, the `Choice` on a request) is kept, and its inline Iso is taken out here. The refinement page items are W1–W5.

## 1. What is asked

In Lachlan's words: three panes, "think/write → connect/map → build/converse/collaborate". The **Note** pane, the **Atlas** pane and the **Iso** pane, tightly joined: whatever is in one can be brought to another.

- **Desktop:** three columns by default; other tiled layouts allowed. **Phone:** one pane at a time, swiped left and right; with three, every pane is one swipe from the others.
- **Note and Atlas each have three lenses:** normal, Iso, understand. A lens changes what is shown, never what Iso may do. On a phone a lens is changed by swiping up or down **on the pane's header only**, never on the note (agreed 2026-10-22); on a desktop by a key or a small button.
- **Iso's pane has modes,** which are what Iso may do: **Ask** (reads the knowledge base), **Write** (also writes it), **Build** (reads, writes and runs the project; also the knowledge base), **Understand** (reads the knowledge base, writes the study base). "Lens" and "mode" are kept apart in words and look (agreed).
- **Iso's pane is a chat like Claude Code's.** It shows what Iso reads and changes, and those reads and changes show in the other panes, whose lenses may change to show them. **A pane you are working in is never switched;** the lens Iso wants is lit instead (agreed).
- **Write mode's changes go straight into the note.** You do not have to review them, but you can always see what Iso changed.
- **Understanding, not study.** Every note has an Understanding note: Iso's reading of your understanding, what changed it, and a scratchpad only you see. Iso tracks your understanding and tailors its replies in Understand mode by it. Less weight on exercises.
- **Inline Iso is dropped** ("worth exploring, but I don't think it works as well as I hoped").
- **For a developer** the Iso pane will mirror the terminal's OpenCode session (W3–W5, spiked on 2026-10-21).

## 2. Two milestones, not one

| | M10 (this plan) | M11 (next plan) |
|---|---|---|
| Panes, layouts, swiping | yes | |
| Note and Atlas lenses | yes | |
| The Iso pane, on isorite's own engine | Ask, Write, Understand | |
| Understanding notes, tailoring | yes | |
| The context tray | yes | |
| The tutorial | L1 and L2 rewritten, E1 adjusted, L3 drafted | L4 |
| The terminal's session in the Iso pane | | yes (`opencode2 serve`, the TUI with `--server`, the server as proxy) |
| Build mode | | yes, it needs a project and a shell |
| Reaching it over Tailscale; a configurable port | | yes |

**Why split:** M10 is all in the browser and the engine, and is tested with the scripted provider as everything so far has been. M11 changes how `isorite term` starts OpenCode and opens the server beyond localhost, which wants its own plan and its own security review. M10 is built so M11 only adds a second source to the Iso pane (§4).

## 3. The panes

**The shell.** `+layout.svelte` holds the three panes as one row; each pane is a component that stays mounted, so the Atlas keeps its layout and the editor its place when a pane is hidden or swiped away.

| | Desktop (over 760 px) | Phone |
|---|---|---|
| Layouts | three columns (default); the note beside the Atlas over Iso; one pane | one pane, swiped |
| Sizes | dividers drag, widths remembered (as V1's divider is now) | full width |
| Showing a pane | each can be hidden from the header (a developer with a terminal may hide Iso) | all three always there |
| Moving between | click, or Alt+← / Alt+→, Alt+1/2/3 | swipe, or the tabs at the foot |
| Lens or mode | the pane's header buttons, or Alt+↑ / Alt+↓ | swipe up or down on the pane's header |
| Layouts by key | Alt+L | |

- **Routes.** `/n/<note>` still names the open note, so links and the back button keep working. `/atlas` and `/notes` go: the Atlas is always a pane, and the notes list is the Note pane's file tree.
- **The header** keeps the logo, the base, the path of the open note, the context count and cost, and gains the layout and show/hide icon buttons (icons, no `[ text ]`).
- **The phone's tabs** show each pane's name with its lens or Iso's mode under it, and a count on Iso's tab of what was sent to it from another pane since you last looked.

**Boards followed:** `Desktop-Editor`, `Note-Rich` and `Marks` for the Note pane; `Desktop-Atlas`, `Atlas-Large`, `Atlas-Study-Open` and `Atlas-Timeline` for the Atlas; `Terminal-Chat` and `Terminal-Chat-Tools` for the look of Iso's chat (tool lines, a permission asked); `Header-Context` for the count; `Mobile-Note` and `Mobile-Atlas` for the phone. No board shows three panes: the mockup is the reference for the arrangement, with the boards' values for everything inside a pane. Screens are compared with both after building.

### The Note pane

- The editor as it is (`NoteEditor`, live preview, KaTeX).
- **A file tree** behind an icon in the pane's header, with a search box (keyword search, as the notes list has now). It replaces the notes list.
- **Normal lens:** the note.
- **Iso lens:** what Iso wrote, marked (§5); the timeline (`Timeline`, marks only, unobtrusive); what of this note is in Iso's context now, outlined; any proposal still pending from before (a terminal agent's, or an older Iso request) at its place with keep and remove, until M11 changes how the terminal's edits arrive.
- **Understand lens:** the note's Understanding note (§6).
- **Selecting text** shows one icon button, "send to Iso", which puts the passage in the context tray.

### The Atlas pane

- The Atlas as now, with M8's stability (V5) and M9's hold to make a note or folder.
- **Normal lens:** as now. A click opens the note in the Note pane (on a phone it also swipes there).
- **Iso lens:** notes and folders in Iso's context; notes Iso changed this session (◆); notes Iso points you to (a marching outline); what Iso read in this turn, numbered in order. A tap brings a note or folder into Iso's context or takes it out.
- **Understand lens:** each note's understanding (the existing four steps, with the squares), and a mark on a note that changed after the last time your understanding of it was recorded. Study folders are drawn only in this lens.
- **Giving a note to Iso** from any lens: drag it onto the Iso pane (mouse), or press and hold (touch). Holding stays "make a note" in an empty place, as M9 has it, but what is drawn while you hold is a note or folder icon where it will be made, not a whole area (Lachlan's verdict on V6, 2026-10-22).

### The Iso pane

- **The conversation:** your messages with what they were sent with; Iso's text; one line per tool call (read, search, edit, write), each note in it a link that opens the note; an edit as a small diff with an "open in the note" icon; a permission asked, with "Allow once", "Always allow this" and "Don't allow".
- **Above the box:** the mode's name and what it allows, in a line. The mode is the strongest mark in the header (filled in gold), so it is never mistaken for a lens. Shift+Tab moves to the next mode, as in OpenCode.
- **The context tray** (§7) above the box, and under it the count with instructions and the tier.
- **Stop** while Iso works (Escape, or the send button turning into stop).

## 4. One conversation, two sources

The Iso pane draws a conversation from one model in the app, so M11 can feed it from OpenCode without a second pane:

```ts
type Turn = { id; mode; asked: string; context: Part[]; items: Item[]; state: "running" | "done" | "stopped" | "failed"; cost? }
type Item =
  | { kind: "text"; text }                                   // streamed
  | { kind: "look"; how: "keyword" | "meaning" | "link" | "read"; note?; query? }
  | { kind: "change"; note; entry; added; removed }          // a journal entry of the note
  | { kind: "permission"; id; what; answer? }
  | { kind: "point"; note; why }                             // Iso points you to a note
  | { kind: "understood"; note; event }                      // Understand mode recorded something
interface IsoSource { turns(): Turn[]; send(asked, context, mode, tier); stop(); answer(permission, decision) }
```

- **M10's source is the engine.** A request becomes a turn; the engine's `iso-*` events become items (`iso-step` is a look, `iso-text` text, and the new `iso-change`, `iso-ask`, `iso-point`, `iso-understood` the rest).
- **M11's source is OpenCode's session**, read through the isorite server from `@opencode/client` (`message.list`, `event.subscribe`, `session.prompt`, `permission.reply`, as the spike used them).
- **Where the conversation is kept (a change).** Today there is no conversation store: the conversation is the session's proposal entries in the notes' journals (`architecture.md` §5). A chat that is not about one note needs its own record, so each turn is kept in the study base as `sessions/<session id>.jsonl` (in project mode, `.isorite/sessions/`), one line per turn and per item, append-only like the journal. Changes stay in the notes' journals, and a `change` item names the entry, so the timeline and the conversation tell the same story.

## 5. Write mode, and knowing what Iso wrote

- **Iso gets tools that write**, in Write mode only: `edit_note` (replace a passage that must match exactly, as OpenCode's edit does), `write_note` (a new note), `move_note` and `delete_note`. Each goes through the note store (`architecture.md` §3) as a `change` with `who: iso`, the request's id and the mode. **This reverses "Iso has no tool that writes" and "unkept text never enters the note's file"** for Write mode only; `decisions.md` gets the new row.
- **Moving and deleting ask first** (a permission in the pane); editing and making notes do not. (Q4.)
- **Undo.** A turn's change items carry an icon to undo the whole turn: each note it changed goes back to before the turn (a `restore` change, refused for a note that has changed since, as the timeline's restore is).
- **Marking what Iso wrote (Lachlan left the granularity to me): words, worked out from the journal.** The journal already records who made each change, as line hunks. For the Iso lens the app compares each of Iso's hunks word by word (old lines against new) and carries the words Iso put in forward through every later change, the way `touched()` carries lines for the timeline now. A word you later retype is yours. Nothing new is stored.
- **Git** is not used for notes, since many bases will not be repositories. In M11's Build mode Iso commits code under its own git author, so code changes can be traced with ordinary git tools.
- **What a hostile note can do** changes: in Write mode it could talk Iso into a bad change. The bounds are the mode you chose, the journal, a turn's undo, and asking before moving or deleting. `architecture.md` §12 is updated.

## 6. Understanding

- **An Understanding note** is kept per note in the study base, at `understanding/<note id>.md`: an ordinary note with two sections, **Iso's reading** (written by Iso in Understand mode, journalled as any note) and **Scratchpad** (yours; Iso does not write it). In a base shared by several people each has their own study base, so the scratchpad is private.
- **What changed it** is not kept in the note: it is drawn from the study record, newest first: each Understand conversation that moved the note, older exercise attempts, wind-backs, and (M11) a build that changed what the note describes.
- **The number stays derived from the record** (`core/understanding.ts`). A new event, `understood`, carries Iso's judged move for a note (−1 to +1 in halves) and a line of why, exactly as an attempt's move does now. Iso records one with `record_understanding` in Understand mode, at most one per note per turn.
- **Tailoring.** In Understand mode the Understanding note of each note in context joins the context tray as its own part, which you can take out. With it Iso starts from where you are; without it Iso starts from the beginning. The mode's prompt tells Iso to use Iso's reading and the recent events, to ask before explaining, and to update its reading at the end of a conversation (`write_understanding`).
- **Exercises are kept but put aside:** the study list and "ask for an exercise" leave the interface; existing exercises still open as notes and still count in the record. Asking Iso for an exercise in Understand mode is left for later.

## 7. The context tray (Iso's context under your control)

- What Iso is sent is the tray: notes, folders and passages you put there, plus the mode's own (the Understanding notes in Understand mode). Each can be taken out with its ×. M9's per-part switches are the engine side of this: the tray is the `Choice` on the request.
- Notes reach the tray by dragging or holding on the Atlas, by tapping in the Atlas's Iso lens, by "send to Iso" on a selection, and by the open note (offered, not added: one tap). Earlier turns of the conversation are listed in the count's breakdown with a switch each, as in M9.
- **No automatic trimming is added.** The existing budgets stay as a stopgap and are shown in the breakdown when they apply.
- Whether Iso may look up more notes itself stays a switch (M9).

## 8. What goes

- Asking in the text (I5, Q6), the prompt in the note's type (I2), the phone's strip (I6), the inline proposals' buttons as the way to use Iso, and the header's context dialog (replaced by the tray and the count's breakdown).
- `/atlas`, `/notes`, the study list page, and the side-by-side switch (V1, V2): the panes replace them.
- The engine's `insert` and `rewrite` forms stay for pending proposals and for the terminal until M11, then go.

## 9. The tutorial

- The section list stays (L1, L2, E1, L3, E2, L4, E3). Sections are approved on the refinement page before their steps are written, as before.
- **L1** (the knowledge base): rewritten for the Note and Atlas panes, the file tree, swiping and layouts.
- **L2** (Iso): rewritten around the Iso pane: Ask, the tray, the Atlas's Iso lens, Write with its marks and undo.
- **E1** (knowledge work): adjusted to the pane.
- **L3** becomes "understanding" (the lens, the Understanding note, Understand mode); objectives drafted on the page in this milestone, built in the next round.
- The tutorial card must not cover Iso's answer on a phone (a known fault from M9).

## 10. How it is checked

- `npm test`, `npm run check`, the browser tests, and the tutorial's tests, rewritten for the panes, at 1280 and 390 px on both grounds.
- Engine tests with the scripted provider for each mode's tools: Ask cannot write; Write's changes are `who: iso` entries; a turn undoes; moving and deleting wait for permission; Understand writes only the study base; an `understood` event moves the number.
- A core test for word-level marks: Iso's words survive later changes of other lines, and lose the mark when retyped.
- Screenshots of each pane and lens against the mockup and the named boards, posted to the refinement page with each item's result; anything not checked is listed there.
- One real-model check of each mode on a temporary copy of a base, with its cost reported.

## 11. Order of work

1. The shell: panes, layouts, show/hide, phone swiping and tabs, keys. The old routes redirect.
2. The Note pane's file tree; the Atlas pane's click, drag and hold to the Iso pane.
3. The Iso pane on the engine: the `Turn` model, `sessions/`, the tray, Ask mode.
4. Write mode: tools, permissions, undo; word-level marks; the Note's and Atlas's Iso lenses.
5. Understanding: the notes, the `understood` event, Understand mode and its tailoring; the Understand lenses.
6. Taking out what goes (§8).
7. The tutorial's L1, L2 and E1; L3's objectives on the page.
8. Tests, screenshots, results on the page.

## 12. Questions

All six answered by Lachlan on 2026-10-22, each as recommended. On Q15 they added: "Ask turns will not form the primary basis of understanding."

| | Question | Answer |
|---|---|---|
| Q1 | Split into M10 (panes, engine Iso) and M11 (terminal session, Build, Tailscale)? | Yes |
| Q2 | A folder-level note: what file is it? Clicking a folder should open one. | `<folder>/index.md`, an ordinary note whose title defaults to the folder's name; made when first opened, not before |
| Q3 | Keep conversations in the study base as `sessions/<id>.jsonl`? | Yes |
| Q4 | In Write mode, ask before moving or deleting, not before editing? | Yes |
| Q5 | The tier (low, mid, max): beside the send button, or only in the count's breakdown? | Beside the count under the box, one tap to change |
| Q6 | Ask-mode conversations as evidence of understanding? Ask cannot write the study base. | Not now; Understand mode may read recent Ask turns when they are in its tray |

## 13. What was built (2026-10-22)

Branch `m10-panes`, steps 1 to 6 of §11, and the tutorial's Iso scripted for the pane. Results and screenshots are on the refinement page (W1, W2, V6); the tutorial's sections L1, L2 and L3 are rewritten there as drafts, waiting for approval before their steps are written (§11 step 7).

| Step | Commit | What |
|---|---|---|
| 1 | 72998ad | The three panes, layouts, show and hide, dividers, the phone's row and tabs, keys |
| 2 | 115fa68 | The notes over the note; giving notes, folders and passages to Iso; the hold marked by an icon (V6) |
| 3 | 31f7def | Turns in the engine (`converse`, `conversation`, `turnContext`), Ask mode, the pane; inline Iso taken out of the note |
| 4 | ee0e4a9 | Write mode (edit, write, move, delete; asked first for move and delete; undo by turn); `wordAuthors`; the Iso lenses |
| 5 | 4788464 | Understanding notes, the `understood` event, Understand mode, the Understand lenses |
| 6 | 71dd521 | The header's count and study link, the note's margin and exercise asking, taken out; the pane's breakdown with switches for earlier turns |
| | 0f00192 | The tutorial's Iso answers turns; a rewritten passage is marked as the rewriter's whole |

**Departures from this plan.**
- Conversations are kept as `conversations/<id>.jsonl` in the study base, not `sessions/` (Q12): a session already means a stretch of work in isorite's journals.
- Asking in the text is gone from the note, as planned, but its code (the prompt in `NoteIso`, the `insert` and `rewrite` forms) stays, unreachable from the note, for pending proposals and the terminal until M11.
- The Atlas lays itself out again when it goes into or out of its Understand lens, since study folders are drawn only there.
- A turn is part of the session for its cost, but only journals are read when the engine starts to find the last session, so a conversation alone does not carry a session over a restart.

**Checked.** `npm test` (core 323, engine 87, and the rest), `npm run check`, and every browser test (132, at 1280 and 390 px on both grounds); the tutorial's own tests are not run, since its sections are rewritten next. Screens were compared with the mockup. One real-model check of each mode on a temporary copy of the information-theory base (mid tier, Claude Sonnet 5.5): Ask $0.0038, Write $0.0154 (one sentence added where asked), Understand $0.0267 (recorded +0.5 with a reason, and asked a question back); with a first Ask stopped by a fault the check found (a running turn read back as stopped, fixed), $0.054 in all.

**Not checked.** The Atlas's Understand lens on a large base (its relayout); carrying a note with a pen or a trackpad; the phone's swipe on a real phone (only emulated touch); search by meaning inside turns.

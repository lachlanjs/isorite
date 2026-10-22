# Milestone 10b: the panes, refined

Written 2026-10-22, after Lachlan tried M10 (the demo on 4796 and their own base). Approved 2026-10-22 (W8 right; V7, V8, W7 right; Q16 hold, Q17 corner, Q18 no header at all). The refinement
page items are V6–V9, I7, I8, W1, W2 and W7, with Q16–Q18. Branch `m10b-refine`, started from `m10-panes`, which is
merged into `main` first (`--no-ff`) once this plan is approved, so M10 lands as built and these changes are their own
milestone.

## 1. What is asked

M10 "looks good but some minor adjustments are needed". In short:

- **No header, no footer** (W7, Q18). The breadcrumbs go. Settings move into the panes' heads, one menu per pane.
- **Iso's input, pared back** (I7, Q17). No send button, no hints, no "looks further", mode icons instead of words.
- **Context, its own view in Iso's pane** (I8). Nothing about context shows above the input.
- **The Atlas** moves in three beats on a lens change (V7). A drag from a note or folder title never pans (V8). A
  hold makes "Untitled note" or "Untitled folder" in place instead of asking for a name elsewhere (V6).
- **The scratchpad** is the note editor (V9).
- **The phone:** the tabs at the foot stay and are preferred to swiping; a lens shows as the colour of the pane's
  name; a hold on a note offers to give it to Iso (Q16, W1); fullscreen (W1).

Lachlan uses isorite as a PWA added to their iPhone's Home Screen, over the Tailscale app.

## 2. The steps

Each step is a commit with its tests, as before.

| Step | What | Items |
|---|---|---|
| 1 | Header and footer out; each pane's head gets a settings icon at its right | W7, Q18, W1 |
| 2 | Iso's input and the mode icons | I7, Q17 |
| 3 | The Context view | I8 |
| 4 | The Atlas: drags, three beats, untitled notes | V8, V7, V6 |
| 5 | The scratchpad editor | V9 |
| 6 | The phone: tab colours, the hold menu, fullscreen, selection to Iso | W1, Q16 |
| 7 | Tests, the tutorial's L1/L2 drafts brought in line, screenshots on the page | |

### Step 1: header and footer out

- **The header goes.** It holds the logo's menu, the base name and breadcrumb, the Atlas's "↑ out" with where you
  are, Iso's stop, and the exercise bar. Each finds a place:
  - the **logo's menu** is split into the panes' settings (below);
  - **"↑ out"** goes into the Atlas pane's head;
  - **stop** is already in Iso's pane; a run in a note says so in the note's head;
  - the **exercise bar** (its kind, the six squares, wind back, next) moves to the Note pane's head.
- **The footer goes.** The save state is a small mark in the Note pane's head (a failure in rose, with its words
  on hover). A terminal agent at work is said in Iso's pane head. The
  editor's hints go.
- **Each pane's head gets a settings icon at its right**, opening a small menu under it, in the style of the logo's
  menu now:
  - **Note:** fullscreen; the ground (light or dark); the base's name and whether it is a study or a project; the
    link to the parts; the layouts and pane switches on a desktop.
  - **Atlas:** the legend, drawn where it is now, only while this menu is open; layout settings when they come.
  - **Iso:** the provider key (hold it, forget it, sign in for a new one), from the logo's menu as it is now.
- **The layouts and pane switches** now in the header move into the Note pane's settings. Alt+L and Alt+1/2/3
  stay. A hidden pane comes back from there, or by its key.

### Step 2: Iso's input

- One box the pane's width, growing with what you type, and one quiet line under it: the token count, the
  low/mid/max tier and the cost. **Enter sends**, Shift+Enter is a new line. On a phone (no Shift), a small arrow
  appears inside the box's bottom-right corner once there is text (Q17).
- **Gone:** the send button, the mode's description line, the empty pane's paragraph, "looks further" (Iso always
  reads the knowledge base; the `lookup:false` option is removed from the app, kept in the engine for the tutorial
  if it uses it, else removed).
- **Mode icons** in Iso's head, drawn as the app's other icons are (16 px line icons, `currentColor`): a speech
  bubble for Ask, a scribe's quill for Write, a small L-system sprig (two or three generations of a branching rule)
  for Understand. Each has its name as `aria-label` and a tooltip; the one chosen takes its mode's colour. Shift+Tab
  still steps through them.

### Step 3: the Context view

- An icon in Iso's head, beside the modes, with a small count of what is given. It switches the pane between the
  conversation and **Context**. The token count under the box opens it too.
- **Context lists:** what you gave (notes, folders, passages, Understanding notes), each with its size and a way to
  take it off; then the rest of what is sent (instructions and tools, earlier turns with their switches), as the
  breakdown shows now. The breakdown under the box goes; this view replaces it.
- Giving Iso something while the conversation is shown pulses the icon's count once.

### Step 4: the Atlas

- **Drags (V8).** A pointer down on a note or a folder's title starts a carry, never a pan: with a mouse it can be
  dropped on Iso's pane (as now), and a drop anywhere else puts it back. A pointer down anywhere else pans. A click
  on a note still opens it; the hold on open ground still makes a note or folder.
- **Three beats (V7).** Every re-layout, not only a lens change: the links retract along their paths (about 200 ms),
  then notes and folders move and fade in or out (the move as now), then the new links draw out from their sources
  (about 250 ms). Nothing is drawn while anything moves. Reduced motion: no animation, as now.
- **Untitled (V6).** A hold makes "Untitled note" or "Untitled folder" right away, numbered if the name is taken
  ("Untitled note 2"), with no name asked for. The note opens in the Note pane with its title selected, so typing
  renames it; a folder's name is changed as any folder's is.

### Step 5: the scratchpad

The scratchpad in a note's Understand lens becomes the note editor (CodeMirror, Markdown and maths rendered as you
type, links to notes), on the scratchpad's text, saved as it is now, kept in the study base. The editor's Iso
actions (send to Iso, Ctrl+Enter) are off in it, since it is private.

### Step 6: the phone

- **The tabs stay** as the way between panes; swiping between panes is kept but is no longer the main way.
- **A lens shows as colour:** the word under a tab's name goes; the name is gold in the Iso lens and green in
  Understand, as the moodboard's colours for those.
- **Hold on a note (Q16, W1):** a small menu at the note: *Give to Iso*, *Open*. On a desktop the hold gives it to
  Iso directly, as now, since a mouse can drag.
- **A passage to Iso on a phone:** "send to Iso" beside a selection is checked on a phone and fixed where the
  phone's own selection menu hides it.
- **Fullscreen:** in the Note pane's settings, using the Fullscreen API where the browser has it (Android, desktop).
  iOS has no fullscreen for a page; added to the Home Screen, isorite opens without the browser's bars only if it
  says it is a web app, so a manifest (`display: standalone`, theme colour from the ground, an icon from the logo)
  and Apple's web-app meta tags are added, with the safe-area insets respected. In standalone, the fullscreen item
  is not shown.

## 3. What is not in this plan

- The terminal's session in Iso's pane, Build mode, Tailscale: M11, as planned.
- The tutorial's steps: L1 and L2 drafts are updated to match this, for your approval; L3 is approved and its steps
  are written after this milestone, with L1, L2 and E1, so they describe what is there.

## 4. How it is checked

The browser tests at desktop and phone widths, updated for the header's going and the new controls; screenshots of
each step on the refinement page for your verdict. No real-model check is needed: nothing here changes what Iso is
sent, except "looks further" always on.

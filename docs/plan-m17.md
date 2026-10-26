# Milestone 17: the Atlas follows the note

Written 2026-10-26, for approval. Branch `m17-atlas-follow`, from `main` at `8ca37f8` (0.4.0). A small milestone,
from Lachlan's note of 2026-10-26: the Atlas should mark the note you have open, and a link hovered in the Note pane
should be lit on the Atlas. It is independent of M16 (the guide), which goes on beside it on `m16-guide`.

## 1. What is there today

Found by reading `app/src/lib/components/Atlas.svelte` at `8ca37f8`.

- **The Atlas lights only what was done on the Atlas.** It has two highlights.
  - *Chosen* (`walk`, `chosen`): a click on a note lights it and its links, one step each way, and dims the rest. A
    second click opens it.
  - *Pointed* (`pointed`): with nothing chosen, the note under the pointer is lit the same way.
- **Opening a note any other way tells the Atlas nothing.** That covers following a link in the note, the notes
  list, a link in Iso's reply, or the timeline. The map shows no sign of where you are, so you look for the note
  again.
- **A moment of the session's timeline does reach the Atlas** (`moment`). Pointed at, it outlines the note it
  touched: 2.5 px, 3 px out, blue for you and gold for Iso, after the **Atlas-Timeline** board. That is the one
  existing case of a pane pointing at a note on the map, and this milestone follows it.
- **The editor already knows which link is under the pointer.** `editor/linkControl.ts` tracks it (`hover`), for
  the rating control in the margin.

## 2. What M17 does

**1. The open note is marked on the Atlas** (Q78).
- **The mark:** a bar 3 px wide inside the block's left edge, in the text colour. It's quieter than the chosen
  note's outline and dims nothing, so the map stays as it was.
- **Kept apart from the other marks:**
  - It isn't gold, because the **Marks** board keeps gold for what Iso is doing now.
  - It isn't the blue outline either, which is focus on that board and "you" on Atlas-Timeline.
  - It sits with the notch (changed since), the Iso marks and the moment outline without covering them.
- **A folder** closed over the open note carries the same bar.
- **On a phone** it's there when you swipe to the Atlas, which is where it's needed most.

**2. The map does not move to it** (Q82). Opening a note never pans or zooms the Atlas, keeping to "the map moves
as little as it can".
- **An off-screen note gets a pip** instead. It's a small mark at the Atlas's edge, on the line from the centre
  towards the note.
- **Clicking the pip** brings the note into view, with the same eased move as a click on a folder.
- **Kept out of the way:** the pip is drawn beside the dock and the key, never under them.

**3. The chosen note follows you** (Q79).
- **When it applies:** you chose a note on the Atlas, opened it, then follow one of its links in the Note pane.
- **What happens:** the choice moves to the note you opened. If that note is one the chosen note requires, it moves
  along the walk, as a click on the Atlas would.
- **What it leaves alone:** a choice of some other note, or no choice at all. A note opened from the list doesn't
  light and dim the map.

**4. A link hovered in the Note pane is lit on the Atlas.**
- **What lights:**
  - its target gets the **Atlas-Timeline** outline, in blue (your pointer);
  - the route from the open note to it is lit, in the link's kind, as `light()` draws a chosen note's links;
  - nothing is dimmed.
- **Off screen:** the target gets the pip, lit while the hover lasts.
- **Other targets:** a link to a folder outlines the folder's frame. A broken link, or a link to the web or to code,
  lights nothing.
- **On a phone** there's no hover, and only one pane shows, so it's left out.

**5. The same from Iso's pane** (Q81). Hovering a link to a note in one of Iso's replies, or in the list of its
changes, lights the note in the same way, with the route from the open note when there's a link between them.

**6. The other way, from the Atlas to the note** (Q80). Pointing at a note on the Atlas underlines the open note's
links to it, in the link's kind. You can then see where in the note the link is made.

**How it fits together:**
- **The shared value:** `atlasHint.svelte.ts` holds the note pointed at from another pane (`{ id, from: "note" |
  "iso" }`). The editor's hover, Iso's links and the timeline's moment set it. The Atlas reads it beside its own
  `pointed`.
- **The timeline's `moment` prop** moves to the shared value too, so the three ways in work alike.
- **The open note** comes from the page's route, as `panes.setLast` does now.
- **The underlining** (part 6) is a CodeMirror decoration fed by a state effect when the Atlas's `pointed`
  changes.
- **What doesn't change:** the layout, so `LAYOUT_VERSION` stays as it is.

## 3. Tests

- **Browser:** `app/tests/follow.spec.ts`, about seven tests on the example base.
  - The open note's block has the bar, after following a link in the Note pane.
  - Nothing is dimmed by it.
  - Zoomed elsewhere, the pip appears, and clicking it brings the note into view.
  - Choose, open, then follow a required link: the choice has walked.
  - Hovering a link in the note outlines its target and lights one route. Moving off clears both.
  - Hovering a link in Iso's reply does the same.
  - Pointing at a note on the Atlas underlines the open note's link to it.
- **Unit:** a link under the pointer resolves to a note's id, with a section or a folder, and to nothing for the
  web, code or a broken link (`editor.test.ts`).
- **The rest:** `npm test`, `npm run check` and every browser test pass. The svelte-autofixer is run on every
  changed `.svelte` file. No real model is used.

## 4. The guide

The guide's note on the Atlas gets a line on these marks:
- **If M16 is merged first:** the line goes in here.
- **If M17 is merged first:** the guide takes it in M16's step 5.

## 5. Order of work

1. The shared value, with the timeline's `moment` moved onto it.
2. The open note's bar, the pip, and the chosen note following.
3. The hover from the Note pane, then from Iso's pane.
4. The underlining from the Atlas.
5. Tests, screenshots against the boards, and the write-up as §7 here. Version 0.4.1, unless M16 goes first and
   brings 0.5.0.

## 6. Questions

- **Q78: how should the open note be marked?** A bar inside the block's left edge in the text colour, or the
  Atlas-Timeline outline? *Recommended: the bar.* The outline already means "pointed at from elsewhere", and the
  open note stays marked all the time, so it should be the quieter of the two.
- **Q79: when should the chosen note follow?** Only when the chosen note was the open one, or should every note you
  open become the chosen one? *Recommended: only then.* Choosing every note opened would dim the map each time.
- **Q80: should pointing at a note on the Atlas underline its links in the open note?** *Recommended: yes.* It's
  cheap once the shared value is there, and it closes the loop between the two panes.
- **Q81: should links in Iso's pane light the Atlas too?** *Recommended: yes.* Iso's answers are where most links
  to unfamiliar notes are met.
- **Q82: for an open note off screen, a pip or a pan?** *Recommended: the pip.* The Atlas moves only when you ask.

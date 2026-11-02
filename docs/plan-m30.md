# Milestone 30: the look

Begun 2026-11-02, from Lachlan's notes taken using isorite at work beside omp (`screenshots/notes-to-self.png`): the lustre "a bit less overt, maybe an electrical pulse around the outside instead of the dithered flash"; "icons in the Atlas top bar not that nice"; "read mode"; "what can be learned from Tern's style?". Handling notes and code links were M29.

## Built

- **The pulse** (`lustre.ts`): touched is now a thin line of light that runs round the outside of the face, from the top left both ways to the bottom right, with a fading tail and a faint glow, 420 ms, easing out, following the chamfer's cut corners; at the device's pixel ratio, not dithered. Reduced motion: none, as before. It replaces the dithered band (320 ms, 2 px cells, 24 frames a second). `docs/taste.md`'s "Settled" line for the lustre is to be rewritten to match.
- **The switches' icons** (`PaneHead.svelte`): the switches that stand for a kind on the Atlas (questions, problems, web, code, pictures) now wear that kind's glyph from `glyphs.ts`, the one the Atlas draws, so the button and what it shows are the same mark (the web switch was a globe beside an octagon on the map). The rest (provenance, timeline, what an agent may do) are drawn on the same grid, stroke (1.5) and square caps. Context, which was nearly the question glyph, is three bars, strata as in the taste doc.
- **Read mode** (`NotePage.svelte`): a *read* button beside *source*. The title becomes a heading, the text is set at 20 px and cannot be edited, and the label, the attached questions and the timeline go; the buttons stay at the corner, faint, to leave it. Test: `read-mode.spec.ts`.

## Tern, and what it says for isorite

Read from its page (stencil.so/tern; no CSS was available to the reading, so values below are what its mockups show, not measured). What it does that isorite could take, in the order of what I'd do:

1. **Words and glyphs, not an icon set.** Its menus use typographic marks (❯ ▣ ◇ ∑ ⓘ) and keyboard glyphs (⌘ ⇧ ⌃ ⌥ ⏎) right-aligned. isorite already draws its own glyphs on one grid; the keyboard hints could be right-aligned in menus and the command palette in the same way. (Not done.)
2. **Status as small chips** (✓ done, ●3, ↑2) where isorite uses words or colour alone: a note's state in the list, the count of changes waiting in a note. (Not done.)
3. **Braille spinners** as the loading mark: isorite's own are the logo's strokes drawing and Iso's crystal, both more particular; keep them.
4. **Numbered chapters with a headline and one line**, a long page of bands: suits the guide and the README, not the app.
5. **Tone**: dry fragments ("The window closed. Nothing stopped."). isorite's voice is already "short, concrete, a little dry" (taste.md); nothing to change.
6. **Dark first, themes shown by swatch**: isorite has lapis and quartz; a swatch preview in the ground setting rather than a name would match it. (Not done.)

## Left

- The remaining notes: the terminal's feel (a minimal TUI?), and the "performative learning" idea, both waiting for a talk.
- 1 to 2 and 6 above, if wanted; rewriting taste.md's lustre line; a photosensitivity look at the pulse (it runs once, 420 ms, on touch, never loops).

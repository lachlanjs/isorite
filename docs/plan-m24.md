# Milestone 24 (draft): the look, built

M23 left the design work from the inspiration rounds on paper (`docs/taste.md`, `inspiration/combinations/sketches.src.html`). M24 builds it. Decisions below were made on 2026-10-29, asked one by one.

## Decided

### Order

Foundation first, then surfaces, then Iso, then the rest:

1. **The foundation.** P (one set of states for every control), C as C′ 1 · Ordered (the lustre, dithered), the motion rules, and "The Atlas, as it is" (labels at the screen's own pixels, boxes with a face, hover dimming the rest and lighting the note's routes in blue; layout and routing untouched).
2. **Surfaces.** D (rows with a vein), H/N (links in a note's text, weighted by kind), G (what Iso drew on), J (the lustre when a kind is chosen).
3. **Iso.** I (growing crystals), K (conversations as specimens), O (context as strata).
4. **The rest.** T (history as strata) and the unbuilt half of R.

### The look

- **Lustre is C′ 1 · Ordered**: a 4×4 Bayer dither in 2 px cells, the band leaning as C's does, moving in whole frames. On a light ground (quartz) it's drawn in dark pixels, a dithered shadow sweeping across, since white on a white face doesn't show.
- **Gold is Iso's alone.** D's marker and vein are blue (lattice).
- **The three themes blend.** The README's rule (the machine is how isorite answers you, the mineral is what notes are made of, growth is how they change) is a heuristic, not a separation: a surface may mix them. The dithered lustre is the model, a mineral's lustre drawn by a machine.
- **Guiding text: as little as possible, ideally none.** No key legends, captions or hints explaining controls.
- **Voice**: short, concrete, a little dry. No exclamation marks, no "Oops".

### Motion

- **Things appear by growing along a line** (a stroke drawing itself, a box outlined before it's filled), never by fading or sliding in.
- **Timing**: 120 ms to acknowledge (press, hover, focus), 260 ms for a change (open, close, swap), 600 ms or more for a result worth noticing. Ease-out to arrive, ease-in to leave, no springs or bounce. The lustre's frames step within these.
- **Gold moves, and so may blue.** Iso's work and growth animate in gold; your own actions may animate too, in blue, but less than Iso's.
- **Spinner → the logo's strokes drawing**, for every wait but Iso's.
- **Toast → a mark in place**: the thing that changed carries an edge for a beat (gold when Iso changed it).
- Every animation keeps a `prefers-reduced-motion` form that keeps the information and drops the movement.

### Iso

- **I**: a crystal grows only while Iso works, and becomes that conversation's mark.
- **K**: past conversations in a drawer, each with its crystal; open one to read it or carry it on. Built so other threads can join it later (GitHub and GitLab issues, discussions), as specimens of the same kind.
- **Citations in the text** (G, H): the cited phrase is a link, its underline's weight showing the kind, lit with the note it came from. The numbered `[1] note-name` tail goes.
- **R's other half**: a question Iso asks shows in its reply as a rose ◇ with a "keep" button. Before it's kept, the question it would become shows on the Atlas as a prospective node with a dotted outline, where it would actually go in the structure. No catalogue number on a question's label.

### History (T)

Layers are Iso's writes (from the journal) and your saves, a run of saves merged into one layer per session (after some idle time), yours blue and Iso's gold.

### Hard-wrapped Markdown

Notes and replies are not wrapped at a fixed width: a paragraph is one line, and the editor and the panes wrap it. Hard returns inside a paragraph make the text flow raggedly once the pane is narrower or wider than the wrap. M24 finds where it happens and stops it:

- what Iso writes into notes (its context says so, and `write_note` may join soft breaks in prose);
- Iso's replies in the pane, if they're wrapped there too;
- the repository's own docs, written so far at 120 characters: rewrapped.

### Understanding, phased out

Done first, before the surfaces, so nothing more is styled for it. The Understanding note (Iso's reading of you and your scratchpad beside each note), its button in the Note pane's header, its part in what Iso is sent, `write_understanding` and its API go. Iso is told instead to read where you stand from the notes themselves, and to offer where it stops as a question to keep or a problem to try. The files already in `.isorite/understanding/` are left as they are: nothing reads or writes them. Old conversations read, with what they gave or wrote of an Understanding note passed over.

### Small ones

- **T's layer closes after 10 minutes idle.**
- **The repository's docs are rewrapped** to one line per paragraph, in one mechanical commit (code blocks, tables and lists left alone).
- **J is the lustre on choosing**: picking a kind in the label runs the Ordered lustre once on its slot. The rest of J came with M23 (the label's kind slots, the glyphs).

## Questions

None open.

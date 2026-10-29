# Inspiration

A mood board for isorite's look and feel, and what each theme could mean for the interface concretely. The images are for you to judge; the "take" lines are my proposals, to keep or strike.

| Folder | What's in it |
|---|---|
| `alien-isolation/` | Screenshots of the game's UI: terminals, logs, crafting inventory, item wheel, CRT screens, motion tracker. See `alien-isolation/SOURCES.md`. |
| `minerals/` | Photographs from Wikimedia Commons (bismuth, pyrite, quartz, lapis with pyrite, gold, malachite, rose quartz, veins, fluorite, agate), and two drawn here (`generated-*`). |
| `organic-growth/` | Photographs of venation, dendrites, phyllotaxis, lichen, coral, romanesco, DLA, and three drawn here (`generated-*`). |
| `combinations/` | `sketches.html` (not in git: build it with `node inspiration/combinations/build.mjs`, which inlines the fonts into `sketches.src.html`): working sketches that cross the themes, in isorite's own tokens and fonts. Open it in a browser and hover. |
| `prospective/` | Themes that could join these three. See `prospective/README.md`. |
| `MANUAL-LINKS.md` | Images I couldn't fetch or didn't find, for you to open by hand. |

`generate.mjs` redraws the `generated-*.svg` files (not in git) (`node inspiration/generate.mjs`). The PNGs beside them are renders of the same SVGs.

## The three themes, and what each could take

### Alien: Isolation (the machine)

What's distinctive in it isn't "terminal green". It is:

- **Solid inverted selection.** The selected row is a filled block, not an outline or a tint (`archive-logs.png`, `terminal-personal-folders.png`, where the marker bars sit on both sides of the block).
- **Scale contrast inside one panel.** A huge title (`GOODBYE FROM SEEGSON`) over small caps body text. isorite today has almost none: nearly everything is 11 to 13 px.
- **A key legend at the foot of every screen** (`UP / DOWN HIGHLIGHT . . . . . E SELECT`), dotted leaders included. This answers "what do these tiny icons do?" without tooltips.
- **Bracketed, open frames** (`item-wheel-inventory.png`, `crafting-inventory-medikit.png`): corner brackets and half-boxes, not closed rectangles; dotted connector lines from parts to the thing they make. That is your Atlas's routes, already.
- **Blueprint drawings** of the item being made (crafting screen): a technical drawing as the object's portrait.
- **Hardware imperfection**: CRT curvature, phosphor bloom, a redraw that isn't instant.

- **The map** (`map.png`), which is the closest thing here to the Atlas: rooms are *filled* shapes, not outlines; corridors are thick filled channels, not lines; sector names are huge and faint, laid over the map (`GEMINI SECONDARY SYSTEMS`); room names sit outside, joined by thin leader lines; dashed outlines mean "underneath" or not yet reached; a legend at the foot groups every symbol by category, colour-coded (green mission, yellow item, red locked). The Atlas has the same parts (regions, notes, routes, kinds) drawn as hairline boxes.

Take: solid selection; one large title per pane in Departure Mono; a key legend at the foot of the Atlas and the note pane; corner-bracket frames for what Iso is looking at; on the Atlas, filled regions, folder names large and faint across their region, note names as callouts, a grouped legend at the foot; stepped (not eased) acknowledgement of a press or hover.

*I think these are good suggestions*

### Minerals (the material)

- **Lustre** (metallic, vitreous, adamantine): light moving across a facet. Pyrite and bismuth show it best.
- **Habit**: the shape a crystal grows in. Cubic pyrite, octahedral fluorite, hexagonal quartz, the stepped hopper faces of bismuth. Your chamfered corner is a habit; it could be one used everywhere.
- **Veins**: gold or quartz running through host rock along fractures (`quartz-vein-rock-*`). Links as veins, which the Atlas's routes nearly are.
- **Banding** (malachite, agate): layers that record growth over time. A note's history, drawn?
- **Your accents are already minerals**: lapis, quartz, gold (growth), malachite, rose (quartz). The board shows them as the real stones, so you can judge whether the tokens match.

Take: lustre on hover for gold things only (what Iso grew, what is valuable); one habit (the chamfer) on every surface; routes drawn as veins (thicker where more links share them, as `generated-vein-colonisation` does).

*I think these are good suggestions, with a caveat on the vein-colonisation - so much efort has been dedicated to the graph layout and routing that I don't want to mess with this too much except for pure styling of the lines. So, if it is confined to that, then okay, but don't mess with the layout*

### Organic growth (the process)

- **L-systems**: a rule rewritten over and over gives a plant. The rule is small and the result is large, as a note is small and a base is large.
- **Venation and space colonisation**: veins grow toward what needs feeding, and thicken where more flow passes.
- **Dendrites at crystal angles** (`generated-crystal-dendrite`): growth constrained to 60°. This is where organic and mineral meet; it may be the most isorite image here.

Take: new things grow in along a line (already in `docs/taste.md`); the Atlas's routes thicken by how much passes along them; growth only at the angles the lattice allows.

*Take into account notes from above*

Noted, and carried into the sketches: **the Atlas's layout and routing are not to change.** Anything here touches only how lines and shapes are drawn (colour, weight, fill, motion), never where they go.

## Crossing them

`combinations/sketches.html`, with switches for the ground (lapis, quartz) and the display face (Departure Mono, Ioskeley Mono). Round two, after your notes: no flash anywhere (a touched thing shows one band of light), no directive text in the mock interfaces, display text only at 11, 22, 33 or 44 px so Departure Mono sits on its pixel grid.

- **C, lustre on touch**: the edge changes in one step, the face fills, one band of light crosses. Gold for Iso and what is valuable, blue (fainter light) for structure and your own actions.
- **D, rows with a vein**: marker, vein, and a faint band across the row.
- **The Atlas, as it is** (replaces F, which changed the layout too much): the same boxes, folders and routes, drawn at the screen's own pixels so labels are crisp; boxes with a face; hover dims the rest, lights the note's routes in blue and runs the lustre across its box; the open note's white bar as now; a gold ◆ for a note Iso read; L's banding in the corner.
- **G, what Iso drew on**: parts under the reply, lit together with the phrase that cites them.
- **H, Iso's words as a seam**, with **N, links as veins**: a link's kind (requires, uses, see also) as the weight of its underline, light running along it on hover.
- **I, Iso at work, growing**: a hundred L-system crystals with 3- to 8-fold symmetry, one chosen at random each time, growing outward segment by segment; a drawer shows all hundred.
- **J, a note's kind**: slots, filled with one band of light; no description or key legend.
- **K, conversations as specimens** (new, for "past conversation history"): each conversation keeps the crystal it grew when it began.
- **O, context as strata** (new, for "context management a bit skewiff"): what Iso will be sent as a geologist's column on its side; hover a layer for its name and size.

Round three: Ioskeley Mono is the display face (Departure Mono stays switchable for comparison); L is gone, since understanding is being phased out in favour of questions and problems as the journey. New:

- **P, one grammar of states**: rest, touched (lustre), keyboard focus (corner brackets), chosen (solid), open (bar), Iso's (gold ◆), unavailable (faint), the same on every control.
- **Q, glyphs with a habit**: one drawing rule for every icon (0°, 45°, 90°, 60° for hexagonal ones; 1.5 px; the note's chamfer), at 16 and 32 px.
- **R, questions and problems on the way** (second version): a question as a specimen label with one mark that fills when answered; a problem as a crafting screen with slots and a progress bar; on the Atlas, ordinary boxes with the mark or the bar. Iso's asked question with a keep button.
- The terminal sketch (S) is set aside for now.
- **U, a note's label** in place of the details section: description in place, kind as slots, the path to move and rename, tags as parts, a question's "about" and answer mark, a problem's uses and steps.
- **V, an artifact in the Note pane** under the same label, with its look (isorite or plain) and "standalone".
- Q now has glyphs for the new node kinds (artifact, data, document, misc) and every kind drawn as an Atlas node; the plan for those kinds and for artifacts is `docs/plan-m23.md`.
- **T, a note's history as strata**: versions as layers, yours blue and Iso's gold.

Gray area: D's marker and vein are gold, which the tokens reserve for Iso. You liked it gold; if gold should stay Iso's alone, D would be blue.

A rule that could hold them together: **the machine is how isorite answers you (stepped, instant, slightly broken); the mineral is what your notes are made of (lustre, habit, veins); growth is how they change (along lines, at lattice angles).** Gray area: three metaphors at once can turn into a theme park. Pick which one each surface speaks in, and keep the others out of it.

## From your testing notes

Most of them are about function. These touch the look and feel:

| Note | Why it matters for design |
|---|---|
| "Text in Atlas not very crisp" | The Atlas's labels are very small in the screenshots I took, and drawn inside a scaled map; I haven't measured why they're soft. Crispness is the first thing a "polished" eye catches. Worth fixing before any styling. |
| "TUI is a bit janky and too opencode'y" | The terminal is where isorite looks least like itself. The Alien: Isolation theme belongs there most naturally: it's already a terminal. |
| "Really cool diagrams in the terminal (pele or mermaid??) they are excellent" | You think they're pele, and they render well in Windows Terminal and in Iso's chat. Nothing to do; noted as what already works. |
| "Markdown formatting of AI output with fixed char lines" | Confirmed: output wrapped at a fixed character width. It reads as a machine's paste, not prose; it should reflow to the pane. |
| "Outputs at the end with [1] <note-name> are weird" | Citations as a numbered tail is a web-chatbot convention. The game would draw a dotted connector to the thing; the mineral board would make it a vein. |
| "Details section not nice", "Selection of note type is not nice", "hard to add question type notes" | These are forms. The game's crafting screen is a form (parts, slots, progress); it may be a better model than settings fields. |
| "Note editing experience is a bit janky" | Out of scope here, but feel starts with the editor not fighting you. |

## A note on the images

The Alien: Isolation screenshots are the game's, from Fonts In Use and the Steam store; they're here for reference, not to ship. The rest are from Wikimedia Commons under the licences in each `SOURCES.md`. The image files are kept out of git (`.gitignore`), so the repository keeps only this text, the sketches and the generator.

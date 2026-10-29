# isorite: taste and motion (DRAFT, to be rewritten in your own words)

This is the doc an agent reads before it touches anything a person sees or feels. Features live in the plans; this is about how the thing behaves. Every line marked (?) is a guess to confirm or overwrite.

## The one idea

isorite is a mapping that keeps structure (Iso is for isomorphism, not isometric): your notes on one side, your understanding and Iso's words on the other, and what makes it feel right is that the shape survives the crossing. Structure is rigid, growth is gold, and growth is the only thing that moves on its own. (?)

## Motion

- One physical rule: things appear by growing along a line (a stroke drawing itself), never by fading or sliding in from nowhere. Lines extend; boxes are outlined before they are filled.
- Where there is a direction it follows the structure it belongs to (a line down a folder's edge, across a link), not a decorative one. (?)
- Three durations: 120 ms (acknowledge: press, hover, focus), 260 ms (change: open, close, swap), 600 ms+ (a result worth noticing: Iso wrote into a note, a check resolved). Nothing else. In CSS: `--t-ack`, `--t-change`, `--t-result`.
- One curve for arrivals (ease-out), one for departures (ease-in). No springs, no bounce. In CSS: `--ease-out`, `--ease-in`.
- Gold moves, and so may blue. Iso's work and growth animate in gold; your own actions may animate too, in blue, but less than Iso's (a pointed-at note's routes draw out in 390 ms; nothing of yours loops).
- Every animation has a `prefers-reduced-motion` form that keeps the information and drops the movement.

## Settled (from the inspiration rounds)

- No flash. A touched thing acknowledges with one band of light across its face (lustre), not an inversion or blink. The band is dithered (4×4 Bayer, 2 px cells, 24 frames a second, 320 ms across): a mineral's lustre drawn by a machine. On quartz it is dark pixels. `app/src/lib/lustre.ts`.
- One grammar of states on every control: rest; touched (the lustre); where the keyboard is (corner brackets, not an outline); chosen (solid, in its colour or the lattice); open (a bar); Iso's (a gold ◆); unavailable (faint).
- The three themes blend: the machine is how isorite answers you, the mineral is what notes are made of, growth is how they change. A heuristic, not a separation.
- No directive text: no key legends, no captions explaining what a control does. If it needs one, redesign it. As little guiding text as possible, ideally none.
- Voice: short, concrete, a little dry. No exclamation marks, no "Oops".
- Gold is Iso's alone.
- The Atlas's layout and routing do not change for style. Colour, weight, fill and motion only.
- Ioskeley Mono is the display face. (Departure Mono, if kept anywhere, only at 11, 22, 33 or 44 px with no letter-spacing, or it blurs.) Map labels drawn at the screen's own pixels, not scaled with the map.
- A row in a list (the notes) has a vein: touched or chosen, a blue marker grows down its left edge and a vein runs along its foot, and the lustre crosses it. `.vein-row` in `app/src/app.css`.
- A link's kind is the weight of its vein, in the text's own colour: requires solid and blue (2 px), uses thin, see also dotted, the web dashed. Light runs along it when pointed at. The same in the note and in what Iso says. `.vein`.
- Iso cites in the sentence: the phrase that rests on a note is the link to it. What it drew on stands under the reply as parts in corner brackets, and a phrase and its part are lit together. No numbered tail.
- Iso at work is a crystal growing (one of a hundred, chosen by the conversation's id), not a spinner; at rest it marks that conversation. Past conversations are specimens in a drawer, each with its crystal.
- What Iso is sent is strata: hatched for what Iso is told, blue for notes, ruled for the conversation, malachite for its summary, empty for the room left.
- A note's history is strata in its margin: a layer per moment, newest on top, as thick as the change, yours blue, Iso's gold.
- A question Iso asks shows, before it is kept, where it would go on the Atlas: a dotted rose outline. Kept, the note takes its place.
- Understanding is phased out; questions and problems carry the journey.
- Sketches: `inspiration/combinations/sketches.html`.

## Banned defaults

Each has a replacement, or it stays banned until one is found.

| Default | Instead |
|---|---|
| Spinner | The logo's strokes drawing, looped (`Drawing.svelte`), for every wait but Iso's; Iso's is a crystal growing |
| Toast / snackbar | Mark in place: the thing that changed carries an edge for a beat, gold when Iso changed it |
| Skeleton shimmer | The dotted ground showing through; content grows in |
| "No items yet" empty state | A drawn, specific first move (?) |
| Hover lift / drop shadow | Edge brightens one step; nothing casts a shadow |
| Stock icon set | Icons drawn on one grid, 1.5 px stroke, round caps |
| Generic error copy | Say what failed, what it touched, what to do, in isorite's voice |

## Voice

Short, concrete, a little dry. Says what happened to the notes, not how the software feels. No exclamation marks, no "Oops", no "Let's get started". (?)

## Done means

- Every state of the screen has been looked at (empty, loading, error, long, narrow), not just the happy path.
- Nothing waits more than 100 ms to respond to input without showing it has heard.
- Screenshots of the changed states were taken and judged against this document, not just tested.
- Where a default was used because nothing here said otherwise, say so in the commit, so it can be replaced.

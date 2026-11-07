# isorite: taste and motion (DRAFT, to be rewritten in your own words)

This is the doc an agent reads before it touches anything a person sees or feels. Features live in the plans; this is about how the thing behaves. Every line marked (?) is a guess to confirm or overwrite.

## The one idea

isorite is a mapping that keeps structure (Iso is for isomorphism, not isometric): your notes on one side, your understanding and Iso's words on the other, and what makes it feel right is that the shape survives the crossing. Structure is rigid, growth is gold, and growth is the only thing that moves on its own. (?)

## Motion

- One physical rule: structure appears by growing along a line (a stroke drawing itself). Lines extend; boxes are outlined before they are filled.
- Words and the items of a list may fade in (opacity only, in the time of a change), after the line that holds them has drawn. Nothing slides in from nowhere. What leaves the flow folds away (its height to nothing, ease-in, the time of a change), so what is below follows it rather than jumping.
- Nothing jumps under the reader: content that grows after it arrives (a diagram, a code block) is followed, and what you are reading stays where it is.
- Where there is a direction it follows the structure it belongs to (a line down a folder's edge, across a link), not a decorative one. (?)
- Three durations: 120 ms (acknowledge: press, hover, focus), 260 ms (change: open, close, swap), 600 ms+ (a result worth noticing: Iso wrote into a note, a check resolved). Nothing else. In CSS: `--t-ack`, `--t-change`, `--t-result`.
- One curve for arrivals (ease-out), one for departures (ease-in). No springs, no bounce. In CSS: `--ease-out`, `--ease-in`.
- The Atlas flown from one view to another zooms about the one point of the screen that stays put: everything moves in a straight line, at one pace, the same zooming in as out. A new layout's three beats leave no gap, and a note that is new is there before the lines to it draw.
- Held on a note or a folder (M33), three tags: move is blue, delete is rose, send is gold, the one place gold stands for something you do: the thing is being handed to Iso.
- Gold moves, and so may blue. Iso's work and growth animate in gold; your own actions may animate too, in blue, but less than Iso's (a pointed-at note's routes draw out in 390 ms; nothing of yours loops).
- Every animation has a `prefers-reduced-motion` form that keeps the information and drops the movement.
- Respond at once. What you did shows within 100 ms (a press, a send), even while the server has yet to answer; a control that has been pressed stands down until it is answered, so nothing is done twice.

## Settled (from the inspiration rounds)

- No flash. A touched thing acknowledges with a pulse round its edge (lustre): two sparks run from the top-left both ways round the outline, with a fading tail, 420 ms, once, never looped; a 1 px core and a faint 3 px glow, following the chamfered corners. Reduced motion turns it off. `app/src/lib/lustre.ts`.
- What a drag passes over is not touched: no pulse, no lit links, until the button is let go. What appears where you are working (held tags, a question, a thing carried) comes in over `--t-ack` from 4 px below (`appear`, app.css); a question floats over what it is about rather than pushing it down. A thing carried is drawn over the page, never clipped by the pane it left.
- On a phone the panes are one row, swiped or tapped between: a sideways swipe anywhere in a pane but the Atlas (whose drag pans the map) changes pane, and the tabs' bar moves with the row as it slides, the tab past half way lit.
- A note opened comes in (its opacity, over `--t-change`) rather than replacing the last between two frames with a blank one; the drawing that says a note is opening shows only once it has taken 300 ms.
- Writing keeps 80 px of room around the cursor (`cursorScrollMargin`), and a note has room after its end: the line written is never pressed to the pane's edge. Enter on the empty item that ends a list leaves a blank line, so the editor and every other reader of the Markdown agree on where the list stops.
- A note changed elsewhere while open (an agent's edit) takes only what differs: the cursor stays in its words, the words at the top of the view stay on the screen, and what came in glows gold and fades (1.2 s). A conflict says so at the top of the pane, wherever you are in the note.
- In the agent's pane the session, the drawer and the context take each other's place by fading in (`--t-ack`), and the session comes back where you were reading in it. A pane's settings come in as other floating things do (`appear`).
- One grammar of states on every control: rest; touched (the lustre); where the keyboard is (corner brackets, not an outline); chosen (solid, in its colour or the lattice); open (a bar); Iso's (a gold ◆); unavailable (faint).
- The three themes blend: the machine is how isorite answers you, the mineral is what notes are made of, growth is how they change. A heuristic, not a separation.
- No directive text: no key legends, no captions explaining what a control does. If it needs one, redesign it. As little guiding text as possible, ideally none.
- Voice: short, concrete, a little dry. No exclamation marks, no "Oops".
- Gold is Iso's alone.
- The Atlas's layout and routing do not change for style. Colour, weight, fill and motion only.
- Lyth Mono (hinted, OFL; from 0.17.0, in place of Ioskeley Mono and Departure Mono) is the interface, display and code face. It is not a pixel font, so any size will do; its advance is 0.604 em, about what Ioskeley had. Only the app loads it: the kit's artifact theme still inlines Ioskeley, whose files stay in `app/static/fonts`, since inlining Lyth would cost each artifact ~440 KB. Map labels drawn at the screen's own pixels, not scaled with the map: 11 px, and larger in steps (13, 15, 18, 22) as a box grows on the screen.
- A row in a list (the notes) has a vein: touched or chosen, a blue marker grows down its left edge and a vein runs along its foot, and the lustre crosses it. `.vein-row` in `app/src/app.css`.
- A link's kind is the weight of its vein, in the text's own colour: requires solid and blue (2 px), uses thin, see also dotted, the web dashed. Light runs along it when pointed at. The same in the note and in what Iso says. `.vein`.
- The agent's session: what you asked is a block on the ground with a blue rule down its edge; the agent's words carry its gold ◆; what folds (thinking, a command's output, a diff) has a caret that turns. While it works, the line under the turn names the step ("is reading *Surprise*"), by the crystal. Its words are shown at a steady pace that catches up with what has come, never dropped in a burst. The session follows the newest only while you are at the end; scrolled up, you stay, and a lifted button takes you back.
- The box you write in and its settings are one framed unit: the text above, a bar below with the session's settings as quiet words with a caret, and the button that sends (growth, solid once there is something to send) or stops (rose).
- Corners, eased: a square corner by `--round` (2 px), each vertex of a 45-degree cut by `--round-cut` (2 px; on the Atlas, two screen pixels at any zoom). Barely: a corner still reads as a corner, a cut as a cut. Where the browser cannot draw curves in a clip, the cuts stay sharp.
- Light (glow) belongs to what is live or the agent's, never to what merely sits there: the crystal at work; the agent's diamond while it writes; on the Atlas what it used, reached, has in hand or read, and a moment pointed at on the timeline; the part lit with its phrase; the session shown in the drawer. Gold for the agent, blue for you and for reading. `--glow-growth`, `--glow-lattice`, `--glow-rose`; `--glow-a` is how strong, less on quartz. A pulse along an Atlas link carries its own light: a halo blurred 3 screen pixels round its glow and sheen.
- Pulses are few, and each says that something has just happened: a note the agent has just read (once, the time of a result); a permission asked (twice); the box you write in while the agent works (slow, and only while it is not in use). None plays with reduced motion.
- Glass: what floats over moving content (the "Newest" button, the slash commands) is a little see-through and blurs what is behind it, `--glass`. Nothing else is see-through.
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
| Hover lift / drop shadow | Edge brightens one step. Nothing in the flow casts a shadow; only what floats over it (a menu, a settings panel, a button over a scrolling session) is lifted, with `--lift`, or `--lift-drop` for a cut frame, whose shadow follows its cut |
| Stock icon set | Icons drawn on one grid, 1.5 px stroke, round caps |
| Generic error copy | Say what failed, what it touched, what to do, in isorite's voice |

## Voice

Short, concrete, a little dry. Says what happened to the notes, not how the software feels. No exclamation marks, no "Oops", no "Let's get started". (?)

## Done means

- Every state of the screen has been looked at (empty, loading, error, long, narrow), not just the happy path.
- Nothing waits more than 100 ms to respond to input without showing it has heard.
- Screenshots of the changed states were taken and judged against this document, not just tested.
- Where a default was used because nothing here said otherwise, say so in the commit, so it can be replaced.

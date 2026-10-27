# isorite: taste and motion (DRAFT, to be rewritten in your own words)

This is the doc an agent reads before it touches anything a person sees or feels. Features live in the plans; this is
about how the thing behaves. Every line marked (?) is a guess to confirm or overwrite.

## The one idea

isorite is a crystal growing along fixed axes: structure is rigid, growth is gold, and growth is the only thing that
moves on its own. (?)

## Motion

- One physical rule: things appear by growing along a line (a stroke drawing itself), never by fading or sliding in
  from nowhere. Lines extend; boxes are outlined before they are filled. (?)
- Moves along the iso axes only (0°, 30°, 90°, 150°) wherever there is a direction. (?)
- Three durations: 120 ms (acknowledge: press, hover, focus), 260 ms (change: open, close, swap), 600 ms+ (a result
  worth noticing: Iso wrote into a note, a check resolved). Nothing else.
- One curve for arrivals (ease-out), one for departures (ease-in). No springs, no bounce.
- Gold moves; blue stays. Only Iso's work and growth animate in gold; the user's own actions are instant or 120 ms.
- Every animation has a `prefers-reduced-motion` form that keeps the information and drops the movement.

## Banned defaults

Each has a replacement, or it stays banned until one is found.

| Default | Instead |
|---|---|
| Spinner | The logo's strokes drawing, looped (?) |
| Toast / snackbar | Mark in place: the thing that changed carries a gold edge for a beat (?) |
| Skeleton shimmer | The dotted ground showing through; content grows in |
| "No items yet" empty state | A drawn, specific first move (?) |
| Hover lift / drop shadow | Edge brightens one step; nothing casts a shadow |
| Stock icon set | Icons drawn on the logo's grid, 1.5 px stroke, round caps |
| Generic error copy | Say what failed, what it touched, what to do, in isorite's voice |

## Voice

Short, concrete, a little dry. Says what happened to the notes, not how the software feels. No exclamation marks, no
"Oops", no "Let's get started". (?)

## Done means

- Every state of the screen has been looked at (empty, loading, error, long, narrow), not just the happy path.
- Nothing waits more than 100 ms to respond to input without showing it has heard.
- Screenshots of the changed states were taken and judged against this document, not just tested.
- Where a default was used because nothing here said otherwise, say so in the commit, so it can be replaced.

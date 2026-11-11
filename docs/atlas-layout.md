# The Atlas's layout and routes

How the map is placed and its lines found, written down on 2026-10-15 after milestone 3 replaced most of what came from rdstudio. Read this before changing anything in `packages/core/src/atlas/`: the second half is what was tried, what it measured, and why it was dropped. Most of these ideas look right on paper. Several made the map worse.

## 1. What runs, in order

```
plainModel ─► nestedLayout ─► highwayTrunks ─► gutters ─► nestedLayout again ─► highwayTrunks ─► highwayFeeders ─► cornerEnds
              (places)        (lines between   (widen     (same arrangement,     (final)          (inside each       (ends at a
                               linked siblings) busy gaps)  wider gaps)                              folder, to gates)  cut corner)
```

All of it is `gridLayout` in `layout.js`, run in the app's worker and kept under `layoutKey`. **Bump `LAYOUT_VERSION` whenever the output changes** (it is 16 now).

| Part | File | Does |
|---|---|---|
| layers | `nested.js` | A folder holding only notes: a layered diagram (Sugiyama) along the folder's way, which alternates up and right with depth. Carried over from rdstudio. |
| floorplan | `floorplan.js`, `nested.js` `planned` | A folder holding folders: its items are placed as blocks by a sequence pair and simulated annealing, as in chip design. The cost covers four things. Room between joined blocks counts as a highway would draw it. A block standing past what requires it counts against the flow. Area counts, as does the shape's distance from square (1 wide to tall, the same at the root on a phone). Crossings of the straight lines between joined blocks count too. Seeded from the folder, so the same folder always places the same way. |
| highways | `highways.js` `highwayTrunks` | Between two linked items of one folder, the shortest way across the folder's floor, from wall to wall. Drawn directly where nothing blocks it: straight where the two face each other; otherwise out of the middle of one side, one run at 45° halfway, into the middle of the other. Searched (A* over cells and directions) only where blocked. Where it meets a folder's wall is that folder's gate. |
| gathering | `highwayTrunks`, `gather` | Gates on one side of a folder within 224 units are merged at the busiest. Rerouted highways keep their other end. A side then has one gate where it had several, and one tree of feeders inside. |
| feeders | `highwayFeeders` | Inside each folder, from every item holding an end of a highway's links, the way to the gate. A* with direction states. A branch may join one already there at a discount, so feeders form trees, and a subfolder already fed to a gate reuses its exit. |
| gutters | `layout.js` `gutters` | After a first pass, each gutter carrying parallel highways is widened by a lane (3 cells; 2 coarse) per line beyond the first. Then the same arrangement is packed again (`pair`). |
| corners | `highways.js` `CORNER`, `cornerEnds` | A folder's cut is 10 units, in map units and not screen pixels. No route ends on the wall inside a cut. A route may end at the middle of the cut itself, square to it, at 45°. |

The costs are named constants beside their code: `PLAN_COSTS`, `HIGHWAY_COSTS`, `FEEDER_COSTS`. Each was chosen by a sweep, not by reasoning, and section 4 says how to run one.

Two keys stay on the Atlas (Lachlan, 2026-10-15): `c` cycles the grid through fine (7 units a cell), coarse (14) and coarser (18; a note is 7 by 2 cells), and `l` draws each note's line to its folder's wall at rest. Both are remembered in the browser. The comparison switches (`b` blocks or layers, `r` highways, gated routes or trunks, `g` the router's grid) were removed with the code behind them: the gated routes (`gates.js`, every link routed note to note through gates on each wall) and the grid panel. Layers remain for folders of notes, and the `blocks` option of `gridLayout` remains for tests and the benchmark.

## 2. What it measured

Means over six seeds of the floorplan; layers is deterministic. "Line" is the total length drawn at rest, merged where lines share cells. "Straight" is the share of highways between two folders with no bend. "Back" is the share of links running against the folder's way. dg is `~/Repositories/differential-geometry/knowledge` (63 notes). rdstudio is a copy of `~/rdstudio/knowledge` (230 notes).

| | dg: layers → blocks | rdstudio: layers → blocks |
|---|---|---|
| line drawn at rest | 12.6k → 11.0k (−13%) | 43.5k → 35.9k (−17%) |
| area of the map | 7.5M → 3.8M (−49%) | 20.8M → 12.8M (−38%) |
| straight highways between folders | 71% → 80% | 33% → 77% |
| crossings | 13 → 18 | 90 → 87 |
| links running backwards | 5% → 9% | 28% → 29% |
| bends | 76 → 85 | 161 → 155 |
| layout time | 0.13 → 0.16 s | 0.31 → 0.33 s |

On generated trees of 115 to 433 notes, nested three deep, the gain grows with size: line −42% to −46%, area −62% to −67%, at the same speed. Crossings rise by up to a quarter (110 → 136 at 433 notes), and back links go from none to up to 8%. Varying the floorplan's weights barely moved these numbers. Counting crossings in its cost took dg from about 22 to 16–18, and a search of 1,000 steps per block did as well as longer ones at a third of the time.

Both columns use the highways and feeders: the left one places folders in layers, as rdstudio did. Later the gutters were widened (about 1% more area on dg) and corner ends added.

Lachlan's verdict on dg: "a huge improvement … It looks more naturally organised and organic." The cost is a few more crossings and links running backwards. Both are still open (section 5).

The old benchmark (`npm run bench:atlas`) measures only the layers layout. It no longer matches its 2026-10-11 baseline exactly: the folder padding went from 8 cells to 6 and the margin from 3 to 8, so the grids are slightly smaller. Its straight, bend and crossing counts are the same.

## 3. Tried and dropped

Each was built, measured over several seeds on both bases, and removed from the code. None is kept behind a flag.

| Tried | Why it seemed right | What it did |
|---|---|---|
| level gates: a folder's gates lined up so that highways run straight between them | fewer bends at walls | dg line 12.6k → 16.6k, crossings 13 → 22 |
| a second Sugiyama pass that knows where each folder's ports are | orders items by where their lines actually leave | rdstudio crossings 90 → 137–250 |
| grouping a floorplanned folder's linked notes into one layered block | fewer, larger blocks to pack | more crossings on dg |
| wider gaps between all blocks | room for lines | more line and area, crossings no better; widening only the busy gutters, after the lines are found, replaced it |
| a higher flow weight in the floorplan (3) | fewer back links | back links 10% → 6%, but crossings 16 → 26 |
| a folder padding of 4 cells (6 kept) | a smaller map | longer lines and twice the layout time |
| gated routes (`gates.js`): every link routed note to note, crossing each wall at a gate, kept beside the highways for comparison until 2026-10-15 | one search, gates shared by every link through them | read worse than highways with their feeders on dg; removed with the switch |
| gates at quarter points of a side, not only the middle | shorter ways | dg 4% shorter but rdstudio 6% longer: links spread over more gates and shared less |

## 4. How to judge a change

- **Judge on dg, not rdstudio.** Lachlan finds rdstudio's base disorganised ("a bit of a red herring"); dg is the base whose map they read. rdstudio and the generated trees are for size and speed.
- **Several seeds, both bases, both grains.** The floorplan is randomised, and one seed's result can differ from the mean by more than the change being judged. Report mean and spread for line, bends, crossings, area, back links, straight highways and time.
- **Numbers first, then look.** The sweep that produced the tables above (`measure` over `nestedLayout`, `highwayTrunks`, `highwayFeeders` and the app's `restRoutes` and `mergeRoutes`) was a scratch script reading `/api/map` from servers on temporary copies of the two bases. It is not in the repository, because dg is Lachlan's own notes and its model would have to be committed as a fixture. Rebuild it from that description, or ask Lachlan whether a fixture of dg's model (titles and links, no text) may be kept in `bench/fixtures/atlas`.
- **Then screenshots at several zooms, on both grounds,** beside `Atlas-Nested`. Faults like the corner incut only show close up.
- **Stability does not matter.** Lachlan accepts the layout reshuffling when notes change; optimise how it reads.

## 5. Lessons

1. **Draw the shape the boards draw, and search only where it is blocked.** A highway drawn straight, or with one 45° run halfway, from the middle of one side to the middle of the other, reads better than the cheapest path a search finds. On a grid with diagonal steps a staircase costs the same as a straight run, so a search needs turn costs or the sawtooth comes back.
2. **A search that joins another branch must count the way still to go along it.** The feeders' sawtooth came from a branch counting only its way to the meeting point. The fix was the join discount on the rest of the branch (`FEEDER_COSTS.join`), not new turn costs or clearances, which changed almost nothing.
3. **Placement sets what routing can do.** Most of the gain in straight highways (rdstudio 33% → 77%) came from the floorplan, with the routing unchanged. Look at where things stand before tuning the lines between them.
4. **Measure before keeping.** Three of the most reasonable-sounding ideas (section 3) measured clearly worse. Remove a failed idea from the code rather than leaving it switchable.
5. **Anything a route must meet lives in map units.** The cut corner was sized in screen pixels, so in cells it changed with every zoom and no route could meet it. The same goes for anything else routes end on.
6. **Keep drawing precision finer than the layout's.** Snapping points to half cells silently dropped the last fraction of a cell, which was exactly where routes met corners.
7. **Check the boards' values, not memory of them.** Lit lines had drifted to growing with their link count (up to about 9 px) when the board fixes them at 3 px. Read the CSS values off `Atlas-Nested` when touching the drawing.
8. **Close-ups find what overviews hide.** The corner "dog ear" was one pixel of edge showing through a gradient. Only crops at several zooms in both themes showed it. Frames are now drawn as the boards draw them: two clipped shapes, the edge, then the fill one pixel inside.
9. **Widening is cheap when the arrangement is kept.** Re-packing the same sequence pair with wider gutters changes nothing else, so lines can ask for room after they are found. Searching again would undo the arrangement.

## 6. Still weak

- dg has slightly more crossings than under layers, and more links run backwards.
- Crossings that meet at cut corners crowd there.
- Highway counts show only when zoomed in.

## 7. The screen's shape, and a refinement pass (2026-11-09)

What was looked at: the guide and a 225-note base made from `bench/fixtures/atlas/this-base.json`, served and captured at the whole map, two zooms in, and hovering, at a desktop of 1280 by 800 (where the Atlas is the middle pane, 388 by 760, taller than wide) and a phone of 390 by 844.

### What it found

- **The map did not take the shape of the screen it is framed in.** The top level aimed to be square (`PLAN_COSTS.shape` 1) whatever the screen, and the way it ran came from the window, not the Atlas's pane. On a phone the guide filled a third of the screen when framed, a band across the middle with empty ground above and below; in the desktop's middle pane, two thirds by luck. Everything framed smaller than it needed to be, so names showed only further in.
- **Nothing came onto the map; it was there or not.** A folder opening as the zoom passes it swapped its block for its frame and its notes in one frame; note names appeared and went in one frame at the zoom they became readable.
- **The layout is slow on a large base.** About a second for 225 notes on an idle machine (6 to 11 s while other work loaded it), most of it in the highways' and feeders' searches (A* over every cell of a folder) and the floorplan's annealing. The highways' search kept its heap as an array of pairs, a third of its time making and collecting them.
- **Slow cases are opt-in.** `ISORITE_SLOW=1 npm test -w @isorite/core` also runs the two cases that lay out and route about 1,200 notes (minutes); `npm run bench:atlas` measures the same.
- **The old benchmark measured a layout the app no longer draws** (layers, not blocks and highways).
- Folder names are cut off where a folder is one note wide ("out…", "ter…"), and at the whole-map zoom of a large base notes are blank blocks. Both are the level of detail working as meant; see the ideas below.

### What changed

| Where | What |
|---|---|
| `nested.js`, `layout.js` | `gridLayout(model, { aspect })`: the shape the whole map aims for, wide to tall. The top level's floorplan aims for it, with its shape counting `PLAN_COSTS.fit` (6) times as much as a folder's; a top level of notes only (layers) takes it as its rows' shape. Taken in steps of a quarter of a doubling, a quarter to four (`aspectOf`), so a pane dragged a little wider is the same map; part of `layoutKey`. `LAYOUT_VERSION` 15. |
| `Atlas.svelte` | The pane's own shape is asked for when the map is laid out afresh (first drawn, a new grid, the relayout button) and kept until then: a note opened beside the Atlas narrows it, and must not reshuffle the map. The way the top level runs is still the window's: running it the pane's way measured worse (more crossings on the guide in the desktop's pane, 9 → 27). |
| `highways.js` | The highways' search keeps its heap in typed arrays, as the feeders' already did; the clearance of a layout's cells is worked out once for the highways and feeders, not once each. The output is the same to the bit (checked on the guide and nanosim, three option sets). Highways and feeders on the 225-note base: 760–920 ms → 600–810 ms. |
| `AtlasBlock.svelte`, `AtlasFolder.svelte` | What comes onto the map grows in: a note (from nothing) and a folder's frame (from a third, so a folder opening does not blink) take their opacity over `--t-change`, by `@starting-style`, so the map first drawn, a folder opened by the zoom and a note made all come in. A note's name fades in over `--t-change` as the zoom settles past where it reads, and goes at once. The dimming of the notes not lit is `--t-change` too (it was 150 ms, off the three durations). With reduced motion, none of it. |
| `bench/atlas_layout.mjs` | `--app`: the app's own layout (blocks and highways) for each fixture, framed in a phone, the desktop's middle pane and the Atlas alone on the desktop: how much of the screen the whole map fills, the line drawn at rest (merged), crossings, straight highways between folders, back links, time. `--no-aspect` lays out as before. The guide is a fixture now, read from `packages/guide/notes` (it changes with the guide). Results in `bench/baselines/atlas-app-2026-11-09-aspect-{before,after}.json`. |

### What it measured

`node bench/atlas_layout.mjs --app` before (`--no-aspect`) and after, one seed. Fill is the share of the screen the map's frame covers when the whole map is framed.

| Fixture | Fill: phone / pane / wide | Line drawn | Crossings |
|---|---|---|---|
| guide | 0.34 / 0.64 / 0.41 → 0.70 / 0.90 / 0.75 | 12.8k → 14.2k | 58 → 63 |
| this-base (225 notes) | 0.40 / 0.82 / 0.31 → 0.42 / 0.89 / 0.61 | 119k → 123k | 376 → 368 |
| nanosim | 0.44 / 0.46 / 0.56 → 0.80 / 0.86 / 0.81 | 5.0k → 5.8k | 15 → 10 |
| mockup | 0.37 / 0.58 / 0.44 → 0.87 / 0.90 / 0.71 | 4.9k → 5.4k | 7 → 7 |
| synth-6x9 | 0.50 / 0.44 / 0.59 → 0.81 / 0.92 / 0.89 | 15.2k → 16.0k | 49 → 42 |
| synth-12x12 | 0.47 / 0.36 / 0.73 → 0.76 / 0.88 / 0.85 | 56.5k → 60.2k | 127 → 145 |

Over the eighteen cases fill goes from 0.49 to 0.80 on average: the framed map is about 28% larger across on the screen, so names show sooner. The line drawn grows 5%, crossings are level (632 → 635), straight highways and back links move both ways by fixture. The weight was chosen over four seeds on the guide and nanosim: at `fit` 1 (the plain aspect cost) the guide filled 0.60 of the screen, at 4 0.73, at 6 0.77, at 16 0.82 with straight highways falling; 6 kept line and crossings within a tenth of 1. this-base's phone barely moves: its `tasks` folder (138 notes) is most of the map, and a folder's own shape is not the screen's.

The core's timing test ("is the same for the same bundle…", under 60 s for 1,177 notes twice) failed once at 73 s while the machine's load was 14 on two cores; it is a guard against a layout gone badly wrong, and the layout of that test (layers) did not change.

### Ideas judged too risky or too large for now

| Idea | Why not yet | Effort |
|---|---|---|
| Inner folders taking the screen's shape too (the square root of theirs and the screen's) | Tried: the guide's phone filled 0.70 against 0.66, but the folders' layered diagrams changed shape everywhere, which the doc's lesson 3 says to judge on dg first. | half a day with dg |
| The top level running the pane's way, not the window's | Measured worse on the guide in the desktop pane (crossings 9 → 27); the alternation of ways with depth makes the top level's way set every folder's. Worth a sweep on dg. | half a day |
| Relaying out when the pane changes shape a lot (a phone turned) | A note opened beside the Atlas changes its shape too; telling the two apart needs a rule (turned, or more than a doubling) and the reshuffle is jarring. The relayout button does it now. | 2 hours |
| Semantic zoom at the whole map of a large base: folder names large and faint across their region (Alien: Isolation's map), notes as blocks | A new layer of drawing with collisions to settle between nested names; the inspiration README lists it as liked. | 1 day |
| A folder's full name where its frame cuts it off | A title on hover is cheap but is directive-ish text; widening a one-note folder for its name costs area at every zoom since the name is at screen size. | 1 hour (hover), unknown (layout) |
| Faster feeders on large bases: a search per subfolder region on a cropped grid, or the A* in one typed state space shared across searches | The feeders' search is now the largest cost (about half of a large layout). Must stay output-identical or be re-judged. | 1 day |
| Flights whose length follows the distance (van Wijk and Nuij's smooth zoom) | `fly` is 320 ms however far; a long zoom out reads as a jump. Touches the taste doc's three durations. | half a day |
| Routes that fade in as a folder opens | The rest lines are redrawn wholesale at the end of a new layout's draw beat, and a fade there would blink every line. Needs the beats to keep their elements. | half a day |

## 8. Lenses (2026-11-11)

A lens (`docs/lenses.md`) gives the layout a different tree and changes nothing else in it. Core's `lensModel` takes the model of the folders and returns one whose folders are the lens's islands: an island's ref starts with a colon (`:Combat/Weapons`, `:` for the implicit last island, Elsewhere), which no note's or folder's id can hold, so an island is never taken for a folder. Each note is the folders' item for it, placed once at its home. A ghost, a note a second island holds, is an item of its own in that island, with the ref `ghost:<note id>:<island ref>` and no links, so it takes room and takes no part in routing; the app draws it as a dashed block standing for the note, and a dotted line to its home while either is lit.

| Where | What |
|---|---|
| `layout.js` | `LAYOUT_VERSION` 16. `lens` (a name) is in `layoutKey`, and seeds the floorplan's salt (`planCosts.seed`), so each lens is laid out on its own and a lens does not inherit the folders' arrangement (`from`). |
| `Atlas.svelte` | Chosen in the Atlas header; a lens map takes the same worker, key and beats as the folders. A new lens is a new map, framed afresh. Files and the code switch's items are not in a lens (a lens has notes only until it has `type:` rules). A lens map makes, moves, renames and hides nothing: islands are not folders. |

Not measured on the 1,200-note case yet.


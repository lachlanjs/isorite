# The Atlas's layout and routes

How the map is placed and its lines found, written down on 2026-10-15 after milestone 3 replaced most of what came from rdstudio. Read this before changing anything in `packages/core/src/atlas/`: the second half is what was tried, what it measured, and why it was dropped. Most of these ideas look right on paper. Several made the map worse.

## 1. What runs, in order

```
plainModel ─► nestedLayout ─► highwayTrunks ─► gutters ─► nestedLayout again ─► highwayTrunks ─► highwayFeeders ─► cornerEnds
              (places)        (lines between   (widen     (same arrangement,     (final)          (inside each       (ends at a
                               linked siblings) busy gaps)  wider gaps)                              folder, to gates)  cut corner)
```

All of it is `gridLayout` in `layout.js`, run in the app's worker and kept under `layoutKey`. **Bump `LAYOUT_VERSION` whenever the output changes** (it is 11 now).

| Part | File | Does |
|---|---|---|
| layers | `nested.js` | A folder holding only notes: a layered diagram (Sugiyama) along the folder's way, which alternates up and right with depth. Carried over from rdstudio. |
| floorplan | `floorplan.js`, `nested.js` `planned` | A folder holding folders: its items are placed as blocks by a sequence pair and simulated annealing, as in chip design. The cost covers four things. Room between joined blocks counts as a highway would draw it. A block standing past what requires it counts against the flow. Area counts, as does the shape's distance from 1.4 wide to tall (1 to 1.4 at the root on a phone). Crossings of the straight lines between joined blocks count too. Seeded from the folder, so the same folder always places the same way. |
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

# Milestone 3: the Atlas

Written 2026-10-13 for Lachlan's approval. Branch: `m3-atlas`, which holds only this plan until it is approved. Nothing below is built.

**Done when:** the information theory base and rdstudio's 225-note base both draw; selecting a note lights what it requires and what builds on it; Iso's path is drawn while it reads; a note for Iso can be started by holding on the map and its linked notes picked there; and pan and zoom frame times on the 225-note base are measured and reported.

The boards followed:

| Board | What it settles |
|---|---|
| `Atlas-Nested` | The map itself: nested folders, blocks, routes between siblings, study folders with the band and the grown mark, and what lights when a note is pointed at. |
| `Desktop-Atlas` | Holding on open ground: the marching gold box, "a new note", and the status line at the foot. |
| `Desktop-Think` | The map while Iso reads: the draft's block, its lines to the notes you linked, the four ways a note was reached, "Iso is reading …", `[ stop ]`. |
| `Marks` | A block's four states by line and fill, the three outlines for how Iso found a note, the grown mark's rule. |
| `Mobile-Atlas`, `Mobile-Pick`, `Mobile-Think` | The same at 390 px: closed folders with a count, `↑ out`, picked notes numbered, the dock with "back to it". |

Not followed: `Atlas-Large` and `Atlas-Study-Open`, which `decisions.md` records as replaced by `Atlas-Nested`. `Atlas-Timeline` is milestone 5.

## 1. What you will be able to do

1. **Open the atlas** from the header and see the whole base: every folder a cut-corner frame with its title in its top edge, every note a block, laid out by what requires what.
2. **Move about.** Drag to pan, wheel or pinch to zoom. A folder that is small on screen is one closed block with its name and note count (as on `Mobile-Atlas`); it opens as you zoom in. Click a folder to zoom to it, open ground to step out.
3. **Select a note.** Pointing at a note, or clicking it, lights what it requires all the way back (purple, the dashes running toward it) and what builds on it directly (orange, running away), and dims the rest. Clicking the selected note opens it.
4. **Read understanding off the block:** dotted for not reached, a solid line for opened, filled for worked through, a double blue line for understood (`Marks`).
5. **See study folders** beside the folders they study: a solid title band with the grown mark, cut-corner items with their kind on the top edge, dotted links to the notes they test.
6. **Start a note for Iso on the map.** Hold on open ground for a blank one, or on a note to start from it. The draft opens as it does now.
7. **Pick linked notes on the map.** `[ + pick on the atlas ]` on the draft opens the map; each note you click is linked and numbered, and a dock at the foot takes you back.
8. **Watch Iso read.** After sending, you are on the map: the draft's block in gold, blue lines to the notes you linked, and each note Iso reaches outlined by how it got there. The note opens when Iso is done.

## 2. What is built

### In the core

Nothing new in the layout: `gridLayout`, `feeders`, `gridRouter` and `layoutKey` are there and benchmarked. Added, with tests:

| Part | Does |
|---|---|
| `reach(graph, note)` | What a note requires, all the way back, and what builds on it directly, as note ids and as the links between them. The graph has the pieces; this is the one function the map and (later) a terminal both call. |
| the grown mark | `Marks`'s rule (`X › F[+X]F[-X]+X`, turning 45°) as a pure function from a seed and a depth to a path, so a folder always grows the same plant. |

### In the engine and the server

One new operation on the `Api`:

```ts
map(): Promise<MapReport>
// the map model (core's mapModel over both bases), and for each note:
// its title, its understanding step (0 to 3), and for a study note its kind
```

- The engine already holds both bundles and rebuilds them when a note changes. `map()` reads them and the study record.
- No new event. The map asks again on `note-changed` and on `record`.
- Iso's path needs nothing new: `iso-start`, `iso-step` (which already says `how`: keyword, meaning, link or read, the notes named, the note opened and the note it was reached from) and the three endings are on the stream now.

### In the app

| Part | Notes |
|---|---|
| the layout worker | Core's `gridLayout` and router in a Web Worker, as in rdstudio's `layout-worker.js`. Kept under `layoutKey` (version, direction, model). |
| `Atlas` | The viewport: pan, zoom, hold, what is open at this zoom. The only imperative part. |
| `AtlasFolder`, `AtlasBlock`, `AtlasStudyFolder`, `AtlasStudyItem` | One component per kind of thing. Each is told its place and its marks; none knows about the layout or Iso. |
| `AtlasRoutes` | One SVG layer under the blocks: trunks with their counts, feeders, and the lit routes. |
| overlays | Four plain maps from note id to a mark, looked up while drawing: understanding (from `map()`), selection (from `reach`), Iso's path (from the event stream), picked notes (from the draft). Milestone 5 adds a fifth, the session's moments, with no change to the drawing. |
| the status line | Mode, counts, and the one line of what holding does (`Desktop-Atlas`). |
| pick mode | The map with the dock at its foot; the draft page gains `[ + pick on the atlas ]`. |
| the atlas while Iso thinks | The draft's block, its lines, the path, `[ stop ]`. |

The board's sizes are taken as drawn: a block 126 by 35 px at 10.5 px type, 0.5 opacity at rest, routes 1.5 px, lit routes 3 px dashed 7 and 5, a study folder's band 20 px high, a study item's corners cut by 8 px.

## 3. Where rdstudio's code does not carry over as it is

1. **`gridmap.js` is 1,118 lines of d3 and hand-made DOM, and is not carried over.** `decisions.md` says the drawing is rewritten as components. What is carried over is its arithmetic: the cell size, when a folder opens, when titles and the grid's dots appear, the cut-corner path, the lane offset for parallel routes, and the fit-to-folder transform.
2. **No d3.** rdstudio used `d3-zoom`. Pan, wheel and pinch over pointer events is about a hundred lines, and holding has to share those events anyway. Say if you would rather have the dependency.
3. **rdstudio's map had lenses, a trail, tours, a card, code and artifacts on it.** None is in the slice and none is carried over.

## 4. Choices that need your eye

1. **Blocks and folders are HTML elements, routes are SVG,** both under one transform. `architecture.md` says "components over SVG". The boards draw it this way, the cut-corner frames and the focus ring are already CSS from milestone 1, and titles wrap to two lines, which SVG text does not do. The components and the measuring are the same either way.
2. **Pointing lights a note, and so does a click.** The board lights on pointing; a phone has no pointing, and `architecture.md` rules out anything reachable only by hover. So: point to preview, click to select and hold the light, click again to open.
3. **Every block will be dotted and faint until milestone 4.** Understanding comes only from the study record, and nothing writes attempts to it until exercises exist. The states are built and tested against a scripted record. If you would rather the map did not look unreached for a whole milestone, the alternative is to count a note you have written or kept text in as "opened". That is a change to the rule in `understanding.ts`, so I have not assumed it.
4. **Where a draft's block sits.** A draft is not in the base, so the layout has no place for it. I would draw it where you held, remember that in the browser only, and otherwise put it on open ground to the right of the map. Nothing about its place is written to disk.
5. **Iso's path is drawn for every request,** including one made in a note, so the atlas in a second tab shows it. It stays until the next request or until you click open ground.
6. **The grown mark has nothing to grow from yet.** On the board each study folder's plant is a different size. I would draw the smallest plant for every study folder now and let it grow with the folder's exercises passed in milestone 4.
7. **What you pick is what Iso is sent.** Picking on the map is the first place you choose Iso's context by hand, so I would show each picked note's size in tokens in the dock, and the total. The automatic 8,000-token share for linked notes in `iso.ts` stays as it is; no trimming is added.
8. **The layout's cache is in memory only.** The benchmark records 7 ms to lay out 225 notes and 5 ms to route them, so keeping layouts on disk would save nothing you could notice. The worker and the versioned key are built as planned, for larger bases.
9. **"Poor" needs a number.** I would call it a 95th-percentile frame over 25 ms (under 40 frames a second) while panning and zooming the 225-note base at 1280 by 800 on this machine. Past that, the routes alone move to a canvas under the blocks. Under it, nothing changes.
10. **Phones.** The slice is desktop only, but every screen is checked at 390 px. The map will pan, pinch, select, pick and show Iso's path there, with `↑ out` in the header. It is compared with the three mobile boards and the differences listed; it is not tuned for a hand.

## 5. Two things about the bases

- **`~/Repositories/information-theory` has one note** (`Fundamentals/entropy.md`), and its study base has no exercises. Its atlas will be one folder holding one block. That meets "draws", and shows almost nothing. The map is really judged on the larger base until you have written more.
- **The 225-note base is `~/rdstudio/knowledge`,** read from a temporary copy, with a study base made beside the copy and a few scripted exercises in it so study folders appear. `bench/fixtures/atlas/this-base.json` stays the layout's own test.

## 6. Order of work

1. `map()` in the engine and over HTTP; `reach` and the grown mark in the core. Tests.
2. The worker, the viewport, folders, blocks and routes at rest. Pan, zoom, what opens when.
3. Selection: pointing, clicking, the lit routes, opening a note. **I would stop here and show you,** on the 225-note base, since it is the first time the map is on the screen.
4. Understanding on the block; study folders, their items and dotted links.
5. Hold to start a note for Iso; pick mode and the dock.
6. Iso's path, the draft's block and its lines, the atlas while Iso thinks.
7. Frame times measured and reported. The routes move to canvas only if the number in 4.9 is passed.
8. A real model once. Screens compared with the boards at both widths on both grounds. The write-up.

Each step ends with its tests passing and a commit.

## 7. How it is checked

- **Core:** `reach` on a small graph with a cycle, a broken link and a note nothing requires; the grown mark gives the same path for the same seed. The layout benchmark still reproduces its baseline (53% straight, 25 crossings).
- **Engine and server:** `map()` on a base with and without a study base; a study note joined to what it tests; steps from a scripted record; the map changes after a note is saved with a new link.
- **Browser,** against a scripted provider, at 1280 and 390 px on both grounds: the map draws; a click selects and lights the right notes and no others; a second click opens the note; a folder zooms in and open ground steps out; a hold makes a draft and the base's files are unchanged; picking two notes links them in the draft in order; a scripted run of Iso's steps outlines each note in the right way and ends by opening the note; `[ stop ]` stops it.
- **By eye:** screenshots beside `Atlas-Nested`, `Desktop-Atlas` and `Desktop-Think`, and the three mobile boards, with sizes measured and not judged.
- **Frame times:** a scripted pan and zoom over the 225-note base, median and 95th percentile reported.
- **Every `.svelte` file** through the Svelte tool.
- **A real model:** one note for Iso started on the map, on the mid tier, on a temporary copy. About $0.03. I would run it on the copy of rdstudio's base, since a path through one note shows nothing; that sends some of rdstudio's notes to OpenRouter, so say if you would rather it ran on information theory.

## 8. Risks

- **Holding, dragging and clicking share one gesture.** A hold that moves is a pan; a hold on a note is not a click. This is where a map most often feels wrong, and tests catch it poorly. It gets the most time by hand.
- **Zoom by CSS transform** can blur text mid-zoom and repaint a large layer. The measurement in step 7 says whether it matters; the fallback is to place blocks by their own coordinates, as rdstudio did.
- **A map of one note** will not show faults that a real base would. Until information theory has grown, faults found on rdstudio's base are the ones to trust.
- **Size.** Smaller than milestone 2: no new mechanism on disk and no change to Iso's loop. The drawing is new code, and the gesture work is the unknown.

## 9. Not in this milestone

- The session's moments on the map (`Atlas-Timeline`): milestone 5.
- Squares on a block for its exercises, and the list of what tests a note (`Study-Fit`): milestone 4.
- Suggested links, lenses, study paths, the tours.
- Stability of the layout under small edits (accepted in `decisions.md`).

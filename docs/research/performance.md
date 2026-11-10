# Performance: measurements, quick wins, cliffs and long-term paths

Written 2026-11-09 from a read-only investigation (no source was changed). Scripts and synthetic bases are in the session scratchpad, not the repository; the method is in section 1 so a run can be repeated.

## 0. Summary

isorite is fast at the sizes it was built for and has four things that will hurt before the base is large.

- **A save rebuilds everything.** Every write sets `this.built = this.index = null` (`packages/engine/src/engine.ts`: `put` and eight other write paths, plus `reload`), and the next read of `notes()`, `map()` or `search()` re-parses every note, re-parses every YAML frontmatter, rebuilds the link graph and rebuilds the BM25 index. The app asks for exactly those three things 300 to 400 ms after each save, from every open pane. At 1,000 notes of 8 KB that is about 0.4 s of CPU for the bundle, 0.4 s for the map and 0.6 s for the search index, repeated for each autosave (the editor saves 1.5 s after the last keystroke). At 5,000 notes it is the machine working continuously while you type.
- **A note's save cost grows with its own history.** Saving one 8 KB note cost 16 ms with an empty journal, 134 ms after about 275 saves and 282 ms after about 575 (CPU). The journal is never trimmed, and `replay` re-hashes the note once per entry with a pure-JavaScript SHA-256 that runs at 24 MB/s (Node's `crypto` runs at 700 MB/s). This is a cliff in time, not in base size: a note edited heavily for a few weeks reaches it.
- **Search by meaning spends 95% of a query on fingerprinting, not on vectors.** `Meaning.similar` re-cuts every note into pieces and re-hashes every piece with the same slow SHA-256 on each call (337 ms at 1,000 notes, 3.4 s at 10,000), then scans the vectors in 14 ms (68 ms at 10,000).
- **Atlas layout is the one genuinely super-linear piece.** It runs off the main thread and is cached by key, so it is not a freeze, but a changed link structure costs about 10 ms per note in my synthetic maps (10 s at 1,000 notes) and routing a back trunk costs seconds at that size.

Everything else (the wire format, SSE instead of polling, the note-list DOM, the Atlas's semantic zoom) is sound at 100 to 5,000 notes. The recommended sequence is in section 7: fix the three O(history) and O(base)-per-save problems first (days of work, no format change), then make the engine incremental, and only then consider a persistent index or Rust.

## 1. Method and caveats

- Synthetic bases written to disk by a generator: N notes in folders of 12 (`a0/b0/n17.md`), each with frontmatter (type, title, description, tags), a leading `#` heading, four `##` sections of two 60-word paragraphs, and four links in the first section (20% rated "requires"). About 8 KB a note, which is larger than a typical personal note (2 to 4 KB), so per-note CPU here is probably 1.5 to 2.5 times what a real base costs. N = 100, 1,000, 10,000 were run. 50,000 was generated (409 MB) but not run: the machine has 8 GB and was shared; the 50,000 column is extrapolated and marked so.
- The machine is 2 vCPUs, shared with other agents' test runs and builds throughout (load average 6 to 13). Wall times were 3 to 5 times CPU times. **Every number below is CPU milliseconds (`process.cpuUsage`) unless it says "wall"**, because CPU time survived the contention; scaling between sizes is reliable, absolute values are probably pessimistic by 1.5 to 3 times against an idle laptop.
- Engine numbers use the real `Engine` with `NodeFiles` (no embedder), the real `Bundle`, `SearchIndex` and `Meaning`. The meaning scan used random int8 vectors of the real width (384). The real embedding model is installed here (granite-embedding-small); its throughput was measured but the machine was too loaded for the figure to mean much (section 2.4).
- Server numbers come from `isorite serve` on port 4879 (4873 was held by another agent's server) with `HOME` and the cache and config folders pointed at scratch.
- Profiles: `node --cpu-prof`, summarised by self and inclusive time per function.

## 2. Measured numbers

### 2.1 Core and engine, by base size

CPU ms except where noted. "Warm" is a second run in the same process (JIT warmed); "first" includes JIT warm-up and is what a cold start sees.

| What | 100 notes | 1,000 | 10,000 | 50,000 (extrapolated) |
|---|---|---|---|---|
| Walk and read every file | 68 | 373 | 3,408 | ~17,000 |
| `Bundle.fromFiles`, first | 174 | 923 | 5,264 | ~27,000 |
| `Bundle.fromFiles`, warm (= what every save pays) | 73 | 406 | 4,221 | ~21,000 |
| YAML frontmatter alone, per note | 0.36 ms | 0.25 ms | 0.12 ms | |
| `SearchIndex` build (also per save, on next search) | 98 | 625 | 5,641 | ~28,000 |
| One keyword query on a built index | 3.3 | 16 | 128 | ~640 |
| `pieces()` (cut and fingerprint; runs on every meaning query and every save) | 123 (400 pieces) | 447 (4,000) | 3,360 (40,000) | ~17,000 |
| Meaning scan of the vectors alone | 6 | 14 | 68 | ~340 |
| `Meaning.similar` warm, whole call without the model | 58 | 337 | ~3,500 (not run to the end; scan plus `pieces`) | |
| `mapModel` including `prerequisiteOrder` | 10 | 121 | 6,314 | super-linear (see 5) |
| `GET /api/notes` JSON | 23 KB | 236 KB | 2.4 MB | ~12 MB |
| `GET /api/map` JSON | 26 KB | 268 KB | 2.9 MB | ~15 MB |
| Vector cache file (JSON, base64 int8) | 0.2 MB | 2.1 MB | 20.5 MB | ~100 MB |
| Process RSS with the bundle built | 102 MB | 177 MB | 551 MB | ~2.7 GB |
| `isorite serve` RSS | 204 MB | 270 MB | 629 MB | |
| `isorite serve` start to first answer (wall, loaded machine) | 4.3 s | 6.8 s | 23 s | |

Where the bundle time goes (profile of repeated rebuilds at 1,000 notes): `loadConcept` 65% inclusive, of which `splitFrontmatter` 59% and the `yaml` library's `parseDocument` 53%; then `linkRefs`/`markdown.parse` about 12%, `resolve` 4%, `prerequisiteOrder` 4%, `hasConflict` (a multi-line regex over every note) 4%, the CRLF `replace` per note 3%, `sha256` 2.5%.

### 2.2 What one save costs

Saving one note in a 1,000-note base through the HTTP server (wall, loaded machine; CPU is a third of it):

| Step | Time |
|---|---|
| `PUT /api/note` | 44 ms (392 ms the first time) |
| then `GET /api/notes` (bundle rebuild) | 0.92 to 1.12 s (17 ms when nothing changed) |
| then `GET /api/map` (no memo: recomputed every call, 0.29 s when nothing changed) | 0.37 to 0.48 s |
| then `GET /api/search` (index rebuild) | 1.3 to 1.9 s (first search ever: 1.27 s) |

So one autosave makes the server do about 1.4 s of wall work for the list and the Atlas, and a further 1.3 s the next time anyone searches, while three panes (list, Atlas, context view) each ask for `/api/map`.

Cost of a one-character save of an 8 KB note as its journal grows (CPU, 100-note base; the base size is irrelevant to this):

| Journal entries | CPU per save | Journal file |
|---|---|---|
| 0 to 50 | 16 ms | |
| about 275 | 134 ms | |
| about 575 | 282 ms | 598 KB for 600 saves |

`readNote` after 600 entries: 160 ms. The profile of a 60-save run: 56% of all CPU in `sha256`, 90% inside `put` → `change` → `replay` and `reconcile` (which calls `change`, so `replay` runs twice a save).

### 2.3 Hashing

SHA-256 of 8 KB: pure-JS `sha256` in `packages/core/src/text.ts` 0.334 ms (24 MB/s); `node:crypto` 0.0113 ms (710 MB/s). The pure version is used for: every journal chain check, every note version (`hashText` on every read and save), every meaning-piece fingerprint, and the bundle's own use.

### 2.4 Search by meaning, indexing

- The model took 6.5 s to load, then 4.2 s per 1,800-character piece on a machine at load 11 (10 in parallel took 35 s, so the single worker thread is the limit). That is not a fair figure. For a small int8 ONNX model on an idle two-core laptop, 60 to 200 ms a piece is a sound expectation, so the first index of a 1,000-note base (about 4,000 pieces) is **4 to 13 minutes**, 10,000 notes 40 to 130 minutes, one piece at a time, no batching (`Meaning.refresh` loops `await embed(p.text)`). This is a background task, not a freeze; after the first pass only changed pieces are embedded.
- `Meaning.save` writes the whole vector map back as JSON every 40 vectors during indexing (`meaning.ts`, `made % 40`): at 10,000 notes that is a 20 MB `JSON.stringify` and write repeated 1,000 times during the first pass.
- `Meaning.load` parses the whole file and base64-decodes every vector into its own `Int8Array` (40,000 small arrays at 10,000 notes) on the first query.

### 2.5 Atlas layout (`npm run bench:atlas`, plus a synthetic scaling run)

The repository's fixtures (loaded machine, wall): this-base (225 notes, 10 folders) 284 ms layout plus 145 ms routing; 160 notes 94 ms plus 40 ms; 62 notes 49 ms plus 11 ms.

Synthetic maps of my own (CPU): a model with one link a note, 93% of them to a neighbour within about 12 notes, random strengths. This is denser and less tidy than the repository's real base (about 0.6 drawn links a note), which is why it is slower at the same size; use it for scaling, not for absolute values.

| Notes | Layout | 40 route queries |
|---|---|---|
| 225 | 1.8 s | 3.2 s |
| 500 | 4.7 s | 3.6 s |
| 1,000 | 9.9 s | 43 s |
| 10,000 | not run; at the linear rate 100 s, probably worse | |

With two links a note and 200 notes the layout took 5.7 s, so edge density matters as much as note count. Layout returns 213 to 545 KB of JSON per 200 notes through `postMessage`. The layout is asked of a worker (`app/src/lib/atlas/layout.ts`) and kept under a key made from the map's structure (`layoutKey`), so editing a note's body (which changes no link or title) is answered from the cache; adding a note, changing a link or renaming one lays out again.

### 2.6 Frontend build (`npm run build`, 66 s)

| What | Size |
|---|---|
| Entire `app/build` | 8.2 MB, 306 files |
| JS | 5.09 MB over 200 files (most are lazy language grammars and the guide engine) |
| CSS | 671 KB over 12 files (`0.*.css` is 117 KB, 25 KB gzipped, loaded eagerly) |
| woff2 fonts | 1.27 MB over 36 files (Lyth Mono is 4 files of 163 to 182 KB each; KaTeX 20 files; IBM Plex, Charter, Ioskeley) |
| KaTeX ttf and woff, shipped but unused by any current browser | 817 KB |
| `static/kit` (artifact kit: chart 386 KB, model 803 KB, math 255 KB + css 360 KB, isorite.css 137 KB) | 1.9 MB, lazy, only for artifacts |

`index.html` preloads 22 files: **1.69 MB raw, 542 KB gzipped** of eager JS and CSS. The big eager chunks: a 593 KB (179 KB gz) chunk holding KaTeX, markdown-it and DOMPurify; 280 KB (90 KB gz) of CodeMirror and Lezer; 223 KB (84 KB gz) of the `yaml` library (needed in the browser for frontmatter editing); the 219 KB layout node; 117 KB for the note page. The Atlas layout worker is a separate 43 KB chunk. Highlight grammars (`@codemirror/language-data`) and `pele` (diagrams) are dynamic imports. Fonts are `@font-face` rules the browser fetches only when a glyph uses them.

Serving (`packages/server/src/http.ts`):

- Static files: `readFileSync` on every request, no compression, no `ETag` or `Last-Modified`. Only `/_app/immutable/*` gets `immutable`; everything else (`index.html`, `/fonts/*`, `/kit/*`) is `Cache-Control: no-cache` with no validator, so the browser re-downloads them in full each load. On localhost this is invisible; over a tailnet or LAN it is 1.69 MB of JS (542 KB if compressed) plus the fonts on each visit.
- API: `JSON.stringify` of the whole value, `Cache-Control: no-store`, no compression, no revision or ETag. `/api/notes` and `/api/map` are whole-collection answers.
- Events: one SSE stream (`/api/events`) with 25 s heartbeats. There is no polling anywhere in the app (good). There is also no file watcher in the server: the base is read once in `Engine.open` (`reload()` is called nowhere else), so an edit made outside the app (a git pull, another editor) is invisible to the list, search and Atlas until the server restarts, though `readNote` reads the file fresh. This is a correctness gap that interacts with any caching plan: an incremental index needs an invalidation signal (a watcher, or a cheap re-stat on read).

### 2.7 Cold start of the server (checkout, TypeScript run directly by Node 24)

`node packages/server/src/main.ts --help` takes 3.2 to 3.5 s (bare `node -e 0` is 0.1 s) because every command loads the whole import graph. Measured import times (wall, loaded): `@earendil-works/pi-coding-agent` 2.7 s, `@agentclientprotocol/sdk` 1.0 s, `pi-ai` 0.36 s, `pi-agent-core` 0.24 s, `hono` 0.15 s. `serve.ts` imports `PiControl` statically, `main.ts` imports `acp-wrap` and `doctor` statically. The built npm package and the single executable (`scripts/sea.ts`) will be faster than source, but the graph is the same.

## 3. The frontend in detail

- **Reactive store.** `app.listing` is `$state.raw` and replaced whole on each refresh (`app.svelte.ts`), after a 300 ms debounce on `note-changed`. Fine. `NoteList.svelte` then re-runs: `seen` (an `isHidden` scan over the hidden list for every note, O(N·H)), `shown`, and `folders`, which builds each folder's array with `by.set(n.dir, [...(by.get(n.dir) ?? []), n])` (quadratic within a big folder). At 10,000 notes this is tens of ms, not a problem; it is the network and server work behind it that matters.
- **Refetch chatter.** `NoteList.svelte` has an `$effect` that reads `app.listing` and calls `api.map()` on every change, only to find the non-note files (artifacts, pictures, data) for the list. So each save, with the list open, fetches `/api/notes` (2.4 MB at 10,000) and `/api/map` (2.9 MB at 10,000) and the server recomputes both. `Atlas.svelte` fetches `/api/map` again 400 ms after the same event, and `ContextView.svelte`, `NoteMenu.svelte` and `NoteSettings.svelte` fetch it on demand. The map is not cached server-side. The `note-changed` event carries only the note's id and version, so the client cannot patch its listing and must refetch.
- **Note list is not virtualised.** Every note of every folder is a row in the DOM (`{#each notes as n (n.id)}`), with no folding of collapsed folders. At 1,000 notes that is about 1,000 rows, fine. At 10,000 it is 10,000 rows with hold-gesture handlers; scroll is fine, but first render and each refresh are heavy. Windowing, or rendering only the rows of open folders, is simple.
- **Atlas rendering is DOM, but bounded by semantic zoom.** Each block is an `<a>` with 3 to 6 child nodes, absolutely positioned by CSS variables. `openAt` (`app/src/lib/atlas/geometry.ts`) opens a folder only when it is big enough on screen, and `notes` is only the items whose folder is open (`open[i] === "s"`), so the DOM holds the folders and the notes of the open ones, not all N notes. There is no viewport culling inside an open folder, which only matters if one open folder has thousands of notes. The `{#each folders}` and `{#each notes}` lists re-evaluate (`openAt` is O(items) and returns a string, `indexLayout` and `withHighways` run once per layout) per zoom step; at 1,000 notes that is cheap. **Canvas or WebGL is not warranted** by anything measured: the bottleneck on the Atlas is the layout computation and the map payload, not painting. Revisit only if an open folder can hold more than about 2,000 notes on screen.
- **Layout worker.** Already a Web Worker, results cached by key (6 kept), routes asked of the worker lazily. Good. The `layout` object returned is 213 to 545 KB per 200 notes of JSON-shaped data and is structured-cloned; at 1,000 notes expect 2 to 3 MB per layout message.
- **Network.** SSE only; no polling. `GET /api/search` is called 200 ms after the last keystroke in the list's filter box (debounced), and each query is O(base) on the server today.

## 4. The agent path

Latency that is isorite's, per turn (an ACP/MCP agent calling the base's tools):

1. **First `search_notes` of every turn builds its own BM25 index.** `Lookup` is constructed per turn over the bundle as it was at the start (`startTurn`, `engine.ts`; `lookup.ts` `this.index ??= new SearchIndex(this.b)`), and it does not share the engine's `this.index`. The index build costs 98 ms at 100 notes, 625 ms at 1,000, 5.6 s at 10,000 of CPU, on the agent's first search each turn. Sharing the engine's index (or building it once per bundle) removes it.
2. **Every agent write rebuilds the bundle on the next read.** `agentWrite` → `readNote` (reads and reconciles the journal) → `put` (replays the journal twice, hashes) → `built = null`. Then the UI's refetches and the next tool call that uses `this.bundle` (`brief_base`, `startTurn`) rebuild it: 0.4 s at 1,000 notes, 4 s at 10,000.
3. **`find_similar` re-cuts and re-hashes the whole base per call** (`Meaning.similar` → `pieces`): 0.34 s at 1,000 notes, 3.4 s at 10,000, plus the query embedding (one model call, estimated 50 to 150 ms idle) and the first-call load of the vector file (2 MB parse at 1,000 notes, 20 MB at 10,000).
4. **`brief_base`** formats the folder list and concatenates the instructions and practice text on each call; negligible.
5. **Per-call transport.** `/mcp` is stateless Streamable HTTP with a zod parse; negligible next to the above.
6. **Embedding backlog.** After the agent writes, `embedSoon` runs `refresh` over the whole base: `pieces(b)` (0.45 s at 1,000 notes), then embeds the changed pieces one by one, saving the whole vector file every 40 vectors. A search made meanwhile embeds up to `INLINE = 12` missing pieces on the spot, which at 100 ms a piece is 1.2 s added to that query.

None of this is the model's latency. All of it is O(base) or O(history) work repeated per tool call, and all of it is removed by the same fixes as the interactive path.

## 5. Scaling cliffs

"Cliff" means the point at which an ordinary action takes longer than the 1.5 s save debounce, or a person waits. Sizes assume the 8 KB test notes on this loaded machine; halve the note count where the note is 8 KB and the machine is idle, double it for 3 KB notes. Real bases sit between.

| Subsystem | Breaks at | Why |
|---|---|---|
| Per-save rebuild (bundle + map + BM25) | about 1,500 to 3,000 notes (earlier on slow phones) | Everything is recomputed from scratch after each write: 0.4 + 0.4 + 0.6 s at 1,000 notes, linear above, with `mapModel` super-linear (section below). At 5,000 notes each autosave is 6 to 10 s of CPU, so typing keeps the server pegged. |
| A heavily edited note | about 500 journal entries of a note, regardless of base size | `replay` from entry zero with a slow hash, twice a save. 0.28 s per save at 575 entries; about 1 s at 2,000. The journal also grows without bound (1 KB an entry, in git). |
| `mapModel` / `prerequisiteOrder` | about 3,000 notes | 121 ms at 1,000 and 6.3 s at 10,000: about 52 times for 10 times the notes, so roughly O(N^1.7). Cause: `prerequisiteOrder` (`bundle.ts`, around line 478) does `[...ready].sort(...)` on every step, which is O(n² log n) in a flat base where most notes are ready at once. `Engine.map()` adds a `[...bundle.files].filter` per picture folder and a `model.edges.some` per artifact (quadratic in files and edges). |
| Meaning query | about 3,000 notes (a second a query); first index time from about 500 notes | Query is dominated by `pieces()` re-hashing; vectors scan is trivial. Indexing is one piece at a time. |
| Atlas layout | about 1,000 notes with ordinary link density; about 300 with dense links | About 10 ms a note and edge-density sensitive; routing grows with the grid area (43 s for 40 queries at 1,000 notes). Off the main thread, so latency not a freeze. |
| Memory | about 20,000 to 30,000 notes of 8 KB on a 4 GB machine; phones far earlier | The engine keeps every note's text in the `files` map and again in each concept's body, plus index maps and the BM25 postings: 5 to 6 times the on-disk size (551 MB for 82 MB at 10,000). On a phone webview (Tauri), a 1,000-note base is already ~180 MB of JS heap. |
| Startup | the import graph, not the base, up to about 2,000 notes; the base above that | 3 s of module loading in a checkout before any note is read, then a full sequential read and parse: 1 s at 1,000 notes, 9 to 10 s at 10,000 (CPU), minutes at 50,000. Nothing is cached between runs except vectors. |
| Wire | about 3,000 notes over a slow link | 236 KB a refetch at 1,000 notes, uncompressed, twice (list and map) after each save. 5 MB at 10,000. |
| Note list DOM | about 5,000 notes | Not virtualised, all folders expanded. |
| Journal files in git | long-term | One growing JSONL per note, never compacted; each entry has the hunks, and every 40th a full copy of the text. |

## 6. Quick wins, ranked

Ranked by (gain at realistic sizes of 100 to 5,000 notes) over (risk and effort). File and line numbers are as of this writing; other agents are editing these files, so grep for the quoted code.

**1. Replay the journal from the last snapshot, and stop hashing it twice.** `packages/core/src/journal.ts`, `replay` (line 123): it walks every entry from the first and calls `hashText(text) === e.before` for each delta, so a save costs O(entries × note size). `change` (line 236) calls `replay` and `reconcile` (line 252) calls `change`, so `put` replays twice. Fix: in `replay`, find the last entry with a full `text` at or before `upTo` and start there (a snapshot makes everything before it irrelevant to the result; keep `broken` for the entries after it, and decide whether older broken entries still force `whole` in `change`; they should not once a snapshot exists after them). Better still, have the engine keep the replayed head per note in memory (`{ entries, text, hash }`) and update it as entries are appended, so a save does no replay at all. Expected gain: save CPU becomes constant, about 16 ms for an 8 KB note, instead of 280 ms at 575 entries and growing; `readNote` likewise. Risk: low to medium; the journal format is unchanged and the tests in `core/test` cover `replay`. Effort: half a day.

**2. Use a native hash where there is one, and memoise.** `packages/core/src/text.ts` line 130 (`sha256`) and `journal.ts` line 94 (`hashText`). Pure JS runs at 24 MB/s, 30 times slower than Node. Fix: let the core take a hasher by injection (`setSha256(fn)`), keeping the pure version as the default so the core stays free of `node:` (a test enforces that); the server entry (and `engine`'s `EngineOptions` for a webview, using a faster JS implementation or `crypto.subtle` where async is acceptable) installs `node:crypto`'s `createHash("sha256")`. Add a one-entry memo to `hashText` (the last text and its hash) since `put` hashes the same string several times. Expected gain: removes 56% of save CPU and most of `pieces()`; combined with #1, a save is milliseconds. Risk: low (same digest; tests compare hex). Effort: 2 hours.

**3. Stop discarding the whole bundle on a save: parse cache first, incremental later.** `packages/engine/src/engine.ts` line 981 (in `put`; the same assignment is at lines 189, 586, 673, 697, 731, 768, 807, 916, 930). Step A (a day): give `Bundle.fromFiles` a parse memo, a `Map<path, { text, parsed }>` kept by the engine, so `loadConcept` (frontmatter YAML 53% and markdown parse about 12% of the rebuild) runs only for notes whose text changed; relink and rebuild the cheap aggregates. Expected: warm rebuild 406 ms to about 120 ms at 1,000 notes, 4.2 s to about 1.3 s at 10,000. Step B (a week or two): a real incremental `Bundle` with `applyChange(path, text)` that re-parses one note, re-resolves links to and from it, and patches directories, backlinks, issues and the memoised `components`/`prerequisiteOrder` (invalidated rather than patched). Expected: a save costs O(note + its links), 5 to 15 ms, at any size. Risk: A low; B medium (the bundle is large and its derived caches, `memo()`, must be invalidated carefully; the conformance fixtures in `fixtures/` and `expected.ts` make this testable). Also needed for B: have `put` update the BM25 index incrementally (add and remove one document's postings, adjust `df` and `avgLen`).

**4. Stop the refetch storm on a save.** `app/src/lib/components/NoteList.svelte` (the `$effect` that calls `app.api.map()` whenever `app.listing` changes), `app/src/lib/app.svelte.ts` lines 53 to 57, `Atlas.svelte` (the `note-changed` handler at line 178), `engine.ts` line 229 (`map()`). Fix in three parts: (a) memoise `Engine.map()` and `Engine.notes()` on the bundle's identity (`this.built`), like `brokenCode` already does with `codeCheck.of`, so N panes cost one computation; (b) add a revision number (`rev`, incremented on every change that sets `built = null`) returned with `notes()` and `map()` and accepted as `?since=`; the server answers 304 or an empty diff when nothing changed; (c) in NoteList, find the "besides" files from a cheaper `GET /api/files` (or the `files` part of the map only), or only when the event says a non-note file changed, not on every note save. Expected gain: with (a) alone, a save with three panes open does one map computation instead of three, and an edit that changes nothing structural skips the Atlas relayout request entirely; with (b) the 2.4 + 2.9 MB at 10,000 notes per save drop to a few hundred bytes. Risk: low. Effort: a day.

**5. Cut the meaning query's O(base) fingerprinting.** `packages/engine/src/meaning.ts` lines 130, 139 and 164 (`pieces(b)` in `state`, `refresh` and `similar`). Cache `pieces(b)` per bundle (a `WeakMap<Bundle, Piece[]>`) and, once #3 B exists, per concept keyed by the note's text version, so only a changed note is cut and hashed. Combined with #2 the call is the vector scan: 337 to about 20 ms at 1,000 notes; 3.5 s to about 0.1 s at 10,000. Also: `refresh` runs after every write (`embedSoon`) and again calls `pieces(b)`; with the cache it is the diff only. Risk: low. Effort: a few hours.

**6. Do not build a snippet for every match, and share the index.** `packages/core/src/search.ts` line 105: `hits.push({ concept: c, score, snippet: snippet(c, terms) })` computes a snippet (tokenising lines of the body) for every matching note before the sort and `slice(0, limit)`. Push `{ concept, score }`, sort, slice, then compute snippets for the survivors only. Expected: a 1,000-note query from 16 ms to about 3 ms, 10,000 from 128 ms to about 20 ms, bigger for common words. And in `packages/engine/src/lookup.ts` line 154 (`this.index ??= new SearchIndex(this.b)`) pass the engine's index (or a per-bundle cached one via a `WeakMap`) so an agent's first search does not rebuild BM25 (625 ms at 1,000 notes). Risk: very low. Effort: an hour or two.

**7. Load the agent SDKs only when used.** `packages/server/src/serve.ts` line 19 (`import { PiControl, piHostFor } from "./pi/index.ts"`), `main.ts` (`./acp-wrap.ts`, `./doctor.ts`; `mcp-http.ts` imports only a type from the pi folder and is fine). Use `await import()` at the point the Iso pane or a terminal agent is first asked for, and keep `import type` for the rest. `@earendil-works/pi-coding-agent` (2.7 s) and the ACP SDK (1.0 s) are the bulk of the 3.2 s of `--help`. Expected: `isorite serve` and every CLI command start 1 to 3 s sooner on a loaded machine, perhaps 0.5 to 1 s on an idle one. Risk: low, but `scripts/sea.ts` and the npm packager must still bundle the lazily imported modules (static analysis of `import()` strings). Effort: half a day.

**8. Compress and cache what the server sends.** `packages/server/src/http.ts` `staticFile` (line 455 on) and `reply` (line 87): add Hono's `compress()` middleware (or `zlib.brotliCompress` with a cache of compressed static bodies), an `ETag` (the file's mtime and size) with `If-None-Match` handling for non-immutable files, `Cache-Control: public, max-age=31536000, immutable` for `/fonts/*` (never change) and `max-age=3600` with revalidation for `/kit/*`, and read static files asynchronously or from a small in-memory cache instead of `readFileSync` per request. Expected: eager JS 1.69 MB to 542 KB on the wire, `/api/notes` 236 KB to about 40 KB at 1,000 notes, repeat visits download none of the fonts. Invisible on localhost, large over a tailnet or phone. Risk: low (careful with SSE: do not compress `/api/events`). Effort: 2 to 4 hours.

**9. Smaller, cheap ones.**
- `engine.ts` `walk` (line 100): reads files one at a time with `await` in a loop; read in batches of 32 with `Promise.all`. Wall time only; matters on cold disks, network drives and phones (Tauri file API).
- `engine.ts` `map()`: replace `[...this.bundle.files].filter(...)` per picture folder (line 254) with one pass that counts by folder, and `model.edges.some(...)` per artifact (line 264) with a `Set` of edge keys. Fixes a quadratic that appears with thousands of files.
- `bundle.ts` `scan`: skip the `replace(/\r\n?/g, "\n")` when `text.includes("\r")` is false; run `hasConflict`'s regex only when the text contains `<<<<<<<`. About 7% of the rebuild.
- `frontmatter.ts` `parseYaml`: a fast path for frontmatter made only of `key: simple scalar` and `[a, b]` lines would skip the `yaml` library for most notes (it is 53% of `loadConcept`). Keep the library for anything else; the conformance fixtures define "the same result". Gain about 2 times on cold start. Risk medium (YAML 1.2 corner cases: quoting, `yes`, dates stay as written); do it only if #3 B is delayed.
- `meaning.ts` `save`: append-only or binary vector file; stop rewriting the whole JSON every 40 vectors during the first pass.
- `NoteList.svelte`: turn `app.hidden.some(...)` per note into a `Set` of hidden prefixes, build `folders` with `push` instead of spreading, and render only the rows of expanded folders (or window the list) above a few thousand notes.
- `app/vite.config.ts`: drop KaTeX's `.ttf` and `.woff` from the build (817 KB shipped to every install, used by no current browser); load KaTeX only when a note contains math (it is 593 KB in the eager chunk with markdown-it and DOMPurify), which would cut the eager JS by about a third.

## 7. Long-term paths

For each: what it is, what it would buy, an honest forecast, effort. The framing question is whether any of it is worth it at 100 to 5,000 notes. Short answer: the quick wins above are, and one structural change (an incremental engine) is; the rest are insurance for larger bases or for phones.

### 7.1 An incremental engine (the structural fix)

Keep the bundle, the BM25 index, the vector pieces and the Atlas model as live structures updated by `applyChange(path, text)` and `applyRemove(path)`, instead of `built = null`. The engine already funnels every write through `put`, `moveNote`, `deleteNote`, `moveFolder` and friends (ten sites), so the interface exists. Needs a story for outside changes: a file watcher (`fs.watch` recursive on macOS and Windows, `chokidar` or polling re-stat on Linux, and `Files.watch?` is already in the port) that feeds `applyChange`, which also fixes the stale-list gap in 2.6.
- Buys: save cost O(note), independent of base size: removes the whole "per-save rebuild" row of the cliff table; makes the agent path cheap; makes watching external edits possible.
- Forecast: after it, the interactive limits move to cold start and memory, i.e. to roughly 20,000 notes on a laptop.
- Effort: 2 to 3 weeks including tests; the derived caches in `Bundle` (`memo()`: components, order, backlinks, requires graph) are the work. Do #3 A first, it is a prerequisite and may be enough alone below 3,000 notes.

### 7.2 A persistent index (cache file, or SQLite/FTS5)

Cold start today re-reads and re-parses everything: 1 s at 1,000 notes, about 9 s at 10,000 (CPU), with nothing kept between runs but vectors. Two designs:
- **A cache file keyed by (path, mtime, size, content hash):** store each note's parsed result (`meta`, headings, links, tokens) in one binary or JSON file in the existing cache folder (`~/.cache/isorite`, next to the vectors). On open, `stat` every file, re-parse only those whose key changed. Cold start becomes `readdir` + `stat` + load (about 100 to 200 ms at 1,000 notes; 1.5 s at 10,000). Simple, no new dependency, works on every platform, the same file is a natural thing for Tauri to read. Risk: cache invalidation bugs (mtime granularity, git checkouts that rewrite files with the same size; hash the content when mtime is newer than the cache).
- **SQLite with FTS5** (`node:sqlite` is built into Node 24; `rusqlite` or the Tauri SQL plugin on mobile): notes table, links table, FTS5 for keyword search (BM25 built in, incremental by design), a vectors table or a sidecar for embeddings. Buys: incremental by construction, constant-time startup, search without holding postings in JS memory, disk-backed so memory stops scaling with base size. Costs: the BM25 in `core/search.ts` is deterministic and has conformance fixtures; FTS5's tokenizer, stemming and ranking differ, so results change and the fixtures must be redefined; the core's "text in, data out, no file system" rule means SQLite sits in the engine behind a port, and the guide site (the engine in the page, tutorial on GitHub Pages) would need `sql.js`/WASM or keep the in-memory path. Two code paths to keep in agreement is exactly the drift the architecture warns about.
- Forecast: the cache file gives most of the benefit (cold start) for a tenth of the cost, and composes with 7.1; SQLite is justified only if bases of 20,000+ notes or phone memory limits become real. Effort: cache file about 1 week; SQLite 4 to 6 weeks plus the search-behaviour decision.

### 7.3 Rust or WASM for the hot loops

The core's hot loops are: YAML frontmatter, Markdown scan and link extraction, tokenising for BM25, SHA-256, `pieces()`, the Atlas layout and router, the journal's line diff. They are pure functions over text, which is the best case for a shared Rust crate that Node (as WASM or a native addon), the webview (WASM) and the future Tauri shell (native) all link, and `architecture.md` already plans Tauri for mobile.
- Forecast: parse-heavy loops typically run 3 to 10 times faster in Rust/WASM than in JS (the `yaml` library is a slow JS parser; `serde_yaml`-style parsing and a `pulldown-cmark`-based scan are an order of magnitude faster), the Atlas layout 5 to 20 times (tight numeric loops), SHA-256 matches `node:crypto` in WASM with SIMD. But copying strings across the WASM boundary costs, and every algorithm must be ported and kept bit-identical with the fixtures (the core's conformance suite is a strong asset here). It also makes the repository two-language, which the project has so far avoided, and a mistake in the port is a data-integrity risk for a notes app.
- Honest take: not worth doing before 7.1. Once the engine is incremental, parse time is paid once per changed note, so the remaining beneficiaries are cold start (solved more cheaply by 7.2) and the Atlas layout. The Atlas layout is the one place a port pays for itself regardless (it is the most expensive per note and the only super-linear piece). Defer the rest until phones demand it.
- Effort: layout and router alone about 4 to 6 weeks including identical output; the whole core 3 to 5 months.

### 7.4 Worker threads and web workers for parse and layout

The Atlas already uses a worker. The server does not: a 10,000-note bundle rebuild blocks the Node event loop for 4 s (CPU), during which SSE heartbeats, saves and every other request wait. A `worker_threads` pool for `Bundle.fromFiles` and `SearchIndex` would keep the server responsive, and the embedder already lives in a worker (`embed-worker.ts`).
- Cost: the result must cross a thread boundary (structured clone of a 550 MB structure is itself seconds; sharing it needs a design around `SharedArrayBuffer` or having the worker own the index and answer queries), so the useful split is "the worker owns the bundle and index and answers `notes()`/`map()`/`search()` requests", which is a larger rewrite than #3 B and mostly makes it unnecessary.
- Forecast: after the incremental engine there is little long work left to hide; worth it only for the first load of a big base, and for layout. In a browser (the future Tauri webview), `parse` in a Web Worker is the right place for the first load of an in-process engine.
- Effort: 1 to 2 weeks for a request/response worker around the engine; not before 7.1.

### 7.5 Vector search: brute force with quantised vectors versus HNSW

The vectors are already int8 (`pack`), 384 wide: 384 bytes a piece. A brute-force scan costs 14 ms at 4,000 pieces and 68 ms at 40,000 (about 1.7 µs a piece), linear: 340 ms at 200,000 pieces (about 50,000 notes). That is fast enough everywhere that matters. The cost that does grow is indexing (the model, 60 to 200 ms a piece, sequential), the vector file (20 MB JSON at 10,000 notes) and the per-query fingerprinting (#5).
- Do: store vectors as one contiguous `Int8Array` plus an index, in a binary file (memory-mapped or read once), scan with a tight loop (and `Math.imul`-free int dot products, or `Int32` accumulation in blocks), drop the per-piece `Map<string, Int8Array>`; the scan gets 2 to 4 times faster and the load 10 times faster. Batch the model calls (8 to 16 pieces a call) and make the first-pass embedder use all cores (a small pool of workers): indexing 4 to 6 times faster on a 4-core machine.
- HNSW would buy a sub-millisecond query at 200,000+ pieces and costs a build (minutes), 2 to 4 times the memory, an approximate recall that must be tested, and incremental inserts and deletes (stale vectors). Not worth it below about 500,000 pieces; at the realistic 400 to 20,000 pieces it is slower to build than to scan.
- Forecast: brute-force int8 is correct until about 50,000 notes. Effort: the binary layout and batching about 1 week.

### 7.6 Incremental Atlas layout

The layout is recomputed from the whole model whenever its key changes (a new note, a link, a title). 10 ms a note, edge-density sensitive, in a worker. Options, in order of cost:
1. **Skip identical results** (exists: the key). Keep, and make sure the key ignores things that cannot change geometry.
2. **Layout per folder, composed:** the grid layout is nested (`nested.js`, `floorplan.js`), so a changed folder can be re-laid-out locally and the ancestors re-flowed, instead of the whole map. Trunk routing (`highways.js`, `router.js`) is the global part.
3. **Make routing lazy by viewport** (route only the trunks on screen at the current zoom) and give the router a coarse-to-fine search: the 43 s for 40 route queries at 1,000 notes shows the grid A* is the cliff.
4. A port of the layout to Rust/WASM (7.3).
- Forecast: 2 and 3 move the Atlas cliff from about 1,000 notes to about 5,000, and keep a keystroke-level edit (which changes no link) at zero cost as it is now. Worth doing when real bases past 1,000 notes show up; an Atlas of 10,000 notes is probably a legibility problem before it is a performance one (the semantic zoom already hides most of it). Effort: 2 about 2 to 3 weeks, 3 about 1 to 2 weeks.

### 7.7 Virtualised lists and delta sync

- **Virtualised note list:** window the rows (a small hand-written windowing component; the rows have variable height because of folders, so fold collapsed folders and window within open ones). Not needed below about 3,000 notes; at 10,000 it is the difference between 10,000 and about 60 DOM rows. Effort 2 to 3 days. Do it together with 7.1's event payload.
- **Delta sync:** make `note-changed` carry the note's summary (`id`, `title`, `description`, `type`, `dir`, kind, done), so the client patches `app.listing` in place with no refetch; add `GET /api/notes?since=<rev>` for catching up after a lost SSE stream, answering the changed and removed ids; give the map the same treatment (`mapDelta`, or just the part of the model that changed, which the incremental engine knows). Buys: per-save traffic from 2.4 + 2.9 MB (at 10,000 notes) to a few hundred bytes, and removes the client's full re-evaluation. Pairs with quick win #4(b). Effort about 1 week; mostly an API change that both `Api` implementations (HTTP and the future in-process one) take identically, which is why it belongs in `engine/src/api.ts`.

### 7.8 Bun, Deno, a single executable

Startup today is the import graph (3 s of module loading from source) and the full parse (1 s at 1,000 notes), not the runtime. Lazy imports (#7) and a persistent parse cache (7.2) remove most of both. A single executable (`scripts/sea.ts`, Node SEA) already exists and starts from a bundle, which skips TypeScript stripping and resolution; a V8 code cache or snapshot (`node --snapshot-blob`, supported by SEA in Node 24) could cut the remaining module compile time. Bun would start the process faster (about 2 times) and run some loops faster, but the project depends on `worker_threads` for the embedder, an ONNX runtime, the pi agent SDK and `node:` APIs; compatibility risk and a second runtime to test across three operating systems for a gain the other two items give. Deno has the same objection. Recommendation: do not switch runtimes; make the SEA bundle the shipped form and give it a snapshot.

## 8. Recommended sequence

1. **This week (days, low risk, no format change):** quick wins 1, 2, 5, 6 (journal replay, native hash, meaning piece cache, snippet-after-slice and shared index), 4(a) (memoise `notes()`/`map()` on the bundle), 7 (lazy SDK imports), 8 (compression and caching). Outcome: a save of a heavily edited note and a meaning query are milliseconds; the agent's first search no longer rebuilds an index; the server starts 1 to 3 s sooner; a remote browser loads a third of the bytes.
2. **Next (1 to 2 weeks):** #3 A, the parse cache for the bundle, and the quick wins in 9 (quadratic spots in `map()`, `mapModel`'s ordering, the CRLF and conflict regex, NoteList). Outcome: a rebuild is about three times cheaper (the cliff moves from about 2,000 to about 6,000 notes) and 10,000 notes works.
3. **Then (2 to 4 weeks):** the incremental engine (7.1) with a file watcher (also fixing stale external edits) and the delta sync API (7.7, #4(b)). Outcome: per-save cost O(note), flat in base size; the interactive cliffs disappear until about 20,000 notes.
4. **Then (about 1 week):** the persistent parse cache file (7.2, first form) for cold start, binary vector storage and batched, multi-worker embedding (7.5). Outcome: start in a few hundred ms at 1,000 notes; first index of a base 4 to 6 times faster.
5. **As bases past 1,000 notes with links appear:** lazy trunk routing and per-folder layout (7.6); virtualised list (7.7).
6. **When Tauri mobile starts:** decide Rust/WASM for the layout, parse and hashing (7.3) and SQLite (7.2) against measured phone numbers; the incremental engine and the cache file are the same work either way, so nothing before this is wasted.
7. **Not recommended:** HNSW (7.5), switching to Bun or Deno (7.8), canvas or WebGL for the Atlas (section 3), workers for the server's bundle (7.4) before the engine is incremental.

At the realistic sizes (100 to 5,000 notes) steps 1 to 3 are the whole of it. Everything after step 3 is insurance.

## 9. Things not measured, and how to measure them

- 50,000 notes end to end (needs about 3 GB free and a quiet machine; run `bench2` equivalents for the bundle, index, `pieces`, scan, and the save loop, plus a `--heap-prof`).
- The embedding model on an idle machine (the figure here is not representative), batch sizes, and a worker pool.
- Real browser rendering: the Atlas at 1,000 and 10,000 notes (frame times while panning and zooming, DOM node counts at several zooms, a Performance trace of the first load). I read the code and the build output but did not drive a browser.
- Real link density and note sizes: run the same scripts against a copy of an actual base (this repository's `docs/` is about 225 notes), and re-derive the cliffs from those.
- Idle-machine absolute times. Repeat the table on a quiet laptop and on a phone-class device (Tauri webview) so the cliffs are in real units.

## 10. Implemented 2026-11-09

Quick wins 1 to 6 of section 6, measured on the 1,000-note synthetic base with the scratchpad scripts (`save2.mjs`, `bench.mjs`, `sha.mjs`, and a repeat-after-save script), on a loaded machine, so read the numbers to a factor of about 1.5.

| Item | Before | After |
|---|---|---|
| 1. `replay` from the last snapshot (`journal.ts`) | one save of an 8 KB note: 8 ms growing to 28 ms over 60 saves, 280 ms at about 575 | replays at most `SNAPSHOT_EVERY` entries, so it can no longer grow with the journal; with item 2, 2 to 3 ms and flat |
| 2. Injected SHA-256 (`setSha256` in `text.ts`; the server installs `node:crypto` in `nodefiles.ts`) | 26.6 MB/s (0.30 ms per 8 KB) | about 740 MB/s; digests identical (test compares both with `node:crypto`); the core keeps the pure `sha256Pure` and stays free of `node:` |
| 3. Parse cache (`Bundle.fromFiles(files, cache)`) and token cache (`IndexCache`, with incremental document frequencies) | after a save: bundle about 400 ms, search index about 625 ms | bundle about 100 ms (links and the cheap aggregates are still rebuilt from the cached parses), search index about 40 ms |
| 4. `notes()` and `map()` once per revision; `Engine.revision()`; `ETag` and `If-None-Match` with 304 on `/api/notes` and `/api/map`, gzip or brotli | `map()` about 300 ms on every call, 236 KB and 268 KB sent every time | a repeat call is free; an unchanged state answers 304 with no body; the first send is compressed |
| 5. `pieces()` cached per bundle and per note; snippets only for returned hits; `Lookup` uses the engine's index | not re-measured | by construction: a meaning query after a save cuts and hashes only the changed note; an agent's first search no longer builds a second index |
| 6. Lazy `./pi/index.ts` in `serve.ts`; compression and ETag for static files; `/fonts/` immutable | `isorite --help` 1.36 s | 0.60 s (the agent SDK loads when a server starts, not for every command); `index.html` carries `no-cache` and an ETag and answers 304 |

Not done, and why.
The per-note head kept in the engine, and a truly incremental `Bundle.applyChange` (links, backlinks and `mapModel` are still rebuilt on each change: bundle about 100 ms and `mapModel` about 120 ms remain per save at 1,000 notes).
`put` still reads and parses the note's whole journal file on each save (`readJournal`), which is linear in the journal's bytes but cheap next to the hashing that was removed.
The ACP SDK was left alone, as it is being removed.
`NoteList` (app) still refetches `/api/map` for its list of other files on every `listing` change: with the ETag that is now a 304, but the fix of section 6 item 4 (c) (ask `GET /api/files`, or only on a non-note change) remains for the app.
`packages/core/test/atlas.test.js` was not touched and is still slow (more than 120 s for the 1,177-note layout case when run alone).

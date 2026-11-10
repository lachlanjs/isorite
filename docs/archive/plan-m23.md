# Milestone 23 (draft): every file a node, and artifacts Iso can build

Drafted 2026-10-28 from a design conversation; its questions answered the same day; **approved 2026-10-28** ("proceed with the milestone"), and built in the order of §8. Questions are numbered from Q109 (Q108 is M22's); all were answered on 2026-10-28.

What you asked for:

- More kinds of node on the Atlas: **artifact**, **data**, **document**, **miscellaneous**.
- The satellites (web links, code links, pictures) drawn as **nodes** themselves.
- **Iso able to build artifacts**: dashboards and rich standalone visualisations (interactive graphs of collected data, simulations, a 3D asset's viewer), in a design language tightly in line with isorite's.
- Leaving isorite's design language for an artifact used elsewhere should take **no special effort from Iso**: a CSS replacement, or on that order.

## 1. What is there today

- **Artifacts exist on disk, not on screen.** One self-contained HTML file beside the notes, under 200 kB, with title, description, date and author in `<meta>` tags; a file starting with `_` is a draft (`docs/ISORITE_CONTEXT.md`). A note cites one as a link or shows it with image syntax; `citeKind` (`packages/core/src/bundle.ts:45`) knows `.html` as `artifact`. Nothing draws one: M22 left "drawn in place, in a sandboxed frame given the light or dark mode" as the next gap (Q106).
- **The bundle already lists every non-Markdown file** (`Bundle.files`), but a cite is only kept when `citeKind` knows the type (artifact or image). A CSV, a PDF or a GLB cited from a note is dropped silently.
- **Satellites** (`app/src/lib/atlas/kinds.ts`): web and code links (M12) and pictures (M22) are drawn beside their note, down its right side, **outside the layout's placing and routing**, each kind behind a switch.
- **`/api/file`** (M22) serves pictures only, sandboxed (`Content-Security-Policy: sandbox`), by extension.
- **Iso's tools** write notes (`write_note`, `edit_note`, `move_note`) and ask questions; none writes any other file.

## 2. Node kinds

| Kind | What | By extension (a first list) |
|---|---|---|
| note | as now (concept, question, problem) | `.md` |
| picture | as now (M22) | png, jpg, gif, svg, webp, avif |
| artifact | an HTML file isorite can show | html, htm |
| data | what an artifact draws from, or evidence | csv, tsv, json, jsonl, parquet, arrow, npy, xlsx |
| document | something to read that isn't a note | pdf, docx, epub, odt |
| misc | anything else in the notes folder | glb, gltf, stl, obj, zip, … |
| web, code | links out of the base (M12) | `https://…`, `code:` |

- `citeKind` grows to these kinds; anything not listed is `misc` rather than dropped. `isorite check` reports a broken cite of any kind, as it does for pictures.
- **Edges**: note → file (a cite, with its rating when it has one), artifact → data (what the artifact declares it uses, §3.3), and note → web / code as now.
- **Glyphs**: one per kind, drawn to the habit rule in `docs/taste.md` (sketches: Q in `inspiration/combinations/sketches.html`).

### 2.1 Satellites as nodes: where they go

A satellite today is placed beside its note by a rule of its own, never by the layout. Drawing them as nodes can mean two things, and they cost differently:

- **(a) Node-styled satellites.** Same placing rule (beside the note), drawn as small boxes with their kind's glyph and name. The layout and router are untouched. But a file cited by several notes (a CSV two artifacts use) has no single note to sit beside.
- **(b) Files as layout items.** A file in the bundle lives in a folder, so it is placed in that folder like a note, and its edges are routed like links. The layout and router **algorithms** don't change, but their **output** does (more items, more routes), and `LAYOUT_VERSION` is bumped.
- Proposal: **(b) for files in the bundle** (artifact, data, document, misc, pictures), **(a) for links out of it** (web, code), each kind behind the switches the Atlas has now. **Q109 (answered: yes)**: (b) is acceptable; it changes what is laid out, not how. Each kind stays behind its switch.
- **Q110 (answered: one node for the folder)**: pictures saved beside a note (M22's folder named for the note) are one node, which opens to show them, so a note with many pictures doesn't flood the map.

## 3. Artifacts: a framework for Iso

The aim: Iso writes **content and behaviour**, never **look**. The look comes from a kit isorite provides; replacing the kit's theme is the whole of departing from isorite's design.

### 3.1 The kit

A small library isorite provides to every artifact, versioned (`kit@1`):

- **Theme**: one CSS file of custom properties, the same tokens as `app/src/app.css` (grounds, lines, text, the four accents, fonts, the chamfer, spacing), in lapis and quartz. Every component reads only these. Chart series take `--series-1 …` derived from the accents.
- **Components**, as custom elements so Iso writes declarative markup, with a JS API under them for anything custom:
  - layout: `<iso-page>`, `<iso-panel>`, `<iso-grid>`;
  - data: `iso.data("runs.csv")` gives typed columns (CSV, JSON; Parquet and Arrow later);
  - charts: `<iso-chart type="line" data="runs.csv" x="t" y="energy" by="trial">`, on a charting grammar Iso knows well (Observable Plot is the likely base; uPlot where a series is long), shipped with isorite (§3.8);
  - controls: `<iso-slider>`, `<iso-toggle>`, `<iso-select>`, play and pause, bound to one shared `iso.state`;
  - simulation: `<iso-canvas>` with `iso.loop((dt, state) => …)`, at the device's pixel ratio, paused when hidden or when reduced motion is asked for;
  - 3D: `<iso-model src="part.glb">` (glTF, GLB, STL, OBJ; three.js, loaded only when used), lit to suit the grounds;
  - tables, maths (KaTeX) and Markdown, rendered as the notes are;
  - `iso.open("basics/surprise")`: open a note in isorite from the artifact.
- The states, glyphs and motion of `docs/taste.md` (lustre, corner-bracket focus, no flash).

A working sketch of all of §3 is in `inspiration/artifacts/` (kit, an artifact, its data, a host with the bridge and the standalone export).

### 3.2 Leaving isorite's look

Because components only read tokens, a different look is a different theme file:

- the kit ships `isorite.css` (lapis, quartz) and `plain.css` (system fonts, neutral greys, no chamfer);
- a user's own CSS of the same custom properties works too;
- `isorite check` warns when an artifact sets colours or fonts outside the kit (a literal hex, a `font-family`), so Iso's artifacts stay re-themable without anyone thinking about it.

### 3.3 The file

- Iso writes **only the artifact's own part**: markup, its script, and a manifest in `<meta>` (title, description, date, author as now, plus `isorite:uses` naming the data files it reads, and `isorite:kit` its kit version).
- **In isorite** the kit is provided by the host, so the file stays small, diffs read well, and the 200 kB rule holds.
- **Export** ("Save as standalone") writes one HTML with the kit, the chosen theme and the data inlined, which opens anywhere with no server. This is how an artifact is used elsewhere, and keeps the data sovereignty `ISORITE_DOC.md` asks for.
- **Q111 (answered: the host provides the kit)**: the kit is not inlined into every saved file; export makes the self-contained copy.

### 3.4 Shown in isorite

- In a frame with `sandbox="allow-scripts"` and no `allow-same-origin`: it can't reach isorite's token or API, can't open windows, can't navigate isorite.
- **The frame makes no request of its own.** The host fetches the artifact, inlines the kit and theme into it, and gives the frame that document through `srcdoc`; data still comes over the bridge, so the manifest still decides what it gets. Learned from the demo: a sandboxed frame's requests are cross-site, so behind anything that needs a cookie (a Codespace's forwarded port, a proxy, a login) a frame that fetches its own kit gets a sign-in page instead. With `srcdoc` there is nothing to sign in to, and nothing the frame could reach.
- Its only way out is a message bridge the host answers: the data files its manifest names (and no others), the ground (lapis or quartz, and changes to it), `iso.open`, and its errors.
- No network from an artifact, ever (**Q112, answered: never**), enforced as §3.8 says.
- Shown in place in a note (`![…](fig.html)`), opened on its own in the Note pane, and as a node on the Atlas.

### 3.5 What Iso gets

- **Tools**: `write_artifact(path, title, description, uses, html)` and `read_artifact(path)`, journaled and undoable as notes are; `read_data(path)` giving a data file's shape (columns, types, row count, a head, summary statistics) so Iso can build on a 50 MB CSV without reading it.
- **The kit's reference**, short (a few thousand tokens), given only when Iso is building an artifact (in stages, §3.7), with worked examples: a dashboard of charts from a CSV, a simulation with controls, a 3D model's viewer, and a comparison of two data files.
- **Its errors back**: the frame reports exceptions and the kit's own complaints (a column not in the data, a file not in the manifest), and they come back to Iso as the tool's result, so it can fix what it wrote in the same turn.
- **Q113 (answered)**: whether Iso looks at the rendered artifact depends on the model. Whether a model takes images is known from the provider's model list (OpenRouter's `architecture.input_modalities`), and isorite records it per model:
  - a model with vision is shown a screenshot of the rendered artifact after writing it, and asked to check it;
  - a model without it can hand the look to another model that has vision (a tier's model, or one named for the purpose), or skip it; the static checks and runtime errors run either way;
  - the screenshot needs a browser: the app's frame when the app is open, or a headless browser `isorite doctor` finds on the machine (Q117). With neither, there's no visual check, and Iso says so.

### 3.6 On the static site

The guide (`npm run build:guide`, GitHub Pages) runs the engine in the browser with no server. M22 already copies every picture a guide note cites into the site, and the guide's engine answers `/api/file` from there (plan-m22 §2.7). Artifacts fit the same path:

- the build copies each cited artifact **and the data its manifest names**, and the in-browser engine plays host: it fetches them from the site, builds the `srcdoc`, and answers the bridge. The kit and theme ship once with the app.
- Nothing in an artifact needs a server: it is all client-side by design.
- Limits are the host's: GitHub Pages allows 1 GB a site and warns on files over 50 MB (rejects over 100 MB); a big data file is a slow first view. An artifact meant for the site should use a summary of its data.
- **Publishing publishes the data.** A base's data files (experimental evidence, say) would go onto a public site with the artifacts that use them. The build should list what it's about to publish. **Q116 (answered)**: the build lists what it will publish and you opt in per data file. A data file too large to keep in git by good practice (GitHub warns at 50 MB) is left out, and the artifacts using it carry a notice on the site that the data is local: open it in isorite with the data to see it fully.

### 3.7 Enough for a much weaker model

Iso will often run on a model far less capable than the one that built the demo (DeepSeek V4.1, or smaller). The demo's quality has to come from the kit and the context, not the model. Proposal:

- **Most artifacts need no script.** The kit's elements do the work from attributes: `<iso-chart>`, `<iso-table>`, `<iso-stat>`, `<iso-slider>`, `<iso-model>`, bound to data columns and to `iso.state` by name. A dashboard from a CSV is markup only. A weak model writes markup far more reliably than drawing code.
- **Script only where it must**, for simulations and explorables like the entropy lab, and then into **recipes**: a recipe is a complete, working artifact with marked places to change (the model, its parameters, what's drawn), not a blank page. The first set:
  1. a dashboard of charts from one data file;
  2. comparing two data files;
  3. a simulation with parameters and a play button (`iso.loop`, `<iso-canvas>`);
  4. an explorable explanation: input, derived numbers, and linked views (the entropy lab, generalised);
  5. a 3D model's viewer, with notes pinned to parts.
- **Context in stages, so a small context window holds it**:
  - always: one paragraph on what an artifact is and when to make one, and the tools;
  - on choosing to build one: `artifact_recipe(name)` returns that recipe's file, its rules, and a short reference for the kit elements it uses, a few thousand tokens in all, not the whole kit;
  - `read_data(path)` before writing anything that uses data, so column names are real, not guessed.
- **Rules a weak model can follow**, stated in every recipe and checked by `isorite check` and by `write_artifact` itself, which refuses or warns before the file is written:
  - the manifest is present and names every file the script reads;
  - columns used exist in the data (from `read_data`'s shape);
  - no colour, font or corner of its own (use the kit's tokens), no external URL, no `<script src>` but the kit;
  - under the size limit.
- **The loop closes on its own.** The frame reports runtime errors and the kit's complaints (a missing column, a file not in the manifest, a chart with no data) and `write_artifact`'s result carries them, so the model fixes them in the same turn. Gray area: this needs the artifact rendered somewhere when Iso writes it. In the app, the frame can render it unseen; from the terminal or with no browser open there is nowhere, and only the static checks run. **Q117 (answered)**: static checks by default. `isorite doctor` looks for a headless browser on the machine and, if it finds one, Iso can render and see artifacts with it (Q113) when the app isn't open. Artifacts are never viewable in the terminal.
- **The bar is set by an example, not by description.** The entropy lab, rewritten on the real kit, is recipe 4's worked example. A model shown a finished, good artifact imitates it better than it follows adjectives.

### 3.8 Everything ships with isorite: no CDN

- Every dependency an artifact can use (the charting library, three.js and its loaders, KaTeX, Markdown, the fonts) is an npm dependency, built into the kit with the app, and installed with isorite: the npm package and the single executable alike. Nothing is fetched at run time, in isorite or in an exported artifact.
- The host enforces it: the `srcdoc` document it builds starts with `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:">`, so an artifact that tries a CDN fails visibly, and the error reaches Iso.
- The kit is split so an artifact carries only what it uses: three.js only with `<iso-model>`, the charting library only with `<iso-chart>`. Standalone export inlines the same parts.
- Licences go with them into `app/static/licenses/` (Plot is ISC, three.js and KaTeX MIT).
- Cost: the install grows by the 3D and charting libraries, roughly 1 MB. That is the price of no CDN.

### 3.9 Testing it on weaker models

A first run can use the demo's kit (`inspiration/artifacts/kit/`, kit 0) with a draft of the staged context, so what weaker models get wrong shapes the real kit before it's built; the full eval follows the real kit.


- Extend Iso's eval (M15, `npm run eval:iso`, `eval/iso/`) with artifact cases on the N-body example base: a dashboard from a CSV of orbits, a simulation of the bodies with parameters, comparing two runs, a 3D view, an explorable of one note. Each case's checks run without a judge: the artifact renders in headless Chromium with no error, its manifest is right, it uses the kit's elements, it sets no colours or fonts, the data columns exist. Screenshots of each go into the report, for a person to judge the quality.
- Run it through OpenRouter on DeepSeek V4.1 and on smaller models, with a key Lachlan provides for the purpose (an environment variable, never in the repository). **Q118 (answered)**: up to US$10 for the run, across a wide range of artifacts, on three models, with what Lachlan expects of each:
  - **Claude Sonnet 5.5**: builds them capably and easily (the reference);
  - **DeepSeek V4.1 Flash**: builds them capably too;
  - **Gemma 4 31B**: basic building; on par with DeepSeek, given detailed context, would be exceptional.
- What fails decides what changes: a recipe, a rule, a kit element that does more, or a check that catches it.

## 4. Questions and problems (from the design rounds)

Understanding is being phased out as something drawn: it becomes part of Iso's context and system prompt, helping the user find questions and problems, then answer and solve them. Sketch R (in `inspiration/combinations/`), second version, is the current proposal, and the least settled part of the design:

- **A question** as a specimen label: its catalogue number, the question in the user's words, the notes it's about in corner brackets, and one mark: a hollow rose ◇ while open, a malachite ◆ with the answer's first line once answered.
- **A problem** as the crafting screen: the notes it uses as slots (filled once worked through). No progress bar: a multi-step problem is a chain of problems (Q114).
- **On the Atlas** they stay ordinary boxes, with the kind's mark in the corner (◇/◆ for a question).
- A question Iso asks shows in its reply as a rose ◇ and a small "keep" button, which makes it a question note.
- Gone from the first version: hollow dashed cavities and cracks mended in gold. Too much drawing for something this frequent.
- **Q114 (answered: no steps)**: a problem has no steps of its own. A multi-step problem is several problems linked in succession by `requires` links, in a folder of their own if they belong together; isorite already does this. Say so in the tutorial base and in Iso's context. The problem card (sketch R) loses its progress bar: its slots are what it uses, and the Atlas shows the chain.

## 5. The Note pane: a label for every node, and artifacts shown in it

You asked for the details section to be reworked, and for artifacts to be viewable in the Note pane.

### 5.1 What's wrong with details today (`app/src/lib/components/NoteDetails.svelte`)

- The **type** is a free-text field with suggestions, so making a question or problem means knowing to type "Question" (your testing notes: "selection of note type is not nice", "hard to add question type notes").
- A question's **`attached`** notes (what it's about) and **`done`** (resolved) aren't editable here at all.
- The fields don't look like fields, and the description shows a placeholder sentence (directive text).
- **Delete** sits inline beside the file's name.
- The whole section hides behind a "details" button.

### 5.2 The label (sketch U)

- Always shown, one strip under the title, with no field labels.
- The **description** is the italic line under the title, written in place. A faint rule holds its place while empty.
- The **kind** is three slots (concept, question, problem), with the glyphs of `docs/taste.md`.
- The **path** (`coding / huffman-codes`) is where the note lives: press a folder to move it, the name to rename it.
- **Tags** are bracketed parts with a `+`.
- A **question** adds what it's about (parts, `+`) and a mark to answer it (◇ open, ◆ answered: `done`). A **problem** adds what it uses; a multi-step problem is a chain of problems (Q114).
- **History** as strata down the margin (sketch T).
- **Delete** moves to the pane's menu, away from the name.
- Other frontmatter fields stay as now: not shown, never touched.

### 5.3 Every kind opens in the Note pane (sketch V)

- An **artifact** opens in the Note pane, in the sandboxed frame of §3.4, under the same label: its kind fixed, its path, the data it uses as parts. It adds two things: its look (isorite or plain, a different theme file, §3.2), and "standalone" (export, §3.3).
- The same holds for the other kinds, each with what suits it: **data** a table of its head and its shape (what `read_data` gives Iso); a **document** a PDF viewer; a **picture** the picture; **misc** its size and type, and a 3D model through the kit's viewer.
- **Q115 (answered: keep "Note")**: the pane keeps its name.

## 6. Picking this up

Where the design work for this milestone lives, for whoever plans it properly:

- this file, with its questions (Q109 to Q118) answered on 2026-10-28;
- `docs/taste.md`: what is settled about the look (lustre not flash, no directive text, the Atlas's layout untouched, Ioskeley as the display face, understanding phased out);
- `inspiration/README.md`: the themes, the sketches by letter, and what you kept or dropped;
- `inspiration/combinations/sketches.src.html` (build with `node inspiration/combinations/build.mjs`): sketches C to V;
- `inspiration/artifacts/`: the artifact framework working end to end (kit, artifact, data, host, export).

## 7. Not in M23

- The terminal taking isorite's marks (sketched, then set aside).
- Iso seeing images (Q113).
- Editing an artifact by hand in isorite; it is shown, and Iso rewrites it.

## 8. Order of work

Each step is a commit (or a few), tested as it goes; the trial comes first so the kit is shaped by what weaker models get wrong (§3.9).

1. **The trial on kit 0** (§3.9): `npm run eval:artifacts` (`scripts/eval-artifacts.ts`, `eval/artifacts/`): eight cases from one chart to a quadtree explorer, on the three models of Q118, rendered as isorite will show them, checked without a judge, with screenshots. What it finds goes in §9 and decides the kit's elements.
2. **Kinds in core** (§2): `citeKind` gives artifact, image, data, document or misc for any file; a cite of any kind is kept, and a broken one is reported; `isorite check`'s artifact rules (§3.7) as `artifactIssues`.
3. **The kit** (§3.1, §3.2, §3.8): a package of its own (`packages/kit`), built into the app's static files: the two themes, the components, the elements the trial asks for, Plot and three.js bundled and loaded only when used, licences.
4. **The host** (§3.4, §5.3): `/api/file` gives every kind (sandboxed); the Note pane opens an artifact in the frame, with the bridge, the look and standalone export; data, documents, pictures and misc open there too.
5. **Iso's tools** (§3.5, §3.7): `read_data`, `artifact_recipe`, `write_artifact` (checked, journaled, undoable, rendered by the open app's frame or a headless browser with its errors back), `read_artifact`; the recipes; the vision check by model (Q113); `isorite doctor` finds a headless browser (Q117).
6. **The label** (§5.1, §5.2): the Note pane's details become the label.
7. **The Atlas** (§2.1): files in the bundle as layout items, web and code as node-styled satellites, a note's picture folder as one node, a glyph per kind.
8. **Questions and problems** (§4): sketch R's question and problem, with no progress bar; multi-step problems as chains of `requires` in the guide and in Iso's context (Q114).
9. **The site** (§3.6): artifacts and the data you opt into copied into the guide's build, the engine playing host.
10. **The eval on the real kit** (§3.9), the rest of the budget, then docs and the release.

## 9. What was found and built

### The trial on kit 0 (step 1, 2026-10-28)

Eight cases (`eval/artifacts/cases.json`) on the N-body data, each model given kit 0's context (`eval/artifacts/context/kit0.md`) and the entropy lab as its example, with read_data and write_artifact. About US$3 of the US$10 spent: Sonnet 5.5 about $2.75 ($0.20 to $0.77 a case, up to 8 minutes for the explorable), DeepSeek and Gemma about a cent a case.

| | passed (ran, drew, no rule broken) | what went wrong |
|---|---|---|
| Sonnet 5.5 | 8 of 8 | Hand-drawn charts with labels over curves and axes. A readout showing "–" for a number. |
| DeepSeek V4.1 Flash | 6 of 8 with effort low; 2 of 8 at first | Left to itself it thought until the budget ran out and wrote nothing: 16,000 tokens, then 48,000. With OpenRouter's `reasoning: {effort: "low"}` it wrote; one explorable still thought out. |
| Gemma 4 31B | 8 of 8 | Charts with no tick values. Raw LaTeX shown as text (`$\epsilon$`). The theme's names in its prose ("kinetic (lattice)"). Sparse simulations (dots, no trails). |

What changed because of it:

- **Charts are markup** (`<iso-chart>` on Plot): ticks, labels, legends and log axes come out right whatever model writes them. The recipes chart only through it, or `chart.rows` from a script.
- **Maths is set** (`$…$`, `$$…$$`, `<iso-math>`, KaTeX), only in artifacts that write some.
- **The reference says** never to name the theme's colours in text.
- **Room to think**: a write-mode turn may write 32,000 tokens and take 6 rounds; a reply that is all thinking is asked again with three times the room and, on OpenRouter, effort low (`loop.ts`).
- **The context is staged** (§3.7): the write-mode prompt has a short section; `artifact_recipe` gives the reference (about 2,500 tokens) and one of five recipes, each a complete working artifact on its own small data (`packages/kit/context/`).

Judged by eye, the static checks passing is a low bar: Gemma's artifacts work but look thin beside Sonnet's. The full eval on kit 1 (step 10) is where that is measured.

### The eval on kit 1 (step 10, 2026-10-28)

`npm run eval:artifacts` now asks Iso itself: the engine in write mode on a fresh example base, with its prompt, its tools, write_artifact's checks and unseen run, and its loop. The same eight cases, the same three models; about US$0.85 for the 24, and some 30 cents of reruns (about US$4 of the US$10 in all).

| | passed | $ for eight | notes |
|---|---|---|---|
| Sonnet 5.5 | 8 of 8 | 0.65 (kit 0: about 2.75) | Markup and recipes write a third as much: 20 to 94 s a case. |
| DeepSeek V4.1 Flash | 8 of 8 | 0.12 | With the loop's effort low, nothing was lost to thinking. |
| Gemma 4 31B | 8 of 8 after two fixes | 0.06 | First 6 of 8: below. |

What the first run found, and what changed:

- **A table is drawn too.** An artifact of numbers and a table drew no SVG or canvas, and the check called it blank: the check counts a table's cells now.
- **`uses` is worked out, not trusted.** Gemma gave `uses: []`, and write_artifact wrote that over the file's own manifest, then told it to mend the manifest; it did, five times, and each was overwritten. write_artifact now uses what's given, what the file's manifest says and what its markup and script read, together.
- **A reply of nothing at all** is asked for once more (`loop.ts`).
- **The kit stays quiet about a few zeros on a log scale** (an error of 0 at the start), and complains when most of a series is lost.

By eye: Sonnet's are rich and right (the explorable sets its maths, reads its numbers out, and charts through the kit); DeepSeek's and Gemma's are plainer but correct and in isorite's look, which is the point of the kit: the floor is set by the elements, not the model.

### Built, step by step

1. The trial on kit 0, and the eval (`scripts/eval-artifacts.ts`, `eval/artifacts/`).
2. Every file a note cites is kept as its kind (`citeKind`: artifact, image, data, document, misc).
3. The kit, `packages/kit`: two themes, the elements, Plot, three.js and KaTeX each added only when used, the host's assembly, the rules, data shapes; Iso's context (`context/reference.md`, five recipes on their own data).
4. The host: `/api/file` gives any file but a note; the Note pane opens every kind; an artifact in its sandboxed frame by srcdoc, with its look and standalone export.
5. Iso's tools: `artifact_recipe`, `read_data`, `write_artifact` (checked, journalled, undone, run unseen), `read_artifact`; room to think; `isorite doctor` finds a browser; `isorite check` checks artifacts.
6. The label in place of details; delete in the pane's menu.
7. Files on the Atlas as items (the algorithms untouched), a picture folder as one, behind the files switch (Alt+I).
8. Questions as diamonds; problems chained by requires, in the guide and Iso's context.
9. An artifact shown in a note works in place; the guide's site serves artifacts and their data; a guide note on them.
10. The eval through Iso; docs; 0.11.0.

### Not done, or found on the way

- **Q113's vision check** (a screenshot shown to a model with vision) isn't built: the run unseen gives errors back, not a look. The eval's screenshots are for a person.
- **Q116's opt-in per data file** has nothing to apply to yet: the only site is the guide's. It belongs with publishing a base, when that comes.
- **History as strata** in the label (sketch T) and web and code links drawn as node-styled satellites (§2.1 a) are left as they were.
- **The phone's Atlas test** "the chain is walked" fails, hiding "2 steps back" in the header; it failed the same way before M23 (checked at 2d13ce6).


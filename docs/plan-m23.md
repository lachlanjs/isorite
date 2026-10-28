# Milestone 23 (draft): every file a node, and artifacts Iso can build

Drafted 2026-10-28 from a design conversation; **not approved**. It records what was asked and a proposal, so the
milestone can be planned properly later. Open questions are numbered from Q109.

What you asked for:

- More kinds of node on the Atlas: **artifact**, **data**, **document**, **miscellaneous**.
- The satellites (web links, code links, pictures) drawn as **nodes** themselves.
- **Iso able to build artifacts**: dashboards and rich standalone visualisations (interactive graphs of collected data,
  simulations, a 3D asset's viewer), in a design language tightly in line with isorite's.
- Leaving isorite's design language for an artifact used elsewhere should take **no special effort from Iso**: a CSS
  replacement, or on that order.

## 1. What is there today

- **Artifacts exist on disk, not on screen.** One self-contained HTML file beside the notes, under 200 kB, with title,
  description, date and author in `<meta>` tags; a file starting with `_` is a draft (`docs/ISORITE_CONTEXT.md`). A
  note cites one as a link or shows it with image syntax; `citeKind` (`packages/core/src/bundle.ts:45`) knows `.html`
  as `artifact`. Nothing draws one: M22 left "drawn in place, in a sandboxed frame given the light or dark mode" as
  the next gap (Q106).
- **The bundle already lists every non-Markdown file** (`Bundle.files`), but a cite is only kept when `citeKind` knows
  the type (artifact or image). A CSV, a PDF or a GLB cited from a note is dropped silently.
- **Satellites** (`app/src/lib/atlas/kinds.ts`): web and code links (M12) and pictures (M22) are drawn beside their
  note, down its right side, **outside the layout's placing and routing**, each kind behind a switch.
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

- `citeKind` grows to these kinds; anything not listed is `misc` rather than dropped. `isorite check` reports a broken
  cite of any kind, as it does for pictures.
- **Edges**: note → file (a cite, with its rating when it has one), artifact → data (what the artifact declares it uses,
  §3.3), and note → web / code as now.
- **Glyphs**: one per kind, drawn to the habit rule in `docs/taste.md` (sketches: Q in
  `inspiration/combinations/sketches.html`).

### 2.1 Satellites as nodes: where they go

A satellite today is placed beside its note by a rule of its own, never by the layout. Drawing them as nodes can mean
two things, and they cost differently:

- **(a) Node-styled satellites.** Same placing rule (beside the note), drawn as small boxes with their kind's glyph
  and name. The layout and router are untouched. But a file cited by several notes (a CSV two artifacts use) has no
  single note to sit beside.
- **(b) Files as layout items.** A file in the bundle lives in a folder, so it is placed in that folder like a note,
  and its edges are routed like links. The layout and router **algorithms** don't change, but their **output** does
  (more items, more routes), and `LAYOUT_VERSION` is bumped.
- Proposal: **(b) for files in the bundle** (artifact, data, document, misc, pictures), **(a) for links out of it**
  (web, code), each kind behind the switches the Atlas has now. **Q109**: is (b) acceptable, given the layout is not to
  be disturbed for style? It changes what is laid out, not how.
- **Q110**: pictures saved beside a note (M22's folder named for the note): one node each, or one node for the folder?
  M22 hides a folder of only pictures.

## 3. Artifacts: a framework for Iso

The aim: Iso writes **content and behaviour**, never **look**. The look comes from a kit isorite provides; replacing the
kit's theme is the whole of departing from isorite's design.

### 3.1 The kit

A small library isorite provides to every artifact, versioned (`kit@1`):

- **Theme**: one CSS file of custom properties, the same tokens as `app/src/app.css` (grounds, lines, text, the four
  accents, fonts, the chamfer, spacing), in lapis and quartz. Every component reads only these. Chart series take
  `--series-1 …` derived from the accents.
- **Components**, as custom elements so Iso writes declarative markup, with a JS API under them for anything custom:
  - layout: `<iso-page>`, `<iso-panel>`, `<iso-grid>`;
  - data: `iso.data("runs.csv")` gives typed columns (CSV, JSON; Parquet and Arrow later);
  - charts: `<iso-chart type="line" data="runs.csv" x="t" y="energy" by="trial">`, on a charting grammar Iso knows
    well (Observable Plot is the likely base; uPlot where a series is long);
  - controls: `<iso-slider>`, `<iso-toggle>`, `<iso-select>`, play and pause, bound to one shared `iso.state`;
  - simulation: `<iso-canvas>` with `iso.loop((dt, state) => …)`, at the device's pixel ratio, paused when hidden or
    when reduced motion is asked for;
  - 3D: `<iso-model src="part.glb">` (glTF, GLB, STL, OBJ; three.js, loaded only when used), lit to suit the grounds;
  - tables, maths (KaTeX) and Markdown, rendered as the notes are;
  - `iso.open("basics/surprise")`: open a note in isorite from the artifact.
- The states, glyphs and motion of `docs/taste.md` (lustre, corner-bracket focus, no flash).

A working sketch of all of §3 is in `inspiration/artifacts/` (kit, an artifact, its data, a host with the bridge and
the standalone export).

### 3.2 Leaving isorite's look

Because components only read tokens, a different look is a different theme file:

- the kit ships `isorite.css` (lapis, quartz) and `plain.css` (system fonts, neutral greys, no chamfer);
- a user's own CSS of the same custom properties works too;
- `isorite check` warns when an artifact sets colours or fonts outside the kit (a literal hex, a `font-family`), so
  Iso's artifacts stay re-themable without anyone thinking about it.

### 3.3 The file

- Iso writes **only the artifact's own part**: markup, its script, and a manifest in `<meta>` (title, description,
  date, author as now, plus `isorite:uses` naming the data files it reads, and `isorite:kit` its kit version).
- **In isorite** the kit is provided by the host, so the file stays small, diffs read well, and the 200 kB rule holds.
- **Export** ("Save as standalone") writes one HTML with the kit, the chosen theme and the data inlined, which opens
  anywhere with no server. This is how an artifact is used elsewhere, and keeps the data sovereignty `ISORITE_DOC.md`
  asks for.
- **Q111**: or inline the kit into every saved artifact (between markers Iso never sees, as unkept text is fenced), so
  the raw file opens in a browser straight from the notes folder? Simpler for sovereignty, larger files, and the kit
  upgraded by rewriting each file.

### 3.4 Shown in isorite

- In a frame with `sandbox="allow-scripts"` and no `allow-same-origin`: it can't reach isorite's token or API, can't
  open windows, can't navigate isorite.
- Its only way out is a message bridge the host answers: the data files its manifest names (and no others), the
  ground (lapis or quartz, and changes to it), `iso.open`, and its errors.
- No network from an artifact unless the user allows it for that artifact (**Q112**: per artifact, or never?).
- Shown in place in a note (`![…](fig.html)`), opened on its own in the Note pane, and as a node on the Atlas.

### 3.5 What Iso gets

- **Tools**: `write_artifact(path, title, description, uses, html)` and `read_artifact(path)`, journaled and undoable
  as notes are; `read_data(path)` giving a data file's shape (columns, types, row count, a head, summary statistics) so
  Iso can build on a 50 MB CSV without reading it.
- **The kit's reference**, short (a few thousand tokens), given only when Iso is building an artifact, with four worked
  examples: a dashboard of charts from a CSV, a simulation with controls, a 3D model's viewer, and a comparison of two
  data files.
- **Its errors back**: the frame reports exceptions and the kit's own complaints (a column not in the data, a file not
  in the manifest), and they come back to Iso as the tool's result, so it can fix what it wrote in the same turn.
- **Q113**: whether Iso also sees a picture of the rendered artifact. That needs a model that takes images, which M22
  left to its own milestone.

## 4. Questions and problems (from the design rounds)

Understanding is being phased out as something drawn: it becomes part of Iso's context and system prompt, helping the
user find questions and problems, then answer and solve them. Sketch R (in `inspiration/combinations/`), second
version, is the current proposal, and the least settled part of the design:

- **A question** as a specimen label: its catalogue number, the question in the user's words, the notes it's about in
  corner brackets, and one mark: a hollow rose ◇ while open, a malachite ◆ with the answer's first line once answered.
- **A problem** as the crafting screen: the notes it uses as slots (filled once worked through), and a progress bar of
  its steps.
- **On the Atlas** they stay ordinary boxes: the ◇/◆ mark in the corner, or the progress bar along the foot.
- A question Iso asks shows in its reply as a rose ◇ and a small "keep" button, which makes it a question note.
- Gone from the first version: hollow dashed cavities and cracks mended in gold. Too much drawing for something
  this frequent.
- **Q114**: what counts as a problem's steps, and who marks one done (the user, Iso, or both)?

## 5. The Note pane: a label for every node, and artifacts shown in it

You asked for the details section to be reworked, and for artifacts to be viewable in the Note pane.

### 5.1 What's wrong with details today (`app/src/lib/components/NoteDetails.svelte`)

- The **type** is a free-text field with suggestions, so making a question or problem means knowing to type
  "Question" (your testing notes: "selection of note type is not nice", "hard to add question type notes").
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
- A **question** adds what it's about (parts, `+`) and a mark to answer it (◇ open, ◆ answered: `done`). A
  **problem** adds what it uses and its steps (Q114).
- **History** as strata down the margin (sketch T).
- **Delete** moves to the pane's menu, away from the name.
- Other frontmatter fields stay as now: not shown, never touched.

### 5.3 Every kind opens in the Note pane (sketch V)

- An **artifact** opens in the Note pane, in the sandboxed frame of §3.4, under the same label: its kind fixed, its
  path, the data it uses as parts. It adds two things: its look (isorite or plain, a different theme file, §3.2), and
  "standalone" (export, §3.3).
- The same holds for the other kinds, each with what suits it: **data** a table of its head and its shape (what
  `read_data` gives Iso); a **document** a PDF viewer; a **picture** the picture; **misc** its size and type, and a
  3D model through the kit's viewer.
- **Q115**: the pane is called "Note". Keep the name, or call it something that covers every kind?

## 6. Not in M23

- The terminal taking isorite's marks (sketched, then set aside).
- Iso seeing images (Q113).
- Editing an artifact by hand in isorite; it is shown, and Iso rewrites it.

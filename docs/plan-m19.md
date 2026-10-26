# Milestone 19: diagrams and code, drawn

Written 2026-10-26, for approval. Branch `m19-diagrams-code`, from `main` at `5585511` (0.6.0). It was agreed
after M14 as the step after setting up the gateway in the browser, and before Obsidian import: Obsidian vaults are
full of fenced code and Mermaid diagrams, and an import that shows them as raw text would look broken. Syntax
colouring of code blocks has been an open question since M2.

M19 draws two things that are written as fenced blocks today and shown as plain monospaced text:
- **code**, coloured by its language, in notes and in everything Iso, the agent and the terminal say;
- **diagrams** written in Mermaid (```` ```mermaid ````), drawn by [Pele](https://github.com/obsidianmd/pele),
  with maths in their labels set by KaTeX.

The files don't change: a diagram stays its Mermaid source, and code stays code. Only how they are drawn changes.

## 1. What is there today

Found by reading `app/src/lib/editor/{codemirror,livePreview,blocks}.ts`, `app/src/lib/markdown.ts` and the panes
that render Markdown, at `5585511`; and Pele 1.10.0's source (cloned at `4eff76f` for the earlier review).

- **The note editor** is CodeMirror 6 with `@codemirror/lang-markdown`, drawn as a live preview:
  - A fenced block gets the class `cm-lp-codeblock` on each line: monospaced, on a raised translucent ground, with
    a line down its left. Its text has no colours. `markdown()` is given no `codeLanguages`, so the code inside a
    fence isn't parsed at all.
  - `blocks.ts` draws display maths, tables and embeds rendered away from the cursor. Its header says Mermaid
    diagrams "are not drawn yet". Maths keeps its rendering beneath its source while you edit it.
- **Everything else** goes through `render()` in `markdown.ts`: markdown-it with KaTeX, sanitised by DOMPurify.
  That covers Iso's answers (`IsoBlock`), drafts, the terminal's turns, the Understanding view and Iso's changes
  (`IsoChange` shows a changed code block as a bare `<pre>`). Code comes out as `<pre><code class="language-x">`,
  styled in each pane as the boards' code block, with no colours.
- **The boards** (`Note-Rich`, "a note with a figure, mathematics and code"):
  - The **code block** is drawn in ink, not colour: keywords bold, comments faint (not italic), everything else in
    the text colour. It's 13px/20px mono on `g1`, with a 2px `ls` line down its left, padded 12px 16px, and the
    language's name at top right in 12px faint.
  - The **figure** is boxes on `g1` with a 1.2px `ls` outline and corners cut at 45°, joined by 1.5px `ls` wires
    with open arrowheads, labelled in 12px mono, with a faint caption line.
- **Pele** draws every diagram type that Mermaid 12.1.0 does, as SVG, and has no runtime dependencies. It's MIT.
  - It's coloured through CSS variables (`--pele-bg`, `--pele-fg`, `--pele-line`, `--pele-surface`,
    `--pele-border`, `--pele-accent`, `--pele-font`, `--pele-radius`, `--pele-series-1…8`), so a change of ground
    needs no re-render.
  - `pele/lazy` loads each diagram type only when a diagram of that type is drawn.
  - Errors are a `PeleError` with a code (`syntax`, `unsupported-diagram`, `semantic`, `limit`), a line and a
    column.
  - It takes a `math` resolver for `$…$` in labels; links and images can be turned off; and it limits source and
    output size.
  - Its layout is its own, so a diagram won't look exactly as it does in Mermaid.js.

## 2. What M19 does

**1. Code coloured in the editor.**
- **The fence's language is parsed:** `markdown()` is given `codeLanguages` from `@codemirror/language-data`, which
  loads each language's parser the first time a note uses it. A fence with no language, or one CodeMirror doesn't
  know, stays as it is now.
- **Coloured by one highlighter** for the editor and for rendered Markdown (step 2), so code looks the same
  everywhere. It's styled after the board's ink: keywords bold, comments faint, the rest in the text colour (Q87
  asks whether to add colour).
- **The language's name** is drawn at the top right of the block, as on the board, and hidden while the cursor is
  on the opening fence (where the name is written).
- **The block's look** moves to the board's values: `g1` (kept translucent, so the selection still shows), the
  `ls` line, and 12px 16px padding on the first and last lines.

**2. Code coloured wherever Markdown is rendered.**
- **`render()` colours fenced code** with the same Lezer parsers and the same highlighter, giving the same classes
  and the same colours.
- **Parsers load lazily:** a block whose parser isn't loaded yet is drawn plain, then coloured in place once it is.
  The panes use one Svelte action to do this, not a re-render of the answer.
- **Iso's changes** (`IsoChange`) colour a changed code block as well.
- **A copy icon** appears on hover at the top right of a code block in Iso's and the agent's answers, beside the
  language's name. It isn't added to notes, which are text you can select anyway.

**3. Diagrams in the editor.**
- **A ```` ```mermaid ```` block** is drawn as its diagram away from the cursor, like a table. With the cursor in
  it, its source shows for editing and the diagram stays beneath it, redrawn as you type, as maths is. Clicking a
  diagram puts the cursor in its source.
- **Too wide:** a diagram that won't fit uses Pele's `autoDirection`, so a left-to-right flowchart turns
  top-to-bottom at phone width. If it still doesn't fit, it scrolls sideways inside its own box, never the pane.
- **A diagram that can't be drawn** shows its source with one line beneath it in rose: Pele's message, with the
  line and column. The note's text is never changed by this.
- **Drawn lazily:** Pele and each diagram type load the first time a note needs them, so a note without diagrams
  costs nothing.

**4. Diagrams wherever Markdown is rendered.** `render()` turns a `mermaid` fence into a placeholder, which the same
action fills with the diagram. Iso can then answer with a diagram, and the agent's diagrams in the terminal's turns
are drawn too.

**5. The diagrams' look follows the board's figure.**
- **Colours:** `--pele-*` are set from isorite's tokens on both grounds:
  - the surface is `--ground-1`;
  - the border and the line are `--line-strong`;
  - the text is `--text`, and the muted text `--text-faint`;
  - the accent is `--lattice`;
  - the series are lattice, growth, malachite, rose, requires and builds, so a pie or a chart uses the palette.
- **Type:** labels are in the UI's mono at 12px, as on the board.
- **Corners:** square (`--pele-radius: 0`). The board's cut corners aren't something Pele can draw, which is a named
  departure (§4).
- **Maths in labels:** `$…$` in a label is set by KaTeX through Pele's `math` resolver, which matters for the
  differential-geometry notes.
- **Safe by default:** links and images inside diagrams are off. Pele escapes the text, and its SVG goes through
  DOMPurify (the SVG profile, keeping `foreignObject` for maths) like everything else from a note or a model.

**6. Iso and the agent know they can draw.**
- **The prompt:** one line in Iso's `PRACTICE` layer and in the terminal's instructions says that a fenced
  `mermaid` block is drawn as a diagram, and that a fence is named with its language so it's coloured.
- **The eval:** one case asks for a diagram of a note's links and checks the answer has a `mermaid` block that Pele
  can draw. A run on the mid tier costs about $0.03.

## 3. Tests

- **Unit (app):**
  - `render()` colours a Python and a TypeScript fence with the highlighter's classes;
  - an unknown language stays plain;
  - a `mermaid` fence becomes a placeholder holding its source, escaped;
  - DOMPurify keeps Pele's SVG and maths, and drops a `<script>` or a `javascript:` link written into a label.
- **Editor (`editor.test.ts`):**
  - a `mermaid` block is replaced by a widget away from the cursor, and has the diagram beneath it with the cursor
    in it;
  - a broken one has its error line;
  - a fence with a language gets the name widget, and none while the cursor is on the fence.
- **Browser (new `diagrams.spec.ts`, 4 projects):**
  - a note with a flowchart and a Python block: the SVG is drawn, the keywords are bold, clicking the diagram shows
    its source, typing redraws it, and a mistake shows the rose line;
  - on a phone, a wide flowchart turns top-to-bottom and the page doesn't scroll sideways;
  - the scripted Iso answers with a diagram and a code block: both drawn in Iso's pane, and the copy icon copies the
    code;
  - both grounds screenshotted and compared with `Note-Rich`.
- **The site:** the guide's new note (§5) is drawn on the public site, with Pele loaded from the site's own build.
- **Size:** the build's main chunk is checked so it doesn't grow by Pele or the languages. They must be separate,
  lazily loaded chunks.

## 4. The boards

- **`Note-Rich`** is the reference for both: the code block's ink, ground, line, padding and language label, and
  the figure's boxes, wires and labels. Screenshots on both grounds are compared with its values before reporting.
- **Named departures:**
  - the figure's cut corners, as above;
  - Pele's arrowheads are filled, where the board's are open (I'll set Pele's marker style if it allows, and say if
    it doesn't);
  - the board draws one kind of figure, and Pele draws every Mermaid type in its own way within those colours.

## 5. Docs and the guide

- **The guide:** a new note, *Diagrams and code* (`notes/diagrams-and-code.md`), with a flowchart, a sequence
  diagram, maths in a label, and code in two languages. *A note is Markdown* links to it. It doubles as the
  browser tests' fixture.
- **`docs/format.md`:** a line saying a `mermaid` fence is drawn and is otherwise ordinary Markdown.
- **The README:** a line under what a note can hold.

## 6. Order of work

1. Install `pele` and `@codemirror/language-data` (Q89), pinned. The shared highlighter, and code coloured in the
   editor, with the language's name.
2. Code coloured in `render()`, the lazy colouring action in the panes, `IsoChange`, and the copy icon.
3. Diagrams in the editor (`blocks.ts`), the error line, and width handling.
4. Diagrams in `render()`, the theme, maths in labels, and sanitising.
5. The prompt lines, the eval case (about $0.03), the guide's note, and the docs.
6. Tests, screenshots against `Note-Rich`, and a write-up as §8 here. Version 0.7.0.

## 7. Questions

- **Q87: code in ink, or in colour?** The board draws code in ink: keywords bold, comments faint, the rest in the
  text colour. Your question since M2 was about colour.
  - *Recommended: the board's ink, plus strings in `--text-soft` and numbers in `--lattice`.* That's enough to pick
    out the shape of a line, it stays calm beside the serif text, and it uses colours the page already has.
  - The other choice is a fuller palette from the four accents (keywords lattice, strings malachite, numbers growth,
    types rose), which is closer to what an IDE gives.
- **Q88: which languages?** *Recommended: all of `@codemirror/language-data`*, about 140 including Julia, R,
  Fortran, Haskell, LaTeX and Mathematica. Each is its own chunk, loaded only when a note uses it, so it costs
  nothing until then. The alternative is a hand-picked dozen, which is smaller in the repository but misses
  whatever you happen to need.
- **Q89: may I install `pele@1.10.0` and `@codemirror/language-data`?** They're both MIT. Pele has no dependencies;
  `language-data` brings the `@codemirror/lang-*` packages and `legacy-modes`. Both go into the app's dependencies,
  and the lock changes.
- **Q90: diagrams in Iso's answers, and the prompt line?** *Recommended: yes to both*, since a diagram of how
  notes connect is one of the most useful answers Iso can give. The alternative is drawing them only in notes and
  leaving the prompt alone.
- **Answered 2026-10-26:**
  - Q87: in colour, with ink as a setting in the Note pane's settings (*code in colour*, on by default). The
    palette is from the tokens (keywords lattice, strings malachite, numbers growth, types the violet of "requires", comments faint; rose is kept for what is wrong).
    Iso's pane and the others follow the same setting, so code looks the same in every pane.
  - Q88: all of `language-data`.
  - Q89: yes, both installed.
  - Q90: yes, with the prompt line saying to draw a diagram where it helps or when asked, not by habit.
- **Not in M19: Pele's ideas for the Atlas.** These are long edges that turn once (your `sawtooth.png`), a ranked
  list of layout aims, and plain curves where a gap's edges mostly cross. They belong in an Atlas milestone of
  their own, read against `docs/atlas-layout.md`, and I'd propose one after Obsidian import.

## 8. What was built

On branch `m19-diagrams-code`, version 0.7.0.

- **`app/src/lib/code.ts`:** the shared highlighter.
  - It maps `@lezer/highlight` tags to five classes (`tok-k`, `tok-s`, `tok-n`, `tok-t`, `tok-c`), and is scoped
    away from the note's own Markdown by its language data. Without that scope, a link's title would be coloured as
    a string.
  - Languages come from `@codemirror/language-data`; `languageOf` finds a fence's.
  - `highlighted` works on a loaded language and `highlight` loads one first. Both parse the code in an editor
    state of its own, so the older stream languages (Julia, R, Fortran) colour outside the editor too.
  - `colourCode` colours rendered blocks in place.
- **The editor:**
  - `markdown({ codeLanguages })`, plus the highlighter;
  - `livePreview.ts` hides a fence off its line, leaving the 12px padding, and draws the language's name
    (`LangWidget`);
  - `blocks.ts` draws a `mermaid` fence as a `DiagramWidget`. It's replaced away from the cursor and beneath its
    source while being edited, redrawn in place through `updateDOM`, and shows its source when it can't be drawn.
- **`app/src/lib/diagram.ts`:**
  - Pele through `pele/lazy`, which loads each kind on first use;
  - `mountAsync` with links and images off, `autoDirection`, and labels at 12px;
  - KaTeX for `$$…$$` in labels, measured off the page;
  - DOMPurify, with `foreignObject` as an HTML integration point so the maths survives.
- **`markdown.ts` and `drawn.ts`:**
  - `render()` wraps fenced code in `.code-block` with its language's name, and turns a mermaid fence into a
    `div.diagram` that holds its source as text;
  - the `use:drawn` action colours, draws, and adds a copy icon where asked. It's used in Iso's pane, the terminal's
    turns, drafts, IsoBlock, IsoChange and the Understanding view.
- **The look (`app.css`):**
  - the code colours, with ink as `:root[data-code="ink"]`;
  - `--pele-*` set from the tokens;
  - the rendered code block in the board's values.
- **The setting:** *the code* in the Note pane's settings, *in colour* or *in ink*. It's kept in this browser and
  set before first paint (`app.html`).
- **Prompts:** two lines in Iso's `FORMAT` (fenced code named with its language; a mermaid block is drawn, where it
  helps or when asked, not by habit) and a sentence in the terminal agent's instructions.
- **The eval:**
  - a `diagram` check, which uses Pele's `parse` in Node;
  - the case `draw-the-links`;
  - `ask-from-a-note` now also checks that no diagram is drawn unasked.
- **The guide and docs:**
  - the new note *Diagrams and code*, linked from *A note is Markdown*;
  - `docs/format.md`;
  - the npm README, which no longer mentions the exercises taken out in M12.

**Departures from the plan:**
- Types are violet (`--requires`), not rose, which is kept for what is wrong.
- A changed code block in Iso's proposed edits (`IsoChange`) isn't coloured, because a change doesn't carry the
  fence's language.
- In the editor, code lines wrap with the note (CodeMirror wraps every line), where the board scrolls them
  sideways. Rendered blocks scroll as on the board.
- A diagram's corners are square, and Pele's arrowheads are filled, where the board's are cut and open.
- Mermaid's own `$$…$$` is used for maths in labels, not isorite's single `$`, so files stay as Mermaid has them
  (and as Obsidian will).

**Tests:**
- unit: core 303, engine 120, example 11, guide 9, OpenCode 43, server 92, app 51 (4 new in `code.test.ts`);
- browser: 210 passed, 18 skipped. New is `diagrams.spec.ts`, 4 tests × 4 projects: drawing, editing and errors;
  ink; Iso's drawn answer with copy; a hostile diagram, whose script, handler and `javascript:` link don't get
  through;
- site: 8 passed, including a new check that *Diagrams and code* is drawn on the public site;
- the type checks are clean, and the autofixer found no issues.

Pele and the languages are chunks of their own. The main chunk holds only the languages' names.

**Real check:** the two eval cases on the mid tier, on fresh copies of the example base, cost $0.031 in all:
- `draw-the-links` passed 2/2 for $0.0268. It drew `graph TD` with leapfrog's links labelled by kind ("requires",
  "uses", a dotted "see also").
- `ask-from-a-note` passed 5/5 for $0.0044, with no diagram drawn.

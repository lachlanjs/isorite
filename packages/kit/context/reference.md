# The kit (isorite kit 1)

An artifact is one HTML file: markup, perhaps a script, and a manifest in its `<head>`. isorite gives it the kit: the look (every colour, font and corner), the elements below, and `window.iso`. Write what it shows and does, never how it looks: no colour, font family or border-radius of your own.

## The file

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Title</title>
<meta name="description" content="One sentence: what it shows, and what can be done with it.">
<meta name="isorite:kit" content="1">
<meta name="isorite:uses" content="runs.csv other.csv">
<style>/* layout only, if needed */</style>
</head>
<body>
<iso-page>
  <header><h1>Title</h1><p>The question it answers, in a sentence or two.</p></header>
  <iso-grid>
    <iso-panel class="wide"><h2>Name <span>a short reading</span></h2> … </iso-panel>
    <iso-panel><h2>…</h2> … </iso-panel>
  </iso-grid>
</iso-page>
</body>
</html>
```

`write_artifact` fills in the title, description and manifest from its arguments, so they are always right.

## Layout

- `<iso-grid>`: panels in two columns (`style="--cols: 3"` for three); `<iso-panel class="wide">` spans the row.
- `<iso-panel>`: its first child is `<h2>`; a `<span>` in the `h2` is a soft aside. A `<p>` in a panel is a caption: what the panel shows, in a sentence.
- `<iso-row>`: controls side by side. `<iso-stats>`: big numbers side by side.

## Data, with no script

Every element with `data="file.csv"` reads it itself. Several files are one table: `data="euler.csv leapfrog.csv"` adds a column `file` (`euler`, `leapfrog`) to compare them with `by="file"`. `where="integrator=leapfrog"` keeps some rows; `where="t<=$t"` compares with a control's value. `abs(col)` is a column's size.

- `<iso-chart data="f.csv" x="t" y="energy" by="body">`: a chart.
  - `type`: `line` (default), `dot`, `bar`, `area`, `step`.
  - `y` may name several columns: `y="kinetic potential total"`, each its own line.
  - `by`: a column whose values are the series.
  - `x-scale`, `y-scale`: `linear` or `log`, or `$name` to follow a control (`y-scale="$scale"`).
  - `x-label`, `y-label`: the axis with its unit (`"time (s)"`). `height` in pixels (260).
  - `at="t"`: follows the control `t`. A rule where x is its value; or, when the data has a column `t` and x is another column (a path in x and y over time), a dot on each series at the row whose `t` is nearest it.
- `<iso-table data="f.csv" columns="a b c" limit="50">`: the rows.
- `<iso-stat data="f.csv" column="err" of="max" label="worst error" tone="gold">`: one number. `of`: `min`, `max`, `mean`, `sum`, `count`, `first`, `last`. Tones: `gold`, `blue`, `green`, `rose`. Without `data`, set it from a script: `el.value = 0.0023`.
- `<iso-chart3d data="f.csv" x="x" y="y" z="z" by="body" at="t">`: points or paths in 3D, turned by dragging.
- `<iso-model src="part.glb">`: a 3D model (glTF, GLB, STL, OBJ), turned by dragging. List it in isorite:uses.

## Text and maths

- A `<p>` in a panel is its caption. Maths is written as in a note: `$E = \tfrac12 m v^2$` inline, `$$…$$` on a line of its own; the kit sets it. `<iso-math>\frac{a}{b}</iso-math>` is a formula alone.
- Never name the theme's colours in text ("the lattice line"): a chart's legend says which series is which.

## Controls

Each writes its value to `iso.state[name]`; elements that name it (`at="t"`, `$t`) follow it.

- `<iso-slider name="dt" label="time step" min="0.001" max="0.05" step="0.001" value="0.01" digits="3">`
- `<iso-select name="scale" label="scale" options="linear log">`: one of several.
- `<iso-toggle name="softened" label="softened" value="true">`: on or off.
- `<iso-play name="t" min="0" max="12" speed="1.5">`: plays `iso.state.t` from min to max, and pauses.
- `<iso-note href="physics/softening">softening</iso-note>`: opens a note in isorite.

## Script, when markup isn't enough

For a simulation or anything computed. Put it at the end of the body.

- `const rows = await iso.data("f.csv")`: the rows as objects, numbers as numbers.
- `iso.state.name`, `iso.watch((name) => …)`: the shared state; `watch` runs after any change.
- `iso.loop((dt, t) => …)`: runs every frame (dt in seconds), paused when hidden. Returns a stop function.
- `<iso-canvas height="320" id="sim">` and `document.getElementById("sim").draw = (ctx, w, h, t) => { … }`: draw on a canvas sized to its panel; call `.redraw()` after a change. `t` is the theme: `t.text`, `t.soft`, `t.faint`, `t.line`, `t.lattice` (blue), `t.growth` (gold), `t.malachite` (green), `t.rose`, `t.series[i]`, `t.ui` (the font).
- A chart of what the script computes: `chart.rows = [{ t: 0, energy: -1.3 }, …]` on an `<iso-chart>` with no `data`.
- `iso.format(x)`: a number to read (3 figures, 2.3×10⁻³). `iso.tokens()`: the theme, as `t` above.
- In CSS: `var(--text)`, `var(--text-soft)`, `var(--text-faint)`, `var(--line)`, `var(--lattice)`, `var(--growth)`, `var(--malachite)`, `var(--rose)`, `var(--font-ui)`, `var(--font-text)`.

## Rules (write_artifact checks them, and refuses a file that breaks one)

1. Every file read (`data="…"`, `src="…"`, `iso.data("…")`) is in `uses`, and exists: call `read_data` first.
2. Every column named is in its file, spelt as `read_data` gives it.
3. No colour, font family or border-radius of its own: no `#hex`, `rgb(…)`, `white`, `Arial`. Use the tokens.
4. No network: no `http…` address, no `<script src>`, no `fetch`. The kit is given; everything else is in the file.
5. Under 200 kB: data stays in data files.
6. No text that tells how to use it ("drag to rotate", "click here"): a label says what a thing is.

## What good is

Every panel answers a question about the data, with a caption saying what to see. Numbers are read out. Axes say what they measure, with units. Controls change what is drawn at once. Nothing is decoration.

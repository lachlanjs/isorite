# Building an artifact (kit 0)

An artifact is one HTML file beside the notes that isorite shows in the Note pane: a dashboard of the base's data, a
simulation with controls, an explorable explanation, a 3D view. You write its content and behaviour. Its look (every
colour, font and corner) comes from the kit, so the same file can be shown in isorite's look or a plain one.

## Tools

- `read_data(path)`: a data file's shape: its columns with their types, the row count, the first rows and each
  numeric column's range. Call it for every file you will use before writing, so the column names you use are real.
- `write_artifact(path, title, description, uses, html)`: writes the artifact. `uses` lists every data file the
  artifact reads. The result says whether it rendered, and gives back any error and any rule it broke: fix them by
  calling `write_artifact` again with the whole corrected file.

## The file: start from this, exactly

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TITLE</title>
<meta name="description" content="ONE SENTENCE: what it shows and what you can do with it.">
<meta name="author" content="Iso">
<meta name="date" content="YYYY-MM-DD">
<meta name="isorite:kit" content="0">
<meta name="isorite:uses" content="FILE.csv OTHER.csv">
<link rel="stylesheet" href="kit/isorite.css" data-look="isorite">
<link rel="stylesheet" href="kit/plain.css" data-look="plain">
<link rel="stylesheet" href="kit/kit.css">
<script src="kit/kit.js"></script>
<style>
  /* Layout only. No colour, no font family, no border-radius: use the variables below. */
</style>
</head>
<body>
<iso-page>
  <header>
    <h1>TITLE</h1>
    <p>One or two sentences: the question this answers.</p>
  </header>
  <iso-grid>
    <iso-panel class="wide">
      <h2>What this panel shows <span>a short reading of it</span></h2>
      ...
    </iso-panel>
    <iso-panel> ... </iso-panel>
    <iso-panel> ... </iso-panel>
  </iso-grid>
</iso-page>
<script>
  // Your script, if it needs one. Wait for the data, then draw.
</script>
</body>
</html>
```

Paths in `isorite:uses` and in `iso.data(…)` are relative to the artifact, the same as `uses`.

## Elements

- `<iso-page>`: the page. Its `<header>` holds the `h1` and a `p`; isorite hides the header when it shows its own.
- `<iso-grid>`: panels in two columns (`style="--cols: 3"` for three). A panel with `class="wide"` spans the row.
- `<iso-panel>`: a framed panel. Its first child is an `h2` (a short name; a `<span>` in it is a soft aside).
- `<iso-stats>` holding `<iso-stat label="mean error" tone="gold">`: big numbers. Set one from script with
  `el.value = "0.0023"`. Tones: `gold`, `blue`, `green`, `rose`, or none.
- `<iso-slider name="dt" label="time step" min="0.001" max="0.05" step="0.001" value="0.01" digits="3">`: a
  labelled slider. Its value is `iso.state.dt`, and changes reach `iso.watch`.
- `<button class="iso-button">play</button>`: a button. Add the class `on` to show it pressed.
- `<textarea class="iso">`: a text box.
- `<button class="iso-note" data-note="physics/softening">softening</button>` with `iso.open(el.dataset.note)`: a
  link to a note.
- Helpers: `class="row"` (a wrapping row of controls), `class="faint"` (soft text), `class="scroll-x"`.

## Script: `window.iso`

- `await iso.data("orbits.csv")`: the rows as objects, numbers already numbers: `[{t: 0, body: "a", x: 0.97}, …]`.
  JSON files are parsed. Only files named in `isorite:uses` can be read.
- `iso.state` and `iso.watch(fn)`: shared state. Sliders write to it; `fn(name)` runs after any change. Set
  `iso.state.playing = true` yourself for your own controls.
- `iso.tokens()`: the theme's values for drawing on canvas or in SVG: `ground0` (page), `ground1` (panel), `ground2`,
  `line`, `lineStrong`, `text`, `soft`, `faint`, and the accents `lattice` (blue), `growth` (gold), `malachite`
  (green), `rose`; fonts `ui` and `serif`. Read them again inside `iso.on("theme", redraw)`, which runs when the
  ground (dark lapis or light quartz) or the look changes.
- `iso.loop((dt) => { … })`: an animation loop (dt in seconds) that pauses when hidden or when reduced motion is on.
  It returns a function that stops it.
- `iso.open("folder/note")`: open a note in isorite.

In CSS, the same values are variables: `var(--ground-0)`, `var(--ground-1)`, `var(--ground-2)`, `var(--line)`,
`var(--line-strong)`, `var(--text)`, `var(--text-soft)`, `var(--text-faint)`, `var(--lattice)`, `var(--growth)`,
`var(--malachite)`, `var(--rose)`, `var(--font-ui)`, `var(--font-text)`, `var(--font-display)`.

## Drawing a chart

There is no chart element in kit 0: draw charts as inline SVG (or canvas) from script, sized to their panel. Colours
come from `iso.tokens()` or `var(--…)`: axes and grid in `line`, labels in `faint` and the `ui` font, series in the
accents (`lattice` first, then `growth`, `malachite`, `rose`). Redraw on `iso.on("theme", …)` and on resize. Label
the axes with what they measure and their units. Show the data, not decoration.

## Rules (checked; breaking one is reported back to you)

1. The head is the one above: the kit's three stylesheets and `kit/kit.js`, and the manifest metas.
2. `isorite:uses` names every file the artifact reads, and only files you were given.
3. No colour of your own: no `#hex`, `rgb(…)`, `hsl(…)` or colour names like `white` or `black`, in CSS or script.
   Use the tokens. (Transparency: `color-mix(in srgb, var(--rose) 20%, transparent)`.)
4. No font family of your own, and no `border-radius`.
5. No network: no `http://` or `https://` URL, no `<script src>` but the kit, no `fetch`. Everything is in the file
   or comes from `iso.data`.
6. Under 200 kB.
7. Nothing explains how to use it ("drag to rotate", "click here"): a control's label says what it is, not what to do.

## The bar

The worked example below, `entropy-lab.html`, is the standard: every panel answers a question about the data, numbers
are read out, controls change what's drawn at once, and nothing is decoration. Match it.

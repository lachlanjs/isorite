# An artifact, working

A sketch of the framework in `docs/plan-m23.md` §3, running: a kit, one artifact written as Iso would write it, the data it uses, and a host standing in for isorite's Note pane.

- `index.html`: the host. The label (sketch U), the artifact in a frame with `sandbox="allow-scripts"`, and the bridge: it reads the artifact's manifest (`isorite:uses`), hands over only those files, passes the ground and the look, sizes the frame, shows `iso.open` and the artifact's errors. "standalone" saves one HTML with the kit, both looks and the data inside.
- `entropy-lab.html`: the artifact. Markup, a manifest in `<meta>`, and a script; no colour or font of its own.
- `runs.csv`: entropy and Huffman's average code length for twelve texts, measured by `make-runs.mjs`.
- `kit/`: `kit.js` (data, state, sliders, readouts, tokens, the loop, the bridge), `kit.css` (components), and two themes with the same custom properties: `isorite.src.css` and `plain.css`. Changing the look is changing which theme is on.

Build the theme (it carries the fonts, since a sandboxed frame can't fetch them): `node inspiration/artifacts/build.mjs`. Then serve `inspiration/` and open `artifacts/index.html`.

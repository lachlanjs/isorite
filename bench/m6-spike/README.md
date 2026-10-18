# M6 spike: OpenCode 2 plugin, throwaway

What `plan-m6.md` §8 was found with. Not part of isorite; kept so the findings can be run again.

- `.opencode/plugins/isorite-spike/server.ts`: a search tool whose result carries an `isorite` block, a `isorite_propose` tool, and an `execute.before` hook that turns a `write` or `edit` inside `notes/` into a proposal.
- `.opencode/plugins/isorite-spike/tui.tsx`: a sidebar block, a footer status, a side panel (`/atlas`), a full-screen page (`/note`), a splash shown at start, and the `isorite` code-block renderer.
- `.opencode/themes/isorite.json`: lapis (dark) and quartz (light) from the boards' `isorite.css`.
- `opencode.json`: a `gateway` provider, OpenAI-compatible, key from `ISORITE_GATEWAY_KEY`. This is the shape a corporate gateway takes.
- `scripted.mjs`: a scripted OpenAI-compatible endpoint on `127.0.0.1:4599`, standing in for the gateway.
- `xdg/opencode/cli.json`: the TUI's settings (the theme). OpenCode reads these only from its config home.

To run it, with OpenCode 2.0.32 installed in `~/oc2` (`npm i @opencode/cli@2.0.32`):

```
node scripted.mjs &
XDG_CONFIG_HOME=$PWD/xdg COLORTERM=truecolor ISORITE_GATEWAY_KEY=test-key ~/oc2/node_modules/.bin/opencode --standalone
```

The plugins write a trace to `/tmp/isorite-spike.log`.

**Previews.** Two renderers, both from a `tmux capture-pane -e` dump, both in the boards' Ioskeley Mono (download the two `font/woff2` assets of the mood board into `preview/fonts/`, named by their ids):

- `preview/render.mjs pane.ans out.png`: through xterm.js 6 with WebGL, as VS Code's terminal draws it. Needs `@xterm/xterm@6.0.0` and `@xterm/addon-webgl@0.19.0` installed beside it. xterm.js draws box drawing, blocks and quadrants as geometry, and takes everything else, the wedges of Symbols for Legacy Computing and `◢◣◤◥` among them, from the font.
- `preview/ansi2html.mjs pane.ans out.html`, then Chromium's `--screenshot`: draws blocks, quadrants and the wedges as shapes, as kitty, WezTerm, Ghostty and foot are said to.

`preview/splash-xterm-styles.png` is the splash's three logo styles in xterm.js; `preview/splash-geometric.png` is `legacy` where the wedges are drawn as shapes; `preview/compare.png` is that beside the board's SVG.

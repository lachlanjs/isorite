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

**Previews.** `preview/ansi2html.mjs` turns a `tmux capture-pane -e` dump into a page of cells, drawing block and diagonal glyphs as shapes, as terminals with built-in box drawing do. Chromium then takes the picture:

```
tmux capture-pane -p -e -t oc > pane.ans
node preview/ansi2html.mjs pane.ans pane.html
/opt/pw-browsers/chromium --headless --no-sandbox --window-size=1300,900 --screenshot=$PWD/pane.png file://$PWD/pane.html
```

The font is DejaVu Sans Mono, not the boards' Ioskeley Mono. `preview/splash-legacy.png` is the splash with the logo from `packages/opencode/src/logo.ts`; `preview/compare.png` puts it beside the board's SVG.

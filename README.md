# isorite

An agentic harness for understanding. See `docs/ISORITE_DOC.md` for what it is to be.

Milestones 1 and 2: a base can be opened in the browser and notes written in it, with every edit entered in the note's journal, and Iso can be asked for text at a point, for a rewrite of chosen paragraphs, or for a whole note. The Atlas and study are not built yet.

## Starting out

Node 24 or later; for the terminal, OpenCode 2 (`npm i -g @opencode/cli`).

```sh
npm install -g isorite
isorite --tutorial                  # the tutorial: the terminal's tour, and the browser's opened beside it
```

On your own project, with a folder of Markdown notes (it can be empty, and is best its own git repository):

```sh
isorite study init <notes>          # the study base beside it: journals, your record, exercises
isorite serve <notes>               # the browser, at http://localhost:4767/; set Iso's provider key behind the logo
cd <your code> && isorite term <notes>   # OpenCode here, with the notes beside it (starts the server if needed)
isorite model                       # optional: search by meaning (34 MB, once)
```

From a checkout instead: `npm install && npm run build`, then `node packages/server/src/main.ts …` as below. `npm run package` builds the npm package into `.npm/isorite` (the command bundled to JavaScript, with the app, the example notes and the OpenCode plugin beside it); `npm pack` or `npm publish` is run there. Releases go through GitHub Actions on a version tag: `docs/release.md`.

| | |
|---|---|
| `docs/plan-first-slice.md` | the plan being built |
| `docs/plan-m1.md`, `docs/plan-m2.md` | each milestone: what was built and what was not checked |
| `docs/architecture.md` | how the parts fit, built and unbuilt |
| `docs/format.md` | what is on disk |
| `docs/decisions.md` | what was decided |

```sh
npm install
npm test                 # every package
npm run check            # types
npm run fixtures         # the note reader against its conformance fixtures
npm run bench:atlas -- --against bench/baselines/2026-10-11-t117-after.json
node packages/server/src/main.ts check <folder of notes>
node packages/server/src/main.ts study init <folder of notes>

npm run build            # the app, into app/build
npm run serve -- <study base, or folder of notes>     # then open http://localhost:4767/
npm run test:browser     # the app in Chromium, at two widths on both grounds
npm run model            # fetch the 34 MB model for search by meaning (once)
npm run bench:retrieval -- <folder of notes> <questions.json>
node packages/server/src/main.ts term <base>          # OpenCode 2 in this folder, with the base beside it
node packages/server/src/main.ts mcp <base> --agent claude-code   # the base's tools over MCP, for another harness
node packages/server/src/main.ts --tutorial                       # a tour of the terminal, on the example base
```

Iso needs a provider key: set it in the app, behind the logo. It is kept in `~/.config/isorite/config.toml`.

`isorite term` needs OpenCode 2 (`npm i -g @opencode/cli`; an `opencode` that is 1.x is passed over, and `ISORITE_OPENCODE` names another). It keeps OpenCode's config for isorite in `~/.config/isorite/opencode`, apart from yours. OpenCode's free models are used unless a gateway is named: `ISORITE_GATEWAY_URL` (any OpenAI-compatible endpoint: a corporate gateway, or `https://openrouter.ai/api/v1`), `ISORITE_GATEWAY_MODELS` (comma-separated, the first the default) and `ISORITE_GATEWAY_KEY`, which is read from the environment and never written down. Its tests drive it in tmux against a scripted gateway; set `ISORITE_OPENCODE` to run them.

**The tutorial** is over an example base, `nbody-notes`: a developer's notes on an N-body simulation, three weeks in (`packages/example`). In the browser (`npm run build:tutorial -w @isorite/app`, published to GitHub Pages) it is the app with the engine in the page and a scripted Iso, in five parts taken in any order: your notes, Iso in your notes, an evening on the project, study, and the terminal outlined. `isorite --tutorial` (or `isorite tutorial term`) is the whole of it on your machine: the base written into a folder, a scripted model (no key, nothing sent anywhere), OpenCode with the terminal's tour (the agent writing the simulation's code from the notes), and the browser opened on the same base with the five parts, its part E following the agent (`ISORITE_NO_BROWSER=1` leaves the browser closed). The site replays the terminal's tour at `#/terminal`; `npm run record:tour -w @isorite/opencode` records it again, and `npm run test:tutorial:local -w @isorite/app` walks the browser's half against a real server.

To work on the app with hot reloading, run `npm run serve -- <base>` and, beside it, `npm run dev -w @isorite/app`.

Needs Node 24 or later.

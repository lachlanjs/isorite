# isorite

isorite is "an agentic harness for understanding": a local-first web app over a folder of plain Markdown notes (one note per file; links are Markdown links with a kind in the title: `[x](/a/b.md "requires")`).
Its centre is the Atlas (a deterministic map of notes: folders are regions, links are routes) and the Agent pane, where isorite's own agent (pi) reads and writes the notes with the person. An agent of the person's own (Claude Code, Codex, Cursor) connects over MCP. There is no other agent route: ACP was retired on 2026-11-09.
The point is the person's understanding keeping pace with what agents do: every change to a note is journalled (who, what was asked).

## Layers (the one rule)

core (pure functions over text; no fs, clock or network) → engine (state, journal, search; written against ports, never Node) → shells (`packages/server` gives the engine Node and serves HTTP and MCP; `app` draws).
A layer may import only the one below it. Never put I/O in core, never import Node in engine. Tests enforce both.

## Where things live

- `packages/core`: parsing, link graph, search, journal, Atlas layout (`src/atlas/`), timeline.
- `packages/engine`: `engine.ts` (the note store, caches and events), `api.ts` (what shells call), `agent.ts`, `turn.ts`, `lookup.ts`, `meaning.ts` (search by meaning).
- `packages/server`: the `isorite` command (`src/main.ts`), `serve.ts`, `http.ts`, `mcp-http.ts`, `sessions.ts`, `doctor.ts`, `connect.ts`, `pi/` (the agent; `pi/scripted.ts` is the test model), `setup/` (the wizard). Its `package.json` version is the release version.
- `packages/kit` (artifact theme and charts, has a build step), `packages/guide` (isorite's own guide as notes), `packages/example` (the built example base), `packages/model` (the embedding model package).
- `app/`: SvelteKit SPA (Svelte 5 runes). Components in `src/lib/components`, state in `src/lib/*.svelte.ts`, tokens in `src/app.css`, motion helpers in `src/lib/motion.ts`, browser tests in `app/tests/*.spec.ts`.
- `fixtures/` conformance fixtures for the note reader; `bench/` benchmarks (`bench/tokens/` measures the harness's token use); `scripts/` release and packaging; `site/` the built guide (generated).
- `.isorite/` inside a base is isorite's own data (journal, hidden list, settings).

## Commands (run from the repo root; Node 24 runs `.ts` directly)

- Install: `npm ci`.
- Type check everything: `npm run check` (about 2 min). One package: `npm run check -w @isorite/core`. The app: `npm run check -w @isorite/app` (a svelte-check warning fails it).
- Unit tests: `npm test` (about a minute and a half). One workspace: `npm test -w @isorite/engine`. One file: `cd packages/engine && npx vitest run test/kinds.test.ts`. The two 1,200-note Atlas cases run only with `ISORITE_SLOW=1`.
- Browser tests (Playwright; projects `desktop-lapis`, `desktop-quartz`, `phone-lapis`, `phone-quartz`): `npm run test:browser` (about 20 min). One file, one project: `cd app && npx playwright test tests/hide.spec.ts --project=desktop-lapis`. Every run builds the app and starts `app/tests/serve.ts` on port 4799 (`ISORITE_TEST_PORT` changes it). Agent specs use the scripted model (`ISORITE_SCRIPTED=1`, set by the test server).
- Build the app: `npm run build`. Guide site: `npm run build:guide`.
- Serve a base: `ISORITE_NO_SETUP=1 node packages/server/src/main.ts serve <notes-folder> --port 4801` (serves `app/build`, so build first). The app routes by hash (`#/n/<id>`).
- Setup wizard: `node packages/server/src/main.ts setup` (`--yes --base . --agent claude-code` is the non-interactive form); `doctor` prints the checks.
- Fixtures: `npm run fixtures` (must leave `fixtures/expected/` unchanged unless the reader changed). Benchmarks: `npm run bench:atlas` (`-- --app` for the layout the app draws), `node bench/tokens/run.ts --baselines`.
- Release version: `node scripts/version.ts` prints it; `node scripts/version.ts X.Y.Z` sets it.

## Conventions (`docs/taste.md` is binding for anything a person sees)

- TypeScript erasable syntax only (no enums, no parameter properties, no namespaces); relative imports carry the `.ts` extension; `strict` and `noUncheckedIndexedAccess` are on. Two-space indent, double quotes, semicolons.
- Comments say why and what the thing is for, in plain full sentences; files start with a short header comment.
- Prose in docs and UI: short, concrete, a little dry; no exclamation marks. Markdown: one line per paragraph, never hard-wrapped.
- UI: few words, state shown by the thing itself; every animation has a `prefers-reduced-motion` form; durations are `--dur-1/2/3` with `--ease-out`; gold is the agent's alone; "on" is a tint and a 2px bar, never a solid block.
- A UI change needs a browser test that runs at all four projects; each test makes notes under its own project's name (the server and base are shared, workers is 1).
- A change to what a person sees usually also updates the guide note in `packages/guide/notes/` that describes it.
- The agent is "the agent" in code and prose. "Iso" survives only in journal `who` values (`iso:<model>`), the kit's `<iso-*>` elements and historical docs: keep reading them.
- `docs/decisions.md` wins over `docs/ISORITE_DOC.md` where they differ.

## Commits and releases

- A release commit is `isorite X.Y.Z: <what changed, in a lowercase clause list>` and sets the version with `scripts/version.ts`; a non-release commit is a plain capitalised sentence. A failed release is fixed by the next patch, and its message says so.
- Procedure: `docs/release.md`. A tag `vX.Y.Z` pushed to `main` runs `.github/workflows/release.yml`, which runs every test and the type check, so run `npm run check` and `npm test` before tagging.
- Nothing is committed, pushed or tagged without the owner's say-so. Check `git status` before `git add -A`: personal media has landed in a release commit before.

## Docs: what to read for what

- Start: `README.md`, `docs/architecture.md` (parts and ports), `docs/format.md` (what is on disk), `docs/decisions.md`, `docs/taste.md`.
- Setup: `docs/setup.md`, `docs/setup-for-agents.md`, `docs/terminal.md`. Atlas layout: `docs/atlas-layout.md`. Releasing: `docs/release.md`. Unplanned ideas: `docs/ideas.md`.
- Research from 2026-11: `docs/research/SUMMARY.md` indexes the design audit, performance, token efficiency, simplification, integrations and new ideas.
- Historical, do not read unless the task names one: `docs/archive/` (milestone plans; `docs/history.md` is their one-line index), `docs/tui-research.md`.

## Pitfalls

- Browser tests share one server, base and port: never run two at once. A cancelled run can leave `node tests/serve.ts` holding the port; check with `ss -ltnp | grep 4799`.
- Do not wait on a process with `pgrep -f "<its command>"` in a loop: the loop's own command line matches and it never ends.
- `packages/kit` has a build step (`node build.ts`), run by the app's `predev` and `prebuild`.
- The engine caches parses and the bundle per revision; anything that changes notes must go through the engine so the revision moves.
- When other agents are editing at the same time, do not revert changes you did not make.

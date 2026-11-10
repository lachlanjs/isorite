# isorite

isorite is "an agentic harness for understanding": a local-first web app over a folder of plain Markdown notes (one note per file, links are Markdown links with a kind in the title: `[x](/a/b.md "requires")`).
Its centre is the Atlas (a deterministic map of notes: folders are regions, links are routes) and the Agent pane, where the user's own agent (over MCP and ACP) or isorite's built-in agent (pi) reads and writes the notes with the person.
The point is the person's understanding keeping pace with what agents do: every change to a note is journalled (who, what was asked), and agent text is marked as the agent's until kept.

## Layers (the one rule)

core (pure functions over text; no fs, clock or network) → engine (state, journal, agent loop, search; written against five ports: Files, Http, Clock, Secrets, and never Node) → shells (`packages/server` gives the engine Node and serves HTTP/MCP/ACP; `app` draws).
A layer may import only the one below it. Never put I/O in core, never import Node in engine.

## Where things live

- `packages/core`: parsing, link graph, search, journal, Atlas layout (`src/atlas/`), timeline.
- `packages/engine`: `engine.ts` (the note store and events), `api.ts` (what shells call), `agent.ts`, `turn.ts`, `meaning.ts` (search by meaning).
- `packages/server`: the `isorite` command (`src/main.ts`), `http.ts`, `mcp.ts`/`mcp-http.ts`, `acp*.ts`, `doctor.ts`, `pi/` (the native agent), `setup/`. Its `package.json` version is the release version.
- `packages/kit` (artifact theme/charts, has a build step), `packages/guide` (isorite's own guide as notes in `notes/`), `packages/example` (the built example base), `packages/model` (the embedding model package).
- `app/`: SvelteKit SPA (Svelte 5 runes). Components in `src/lib/components`, state in `src/lib/*.svelte.ts`, browser tests in `app/tests/*.spec.ts`.
- `fixtures/` conformance fixtures for the note reader; `bench/` benchmarks; `eval/` artifact eval; `scripts/` release, packaging, `app-tester.ts`, `merge-sim.ts`; `site/` the built guide (generated).
- `docs/`: see "Docs" below. `.isorite/` inside a base is isorite's own data (journal, hidden list, settings).

## Commands (run from the repo root; Node 24 runs `.ts` directly)

- Install: `npm ci`.
- Type check everything: `npm run check` (about 2 min: tsc per package, then svelte-check on `app`). One package: `npm run check -w @isorite/core` (about 15 s). The app: `npm run check -w @isorite/app` (svelte-check is the slow part).
- Unit tests, everything: `npm test` (vitest per workspace; slow, see Pitfalls). One workspace: `npm test -w @isorite/engine`. One file: `cd packages/engine && npx vitest run test/kinds.test.ts` (about 3 s); the app's unit tests are `src/**/*.test.ts`: `cd app && npx vitest run src/lib/pointers.test.ts`. Filter by name: add `-t "words"`.
- Browser tests (Playwright, Chromium; 2 sizes x 2 themes = projects `desktop-lapis`, `desktop-quartz`, `phone-lapis`, `phone-quartz`): `npm run test:browser`. One file, one project: `cd app && npx playwright test tests/hide.spec.ts --project=desktop-lapis`. Playwright's webServer runs `npm run build` and starts `app/tests/serve.ts` on port 4799 (a fresh base in the OS temp dir), so every run costs a build (about a minute) and fails if 4799 is taken. Failures keep a trace in `app/test-results/`.
- Build the app: `npm run build` (runs the kit build first). Guide site: `npm run build:guide`.
- Serve a base: `node packages/server/src/main.ts serve <notes-folder> --port 4801` (serves the built `app/build`, so build first). New base: `node packages/server/src/main.ts new <folder>`. UI dev: `npm run dev -w @isorite/app` with a server on 4767 (or set `ISORITE_SERVE`).
- Fixtures (the reader's conformance expectations): `npm run fixtures` (about 20 s). Benchmarks: `npm run bench:atlas` (layout metrics), `npm run bench:retrieval -- <folder> <questions.json>` (needs `npm run model`).
- Release version: `node scripts/version.ts` prints it; `node scripts/version.ts X.Y.Z` sets it.

## Conventions (from the code; `docs/taste.md` for anything a person sees)

- TypeScript erasable syntax only (no enums, no parameter properties, no namespaces); relative imports carry the `.ts` extension; `strict` and `noUncheckedIndexedAccess` are on. Two-space indent, double quotes, semicolons.
- Comments explain why and what the thing is for, in plain full sentences; files start with a short header comment saying what they hold. Match that.
- Prose in docs and UI: short, concrete, a little dry; no exclamation marks, no "Oops". Markdown: one line per paragraph, never hard-wrapped.
- UI (`docs/taste.md` is binding): no directive text or key legends; every animation has a `prefers-reduced-motion` form; durations are the three tokens `--t-ack`, `--t-change`, `--t-result` and the two curves `--ease-out`, `--ease-in`; gold is the agent's alone; the Atlas's layout and routing do not change for style. Respond within 100 ms.
- A UI change needs a browser test in `app/tests/` that runs at all four projects, and every test makes notes under its own project's name (the server and base are shared, workers is 1).
- A change to what a person sees usually also updates the guide note in `packages/guide/notes/` that describes it (recent commits do).
- `docs/decisions.md` wins over `docs/ISORITE_DOC.md` where they differ; "decided" rows are the owner's, "my call" rows are proposals.

## Commits and releases

- A release commit is `isorite X.Y.Z: <what changed, in a lowercase clause list>` and changes `packages/server/package.json`'s version (via `scripts/version.ts`) alongside the work; a non-release commit is a plain sentence, capitalised, no prefix. If a release fails, the fix is the next patch (`0.21.5` fixed `0.21.4`) and its message says so.
- Full procedure, tag and approvals: `docs/release.md` (a tag `vX.Y.Z` on `main` runs `.github/workflows/release.yml`). Nothing is merged to `main` or pushed without the owner's say-so.
- Recordings and gifs (`tern-recordings/`, `*.gif`) have landed in release commits; check `git status` before `git add -A`.

## Docs: what to read for what

- Start: `README.md` (what it is and how it runs), `docs/architecture.md` (parts and ports), `docs/format.md` (exactly what is on disk), `docs/decisions.md` (what was decided), `docs/taste.md` (how it must feel).
- Setup and agents: `docs/setup.md`, `docs/setup-for-agents.md`, `docs/terminal.md`. Atlas layout: `docs/atlas-layout.md`. Releasing: `docs/release.md`.
- Historical, read only the one you are told to or that the task names: `docs/plan-m*.md` (one per milestone, the newest, `plan-m37.md`, holds the open fix list), `docs/plan-first-slice.md`, `docs/ISORITE_CONTEXT.md` (56 KB, written from the predecessor rdstudio; do not load whole), `docs/ISORITE_DOC.md` (the original vision, older than decisions.md), `docs/tui-research.md`. `docs/ideas.md` holds unplanned ideas.

## Pitfalls

- `npm test` is slow: `packages/core/test/atlas.test.js` lays out a 1,177-note base (minutes under load). Run the one workspace or file you touched, and the whole suite once before a release.
- The app's `check` is `svelte-kit sync && svelte-check --fail-on-warnings`: a warning fails it.
- A release (tag) runs every test and the type check on CI; a type error in a test or in `packages/example` has broken a release before. Run `npm run check` before bumping the version.
- Browser tests share one server and base and port 4799: never run two at once, and another running copy makes the first fail on startup.
- `packages/kit` has a build step (`node build.ts`), run by the app's `predev` and `prebuild`; run it yourself if you work on the kit alone.
- Other agents may be editing files at the same time: do not revert changes you did not make, and do not `git stash`, `checkout` or commit unless asked.

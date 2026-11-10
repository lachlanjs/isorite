# Agentic development efficiency for isorite

Written 2026-11-09. The owner's question: what techniques would make developing isorite faster and cheaper with agentic tools, given a token constraint on the top model.

## What the repo looks like from an agent's side

- One owner, working almost entirely through Claude Code. Recent history is a release a few hours apart (`isorite 0.21.0` to `0.21.6` in one day), each commit a feature or fix plus a version bump in `packages/server/package.json`. Two of the last three releases failed CI on type errors in tests and in `packages/example` (0.21.5 fixed 0.21.4, 0.21.6 fixed 0.21.5): the feedback loop before tagging is the weak point.
- There is no `CLAUDE.md`. Every fresh session therefore starts by rediscovering the layer rule, the commands and the conventions. The only project-level agent file is `.claude/agents/app-tester.md` (a Haiku subagent that plays a new user), which is a good pattern and is the only one used.
- The docs are large: 806 KB under `docs/`, of which about 40 `docs/plan-m*.md` files are milestone plans that are finished, `ISORITE_CONTEXT.md` is 56 KB of predecessor lore, and `ISORITE_DOC.md` is 30 KB and older than `decisions.md`. Nothing tells an agent which are current. This is the largest avoidable token cost: an agent told "read the docs" loads some of it, and an agent that is not told guesses.
- CI exists (`.github/workflows`: `release.yml`, `windows.yml`, `guide.yml`, `model-release.yml`), but only on tags and on Windows pushes. There is no per-push Linux check on a branch, so a type error is found at release time.

## Measured

Measured on this machine (a Codespace, 2026-11-09), under load from other agents editing and running tests at the same time, so read these as upper bounds.

| Command | Time | Note |
|---|---|---|
| `npm run check` (whole repo) | 2 min 03 s | `tsc` per package, then `svelte-check` over 2,049 files, 0 errors |
| `npm run check -w @isorite/core` | 16 s | one package |
| one vitest file, `packages/engine` | 7 s wall, 2 s of tests | most of it is Node and vitest start-up |
| one vitest file, `app/src` | 7 s wall, 0.3 s of tests | |
| `npm run fixtures` | 20 s | |
| `npm test` (all workspaces) | more than 10 min, did not finish when I stopped waiting | `@isorite/core` alone took 520 s: `packages/core/test/atlas.test.js` lays out a 1,177-note base (`156574 ms for both`) and a router test at a thousand notes took 343 s, and 2 of its 37 tests failed (probably vitest's per-test timeout under load; I did not confirm). The other workspaces run after core |
| one Playwright file, one project | 2 min 18 s | the config's `webServer` runs `npm run build` on every invocation, and `reuseExistingServer` is false; the run failed (`hide.spec.ts`, `[data-note="basics/hid-desktop-lapis"]` not found), which I did not investigate: other agents were editing the tree and running browser tests on the same port 4799 |
| full browser suite | not measured | 35 spec files x 4 projects (desktop and phone, dark and light), one worker |

The finding that matters: a developer or agent cannot afford to run `npm test` as a habit, so nobody does, so breakage is found at release. Section "faster feedback" below is about making the cheap loop the default.

## Tactics, ranked by payoff

Payoff means tokens saved or errors prevented per hour of owner time spent.

### 1. A project instructions file (`CLAUDE.md`): highest payoff, one hour

Claude Code reads `CLAUDE.md` at the start of every session and keeps it in context, so it should hold only what is needed in most sessions: what the project is, the layer rule, a map, exact commands, conventions, pitfalls, and a pointer to which docs to read. Community guidance (secondary sources; I found no single official number) converges on keeping the root file near 100 to 200 lines and moving occasional playbooks into skills so they load on demand. Hooks are the deterministic version: instructions in `CLAUDE.md` are followed by the model most of the time, a hook always runs.

A draft is in `docs/research/agentic-drafts/CLAUDE.md` (63 lines). Every command in it was run; the ones I could not verify are noted under "Not verified" below. What it saves: the first ten to thirty tool calls of every session (finding the commands, the test layout, the docs), and the class of mistake where an agent runs `npm test` or full `check` for a one-line change.

Install: copy to the repo root, read it once with your own eyes (it states conventions as rules; delete any you disagree with), and keep it current by having the agent propose edits when a session discovers a wrong line. Keep it free of anything that changes weekly (current milestone, version).

### 2. Condense the docs so agents load less

The doc tree is the project's memory and is already unusually good (decisions with who decided, taste, format). The cost is that nothing says what is current.

- Create `docs/archive/` and move into it every `plan-m*.md` and `plan-first-slice.md` / `plan-embed.md` whose milestone is done, keeping `plan-m37.md` (open fix list) and whatever is live in `docs/`. Move with `git mv` so history follows. Do it in one commit. Check nothing links to the old paths first: `rg "plan-m" -g '!docs/archive'`; the guide notes and `decisions.md` may.
- Add `docs/README.md`, about 30 lines: one line per current doc saying what question it answers, one line saying the archive is history, and when a plan is finished (one line of outcome at its top, then archive).
- Give each current doc a one-paragraph summary at its top and put the "what is still true" in `decisions.md`; an agent should be able to decide from the first 10 lines whether to read on. `ISORITE_CONTEXT.md` (56 KB) should get such a summary and a line "predecessor rdstudio lore; do not load whole". The draft `CLAUDE.md` already tells agents that.
- Do not delete the plans: they are the best record of why. Agents reach them only through `rg`, which costs almost nothing, so archiving makes the rest cheaper without losing them.
- Measured upside: after archiving about 40 plans, the always-relevant docs are `architecture.md` (28 KB), `decisions.md`, `format.md` (14 KB), `taste.md`, `release.md`, which an agent reads selectively.

### 3. Faster feedback loops

The goal is that the check for one change takes seconds, and the whole-suite run happens once, before a release, in CI and not in the agent's context.

- **Scope by what changed.** `npm run check -w <pkg>` (16 s for core) and `npx vitest run <file>` (7 s) are already there; they are missing from the docs, which is why agents run the whole thing. The `verifier` subagent draft encodes the scoping.
- **Make `tsc` incremental.** Add `"incremental": true` and `"tsBuildInfoFile"` to `tsconfig.base.json` (with `noEmit`, TypeScript still writes the build info file). Repeat checks of an unchanged package are then near-instant. Ignore the build info in `.gitignore`. Try it and measure; I have not.
- **Move the 1,177-note layout test out of the default run.** Mark it as a benchmark: put it behind an environment variable (`describe.skipIf(!process.env.SLOW)`) or move it to `bench/`, where `bench/atlas_layout.mjs` already measures layout. This alone would likely bring `npm test` from tens of minutes to minutes. It is a deliberate design call, since that test also asserts the layout is deterministic at scale, so keep the assertion in the slow set and run it in CI on tags.
- **Vitest projects and watch mode.** A root `vitest.workspace.ts` (or `projects` in a root config) would let `npx vitest run --changed` run only tests that depend on changed files across all packages, and `npx vitest` (watch) re-run the affected ones on save. The packages currently each run vitest separately, which is why `npm test` is serial and why each package pays start-up.
- **Browser tests: stop rebuilding every run.** `playwright.config.ts` has `reuseExistingServer: false` and a `webServer` that runs `npm run build` first, so one spec file costs a full build (a minute or more). Add a script `test:browser:fast` that skips the build when `app/build` is newer than `app/src`, or use `reuseExistingServer: !process.env.CI` and start `node app/tests/serve.ts` yourself once. For iteration, run one project (`--project=desktop-lapis`) and then all four once. A parallel run is not possible while the tests share one server and one base; the cost of making them independent is probably not worth it.
- **Run the slow stuff on CI, not locally.** See tactic 8.

### 4. Model routing

The owner is token-constrained on the top model. Spend it on what only it can do: design decisions, tasteful UI judgement, novel debugging, writing the plan. Route the rest:

- **Search and "where is X"**: the built-in Explore subagent (or a `haiku` subagent) reads files in its own context and returns a summary; the main context never sees the dumps. Tell the main agent in `CLAUDE.md` to use it for questions that need more than two or three file reads.
- **Verification**: the `verifier` draft (Haiku) runs check and tests and reports only failures. The output of a failing run can be thousands of lines; it should never reach the top model's context.
- **UI screenshots**: the `ui-shot` draft (Haiku) builds, serves, screenshots and describes. A Haiku reading a PNG is cheap; the top model decides what to do about what it described.
- **Mechanical edits** (rename across files, update guide notes, add a test in an existing pattern): a Sonnet-class session or subagent with a precise spec, then a Haiku verification.
- **Planning and review**: top model, but in plan mode on a small context: give it the plan doc and the files, not the repo.
- Subagent frontmatter accepts `model:` (as `app-tester.md` already uses `haiku`), so routing is configuration. A subagent starts cold and re-derives context; give each a prompt that names the files, and let `CLAUDE.md` carry the shared background.

### 5. Context hygiene

- One task per session; `/clear` between unrelated tasks. A session that carries the previous feature's files pays for them on every turn.
- `/context` to see what is loaded; `/compact` with a focus ("keep the plan and the failing test") when a long task has accumulated noise; `/usage` to find where the tokens went before cutting anything. Community advice, repeated in several sources, is to measure first: a cut that raises regenerations is a loss.
- Keep tool output small: `rg -n` with a narrow pattern and `-g` globs rather than `cat` on large files, `git diff --stat` before `git diff`, `head`. For tests, `--reporter=dot` (vitest) or `tail -30`. A hook can do this (tactic 10).
- Ask for plans to be written to a file and the session restarted from the file: a plan survives `/clear` and a transcript does not. The repo's `plan-m*.md` habit is already this; the improvement is the archive and the first-10-lines summary.
- Use the project's existing memory (the user-level `MEMORY.md` the owner already keeps) for preferences, and `CLAUDE.md` for facts about the repo: preferences belong to a person, facts to the project.
- Prefer `Read` with offset and limit for the 28 KB and 56 KB docs.

### 6. Scripted UI verification

The UI is the project's hardest thing to verify (taste is binding; animations are specified) and the existing evidence is the Playwright suite and screenshots committed by hand (`screenshots/`, untracked at the moment). Add:

- `scripts/shot.ts`: builds if needed, serves a fresh base from `app/tests/serve.ts`' seed on a spare port, takes screenshots of a route at the two widths and two themes given a list of steps, writes PNGs to a scratch folder and prints their paths. `app/tests/serve.ts` already makes the base; the shot script is about fifty lines on top of Playwright, which is installed. The `ui-shot` draft does it ad hoc; a script makes it repeatable, and cheaper still, because the subagent only has to call it.
- A Claude Code skill or subagent then reads the PNGs. Reading images costs tokens: use a small model and ask a precise question ("is the tag row cut off at 390 px?") not "look at this".
- Visual regression: Playwright's `toHaveScreenshot` for a few stable views (the Atlas of the seed base at both themes) would catch unintended layout changes without anyone reading them. The Atlas is deterministic by design, which is what makes this practical. Keep it to a handful; screenshots of animated or live content flake.
- `scripts/app-tester.ts` plus the `app-tester` subagent is a good model: it is a scripted environment plus a persona. Keep it for setup and README checks, which is what it is for.

### 7. Parallel worktrees

Several independent items are waiting (the `plan-m37.md` fix list has 15 small items, then bigger directions). Run several Claude Code sessions each in its own git worktree (`claude --worktree <name>` or `git worktree add ../isorite-<name> -b <branch>`), one item per session, then merge. Cautions specific to this repo:

- Port 4799 is fixed in `app/tests/serve.ts`, so two worktrees running browser tests collide; make the port an environment variable (`PORT = Number(process.env.ISORITE_TEST_PORT ?? 4799)`; the Playwright config imports it from the same file) before using worktrees seriously.
- Each worktree needs `npm ci` (or a shared install; `node_modules` is about the repo root with workspace symlinks, so a cheap copy is `cp -r` or a pnpm-style store; measure before assuming).
- The version file `packages/server/package.json` is a merge hotspot: let only the release step touch it.
- Subagents can use `isolation: worktree` for risky refactors, discarded if unchanged.
- Today other agents are editing the same tree concurrently (that was true while I did this research): worktrees are the fix for exactly that.

### 8. CI on every push

Add a `check.yml` workflow: on push and pull request, run `npm ci`, `npm run check`, `npm test` (with the slow test out of the default set) on Linux, with `cache: npm`. The owner's own release process already runs these on tags; moving them to every push means a type error in a test is seen on the branch, not at release. Add a second job for the browser tests (`npx playwright install --with-deps chromium`, then `npm run test:browser`) that runs on pull requests and `main` only. Cost is GitHub minutes, not tokens, and it replaces the local full runs the agent should not be doing.

Headless Claude Code (`claude -p "<prompt>"`, with `--allowedTools` and a budget) can run in CI for review or triage; it is not needed for any of the above, and spends tokens, so leave it out until there is a specific recurring job (for example, a PR review that checks `docs/taste.md`), and keep it to a cheap model.

### 9. An eval harness for the product's own agent

isorite ships its own agent (pi, M36) and a prompt that tells it how to write and teach. Whether a change to the prompt or the tools made it better is currently judged by hand. The repo already has the pieces: `bench/questions/*.json` and `bench/retrieval.ts` (retrieval), `bench/tokens/` (new, untracked), `eval/artifacts/cases.json` (artifact generation cases), and `scripts/app-tester.ts` (a stand-in gateway that returns a fixed answer). What is missing is a single command that runs the agent on N fixed tasks against fixtures and prints a table.

- Cases: question, base, expected notes cited (checkable mechanically: the quotation check the agent already has), expected writes (a file diff predicate), forbidden behaviour (wrote outside its scope; hid its edits).
- Score: mechanical checks first (cited note ids, quote present, link kinds valid, no unmarked agent text), a model judge only for the residual, on a cheap model, with the rubric in the file.
- Run on a schedule or on prompt changes, record cost and tokens per case: the product promises to show cost, so it should measure it. This also gives the owner a defensible answer to "did this make Iso worse" without spending top-model tokens each time.
- Effort is a milestone, and it is worth it only when prompt changes are frequent. They are (recent commits: "the agent is told how to write and how to teach").

### 10. Hooks and permission allowlists

- **Allowlist** (`settings.json`, draft included): permit the read-only and test commands the agent runs constantly (`git status/diff/log`, `npm run check`, `npx vitest run`, `rg`), so the owner is not asked a hundred times. Deny the irreversible ones (`git push`, `reset --hard`, `clean`, `npm publish`). The release procedure (tag and push) stays a human step, which matches `docs/release.md` and the plan docs' "nothing is merged or pushed without the owner".
- The built-in `/fewer-permission-prompts` skill scans past transcripts and proposes an allowlist; use it after a week of work to extend the draft with what the owner actually runs.
- **Hooks** (deterministic, free of tokens): a `PostToolUse` hook on `Edit|Write` that runs `npx tsc -p packages/<pkg>` for the edited file's package and prints only errors (so the agent sees a type error immediately, not at the end); a `Stop` hook that runs the scoped check and returns the errors to the model if any, which enforces "do not say done with red types"; a `PreToolUse` hook that blocks `git add -A` when untracked files over 1 MB exist (the recordings and gifs have been committed by accident). Hooks are the most powerful and the easiest to get wrong, so add one at a time. I have not written hook scripts as drafts, because the right ones depend on the `tsc` timing above; add them after incremental `tsc` is measured.

## Recurring procedures seen in the history

- **Release**: `node scripts/version.ts`, commit `isorite X.Y.Z: ...`, tag, push, approve twice. Draft skill: `skills/release/SKILL.md`. Marked as manual-only (`disable-model-invocation: true`) so it is never run on a guess.
- **New milestone plan**: `docs/plan-mNN.md` (why, decided, steps, done). Worth a small `plan` skill if the owner wants it consistent, but the existing plans are a better template than any skill; not drafted.
- **UI change**: component, browser test, guide note, taste check. Covered by conventions in `CLAUDE.md`; a skill would be redundant until the checklist grows.
- **A new guide note** (`packages/guide/notes/<folder>/<slug>.md` with frontmatter, linked from its parent): not drafted; the guide is edited in nearly every release (the 0.21.2 commit touches 40 notes with one line each), so a script that checks the guide's links and tags (`packages/guide` has tests) is already the right verifier.

## What to install, and how

The drafts are plain files under `docs/research/agentic-drafts/`. Nothing here touches `.claude/` or the repo root. To adopt, from the repo root, after reading each:

```sh
cp docs/research/agentic-drafts/CLAUDE.md CLAUDE.md
cp docs/research/agentic-drafts/agents/*.md .claude/agents/
mkdir -p .claude/skills/release && cp docs/research/agentic-drafts/skills/release/SKILL.md .claude/skills/release/
```

`settings.json` should be merged by hand into `.claude/settings.json` (shared with the team; commit it) or `.claude/settings.local.json` (yours alone; the `local` file is where Claude Code writes "always allow" choices), because `.claude/settings*.json` may already hold your settings. The `deny` list is the part to check: `git checkout` and `git stash` are denied in the draft, which stops an agent from clobbering a shared tree and also stops you asking for them in a session, so remove them if you want that.

Afterwards, delete `docs/research/agentic-drafts/` once adopted, so the copies do not drift. Restart Claude Code (or run `/agents`) so subagents are picked up.

## Not verified

- I could not complete `npm test` in a reasonable time (see the table), so the whole-suite pass rate is unknown.
- The browser test I ran (`hide.spec.ts`, `desktop-lapis`) failed. I did not establish why; the tree was changing under me and the port is shared. A run on a quiet tree is needed before the browser-test line in the draft `CLAUDE.md` can be called proven. The command syntax (`cd app && npx playwright test <file> --project=<name>`) did run and execute the test.
- `npm run bench:atlas`, `npm run bench:retrieval`, `serve` on a port, and `new`: the command forms come from `package.json`, `--help` and file headers; I did not run them to completion.
- The Claude Code facts (subagent `model` frontmatter, skills `disable-model-invocation`, `permissions.allow` and `deny` rule syntax, worktree isolation) come from my knowledge and secondary web sources; the web searches returned third-party guides, not the official pages. Check the exact syntax against `code.claude.com/docs` before relying on it, in particular the `Bash(cmd:*)` rule form.

## Sources

- https://composio.dev/blog/ways-to-cut-token-consumption-in-claude-code
- https://kdnuggets.com/7-practical-ways-to-reduce-claude-code-token-usage
- https://www.pubnub.com/blog/best-practices-claude-code-sub-agents/
- https://support.claude.com/en/articles/14554000
- https://code.claude.com/docs/en/settings (not fully read)
- https://docs.claude.com/en/docs/claude-code/settings (not fully read)

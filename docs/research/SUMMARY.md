# Research round, 2026-11-09 to 2026-11-10

## Documents

- `design-audit.md`: the app against `docs/taste.md` and Tern; tokens, motion, copy cuts, the Agent pane; two "implemented" sections say what was done and deferred.
- `simplification.md`: the deletion and refactor audit, with the concept decisions.
- `performance.md`: measurements at 100, 1,000 and 10,000 notes, the quick wins (implemented), the scaling cliffs and the long-term sequence.
- `token-efficiency.md`: the harness's token use against stock pi and Claude Code; `bench/tokens/` reproduces it.
- `integrations.md`: Tern, Obsidian, VS Code, and the forecast for phones.
- `agentic-development.md`: tactics for faster, cheaper agentic development.
- `agentic-drafts/`: a draft `CLAUDE.md`, settings, two subagents and a release skill. Not installed.
- `new-ideas.md`: 28 ideas not in `docs/ideas.md`.
- `../lenses.md`: the design of lenses (decided 2026-11-11), built in its first slice: a lens file, `check`, one lens drawn, `read_lens`.

The Atlas work is recorded in `docs/atlas-layout.md`, section 7.

## Changed this round

- Agent routes: isorite's own agent and MCP only. ACP and `isorite acp` are retired.
- Agent pane: composer footer (agent chip, reach switches, context gauge), one row per tool call, a changed-notes bar with Review and Undo turn, plain errors with one action. A scripted model (`ISORITE_SCRIPTED=1`) drives the browser tests.
- App shell: new tokens and one motion scale, quiet switches, a note list without rules, a lit line on the focused pane, list and title motion, copy cuts.
- Atlas: the layout takes the viewport's shape; notes and frames fade in; faster highway search.
- Performance: flat save cost, injected SHA-256, parse and token caches, memoised notes and map with ETags, compression, lazy agent SDK.
- Tokens: `brief_base` returns the map only, with the rest on request.
- Setup: `isorite setup` (wizard and `--yes` form), a fuller `isorite doctor`, MCP configs written for detected harnesses.
- Simplification: spikes, the old eval, the learner record, proposals and `/parts` deleted; appearance cut to the theme switch; plans archived to `docs/archive/` with `docs/history.md`; Iso renamed Agent in code and the guide.
- Skills: isorite's own agent loads `SKILL.md` skills (built in, `<data>/skills/`, `<base>/.isorite/skills/`), by name in the prompt and `use_skill`, or `/name` in the composer; on/off in the agent settings, kept in the base; Jane Street's socratic-tutor ships built in (+212 tokens on, 0 off).
- Tests: the two ~1,200-note Atlas cases run only with `ISORITE_SLOW=1`; `npm test` takes about a minute and a half.
- Lenses, first slice: `.isorite/lenses/<name>.toml` (islands, `notes` and `match` rules, order, titles), resolved in core and served by the engine per revision; a lens picker in the Atlas header; ghosts and Elsewhere; moves rewrite lens entries; `isorite check` reads lenses (`--strict`, `--fix` from git renames); `read_lens` and a lens filter on search; the guide's first-hour lens.
- The global base and the skills base: two bases kept in the data folder, always in the switcher above a person's own. Links to the global base are `global:<id>.md` (a scheme, as `code:` is; no id holds a colon), drawn as marks on the Atlas that open the global base's page, checked by `isorite check`; the skills base opens the per-user skills as islands and notes, scripts as items, built-in skills read only; both lent to the agent through the memory's route while they have notes, with writes journalled in their own journals. See `docs/format.md` §6.
- The public site holds four bases, switched as the app's switcher does: the Tutorial (the guide), and examples of the Global base, the Skills base and a Code base (`packages/example-global`, `example-skills`, `example-code`, outside the workspaces), each with its lenses. A base is named in the address (`#/b/code/n/<id>`; none means the Tutorial, so older guide addresses stand), switching reloads the page into it, and each base's text is a chunk fetched only when it opens. `npm run test:site` runs at all four projects.

## Unfinished

- The refactors in `simplification.md` that were not asked for (R2, R3, R4, R5, R7, R8, R9, R12, R13).
- The tracked media (Tern recordings, the root PDF and gif) are git-ignored but still in git history.
- Guide notes under `iso/` moved to `agent/`, so a saved hidden list or last-open note using the old ids does not carry over.
- "Iso" remains in the kit's element names (`<iso-*>`) and in `docs/tui-research.md`.
- A truly incremental bundle and a file watcher (see `performance.md`).
- The full browser suite was not rerun end to end after the last test fixes; `note-drag` "gold one sends it" is flaky on the phone project.
- Lenses, for the next slice: editing a lens in the app; `linked-from:` and `type:` rules; files and code as items in a lens; a lens file's own journal; the 1,200-note benchmark with a lens; agent writes to lens files through the notes' route; a note-list filter by lens and island in the API.
- The global and skills bases, for the next slice: a global link is not followed by a rename made in the global base, and its broken mark on the Atlas is as of the linking note's last revision; `isorite bases` does not list the two; `skills:` links; a `Built in` title for the `built-in` island; the agent's tools see the skills base only once the person has a skill of their own.

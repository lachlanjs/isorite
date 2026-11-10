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

## Unfinished

- The refactors in `simplification.md` that were not asked for (R2, R3, R4, R5, R7, R8, R9, R12, R13).
- The tracked media (Tern recordings, the root PDF and gif) are git-ignored but still in git history.
- Guide notes under `iso/` moved to `agent/`, so a saved hidden list or last-open note using the old ids does not carry over.
- "Iso" remains in the kit's element names (`<iso-*>`) and in `docs/tui-research.md`.
- A truly incremental bundle and a file watcher (see `performance.md`).
- The full browser suite was not rerun end to end after the last test fixes; `note-drag` "gold one sends it" is flaky on the phone project.

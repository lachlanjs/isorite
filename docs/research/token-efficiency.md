# Token efficiency of the agent harness

How many tokens isorite's agent harness sends a model, where they go, what was changed, and how that compares with pi's stock coding agent and Claude Code.

## Method

`node bench/tokens/run.ts` (add `--before` for isorite 0.21.6 as it stood, `--baselines` for pi's stock agent, `--json` for machine output) measures statically, on the example base in `packages/example`: the system prompt, each tool definition (name, description and JSON Schema, compact JSON), and the tool calls and results of five fixed tasks, each the minimal tool-call sequence.

Tokens are estimated as characters / 4. No tokenizer is installed, and pi's own context estimate is the same. Real BPE counts run about 10% higher for prose and 15 to 25% higher for JSON schemas and code, so absolute numbers are low; the ratios between variants are what matter. No provider API key is in the environment, so nothing was validated against a real call.

The "before" tasks use the engine's tools and the 0.21.6 system prompt unchanged. A write task in the "after" column also fetches the writing part of the brief, as the new system prompt tells the model to, so the saving there is the artifacts and teaching text it does not need, not the whole brief.

## What is sent per turn

- System prompt: `INSTRUCTIONS` in `packages/server/src/mcp-http.ts`, static text (no date, no path, no per-session data), the same for pi's native agent and for MCP clients.
- Tools: 12 (13 with search by meaning), from `Engine.agentTools()`, in a fixed order. Descriptions and schemas are the engine's.
- Results: `Engine.agentLook()`. Already line-oriented text, not JSON: search returns one id, title, type, description and a snippet line per hit; outline returns description, headings and links without the body; read takes a section.
- The one large item was `brief_base`, which the system prompt said to call first on every task. It returned the folder map plus how notes are kept, how to write and teach, and how to make an artifact: about 1,800 tokens, of which about 1,500 matter only to a task that writes or makes a page.
- History: pi's agent keeps messages whole; `host.ts` compacts by summary when the context nears the window (pi's `shouldCompact`).
- Prompt caching: pi-ai's Anthropic provider already sets `cache_control` on the system prompt, the last tool and the last message, and the host passes a stable `sessionId`. The prefix (system prompt then tools) is static, so the cache holds across turns of a session and across sessions within the cache's lifetime. Nothing volatile sits early in it.

## Before and after

Tokens, calls plus results, per task (the fixed prefix is extra and is cached after the first turn).

| Task | Before | After | Saved |
|---|---:|---:|---:|
| find the note about softening | 2,174 | 328 | 85% |
| summarise leapfrog | 2,250 | 404 | 82% |
| what links to energy-conservation | 2,057 | 211 | 90% |
| add a line to units (with part=writing) | 2,103 | 1,861 | 11% |
| a question needing 3 notes | 3,054 | 1,208 | 60% |

Fixed prefix (system prompt plus tool definitions): 1,860 before, 1,841 after. The tool list did not get smaller overall because `brief_base` gained a `part` argument; `edit_note` and `write_note` gave back what it cost.

## Baselines

| Harness | System prompt | Tool definitions | Fixed prefix | Source |
|---|---:|---:|---:|---|
| isorite (after) | 373 | 1,468 | 1,841 | measured |
| isorite (before) | 345 | 1,515 | 1,860 | measured |
| pi stock coding agent (read, bash, edit, write) | 575 | 682 | 1,257 | measured from node_modules with the same estimator |
| Claude Code | about 2,500 to 3,500 | about 9,000 to 17,000 | roughly 12,000 to 20,000 | published and community-observed `/context` figures, varying by version, before CLAUDE.md, skills and MCP; not measured here, uncertain by a factor of about 1.5 |

Per task on the example base, pi stock costs 167 (find), 208 (summarise), 148 (links), 189 (add a line) and 817 (three notes) tokens of calls and results, as against isorite's 328, 404, 211, 1,861 and 1,208. On an 18-note base of short notes the shell is cheaper: `grep` gives a few lines and a whole note is a few hundred tokens. isorite pays a fixed `brief_base` of about 250 tokens plus the search result's snippets, and it buys a link graph (what links here, outline before body), citations by path and the Atlas's record of what was looked at. The gap shrinks as notes grow, because isorite reads one section and pi's `read` takes the file (up to 2,000 lines). It also ought to shrink for the fixed prefix: isorite's is 46% larger than pi's but 6 to 10 times smaller than Claude Code's.

## What changed

- `packages/server/src/pi/slim.ts` (new): a layer between the engine and both ways an agent is given the tools. `brief_base` answers with the map and the person's AGENTS.md (and the "switched off" notice, and the lent bases), dropping the line on how to look that the system prompt already says; `part=writing`, `part=artifacts` or `part=all` returns the rest. `edit_note` and `write_note` descriptions say once what the engine says twice. A note read whole is cut at about 6,000 tokens with the way to read the rest.
- `packages/server/src/pi/tools.ts` and `packages/server/src/mcp-http.ts`: pass tools and results through `slim.ts`, so pi's native agent and external MCP agents both gain. `/api/agent/look` and the engine are unchanged.
- `INSTRUCTIONS` (in `mcp-http.ts`): tighter, and now says to fetch `part=writing` before writing or teaching, to read a section rather than a whole note, and to answer plainly, point first.
- `bench/tokens/` (new): the bench, the 0.21.6 prompt it compares with, and the baselines.
- `packages/server/test/pi-slim.test.ts` (new): the brief's parts, the refusal notice surviving, the tool list, the cut.

Capability risk: a model that writes a note without fetching `part=writing` loses the frontmatter and linking conventions (the engine still adds frontmatter to a note written without it). The system prompt and the `brief_base` description both say when to fetch it.

## Further ideas, by expected saving

| Idea | Saving | Effort |
|---|---|---|
| Trim old, large tool results in `transformContext` (keep the head, say to re-read), only for results over about 1,500 tokens and older than a few user turns. A changed old message invalidates the cache from there on, so it must be done rarely and in big steps. | large in long sessions | medium, needs care for the cache |
| Move the engine's tool descriptions in `lookup.ts`, `engine.ts` and `writing.ts` to the short forms (not my files: `slim.ts` overrides two). `write_artifact` (215), `artifact_recipe` (142) and `ask_question` (132) are the largest. | 200 to 400 in the cached prefix | low |
| Expose the artifact tools (about 420 tokens of definitions) only when the base has artifacts or the person's message asks for one, as pi does with hidden tool declarations. | about 420 in the prefix | medium; changes the tool list per session, so the cache is per variant |
| Search results: drop the snippet line when the title and description answer, or give one hit's snippet only. | 50 to 100 per search | low, in `lookup.ts` |
| Ask for a one-hour cache (`cacheRetention: "long"`) on Anthropic for sessions that pause between turns. | cost, not tokens: reads at 0.1 times, writes at 2 times | low |
| Validate the estimate against a real tokenizer or the provider's usage field (the host already records `usage`). | accuracy | low |
| `find_similar` and `search_notes` could take a `budget` and return paths and titles only on a big base. | large on big bases | medium |

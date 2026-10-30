# Milestone 25 (draft): isorite beside any agent (MCP and ACP)

Begun 2026-10-30. Lachlan, after the terminal research (`docs/tui-research.md`): isorite's value is the understanding drawn out by the note and the Atlas, while the third element, the agent, is being developed elsewhere at a pace isorite can't keep up with. So isorite stops being an agent and attaches to the one you already use (Claude Code, OpenCode, omp, Codex, Hermes, …): the agent gets the notes, the Atlas sees the agent, and the Iso pane shows the conversation. This comes before install, setup and startup (now M26, `docs/plan-m26.md`), which it changes: with no agent of isorite's own, there is no model or gateway for isorite to set up.

## Decided (2026-10-30)

- **Your agent is yours.** isorite is the notes, the Atlas, and the record of how understanding changed, attached to your harness over **MCP** (the agent reaches isorite) and **ACP** (isorite reaches the agent).
- **Iso's own loop is retired.** isorite no longer calls a model. "Iso" stays as the name of the pane and of a way of working (cite in the sentence, ask a question back, offer text rather than impose it), carried by whichever agent is attached. With no agent attached, the notes, the Atlas and search by meaning work as before, and the pane says how to attach one.
- **`isorite term` and the OpenCode-specific code are replaced by ACP.** OpenCode becomes one ACP agent among others (`opencode acp`). The follower (`terminal.ts`, `term.ts`), `packages/opencode`, the pinned `@opencode/cli` and `isorite opencode` are removed at the end of the milestone, once ACP covers what Build mode does.
- **Tested against:** OpenCode and omp (native ACP), Claude (Zed's adapter, `@zed-industries/claude-agent-acp`), Codex (`@zed-industries/codex-acp`) and Hermes; with the Iso pane and Toad (a terminal app for ACP agents) as front ends.
- **The project's MCP config is offered, then written.** isorite shows the lines it would add (`.mcp.json` for Claude Code, OpenCode's `opencode.json`, and the like) and writes them on a yes, on the page and from `isorite doctor`. You commit them. Nothing is written unasked.

## Three ways in

1. **MCP only, for any harness in its own terminal.** The harness has isorite's MCP address in its project config. Its agent searches, reads and writes notes; the Atlas lights as it reads and grows as it writes; changes are recorded under the agent's name. The Iso pane shows no conversation, only the agent's path.
2. **The ACP wrapper, for any ACP front end (Toad in the terminal, Zed, JetBrains).** The front end runs `isorite acp --agent "<the agent's command>"` as its agent. isorite starts the real agent behind it and passes every message through, so the conversation is live in the front end and in the Iso pane at once. A note dropped on the pane goes into the next prompt; a prompt typed in the pane goes into the same session; a note changed records the question that led to it.
3. **The Iso pane as the front end.** The same wrapper, with the page in front, for anyone who doesn't want a terminal. The agent is chosen in the base's settings (or from the ACP registry).

2 and 3 are one piece of code. 1 is the existing MCP server, brought up to date.

## What the agent gets (MCP)

- **Streamable HTTP, on isorite's server, one address per base:** `http://localhost:4767/b/<name>/mcp`. MCP's July 2026 revision (2026-07-28) is stateless: no handshake or session id, the client's name and version on every request. Roots are deprecated, so the base is chosen by its address, not the agent's folders. `isorite mcp` stays as a stdio bridge to that address, for harnesses that only speak stdio.
- **The tools as now:** `brief_base`, `search_notes`, `find_similar`, `outline_note`, `read_note`, `edit_note`, `write_note`, and the lent bases through `base`. **Added from Iso:** `ask_question` (a question back, standing on the Atlas as a dotted prospect until kept) and `offer_text` (text offered to a note, kept or not by you).
- **Notes as resources** (`isorite://<base>/<note>`), so a harness that offers `@` mentions of resources lets you put a note into the conversation from the terminal.
- **Iso's way of working in the server's instructions:** brief first, follow links before searching again, cite in the sentence as a link to the note (`[phrase](/folder/note.md#section)`, the form the pane already reads), ask rather than supply what you don't know. `read_note` gives the link to cite it by.
- **What it changes is recorded under its name** (from the client's name on each request), with what was asked when the wrapper knows it.

## What the wrapper does (ACP)

Built on the TypeScript ACP SDK (`@agentclientprotocol/sdk`). To the front end it is an agent; to the real agent it is a client.

- **Passes everything through**, both ways, and tells isorite's server each session update (text, tool calls, plans, usage, titles), so the pane draws it live.
- **Adds isorite's MCP to `session/new`**, beside the front end's own servers, at the base's address: no config needed in the agent. (MCP over ACP, a draft, would carry it on the same connection; used when agents support it.)
- **Which base:** the one in the session's working folder (the base inside the repo), or `--base <name>`. A session's base is fixed when it starts.
- **Prompts from the pane** wait until the agent is idle, go into the same session, and are echoed to the front end as the user's message. What was given from the pane (notes, passages) is prepended to the next prompt, from either place.
- **Permissions** are asked in the front end and in the pane at once; the first answer counts, and the other is withdrawn.
- **Notes the agent writes directly** with its own file tools, during a turn the wrapper is carrying, are recorded under the agent's name and the question asked, not as outside changes.

## The Iso pane

- **The conversation from ACP:** M11's terminal view (`TerminalView`, `TerminalTurn`, `TerminalTurns.svelte`) becomes the pane's one view of an agent's session, fed from ACP's updates instead of OpenCode's messages: text grouped by message id, tool calls with their names, titles, diffs and output, plans, permissions with the agent's own options, and elicitation as a form.
- **Kept from M24:** the crystal grows while the agent works; the parts under a reply are the notes it read through isorite (recognised by tool name) and the notes it cited; a cited link is a vein, lit with its note on the Atlas when pointed at, opening it when clicked; a question asked with `ask_question` has its rose "keep" and its prospect on the Atlas.
- **Conversations:** isorite keeps its own record of every session it carried, in `.isorite/conversations/`, so they travel with the base and its provenance holds. The drawer lists them with the agent's own (`session/list`) and resumes one with `session/resume` or `session/load`. A conversation started in the terminal can be carried on in the pane, and back. Old conversations with Iso stay readable.
- **Several sessions:** live sessions on the base appear in the drawer with their crystal growing; the pane follows the one you chose, or the last to start.
- **The Context view, as far as isorite can see:** a layer each for what isorite put in (its instructions, each note read, each note given), one for the rest of the harness's own, sized from ACP's `usage_update`, and the room left. What the harness dropped when it compacted can't be seen.
- **With no agent attached:** the pane says how to attach one (the three ways in, with the commands for this base), and nothing else.

## Steps

1. **The spike (go or no-go).** A wrapper that only passes through and reports, in front of OpenCode and omp, driven from Toad, with the pane drawing it read-only. Three questions: is the conversation live in both places; can a session started in one be carried on in the other; and do the agents cite in isorite's link form when the instructions ask (counted over a set of questions on the example base). If live in both places fails, 3 (the pane as front end) and 1 go ahead without 2's mirror.
2. **MCP brought up to date.** Streamable HTTP per base, to the 2026-07-28 revision; `ask_question` and `offer_text` for any agent; notes as resources; Iso's instructions moved in; the project config offered and written; the stdio bridge.
3. **The wrapper.** Everything above under "What the wrapper does", with a scripted ACP agent (as `packages/opencode/src/scripted.ts` is for OpenCode) so the browser tests run without a model.
4. **The pane on ACP.** The view, the parts, lit links, prospects, the drawer, several sessions, the Context view's strata.
5. **The other agents.** Claude through Zed's adapter, Codex through its adapter, Hermes; the agent chosen from the ACP registry in the base's settings; a note per agent in the guide where it differs.
6. **Retiring.** Iso's loop and what only it used: the turn and its modes (`turn.ts`, `loop.ts`, `iso.ts`, `hand.ts`), the provider and gateway (`provider.ts`, `gateway.ts`, `setup.ts`, config.toml's `[provider]` and `[tiers]`), Iso's writing into a note from the model, and the Context view's switches and summaries. Then `isorite term`, `isorite opencode`, the follower and `packages/opencode`. Search by meaning (`meaning.ts`, `model.ts`) stays: its model runs on the device. The guide, `docs/terminal.md` and `docs/setup.md` are rewritten for the three ways in.

## After M25

- **M26, install, setup and startup** (`docs/plan-m26.md`), revised for what this milestone leaves: no model or gateway in isorite's setup; "`isorite` always opens the terminal" to be decided again, since the terminal is now your harness's.
- **MCP Apps:** the Atlas inside hosts that draw an MCP server's HTML (Claude's apps, VS Code, Goose, ChatGPT). A second door, not a terminal one.
- **Hosts like Tern** (`docs/tui-research.md`): reached through omp's MCP and a browser pane at first; through the wrapper if they host agents over ACP.

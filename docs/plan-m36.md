# M36: the isorite harness, and a deeper MCP route for the user's own

Why: isorite's agent integration has two jobs that want different tools. Building the project is done best in the user's own harness, with their skills, MCP servers and subagents. Building and tending the knowledge base wants an agent that is tied to it: a highlight in a note goes straight into the prompt, the person sees how the agent's words and steps relate to the notes, and what the agent holds in context can be shaped. M35 showed the second can be built on pi and what it costs. This milestone turns the prototype into something a person can use daily, and makes the first job's route (MCP) as good as it can be without owning the user's harness.

## Decided

- Two modes, used together. **Your harness over MCP**: the user's own agent reads and writes the notes through isorite's MCP server, and the Atlas and the pane show what it did. This is one-way and the user keeps all their agentic tooling. **The isorite harness**: an agent that runs inside isorite, for tending the knowledge base, with two-way integration (highlights, chips, context control). The recommended flow runs both at once.
- The isorite harness is native: pi (`pi-ai`, `pi-agent-core`) behind the `PaneSessions` seam, with isorite's own session store, approvals and event model. It is the same code behind a web pane and, later, a terminal interface; both are clients of the same server session.
- Its tools: the base's own note tools always. Project files, read-only (read, grep, find, ls), on by default. Project writes: opt-in. Shell: opt-in and off by default, because the isorite agent is for the knowledge base, not the codebase. Where the shell is on, the settings say plainly that nothing confines it (M35, step 5).
- Credentials: API keys, and OpenRouter's sign-in (it mints a key). No Claude subscription login: Anthropic's terms refuse it for a product like this (M35, step 7). A ChatGPT sign-in is added only after OpenAI's terms are read at the source.
- The existing ACP route (the pane driving the user's own agent, `isorite acp`) is kept, and gets three small additions that ride on the native work and nothing else: chips sent as embedded resources (3b), steers sent through `_session/steering` (6b), and the subagent capability declared so child sessions can be told apart (in step 4). Step 2 found the Claude and Codex adapters support all three. It is not removed in this milestone. It is the only way a Claude subscription pays for work in the pane (terms still open, step 2), so its removal is a separate decision to make once the native harness covers daily use.
- Build on a new branch, `m36-isorite-harness`, off `m35-pi-harness`. The pane seam, the chips and the pi host come with it. Nothing is merged to `main` or pushed in this milestone without the owner's say-so, and `m28-chat` is left alone.
- The first step is verification of the ACP side (adapters and terms), because it decides whether freezing ACP is safe. The swarm display (several agents at once on the Atlas) is a feasibility test only.

## The shape

- One session model, `TerminalView`, read by every client. It gains what pi has and ACP lacks: a message queue (steer and follow-up), thinking, and a compaction marker. The ACP path never fills them.
- `PaneSessions` grows from one session to several for the native agent: list, open, resume, fork, forget.
- A session store of isorite's own holds the model's context between runs (the messages pi needs), apart from the pane's record of turns, which exists already. It lives in isorite's data folder for the base, not in the notes' repository.
- The tray becomes the agent's context for the native harness. Each chip is tagged when it is sent; removing a chip withdraws that block from the next request. This is the thing only an owned loop can do, and it is the reason for this harness to exist.
- Tools come in three tiers, set per base in settings: notes (always), project read (on), project write and shell (off). A guard in `beforeToolCall` enforces the tiers and fails closed, as in M35.
- A terminal interface attaches to the same `/api/terminal` routes and event stream as the web pane. It is a client, not a second agent.
- For the user's own harness: the same MCP server, plus a copy-and-paste handoff that tells the agent which notes to read, and the work to tell agents apart on the Atlas if their clients allow it.

## Found so far (what is already there)

- The pane's ACP side starts an agent chosen from the ACP registry (for Claude, `npx -y @agentclientprotocol/claude-agent-acp`; for Codex `@agentclientprotocol/codex-acp`; OpenCode, omp and Hermes by their own `acp` commands) with the server's environment (`agents.ts`, `detect.ts`).
- In pane mode the wrapper introduces itself as an ACP client with file and terminal access switched off (`fs: false`, `terminal: false`, `acp-wrap.ts`), so the agent uses its own tools, shell included. isorite can only refuse a call by answering a permission request.
- The wrapper adds isorite's MCP server to each new or resumed session when the agent accepts HTTP MCP servers.
- The pane already carries chips from the tray (M35 step 4) and a `PaneSessions` seam (step 2). The pi host (step 3 and after) serves one session at a time, refuses a prompt while busy, drops thinking, and does not keep the model's context between runs (M35 step 6).
- The MCP look-up path takes an agent and session name (`agentLook`), so a call is already shown as a step on the Atlas. Whether real MCP clients supply a name that tells their subagents apart is not known.

## Built so far

### Step 1: the baseline (2026-11-05, branch `m36-isorite-harness` at the plan commit)

- Type checks: kit, server and app all clean (`npm run check`).
- Unit suites: all pass except `model.test.ts` (1 failure, only because the embedding model is installed on this machine; not a regression).
- Browser suite, all four projects, one worker: 235 passed, 22 skipped, 3 failed in 11.7 minutes. The three that failed, `note-menu` (desktop-quartz), `atlas` zoom/drag (phone-quartz) and `note-drag` (phone-quartz), all pass when run alone on both quartz projects, so they are the drag and timing flakes seen before and not new. Later failures outside these are new.

### Step 3: the paste handoff

- `app/src/lib/handoff.ts`: `handoffText(parts, question)` writes the block: a line telling the agent to read what is named with isorite's tools (`read_note`, `outline_note`, `search_notes`, `brief_base`) and not from the message alone, then the notes and folders by title and id, then each passage quoted with its note's title and id, then the question typed in the box.
- The Iso pane now shows the tray's chips when no agent is attached (they were hidden then), with a "Copy for your agent" button under them. It copies the block, with whatever is typed in the box as the question.
- Tests: `handoff.test.ts` (3, the text for nothing, for each kind, for a passage alone) and `handoff.spec.ts` (a passage chosen in a note, copied with no agent attached, read back from the clipboard; Chromium only, on all four projects), with `composer-chips.spec.ts` still passing.
- A passage is quoted as it was when chosen and the block says to read the note for the current text, so an edit made since does not leave the agent holding a stale quote without being told. The ids in the block are the ones `read_note` takes (the pi tests read notes by the same ids).
- Not done: a test with a real or scripted MCP client reading from the pasted text. The plan's check asked for one; the text and the tool ids are verified separately, and what a model does with the block is only known by trying it with a real agent. That is one for the owner to do with their own harness.

### Step 2: what the adapters declare (read from their published packages, not run)

Read on 2026-11-05 from `@agentclientprotocol/claude-agent-acp` 0.101.0 and `@agentclientprotocol/codex-acp` 2.5.0 (both Apache-2.0), fetched with `npm pack` into a scratch folder and read, not run: neither can be driven without a login or key, and there is none here for Claude. So these are claims from source, to be confirmed by a run on a machine that has the agents signed in.

- **Embedded context: both declare it** (`promptCapabilities.embeddedContext: true`, plus images). A chip can go as an embedded resource, with the quoted text kept as the fallback for agents that do not.
- **Steering: both support it, through an extension.** Each advertises `_meta.steering.supported` on initialize and answers a `_session/steering` request that injects a message into the running turn (Claude also has `promptQueueing`). So the earlier claim here that ACP offers "cancel only" is wrong for these two adapters. isorite does not send it today, and the extension is not part of the base protocol, so other agents may not have it.
- **Subagents: both can report each as its own child session**, but only to a client that declares `clientCapabilities.subagents`. isorite's wrapper declares no such capability now (`acp-wrap.ts`). This is the likeliest way to tell a swarm apart on the Atlas, and it changes what step 4 should test.
- **Settings and slash commands:** the Claude adapter loads the user's, the project's and the local settings (`settingSources: ["user", "project", "local"]`), so a user's own CLAUDE.md, skills and MCP config apply, and it sends `available_commands_update` (the user's slash commands among them). Codex lists its own (`/status`, `/mcp`, `/skills`, `/compact`, `/review` and others). Both accept MCP servers over HTTP, which is how isorite's reaches them.
- **Resume:** both declare `loadSession` and the Claude adapter `resume`, `list` and `fork`. The Claude adapter reads Claude Code's own transcripts and uses the Claude session's id as the ACP id, which suggests a terminal session can be listed and resumed through ACP. Not run.
- **Sign-in:** the Claude adapter offers a terminal login (`claude /login`) and gateway methods, and has no login of its own. Codex advertises "ChatGPT, API key, and client-provided custom gateway authentication".
- **Terms are still open.** The Claude adapter is built on the Claude Agent SDK, and Anthropic's page says developers using the Agent SDK should use API keys, while allowing an end user to sign in to the unmodified Claude Code binary. Whether a user's subscription through this adapter, started by isorite, falls on the allowed side is not answerable from the source. It needs Anthropic's reply, or a test of what the adapter does on a subscription login. Until then isorite should not promise subscription use through ACP, and should say that it is the user's own agent and login.

What this changes: ACP is a stronger route than the plan assumed (steering, embedded context, subagent sessions), so freezing it costs more than expected. The decision to build the native harness stands, because only it can promise no shell and withdraw a chip from context, but removing ACP stays off the table.

## Steps

Each step is a commit with its tests, and the plan file is updated with what it found. A step that fails its check is reported, not worked around.

1. **Branch and baseline.** Create `m36-isorite-harness` off `m35-pi-harness`. Run the full server suite and the Playwright suite (all four projects) once, so later failures are known to be new. Done when the baseline results are in this file.
2. **Verify the ACP side and its terms.** Run the real Claude and Codex ACP adapters against an isorite session and record: whether each declares embedded-context support; which settings, MCP config and environment the Claude adapter loads; whether it advertises the user's own slash commands; whether a terminal session can be resumed through ACP or the reverse. Read how the Claude adapter is distributed and signed in, and check Anthropic's and OpenAI's pages (the OpenAI page refused a fetch in M35; use its developer docs or a browser) against it. Done when the answers are in this file and the freeze of ACP is confirmed or reversed with reasons.
3. **The paste handoff.** From the tray, produce a block of text that names the chosen notes, folders and passages and tells an agent to read them through the isorite MCP tools, with a copy button. Works with any agent that has the MCP server attached. Done when a test pastes the block into a scripted MCP client's prompt and the client's reads match the chosen items, and the text is still correct for a passage that was edited since.
3b. **ACP: chips as embedded resources.** Send each chip to an ACP agent as an embedded resource when the agent declared `embeddedContext`, with today's quoted text as the fallback when it did not. Done when a scripted ACP agent that declares the capability receives resource blocks for a note, a folder's note list and a passage, one that does not receives the text, and the pane looks the same either way.
4. **Telling agents apart.** Two routes. Over MCP: connect several clients to the endpoint (the MCP SDK client with different `clientInfo`, and real Claude Code and one other harness if available, with subagents) and record what identity reaches `agentLook`. Over ACP: declare `clientCapabilities.subagents` in the wrapper, and record what the Claude and Codex adapters send as child sessions (step 2 found they do for a client that declares it). Done when the file states, per client and per route, whether subagents are distinguishable. If they are, a later step shows one route set per agent; if not, the display says "an agent" and this step ends there.
5. **Keep the model's context.** A session store for the native agent: write the messages after each turn, load them on resume, and rebuild the pane's turns from them where the record is missing. Done when a restart of the server resumes a pi session and a test shows the model still has the earlier turns; a corrupted store is reported, not silently dropped.
6. **Queue and steer.** Add a message queue to `PaneSessions` and `TerminalView`: a prompt sent while busy joins as a follow-up by default, and a steer is sent explicitly, with an item that shows it was queued and when it landed. Done when scripted tests send a steer during a tool run and a follow-up after it, and the pane shows both in order.
6b. **ACP: steering.** Where the agent advertises `_meta.steering.supported`, a steer sent during a turn goes through `_session/steering` and shows in the same queue item as the native agent's; where it does not, the pane offers cancel and re-send only, and says why. Done when a scripted agent that supports it receives the steer mid-turn and one that does not is never sent the request.
7. **Thinking and compaction.** Add a thinking item (collapsed by default) and a compaction marker. The host checks `shouldCompact` between turns and calls `compact` through the chosen model, then marks where the context was shortened and shows the size meter. Done when a scripted long session compacts and a test shows what the marker says; one real-model run, with its cost, confirms the summary reads sensibly.
8. **Models and keys.** A settings section to choose provider and model, enter a key or sign in with OpenRouter, and see which are configured. Keys go to a credential store in isorite's data folder (owner-only permissions), never into the base or the repository, and never into a log. Done when a key entered in the settings is used by the next turn, removed on request, and absent from the base, the repository and the test logs.
9. **Tool tiers.** Settings for the three tiers with a line under each saying what it promises and what it does not. Project read on by default; write and shell off. Done when tests show a default session cannot change a file by any tool it holds, and the settings for write and shell say in words that a shell is not confined and name the ways to confine it.
10. **Context from the tray.** Tag each given block with the chip it came from. Removing a chip withdraws its block from later requests (the earlier turns stay as history, marked withdrawn). Dragging a note or a passage into the box adds a chip. Done when a test removes a chip and shows the next request no longer carries the block, and the pane shows the difference.
11. **Several sessions.** The native agent keeps a list of sessions, opens one, forks, forgets, and resumes after a restart. Done when the pane switches between two sessions with their own turns and cost.
12. **Use it for a week.** Before any terminal interface, the owner uses the native pane for real work for a week or so, with a short list of what failed or annoyed. Done when the list is written in this file and sorted into fix now, later, and never.
13. **A terminal interface, a spike.** Decision gate after step 12: choose a library (pi's own terminal library or OpenTUI) by building the smallest client that shows the `TerminalView` and sends a prompt with a note mention, against the same routes. Done when the spike and a recommendation are written. This step happens only if step 12 says the native pane is worth continuing.
14. **The result.** What worked, what did not, what it cost to keep, and a recommendation for the next milestone: whether ACP is removed, whether the terminal interface is built, whether the swarm display is built.

## Acceptance

- A highlight in a note goes into the isorite agent's prompt as a chip, the agent answers from it, and the person sees which notes it read and changed in the pane and on the Atlas.
- A person using their own harness can paste one block and have it read the notes they chose, and what it reads shows in isorite.
- The native agent resumes after a restart with its earlier turns, can be steered or followed up while it works, shows its thinking and its compaction, and lets the person remove a chip from its context.
- By default the isorite agent cannot change a project file or run a command, and the settings say exactly what turning each on allows.
- No credential is in the base, the repository or a log.

## To verify

- Everything listed in step 2.
- What identity real MCP clients send for subagents (step 4).
- Whether OpenAI's "Sign in with ChatGPT" is open to an app that is not a listed partner, and on what terms.
- Where the session store should live so that it follows the base to a second machine or does not, and what the person expects of either. The default is isorite's data folder per base, not carried.
- Whether pi's session tree is worth using for forks (step 11) or isorite's own store is simpler.
- Whether `pi-agent-core` and `pi-ai` alone are enough for the read-only project tools, or `pi-coding-agent` is needed for them (weight: about 7 MB against about 64 MB).

## Risks

- Owning an agent is a long-term cost that version 0.13 chose to remove. Steps 5 to 11 are most of it. The one-week use in step 12 is the check that the cost is paid for.
- Claude models need API keys. People who want their subscription to pay will use the MCP route with their own harness, or the frozen ACP route. The first run needs a key before the pane works; OpenRouter's sign-in is the easiest start.
- Two agents writing one note can collide. The history keeps who changed what and can restore it, but a tester should be told, and step 12 should look for it.
- Pi still changes. Exact versions stay pinned; pi types stay inside `src/pi/`.
- A shell cannot be confined by this process. Anything that says "read-only" while the shell is on is wrong.
- Credential storage is a new place for a secret to leak. Step 8's check covers the repository, the base and the logs.

## Not in this milestone

Releasing, merging to `main`, or touching `m28-chat`. Removing the ACP route, or giving it more than the three additions above. Context language models. A swarm display on the Atlas beyond step 4's test. A new Atlas layout. Marking reads on the map beyond what exists. An extension for omp or pi. A Claude subscription login of any kind.

# M35: an isorite harness on pi, a prototype

Why: a highlight in a note cannot reach an agent running in the user's own terminal, and isorite cannot see or shape what that agent does. Over MCP the agent only pulls; over ACP isorite hosts the session but cannot enforce, steer mid-run or shape context. Owning the loop is the only route that gives the live, two-way integration. This is a time-boxed spike to find out whether pi is a dependable base for it. It is not a release, and `m28-chat` is not touched or merged.

## Decided

- Build on `@earendil-works/pi-ai` and `@earendil-works/pi-agent-core` plus the exported tool factories (`createReadTool` and the rest) from `@earendil-works/pi-coding-agent`. Write the session store, approvals and event model in isorite. Not `createAgentSession()`: it brings the TUI-shaped app and its dependencies. If the spike shows that is a mistake, the fallback is to try the SDK for half a day and compare.
- The prototype lives on a new branch off `main`, `m35-pi-harness`.
- The first thing to show is the highlight loop: select text in a note, send it as a chip into the composer, ask, and watch the pi session answer in the Iso pane.
- Pin exact pi versions, wrap pi behind one isorite interface (`Driver`), and do not import pi types outside that folder.
- API keys only in the prototype. Subscription logins are a research step, not a promise (below).

## The shape

- One session model of isorite's own, a superset of ACP's session updates: messages and thoughts, tool calls with their state, plans, permission requests, and also what ACP lacks and pi has: steering and follow-up queues, compaction, usage and cost, and the session tree with branches. The web UI reads this model only.
- A `Driver` produces it. Two drivers are planned: `pi` (this milestone) and `acp` (what isorite does today, mapped onto the same model). MCP stays as the way a user's own harness reads and writes notes.
- The session lives in the isorite server. The web UI attaches to it as a client, so a second client (a later TUI, or a phone) can attach to the same session.
- Isorite's note tools are written once and back both the MCP server and the in-process pi tools.
- Context is assembled in `transformContext`. The first version only adds the sent chips and the open note; the point is that the seam exists.

## Found in step 1 (what is already there)

- `m28-chat` is one commit, chat in the Iso pane over GitHub and GitLab threads (`ChatPane.svelte`, `packages/server/src/chat/`). It is not an agent chat and does not cover this. It also edits `IsoPane.svelte`, so expect a merge to touch the same file; it stays unmerged.
- A session model exists, in `packages/engine/src/api.ts`: `TerminalView` (agent, session, busy, turns, asking, cost, tokens, model, context size, commands, settings, sessions), `TerminalTurn`, `TerminalItem` (text, tool with status and diff, question, offer) and `TerminalPermission`. It is ACP-shaped. It has no steering or follow-up queue, no compaction event, no branches.
- The model is built in `packages/server/src/acp.ts` by `AcpFollower` (659 lines), which folds raw ACP messages that pass through `isorite acp` (`acp-wrap.ts`, 303 lines) into `TerminalView`. With `--pane` the server starts the agent itself from the base's settings (`agents.ts`, with the ACP registry); without it, a front end such as Toad or Zed runs the wrapper and isorite taps it. The pane's commands (prompt, cancel, permission, give, open, list, set) go back through the wrapper.
- A passage already goes to the agent: `Given` has a `passage` kind, the tray (`tray.svelte.ts`) holds what is sent, and `given()` renders it as quoted text before the next prompt. What is missing is the chip in the composer and a driver that is not ACP.
- Sessions are kept as `AgentRecord` files (`AgentSession`: live, the agent's own, kept). Iso's old loop (retired in 0.13) left `engine/turn.ts`: modes `ask`, `write` and `build`, and permission items, which map onto the enforcement switches.
- So the model is not new work. The new work is a `Driver` interface taken out of `AcpFollower`, a pi driver that fills the same `TerminalView`, and the extensions the model lacks.

## Built so far

- Step 2: `PaneSessions` (`packages/server/src/sessions.ts`), implemented by `AcpFollower`; the pane's routes and event stream serve any host (`createApp({ terminal })`). Test: `pane-sessions.test.ts`.
- Step 3: `packages/server/src/pi/` (`host.ts`, `tools.ts`, `index.ts`): a pi agent (`pi-ai` and `pi-agent-core`, pinned 1.5.0) serving the pane, chosen with `ISORITE_PI=<provider>/<model>`, with the base's tools shared through `agentTools` and `agentLook`, permission asking through `beforeToolCall`, and stop. Test: `pi-host.test.ts` (pi's faux provider, no network). Not yet tried with a real model. Gaps: the model's context is not kept between server runs (only the pane's view is); no steering, follow-up queue, compaction or branches in the view; a prompt while it works is refused; the provider SDKs make the install heavy.
- Step 4 (in part): chips in Iso's box for what is in the tray (note, folder, passage), removable, faint once given to the session (`IsoPane.svelte`). Test: `composer-chips.spec.ts`. Not done: the ACP embedded resource (the quoted-text fallback stays for ACP until the adapters' support for it is checked; pi gets it as part of the message).

- Step 5: pi's own file and shell tools behind switches (`ISORITE_PI_FILES=read|write`, `ISORITE_PI_SHELL=1`; `packages/server/src/pi/files.ts`), with a guard the host runs before every call and refuses on when it cannot decide. Tests: `pi-reach.test.ts` (scripted, real tools in a temporary project), and by hand against a real model (`anthropic/claude-haiku-5.5` through OpenRouter, a few tenths of a cent a run).

### What step 5 found

- By default the agent has the base's tools alone. What is left out is not there: a call to it fails with "Tool write not found", and a real model, asked to make a file with only read access, said it could not and why. No file was made.
- `read` holds the agent to the project folder: a path outside it (relative or absolute) is refused by the guard before it runs. `write` adds edit and write, still inside the project, and never into `.git`.
- With `shell` on, nothing confines it. Scripted and with a real model: `bash` wrote inside the project, wrote outside it, and read a file outside it, with files set to `read`. The real model reached for bash at once when asked to create a file. So "read-only" can be promised only without the shell tool, or with the process itself confined (a container or a dedicated user), which is pi's own advice too.
- Asking before bash (`ISORITE_PI_ASK=bash`) works as a gate: a refusal through the pane runs nothing. It is a prompt, not a boundary: an answer of "always" lets every later call through.
- The base's own tools follow the base's notes switch (what `agentTools` offers), not these.
- Cost: `pi-coding-agent` (pinned 1.5.0) adds about 57 MB to node_modules, over the 6.7 MB of pi-ai. `npm audit`'s one high advisory is `markdown-it`, already there before pi.

- Step 6: the loss check, as `pi-loss.test.ts` (scripted, no network): the same loop run on pi's faux provider, pi's events compared with the pane's view.

### What step 6 found

- Thinking is lost. Pi streams the model's reasoning (`thinking_delta` in `message_update`); the host folds only text, so none reaches the view. `TerminalItem` has no kind for it. Showing it needs a new item kind and a place in the pane that does not crowd the answer.
- A cancel while a tool runs works. The tool is handed pi's abort signal, hears it, and the turn ends `stopped` with the tool item `failed`, well inside two seconds. This holds for a tool that honours the signal; one that ignores it (a blocking call) would hold the stop until it returns, which is the weakness the omp write-up names.
- A steer reaches the model. `agent.steer(...)` queued during a tool run arrived in the model's next request, and pi emits it as a user message. The host has no `steer` method, refuses a prompt while busy, and has no branch for a user message, so a steer cannot be sent from the pane and would not be shown. `PaneSessions` has no queue to put it in. Follow-up (run after it would otherwise stop) is the same.
- Compaction is not an event. Nothing in `pi-agent-core` says a context was shortened. `pi-coding-agent` offers `shouldCompact` and `compact` (a model call that writes the summary), which the host would have to call between turns and then tell the view about; the view has no item for "context was summarised here", and the model's context is not kept between runs anyway (still open from step 3).
- Not tested here, and so unknown: a real model's thinking from a provider (faux only), compaction through a real model, and branches (pi's session tree is unused).
- What the view would need, in order of value: a steer/queue entry in `PaneSessions` with an item for it, a thinking item, a compaction marker. All three are additions to `TerminalView` that the ACP path would simply never fill.

- Step 7: the subscription-login research, written below.

### What step 7 found

Read on 2026-11-03. The Anthropic page is the primary source (Claude Code's "Legal and compliance"); the OpenAI answer is from reporting and pi's own docs, because openai.com refused the fetch (403), so it is not confirmed at the source.

- **Anthropic: not for a product like this.** The page says OAuth "is intended exclusively for purchasers of Claude Free, Pro, Max, Ultra, Team, and Enterprise subscription plans and is designed to support ordinary use of Claude Code and other native Anthropic applications". Developers building products, "including those using the Agent SDK, should use API key authentication", and Anthropic "does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on behalf of their users", nor to "collect, store, or intermediate Claude.ai credentials or session tokens". It reserves the right to enforce this without notice, and reporting says server-side blocks on third-party tools began in January 2026. The one clear allowance is the unmodified Claude Code binary, signed in by the end user.
- **What that means for isorite.** An isorite harness on pi would have to use API keys (Claude Console, Bedrock, Vertex, or OpenRouter) for Claude models. Pi ships an Anthropic subscription login (`anthropicProvider` with OAuth); isorite should not enable it or document it, since that is the use the page refuses. The existing ACP route, where the user's own Claude Code runs unmodified, stays within the terms and keeps subscription users. That is a real reason to keep ACP/MCP and not replace it.
- **OpenAI: allowed, as reported.** OpenAI's "Sign in with ChatGPT" is reported to let Plus and Pro subscribers use their plan in third-party tools, with per-app weekly caps the user sets, and a launch list of partners that includes OpenCode. Pi's README lists it as a provider login (with an older Codex login marked legacy). Whether an app unlisted as a partner may use it, and on what terms, is not confirmed; check OpenAI's developer docs before relying on it.
- **Others in pi:** GitHub Copilot login, and OpenRouter's OAuth, which mints a user-controlled API key (so it is a key, not a subscription).
- **Consequence for the choice in step 8.** Cost to the user would be API pricing for Claude models, with ChatGPT-plan use possible for OpenAI models. People who want their Claude subscription to pay for the work can only do it through Claude Code itself, i.e. the ACP route.

## Steps

1. Done: see the findings above.
2. Take a `Driver` interface out of `AcpFollower` (connect, prompt, give, reply, cancel, set, follow, fresh) and extend `TerminalView` with what pi has and ACP lacks (queues, compaction, branches); keep what the user sees unchanged, and run the existing ACP tests (`acp.test.ts`, `acp.spec`) to prove it.
3. Add the `pi` driver: an `Agent` with a slim isorite tool set (read, write and search notes, follow links) and pi's read, edit and bash tools behind switches. Stream events into the model. Persist the session as a JSONL tree in the base's own folder.
4. The composer: show the tray's items as chips in the composer (note, folder, passage), removable, and sent as a block in the prompt. Both drivers receive them: pi as part of the user message, ACP as an embedded resource with today's quoted text as the fallback.
5. Enforcement check: with the edit switch off and bash left out, confirm that a prompt asking the agent to change a file cannot change it, by any tool. With bash left in, show that it can, and write that down; this decides what "read-only" is allowed to promise.
6. Done (see above). Loss check: run a long turn with a steer, a compaction and a tool cancel through the model, and compare what pi emitted with what the UI could show. List what is lost.
7. Done (see above). Research step: whether the providers allow third-party harnesses to use subscription logins, and what pi supports. Write the answer in this file.
8. Write the result: what worked, what did not, what it would cost to keep, and a recommendation (build on pi, borrow ideas, or stop).

## Acceptance for the spike

- Select text in a note, press send, and the chip appears in the composer; asking a question gets an answer that uses the selection, with pi as the driver and with ACP as the driver.
- The same UI shows both sessions, with no code in the UI that names a driver.
- A read-only configuration that cannot change files through any tool it has been given, and a note of exactly what it cannot promise.
- A written list of what pi's events lose when carried by the session model, empty or short.
- The Atlas shows nothing new yet; marking what the agent read on the map is later work.

## To verify, from the comparison document

- Which settings, MCP config and environment the Claude ACP adapter loads in an isorite session.
- Whether that adapter advertises the user's own slash commands.
- Whether each adapter declares embedded-context support, which decides between an embedded resource and the text fallback.
- Whether a terminal Claude Code session can be resumed through ACP, or the reverse.
- pi's `steer()` is settled: it enters after the current assistant turn and its tool calls and does not interrupt a running tool; `abort()` stops the run. A `tool_call` handler can block (`{ block: true, reason }`); failing closed is up to the handler.

## Risks

- Pi still changes: its package scope has been renamed, 1.5.0 has a breaking change, `pi-durable` is experimental. Mitigation: pinned versions and the `Driver` boundary.
- No approval model and no isolation in pi: both are ours to build, and "read-only" is only as strong as the tools and the process allow.
- Cancellation is cooperative (`AbortSignal`). Long shell commands need a process that can really be killed; the prototype notes where it falls short.
- Owning an agent again is a long-term cost that version 0.13 chose to remove. The spike's last step must say plainly whether the gain justifies it.

## Not in this milestone

A terminal interface (pi-tui or OpenTUI), context strategies beyond the seam, marking reads on the Atlas, the terminal-agent "received" line, an extension for omp or pi, and any release or merge of `m28-chat`.

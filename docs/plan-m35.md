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

## Steps

1. Read `m28-chat` and the current Iso pane, and write down what already covers the session model, the composer and the event stream. Nothing is built in this step. If a lot is there, the plan shrinks.
2. Define the session model and the `Driver` interface; map today's ACP session onto it without changing what the user sees. This proves the model carries what the UI needs before pi is involved.
3. Add the `pi` driver: an `Agent` with a slim isorite tool set (read, write and search notes, follow links) and pi's read, edit and bash tools behind switches. Stream events into the model. Persist the session as a JSONL tree in the base's own folder.
4. The composer: chips for a selection (note, range, text), shown and removable, sent as a block in the prompt. Both drivers receive them: pi as part of the user message, ACP as an embedded resource, with a text fallback.
5. Enforcement check: with the edit switch off and bash left out, confirm that a prompt asking the agent to change a file cannot change it, by any tool. With bash left in, show that it can, and write that down; this decides what "read-only" is allowed to promise.
6. Loss check: run a long turn with a steer, a compaction and a tool cancel through the model, and compare what pi emitted with what the UI could show. List what is lost.
7. Research step: whether the providers allow third-party harnesses to use subscription logins, and what pi supports. Write the answer in this file.
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

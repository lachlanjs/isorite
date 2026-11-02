# Milestone 27: the agent as you choose it, and where isorite's files live

Begun 2026-11-02, after Lachlan set up isorite fresh beside omp (`isorite-test`), as a new user would. What was found: attaching an agent was a form (a registry dropdown, a command box), conversations could not be removed, switching agent meant knowing where to look, and what was typed in the terminal never showed in the pane. This milestone is the first pass at those, and at one question that came up on the way: whether `.isorite/` belongs in a shared project's repository.

M26 (install, setup and start: `isorite` alone finds and opens the base, agents are found on the PATH) landed on `main` while this was built on the code before it; M27 was merged with it, using M26's detection and `isorite`'s start for the question below.

## What was found, and why the terminal and the pane do not share a session

- The pane's agent ("use it") is a second process, `omp acp`, with a session of its own. A plain `omp` in a terminal is a different process. isorite's MCP reaches both, so both know isorite; neither sees the other's conversation. ACP joins a front end to an agent: it can't join a terminal program that is front end and agent in one.
- **Live in both places needs one agent process behind both**: an ACP front end running `isorite acp <agent>` (Toad, Zed, JetBrains, or Tern's `tern acp`, not yet tried). The M25 spike showed it works, both ways.
- **Carrying on** works without that: the drawer lists the agent's own sessions (`session/list`), so what was done in the agent's terminal can be opened in the pane. Not live; resumed.
- Plugins inside an agent could do more (OpenCode's server was how the retired follower did it), at the cost of code per agent. Not done: ACP stays the one way in, and per-agent plugins are for later, where the native interface matters.

## Decided

- **Three ways to use isorite, easy to move between**: in the agent's own terminal (MCP only; the preferred way), in the Iso pane (ACP, started by isorite), and with no agent (the notes, the Atlas, search by meaning). A fourth, isorite's own agent, may come later, as one more ACP agent and not a special path.
- **isorite runs no git to change anything.** It reads (does the project track `.isorite/`?), asks once, and gives the commands to copy. The answer is the machine's (`history` in `bases.toml`).
- **Removing a conversation removes isorite's copy only.** The agent's own history is never touched, and a live session is not removed from under its agent.

## Built

- **The agent picker** (`AttachAgent.svelte`): a card for each agent isorite knows by name (Claude Code, OpenCode, omp, Codex, Hermes), found on this machine or not, with M26's note of whether the key it reads is set (`GET /api/acp/detected`, `detect.ts`: looks on the PATH and for key names, runs nothing; extended here to list those not found as well). *Use in this pane* starts it; *in my terminal* gives the MCP address, and for live sharing the line to run in an ACP front end. *Another agent* is the registry and a command of your own. In the drawer, *change agent* is the same; the header's chip names the agent attached and opens it.
- **`isorite acp <omp|opencode|claude|codex|hermes>`** as the short form of `--agent "<command>"`; a folder of that name here is the notes.
- **Removing**: a kept session (`POST /api/acp/forget`, the engine's `deleteAgentRecord`), and one of Iso's old conversations (`deleteConversation`), each with a confirm in the drawer.
- **The agent's own controls in the pane**: its slash commands (`available_commands_update`) offered as `/` is typed; its modes and options (the model) set from selectors over the box (`session/set_mode`, `session/set_config_option`; the agent's answer settles them). Sessions from the agent's own terminal are labelled so, and carried on from the drawer.
- **Where isorite's files are kept** (`own-repo.ts`, `OwnFiles.svelte`): in a git project, the question follows a base made by `isorite` (M26's start, `start.ts`'s `made`) or by `isorite new`, at a terminal, and the app asks in the empty pane and the drawer: with the project (as before), or apart. Apart gives the commands: `git init` in `.isorite/`, its line in the project's `.git/info/exclude`, a first commit; and, where the project already tracks it, the `git rm --cached` first. Then, for a remote, `git remote add` and `push`. `isorite doctor` says the same.
- Tests: the scripted agent offers commands, a mode and a model; `acp.test.ts` and `acp.spec.ts` set them from the pane; `own-repo.test.ts` runs the commands it gives and checks the project then does not see `.isorite/`; the engine tests remove one session and one conversation alone.
- One flaky browser test, found on the way, made steady: `acp.spec.ts` hovered a part while the box's settings arrived and moved it; it now hovers again until it takes.

## Looked at: Tern

Tern is Stencil's "neoterminal" (closed beta; Stencil's account to sign in). Read from the strings inside its Linux build (0.9.9), not run: a session daemon that keeps panes' programs alive between windows (as tmux does); `tern web serve` for a browser client and `tern remote` for other hosts (a relay by endpoint id, UDP 8376); a CLI to script sessions (`ls`, `send`, `capture`, `events`); plugins in Luau, whose agent calls read an omp session's chat and queue a prompt; and `tern acp`, with the ACP registry, so it is an ACP front end. What that may mean for isorite, to be tried when the beta is at hand: `isorite acp omp` behind `tern acp` for the live session; a plugin reading omp's transcript into the pane for the native one; the browser and phone clients as another way to reach a session isorite also shows.

## Left

- Toad and Tern detection, and the command each is started with (not verified, so not guessed).
- A first-run checklist (agent, project config, search model) in place of three separate places.
- Per-agent one-liners for adding isorite's MCP (`claude mcp add …`), once checked against each agent.
- A hint in the pane when an agent's model fails (a free model that cannot call tools was the first case seen).
- isorite's own agent, as an ACP agent; and per-agent plugins for a live native terminal.

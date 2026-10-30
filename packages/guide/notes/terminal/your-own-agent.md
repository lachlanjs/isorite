---
type: Concept
title: Your own agent
description: Claude, Codex, OpenCode, omp, Hermes or any agent that speaks ACP, attached to a base, and how each differs.
---

isorite attaches to the agent you already use. It reads your notes and cites them; the notes it reads light on the Atlas; what it changes is marked as its own, as [Iso's changes are](/iso/iso-writes-marked.md "uses"). There are three ways in:

- **Here, in Iso's pane.** With no conversation yet, choose an agent of the [ACP registry](https://agentclientprotocol.com/get-started/registry) or give an agent's command, and isorite starts it for this base. Ask it in the pane. It runs on your machine, in the base's repository, set up as it is for its own terminal (its key, its model).
- **From an ACP front end** (Toad in the terminal, Zed, JetBrains): give it `isorite acp --agent "<the agent's command>"` as its agent. The conversation is live in the front end and in the pane at once, asked from either.
- **In the agent's own terminal**: give it isorite's MCP in the project's config; the pane offers the lines and writes them when you say so. Only what it does through isorite's tools is seen.

Notes in the tray go before the next prompt, from either place. Sessions isorite carried are kept with the base, and listed in the pane's drawer with the agent's own, and with Iso's conversations from before isorite attached your agent, to read. It is given the base's [AGENTS.md](/iso/agents-md.md "uses"), and with [a memory](/terminal/memory.md "see also") lent to it, it remembers across projects.

What it may do in the project around the base, edit its files and run commands, is set by the [switches](/atlas/the-switches.md "see also") in Iso's pane: what it asks to do that is switched off is refused.

## How each differs

- **Claude** (`@agentclientprotocol/claude-agent-acp`): looks through isorite's tools and cites in isorite's form. It asks before each of isorite's tools until you answer *always*, or allow `mcp__isorite` in its settings. Its key and model are its own (`ANTHROPIC_API_KEY`, or a gateway with `ANTHROPIC_BASE_URL`).
- **Codex** (`@agentclientprotocol/codex-acp`): asks to be signed in first. Started from the pane, isorite signs it in with its API key (`CODEX_API_KEY` or `OPENAI_API_KEY`); with ChatGPT's sign-in, sign in from a front end or its own terminal. A provider of your own goes in `~/.codex/config.toml`. Its calls to isorite's tools show as commands.
- **OpenCode** (`opencode acp`) and **omp** (`omp acp`): mostly read the Markdown files with their own tools; isorite counts a file of the base read as the note read. OpenCode sends no titles: a session's comes from its list.
- **Hermes** (`hermes acp`, not in the registry: give its command): reads the files with its own tools too, and says only when a tool began, so a read counts when its turn ends. It is given isorite's tools but not told how to cite, so its answers seldom link to a note. Its model is set in `~/.hermes/config.yaml`.

An agent can write a link to a note in its own way (`physics/units.md`, a path on disk): when its turn ends, isorite puts each link to a note that is there in its own form, so it lights and opens as any other.

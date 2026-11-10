---
type: Concept
title: Your own agent
tags: [agent, setup]
description: Claude Code, Codex, OpenCode, omp and others, connected to a base over MCP, and how each differs.
---

isorite has two ways to use an agent. Its own, in the Agent pane, needs only a model's key (or your company's gateway): choose *Use isorite's agent* and set a provider, a key and a model. An agent you already use connects over MCP, in its own terminal: `isorite setup` finds it and writes the project's MCP config, which you commit with the project; its key and model stay its own. It reads your notes and cites them; the notes it reads light on the Atlas; what it changes is marked as its own, as [the agent's changes are](/agent/agent-writes-marked.md "uses"). Only what it does through isorite's tools is seen, and its conversation stays in its terminal.

Notes in the tray go before the next prompt of isorite's own agent. Its sessions are kept with the base and listed in the pane's drawer, with the built-in agent's conversations from before, to read. Both are given the base's [AGENTS.md](/agent/agents-md.md "uses"), and with [a memory](/terminal/memory.md "see also") lent to them, they remember across projects.

What it may do in the project around the base, edit its files and run commands, is set by the [switches](/atlas/the-switches.md "see also") in the Agent pane: what it asks to do that is switched off is refused.

## How each differs

- **Claude Code** looks through isorite's tools and cites in isorite's form. It asks before each of isorite's tools until you answer *always*, or allow `mcp__isorite` in its settings.
- **Codex** is given the MCP server by one command, which `isorite setup` prints.
- **OpenCode** and **omp** mostly read the Markdown files with their own tools, which isorite does not see: ask them to use isorite's tools.

An agent can write a link to a note in its own way (`physics/units.md`, a path on disk): when its turn ends, isorite puts each link to a note that is there in its own form, so it lights and opens as any other.

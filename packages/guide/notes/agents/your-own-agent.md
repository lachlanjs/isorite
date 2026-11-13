---
type: Concept
title: Your own agent
tags: [agents, setup]
description: Claude Code, Codex, OpenCode, omp and others, connected to a base over MCP, and how each differs.
---

isorite has two ways to use an agent. Its own, in the Agent pane, needs only a model's key (or your company's gateway): choose *Use isorite's agent* and set a provider, a key and a model. An agent you already use connects over MCP, in its own terminal: `isorite setup` finds it and writes the project's MCP config, which you commit with the project; its key and model stay its own.

Either reads your notes and cites them; the notes it reads light on the Atlas; what it changes is [marked as its own](/editing/every-change-is-kept.md "uses"). Only what an MCP agent does through isorite's tools is seen; its conversation stays in its terminal. Both are given the base's [AGENTS.md](/agents/agents-md.md "uses"), and with [a memory](/bases/memory.md "see also") lent to them they remember across projects. What either may do in the project around the base is set by the [switches](/general/the-switches.md "see also").

## How each differs

- **Claude Code** looks through isorite's tools and cites in isorite's form. It asks before each tool until you answer *always*, or allow `mcp__isorite` in its settings.
- **Codex** is given the MCP server by one command, which `isorite setup` prints.
- **OpenCode** and **omp** mostly read the Markdown files with their own tools, which isorite does not see: ask them to use isorite's tools.

In [herdr](/agents/herdr.md "see also"), an agent runs in a terminal that keeps running, and isorite's own agent is listed beside it.

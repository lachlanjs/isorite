---
type: Concept
title: isorite in herdr
tags: [agents, setup]
description: Running Claude Code or Codex in herdr with isorite's MCP, and isorite's own agent shown in herdr's list of agents.
---

[herdr](https://herdr.dev) runs agents in terminals that keep running when its window closes, and lists them by what they report: working, blocked on you, done. It reads only what each program says of itself, through an escape code (OSC 7501), not the screen.

An agent of your own runs in a herdr terminal as in any other, and reaches your notes over isorite's MCP: run `isorite setup` once in the project, then start Claude Code or Codex there. Start Codex as `codex --no-daemon`, or its commands run outside herdr's terminal. What it reads and changes through isorite's tools shows on the Atlas, as from [your own agent](/agents/your-own-agent.md "uses") anywhere.

Run `isorite serve` in a herdr terminal too, and it reports [the agent in the pane](/agents/the-agent-pane.md "uses") to herdr: working while a turn runs, blocked while it waits for you to approve a tool, done when the turn ends, idle when you stop it. It shows in herdr's list under `isorite`, beside your other agents, so a turn left running in the browser is not forgotten.

isorite reports only in a terminal herdr started, never in another terminal or into a file. `ISORITE_HERDR=0` turns it off.

`integrations/herdr/` in isorite's repository has a script that opens a herdr space with your agent and `isorite serve` side by side.

# isorite in herdr

[herdr](https://herdr.dev) runs coding agents in terminals that stay alive after the window closes, and shows which of them are working, which need you and which are done. It reads that from each program's own reports, OSC 7501 (the [Program Status Protocol](https://www.superlogical.com/rex/docs/build/program-status)), never from the screen. herdr is two parts: herdr-core (`hc`), the server that runs the terminals, and Herdr, the window over it.

isorite fits in two ways. An agent of your own (Claude Code, Codex) runs in a herdr terminal and reaches your notes over isorite's MCP, as in any terminal. And `isorite serve` run in a herdr terminal reports its own agent's turns to herdr, so the Agent pane's agent shows in herdr's agent list beside the others.

## A space for a project

`isorite-space.sh` opens a space in the Herdr window with your agent on the left and `isorite serve` on the right:

```sh
isorite setup                                        # once: writes the project's MCP config for your agents
sh integrations/herdr/isorite-space.sh notes         # Claude Code beside isorite serve notes
sh integrations/herdr/isorite-space.sh notes codex   # Codex instead (started with --no-daemon, as herdr needs)
```

Herdr's layouts (`~/.config/herdr-app/layouts/*.json`) arrange the window's chrome, not which programs run, so the space is made with `herdr-app do`, which is how herdr scripts it.

Without the window, herdr-core alone does the same:

```sh
hc run --bg --name notes isorite serve notes
hc run --bg --name agent claude
hc ls                                                 # isorite shows its agent's word: idle, working, blocked, done
hc attach agent                                       # Ctrl+\ leaves it running
```

## What isorite reports

Only in a terminal herdr-core started (it sets `HC_TERMINAL_ID`), and only when isorite's output is that terminal; never in another terminal or a pipe. `ISORITE_HERDR=0` turns it off. One root record, `app=isorite`:

| isorite's agent | report |
|---|---|
| no turn yet | `state=idle` |
| a turn running | `state=working`, msg: the first line of what was asked |
| waiting for you to approve a tool | `state=blocked:kind=permission`, msg: what it would do |
| the turn finished | `state=done`, msg: what was answered |
| you stopped it | `state=idle` |
| the turn failed | `state=error` |

A server with several bases reports one word for all of them: blocked if any is waiting for you, else working if any is working.

isorite's agent never asks you a question in the terminal (its questions are notes on the Atlas), so `kind=question` is not sent. An agent of your own reports its own status to herdr, where it supports the protocol; isorite adds nothing to it.

## Names in Herdr's list

Herdr names a program from its table; to give isorite a tile of its own, add it to `~/.config/herdr-app/programs.json`:

```json
{ "programs": { "isorite": { "name": "isorite", "tile": "#2f3b52" } } }
```

# isorite beside your agent

How to use isorite with an agent on a project of your own. There are two ways, and no others: **isorite's own agent**, in the Agent pane (a model's key or your company's gateway, nothing else to install: [setup.md](setup.md)), and **an agent you already use** (Claude Code, Codex, Gemini CLI, Cursor, VS Code, OpenCode, omp), in its own terminal, given your notes over MCP. The agent's key and model are its own, set up as for its own terminal; the Atlas sees what it reads.

Setting isorite up the first time is in [setup.md](setup.md).

## Your notes for the project

Keep the project's notes in a folder of their own, often inside the project's repository (`notes/`), or beside it (`~/notes/<project>`). It can start empty: `isorite new <folder>` makes it. isorite keeps what it needs in the folder's `.isorite/` (the journals of every change, the sessions it carried, and its settings), made the first time the folder is opened. Commit `.isorite/` with the notes, if they're in git.

```sh
isorite          # in the project: finds its base, opens the browser (isorite serve <notes> names one yourself)
```

## Two ways in

### isorite's own agent, in the pane

With no agent set up, the Agent pane offers one action, *Use isorite's agent*, which opens the pane's settings at the provider: choose a provider (or your company's gateway), paste a key, choose a model, *Check*, *Use this model*. Beneath it is one quiet line for the other way: an agent of your own connects over MCP with `isorite setup`. The model's key is kept in isorite's data folder, never in the notes. A session isorite kept can be removed from the pane's drawer (*remove*); a live one is not removed.

### An agent of your own, in its own terminal

Give the agent isorite's MCP in the project's config, and run it as you always do:

```sh
isorite setup                              # finds your agents, writes the project's MCP config
isorite doctor ~/code/my-project/notes     # or: shows the lines it would add, and writes them on a yes
```

They name `isorite mcp <the base's folder>`, a bridge over stdio to the server, so they hold on every machine whatever the port. Commit them with the project. isorite sees what the agent does through isorite's tools; a file it reads with its own tools isn't seen. The agent's own conversation stays in its terminal: the pane shows isorite's own agent's sessions only.

## What the agent gets

isorite's MCP, at each base's address on the server (`http://localhost:4767/b/<name>/mcp`, on this machine only), or through `isorite mcp`:

- `brief_base`, the first look: the base's islands (its folders), how it is kept, how to cite a note, how to make an artifact, and the base's `AGENTS.md`.
- `search_notes`, `find_similar` (by meaning, where the model is installed), `outline_note`, `read_note`: each look is a step on the Atlas.
- `edit_note`, `write_note`: written at once, under the agent's name, with what was asked, its words marked as its own.
- `ask_question`, `offer_text`: a question back, standing dotted on the Atlas until you keep it as a question note; words offered for a note, inserted as yours, or not.
- `read_data`, `artifact_recipe`, `write_artifact`, `read_artifact`: artifacts on isorite's kit, checked and run (in a browser found on this machine) before they are written.
- Notes as resources (`isorite://<base>/<note>`), for agents that offer `@` mentions of them.

## In the browser

The Agent pane is isorite's own agent's session: each prompt, what the agent says, a line for each thing it does (a command opens on its output, a file on its diff, a look-up in your notes on the note), and what it asks before doing. 

- **The tray:** hold a note on the Atlas and it goes before the next prompt, once a session.
- **Pointers:** select text in a note, a file of the repository or the agent's answer, and two tags stand out by it. Ctrl+[ (or picking up the first tag and letting it go in the box) puts a pointer in your message, a small blue chip naming its note (or file) and line, which you can move about the box and hover to light where it is from; Ctrl+] copies the same. On send each pointer is replaced by its place (the file and lines) and its words, so the agent can read the text around it. Several can be in one message ("what does [1] mean next to [2]").
- **The switches:** *agents may edit the notes* (Alt+N), on unless you switch it off, is kept in the base's `.isorite/settings.toml` and enforced by the server: `edit_note`, `write_note` and `write_artifact` are refused with no page open too. An agent whose own tools change a file without asking can't be stopped; the change is found and journalled under its name, to put back. *The agent may edit the project's files* (Alt+F) and *may run commands* (Alt+R) are this browser's: what it asks to do that is switched off is refused while the page is open.
- **The drawer:** the agent's sessions, kept in `.isorite/conversations/agents/`: one is carried on in the pane, or forked. Iso's own conversations, from before M25, are listed under them, to read.
- **The Context view** (the gauge, or ≡): what the agent has in hand: isorite's part, the notes given and read, the rest, and the room left.
- **Slash commands:** a message that begins with `/` is offered the pane's own commands, then the skills that are on. `/compact [what to keep]` summarises the session's earlier turns now and keeps the recent ones (done by itself before a prompt when the session nears the model's window); the session says how many tokens it freed. A command goes before a skill of the same name. `/<skill> [request]` loads that skill for the turn.
- **Notes the agent changes** are written at once. Turn on provenance in the Note pane's header to see its words marked, and the timeline to put a note back.

## How each agent differs

- **Claude Code** looks through isorite's tools and cites in isorite's form. It asks before each of isorite's tools until you answer *always*, or allow `mcp__isorite` in its settings.
- **Codex** is given the MCP server by one command, which `isorite setup` prints; a provider of your own goes in `~/.codex/config.toml`.
- **OpenCode** and **omp** mostly read the Markdown with their own tools, which isorite does not see; ask them to use isorite's tools.

## The agent's memory, and other bases

`isorite memory` makes a base for the agent's memory, lent to every session (see [setup.md](setup.md)). Every tool takes an optional `base`: one of the bases lent, named by `brief_base`; a note in another base can also be named `memory:tools/opencode`. The memory's `AGENTS.md` says what to keep, and how.

A second `isorite mcp`, for another project, on the same port, adds its base to the server that is running rather than starting another; a server one of them started stops when the last using it is done.

To watch the memory learn, open it beside the project: choose `memory` from the base's name at the left of the first pane's header (Ctrl-click for a tab of its own).

## Over SSH

`localhost` is the machine isorite runs on. To open it from your own, forward the port:

```sh
ssh -L 4767:localhost:4767 <the machine>
```

Over SSH, `isorite serve` prints this command too.

## Who can reach it

The isorite server listens on this machine only (127.0.0.1), unless you put it on your tailnet (`tailscale serve`). Then anyone on your tailnet who opens the page can ask the pane's agent to act in your project, as they could already edit your notes. MCP and the pane's model and keys are answered on this machine only.

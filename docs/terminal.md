# isorite beside your agent

How to use isorite with the agent you already use (Claude, Codex, OpenCode, omp, Hermes, or any that speaks ACP) on a project of your own. isorite gives the agent your notes over MCP, and reaches the agent over ACP: the agent gets the notes, the Atlas sees the agent, and Iso's pane shows the session. isorite calls no model itself: the agent's key and model are its own, set up as for its own terminal.

Setting isorite up the first time is in [setup.md](setup.md).

## Your notes for the project

Keep the project's notes in a folder of their own, often inside the project's repository (`notes/`), or beside it (`~/notes/<project>`). It can start empty: `isorite new <folder>` makes it. isorite keeps what it needs in the folder's `.isorite/` (the journals of every change, the sessions it carried, and its settings), made the first time the folder is opened. Commit `.isorite/` with the notes, if they're in git.

```sh
isorite serve ~/code/my-project/notes
```

## Three ways in

### In Iso's pane

With no agent attached, Iso's pane says how to attach one. *Here, in this pane*: choose an agent of the [ACP registry](https://agentclientprotocol.com/get-started/registry), or give the command of one it doesn't list (`hermes acp`). isorite starts it for the base, behind `isorite acp --pane`, in the repository the base is in, with the server's environment, and starts it again when the base is next opened. It runs a program, so it is chosen from this machine only; the choice is kept in `~/.config/isorite/bases.toml` (`agent`, or `agent_command`). The drawer's *stop it* stops it.

A registry agent is run as the registry says: its program for this platform, fetched once into `~/.local/share/isorite/agents/<id>/<version>/` and checked against its SHA-256; else with `npx -y` or `uvx`. `ISORITE_ACP_REGISTRY` names another registry, an address or a file.

### From an ACP front end

Toad in the terminal, Zed, or JetBrains: give it isorite as its agent, with the real agent's command:

```sh
isorite acp --agent "npx -y @agentclientprotocol/claude-agent-acp" ~/code/my-project/notes
```

Run in a folder with a base in it or under it, the notes can be left out. This starts the isorite server for the notes, unless one is running on port 4767 (`--port <n>` for another), and the agent behind it. Every message passes through: the session is live in the front end and in the pane at once, asked from either. isorite's MCP is added to each session the agent opens, so the agent needs no config of its own for it.

### In the agent's own terminal

Give the agent isorite's MCP in the project's config, and run it as you always do:

```sh
isorite doctor ~/code/my-project/notes
```

shows the lines it would add to the project's `.mcp.json` (Claude Code's, read by several others) and `opencode.json` (OpenCode's), and writes them on a yes; Iso's pane offers the same. They name `isorite mcp <the base's folder>`, a bridge over stdio to the server, so they hold on every machine whatever the port. Commit them with the project. Only what the agent does through isorite's tools is seen this way: a file it reads with its own tools isn't.

## What the agent gets

isorite's MCP, at each base's address on the server (`http://localhost:4767/b/<name>/mcp`, on this machine only), or through `isorite mcp`:

- `brief_base`, the first look: the base's folders, how it is kept, how to cite a note, how to make an artifact, and the base's `AGENTS.md`.
- `search_notes`, `find_similar` (by meaning, where the model is installed), `outline_note`, `read_note`: each look is a step on the Atlas.
- `edit_note`, `write_note`: written at once, under the agent's name, with what was asked, its words marked as its own.
- `ask_question`, `offer_text`: a question back, standing dotted on the Atlas until you keep it as a question note; words offered for a note, inserted as yours, or not.
- `read_data`, `artifact_recipe`, `write_artifact`, `read_artifact`: artifacts on isorite's kit, checked and run (in a browser found on this machine) before they are written.
- Notes as resources (`isorite://<base>/<note>`), for agents that offer `@` mentions of them.

Through `isorite acp`, isorite sees more: a Markdown file of the base the agent reads with its own tools is a step on the Atlas, as the note read, and one it changes is journalled under its name, with what was asked. The notes it read or cited stand under its reply; its links to notes are put in isorite's form however it wrote them.

## In the browser

Iso's pane is the agent's session: each prompt (asked in its front end, or from here), what the agent says, a line for each thing it does (a command opens on its output, a file on its diff, a look-up in your notes on the note), and what it asks before doing. Answered in either place, a question is gone from both.

- **The tray:** hold a note on the Atlas, or select a passage and send it to Iso, and it goes before the next prompt, from either place, once a session.
- **The switches:** *agents may edit the notes* (Alt+N), on unless you switch it off, is kept in the base's `.isorite/settings.toml` and enforced by the server: `edit_note`, `write_note` and `write_artifact` are refused, and through `isorite acp` so is an agent's request to edit a note's file, with no page open too. An agent whose own tools change a file without asking can't be stopped; the change is journalled under its name, to put back. *The agent may edit the project's files* (Alt+F) and *may run commands* (Alt+R) are this browser's: what it asks to do that is switched off is refused while the page is open.
- **The drawer:** the agents' sessions, live, the agents' own (their `session/list`), and those isorite carried, kept in `.isorite/conversations/agents/`. One the agent can carry on is carried on in the pane; one whose agent isn't attached is read. Iso's own conversations, from before M25, are listed under them, to read.
- **The Context view** (the gauge, or ≡): what the agent has in hand, as far as isorite sees: isorite's part, the notes given and read, the rest, and the room left, from what the agent says it fills.
- **Notes the agent changes** are written at once. Turn on provenance in the Note pane's header to see its words marked, and the timeline to put a note back.

## How each agent differs

Checked with Claude Agent 0.99.1, Codex 2.5.0 and Hermes 0.15.2 (M25 step 5), and OpenCode 2.2 and omp 18.14 (the spike).

- **Claude** (`@agentclientprotocol/claude-agent-acp`): looks through isorite's tools, and cites in isorite's form. It asks before each of isorite's tools until you answer *always*, or allow `mcp__isorite` in its settings.
- **Codex** (`@agentclientprotocol/codex-acp`): asks to be signed in first; started from the pane, isorite signs it in with its API key (`CODEX_API_KEY` or `OPENAI_API_KEY`). A provider of your own goes in `~/.codex/config.toml`.
- **OpenCode** (`opencode acp`) and **omp** (`omp acp`): mostly read the Markdown with their own tools, which isorite counts as reading the notes.
- **Hermes** (`hermes acp`, not in the registry): reads with its own tools too, and is not told how to cite, so it seldom links a note.

## The agent's memory, and other bases

`isorite memory` makes a base for the agent's memory, lent to every session (see [setup.md](setup.md)). Every tool takes an optional `base`: one of the bases lent, named by `brief_base`; a note in another base can also be named `memory:tools/opencode`. The memory's `AGENTS.md` says what to keep, and how.

A second `isorite acp` or `isorite mcp`, for another project, on the same port, adds its base to the server that is running rather than starting another; a server one of them started stops when the last using it is done.

To watch the memory learn, open it beside the project: choose `memory` from the base's name at the left of the first pane's header (Ctrl-click for a tab of its own).

## Over SSH

`localhost` is the machine isorite runs on. To open it from your own, forward the port:

```sh
ssh -L 4767:localhost:4767 <the machine>
```

Over SSH, `isorite serve` prints this command too.

## Who can reach it

The isorite server listens on this machine only (127.0.0.1), unless you put it on your tailnet (`tailscale serve`). Then anyone on your tailnet who opens the page can ask the attached agent to act in your project, as they could already edit your notes. MCP, `isorite acp`'s link, and choosing the pane's agent are answered on this machine only.

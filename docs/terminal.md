# isorite beside your code: the terminal

How to use isorite on a project of your own. OpenCode 2 is the coding agent in your terminal; isorite gives it your notes, and shows its session in Iso's pane in the browser. From there you can ask it things, give it notes and passages, stop it, and answer what it asks before it acts.

Setting isorite up the first time, or at work behind a company's gateway, is in [setup.md](setup.md).

## What you need

- **Node 24** or later.
- **isorite**: `npm i -g isorite`.
- **OpenCode 2**: `isorite opencode` installs the version isorite is tested with in `~/.config/isorite/opencode-cli`, for isorite alone, leaving the global npm prefix (and an OpenCode 1 you use) as it is. `isorite term` offers to when it finds none. One installed yourself (`npm i -g @opencode/cli`, as `opencode2`) is found too, or name one with `ISORITE_OPENCODE=/path/to/opencode`.
- A model provider, set once in `~/.config/isorite/config.toml`: see [setup.md](setup.md). `isorite doctor` checks all of this.

## Your notes for the project

Keep the project's notes in a folder of their own, for example `~/notes/<project>`. It can start empty: `isorite new ~/notes/<project>` makes it. isorite keeps what it needs in the folder's `.isorite/` (the journals of every change, and its settings), made the first time the folder is opened. Commit `.isorite/` with the notes, if they're in git.

## Starting it

```sh
cd ~/code/my-project
isorite term ~/notes/my-project
```

This starts the isorite server for the notes (unless one is running on port 4767; `--port <n>` for another), and OpenCode's own server, on this machine, with a password of its own. Then it opens the terminal on that server.

Before OpenCode takes the screen, `isorite term` prints:

```
isorite: http://localhost:4767/
  the terminal's models: work-large, work-small, as config.toml names them, through the isorite server
```

Most terminals let you click the link. It prints the same again when OpenCode exits. Closing the terminal stops both servers, if `isorite term` started them.

The first time, the folder you started in is named as the notes' repository in `.isorite/settings.toml`, so that code links in the notes point into it.

### Over SSH

`localhost` is the machine `isorite term` runs on. To open isorite from your own machine, forward the port:

```sh
ssh -L 4767:localhost:4767 <the machine>
```

Then open `http://localhost:4767/` on your own. Over SSH, `isorite term` prints this command too. Any local port works (`-L 9000:localhost:4767`, then `http://localhost:9000/`).

## In the browser

Open the link, or type `/web` in the terminal. OpenCode runs a web page of its own as well, on another port. It asks for a password nobody was given, so isorite's `/web` opens isorite's page instead (OpenCode's pairing is `/pair`), and `isorite term` says on which port OpenCode's page is, so that you don't open it.

While the terminal runs, Iso's pane header has two more switches beside *Iso may edit the notes*: *Iso may edit the project's files* (Alt+F) and *Iso may run commands* (Alt+R). With either on, the pane is the terminal's session:

- **The session:** each prompt (asked in the terminal, or from here), what the agent says, and a line for each thing it does. A command opens on its output, a file on its diff, a look-up in your notes on the note.
- **Asking from here:** what you type goes to the terminal's session, with what you gave Iso (hold a note on the Atlas, or select a passage and send it to Iso): notes by name, for the agent to read with isorite's tools, and passages as they are. Escape, or the square, stops it.
- **Permissions:** when OpenCode asks before doing something, the same question is in the pane: allow once, always allow, or don't allow. Answered in either place, it's gone from both.
- **Notes the agent changes** are written at once, under its name. Turn on provenance in the Note pane's header to see the agent's words marked, and the timeline to put a note back.

With both off, the pane is Iso's own again. The ≡ in its header, or a click on its gauge, opens what Iso is sent: a row for each part, with its size. These are the notes you gave and the notes Iso read, the conversation's turns, and what is always sent. Iso keeps a note it read in hand, and sets it aside after three turns unused, as a line it can read again. A click switches a row on or off. At the head of the conversation, one icon sums the earlier turns up into a briefing sent instead of them, and another starts a new conversation from that briefing. Iso sums up on its own only when a turn would be more than the model takes.

## The agent's memory, and other bases

`isorite memory` makes a base for the agent's memory, lent to every session (see [setup.md](setup.md), §5). Every tool the agent has takes an optional `base`: one of the bases lent to it, named by `brief_base`. Without it, a tool acts on the base the terminal is for. A note in another base can also be named `memory:tools/opencode`. The agent is told which bases are lent, and each base's `AGENTS.md` says how it is kept; the memory's says what to keep, and how.

A second `isorite term`, for another project, on the same port, adds its base to the server that is running rather than starting another; a server `isorite term` started stops when the last terminal using it is done. Over MCP (`isorite mcp`) the tools are the same.

To watch the memory learn, open it beside the project: choose `memory` from the base's name at the left of the first pane's header (Ctrl-click for a tab of its own). What the agent reads there lights on its Atlas; what it writes appears, marked as the agent's.

## The models

The terminal uses Iso's provider, as `config.toml` names it ([setup.md](setup.md)): the `[tiers]` models, `mid` its default. OpenCode asks the isorite server, which passes each request on to the provider with the key, the client certificate, the headers and the query `config.toml` names. OpenCode is given none of them, only the isorite server's token.

`ISORITE_GATEWAY_URL`, `ISORITE_GATEWAY_MODELS` (comma-separated) and `ISORITE_GATEWAY_KEY`, when set, are used instead, and OpenCode asks that address itself. With no key and no certificate in `config.toml`, OpenCode uses its own models; `isorite term` says which.

OpenCode doesn't know a gateway's prices, so Iso's pane shows the session's tokens rather than its cost.

## OpenCode's settings

OpenCode is given the base's `AGENTS.md` (in its `instructions`), when `isorite term` is named the notes, and the knowledge base's ways through `brief_base`: how a note is written and linked, and how the base is kept.

isorite keeps OpenCode's settings in `~/.config/isorite/opencode/`, rewritten at each start, so your own OpenCode settings are never read or changed. Anything of your own goes in `~/.config/isorite/opencode/local.json`, which is never rewritten, and is laid over what isorite writes. For example, to have OpenCode ask before every command (by default it runs them):

```json
{ "permissions": [{ "action": "shell", "resource": "*", "effect": "ask" }] }
```

## Without the internet

Once installed, isorite needs no network, as long as the model's address in `config.toml` is one you can reach (a gateway, or a model served on your own machine). What it fetches, it fetches once:

- isorite and OpenCode, from npm: through your company's npm mirror, if it has one.
- The model for search by meaning (optional): `isorite model` gets it from npm too (`isorite-model-granite`), so the same mirror serves it; else from its release on GitHub, else from Hugging Face. On a machine with none of them, copy its folder from one that has it (`isorite model` there says where), or download the package from `https://github.com/lachlanjs/isorite/releases/tag/model-granite-1.0.0` and unpack it, then `isorite model --from <folder>`. Granite's files are checked against their SHA-256; any other compatible model is checked by use ([setup-for-agents.md](setup-for-agents.md) says which).

## Who can reach it

OpenCode's server listens on this machine only (127.0.0.1), and only the isorite server talks to it. The isorite server listens on this machine only too, unless you put it on your tailnet (`tailscale serve`). Then anyone on your tailnet who opens the page can ask the agent to act in your project, as they could already edit your notes. The provider is passed on to OpenCode only on this machine, never over the tailnet.

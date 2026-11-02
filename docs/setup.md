# Setting isorite up

From nothing to your notes in the browser, with the agent you already use attached to them. If anything fails on the way, run `isorite doctor`: it checks each step and says what to change.

isorite calls no model itself (since M25). It is the notes, the Atlas and the record of how your understanding changed, attached to your agent: Claude, Codex, OpenCode, omp, Hermes, or any that speaks ACP. The agent's key and model are its own, set up as for its own terminal.

## 1. Install

Either one file, with Node inside it:

- **isorite**, as one executable for Linux, macOS or Windows, checked against the release's SHA256SUMS:
  ```sh
  curl -fsSL https://github.com/lachlanjs/isorite/releases/latest/download/install.sh | sh
  ```
  It goes in `~/.local/bin` (`--dir` for another folder). Each address it fetches is printed, so a machine that can't reach GitHub can fetch the same files another way, or from a mirror with `--url <the executable's address>`. It unpacks itself into `~/.cache/isorite/<version>/` the first time it runs. Run the installer again to update.

  On Windows, in PowerShell:
  ```powershell
  irm https://github.com/lachlanjs/isorite/releases/latest/download/install.ps1 | iex
  ```
  It goes in `%LOCALAPPDATA%\isorite`, which it adds to your PATH (open a new terminal after), and unpacks itself into `%LOCALAPPDATA%\isorite\<version>\` the first time it runs. The executable isn't signed, so Windows may say it's from an unknown publisher. isorite's own settings are in `%USERPROFILE%\.config\isorite\`.

Or from npm:

- **Node 24** or later (`node --version`).
- **isorite**: `npm i -g isorite`.

`isorite guide` now opens the guide, a knowledge base about isorite with things to do in it.

### Proxies and the company's certificates

The `isorite` command uses `HTTPS_PROXY` (and `NO_PROXY`) when they're set, and trusts the system's certificate authorities as well as Node's own, so a company's authority installed on the machine is trusted. Node does neither by itself. Set `ISORITE_NODE_DEFAULTS=0` to leave Node as it is.

If the company's authority isn't installed on the machine, name its certificate in `NODE_EXTRA_CA_CERTS`.

## 2. Your notes

A folder of Markdown files. In your project's folder:

```sh
isorite
```

It opens the base it finds there (a folder with `.isorite/` in it, the project's top folder or its `notes/`); with none it offers to make `notes/`; from any other folder it lists the bases this machine knows, last used first, with a new base here and the guide. It opens your browser, and prints the link too: `http://localhost:4767/` (the next free port if that one is taken; `--port <n>` to choose, `--no-open` to leave the browser alone). To name a folder yourself: `isorite new ~/notes/my-project`, then `isorite serve ~/notes/my-project`. A folder of notes you have already is opened as it is. isorite keeps what it needs in the folder's `.isorite/`.

How you want the base kept (your notation, the level, the language, how notes are named) goes in `AGENTS.md` at the top of the notes, which every agent you attach is given. Edit it in Iso's settings, the icon at the right of its pane's header, or in any editor. An agent may offer a line for it when you say how you want things done.

## 3. Your agent

Three ways in; [terminal.md](terminal.md) has each in full.

- **In Iso's pane.** With no agent attached, the pane offers one: an agent of the [ACP registry](https://agentclientprotocol.com/get-started/registry) (fetched and run as the registry says: its program checked against its SHA-256, else `npx` or `uvx`), or the command of one it doesn't list (`hermes acp`). isorite starts it for the base, in the base's repository, with the server's environment. Chosen from this machine only, and kept in `bases.toml`.
- **From an ACP front end** (Toad, Zed, JetBrains): give it `isorite acp --agent "<the agent's command>"` as its agent. The session is live in the front end and in the pane at once.
- **In the agent's own terminal**: give it isorite's MCP in the project's config. `isorite doctor ~/notes/my-project` shows the lines it would add (`.mcp.json` for Claude Code and others, `opencode.json` for OpenCode) and writes them on a yes; the pane offers the same. Commit them with the project.

## 4. Several bases, and the agent's memory (optional)

```sh
isorite memory              # ~/isorite-memory: a base of its own, a private git repository, lent to every session
isorite bases               # the bases this machine knows: each one is listed the first time it is opened
isorite bases lend <name>   # lend one to every session (isorite bases keep <name> stops)
```

One isorite server holds every base it is asked for. Each base's page is the same link with `?base=<name>`, and the base's name before the first pane's name switches between them; Ctrl-click opens one in a tab of its own. A base **lent** to every session can be read and written by every base's agent, its words marked as its own. The memory is one: what the agent learns about you and your tools, kept across projects, as its `AGENTS.md` says. The list is in `~/.config/isorite/bases.toml`, beside `config.toml`:

```toml
[memory]
path = "~/isorite-memory"
lend = true
```

## Search by meaning (optional)

The first start without the model offers it, once; a no is remembered. Later, or by hand:

```sh
isorite model
```

It says which model is installed and where, or fetches it (53 MB, once): from npm, else from a release on GitHub, else from Hugging Face. Without it, the agent searches by words and follows links. A mirror of the release is tried first when `ISORITE_MODEL_BASE_URL` names the folder its `.tgz` is in, and `isorite model --url <address>` fetches from that one address alone. Where none of those can be reached, `isorite model` prints the file's address and SHA-256: fetch it another way, and run `isorite model --from <the .tgz>`. Or copy the model's folder from a machine that has it (`isorite model` there says where it is) and run `isorite model --from <folder>`. Any compatible model works the same way: an ONNX model that gives 384 numbers, with its `tokenizer.json` (for example all-MiniLM-L6-v2, with `{"pooling": "mean"}` in an `isorite-model.json` beside it).

## When something fails

```sh
isorite doctor ~/notes/my-project
```

It checks, in turn: the configuration, how Node reaches the network (the proxy, the authorities), the port, a browser to run artifacts in, the model for search by meaning, the notes and their repository, and the project's MCP config. Each line says what failed, and what to change. `--offline` fetches nothing.

`isorite doctor --report` gives all of it as one block, with the configuration and the environment it read, any secret shown only by its length. Paste it to whoever is helping, or to an AI helping you: [setup-for-agents.md](setup-for-agents.md) is written for it, and `isorite help setup` prints it.

Your agent's own failures (its key, its model, its gateway) are its own: its front end, or the pane, says what it said. A refusal is shown in the pane; an agent that asks to be signed in with its API key (Codex) is signed in with it when isorite starts it.

Until M25, `config.toml` also held Iso's provider, under `[provider]` and `[tiers]`. They are left as written, and no longer read.

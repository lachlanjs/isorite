<p align="center"><img src="docs/assets/logo.svg" alt="isorite" width="260"></p>

<p align="center"><b>An agentic harness for understanding.</b><br>
Your project's notes as a map, beside the agent you already use, which reads and writes them with you.</p>

<p align="center"><a href="https://lachlanjs.github.io/isorite/">Read the guide in your browser</a> · <a href="docs/terminal.md">Use it beside your agent</a> · <a href="https://www.npmjs.com/package/isorite">npm</a></p>

---

- **Notes:** plain Markdown files in a folder you own. Every change is kept, with who made it, yours or an agent's.
- **The Atlas:** your notes laid out as a map, with folders as regions and links as routes. What your agent reads lights up on it.
- **Agent:** the pane where isorite's own agent works, beside the notes and the Atlas: set it up with a model's key and ask it there. An agent you already use connects over MCP instead, in its own terminal. Either way it cites your notes in the sentence, asks questions back, and its words in your notes stay marked as its own.
- **Your agent:** isorite's own agent, built in: with a model's key (OpenRouter, Anthropic, OpenAI and others) or your company's gateway, and nothing else to install. Or the agent you already use (Claude Code, Codex, Gemini CLI, Cursor, VS Code, OpenCode, omp): isorite gives it your notes over MCP.

## New to AI agents?

- **Agent.** A language model that can use tools as well as talk: it can search and read your notes, write into them, and read and edit code and run commands. It works in turns. You ask, it does a few steps and shows each one, then it stops and answers.
- **Your agent's provider.** The agent sends your questions to a model, through its provider's API, and the provider bills you per use. isorite doesn't: the agent's key and model are set up as they are for its own terminal.

You stay in charge of your files. Every change to a note is kept, with who made it, you or an agent, and can be put back. Code the agent changes is in your repository, so `git diff` shows it and `git restore` undoes it: commit before you ask it for something big.

## Install

**macOS or Linux**, in a terminal:

```sh
curl -fsSL https://github.com/lachlanjs/isorite/releases/latest/download/install.sh | sh
```

**Windows**, in PowerShell (no administrator needed):

```powershell
irm https://github.com/lachlanjs/isorite/releases/latest/download/install.ps1 | iex
```

**Or with npm**, if you have [Node 24](https://nodejs.org) or later: `npm install -g isorite`.

Each installer checks the download against the release's `SHA256SUMS` and prints every address it fetches. It puts `isorite` in `~/.local/bin` (Windows: `%LOCALAPPDATA%\isorite`, added to your `PATH`; open a new terminal after). The Windows executable isn't signed, so Windows may say it's from an unknown publisher. Run the installer again to update.

## Set up

In your project's folder:

```sh
isorite
```

The first time, this runs a short guided setup, four steps with a default for each (press Enter), every one skippable:

1. **Your notes.** It finds an Obsidian vault, a base or a folder of Markdown here, or offers a new `notes/` folder. Your files are not touched.
2. **Your agent.** Either **isorite's own agent**, built in, with a key from a model provider (OpenRouter, Anthropic, OpenAI and others) or your company's gateway; or an agent you already use, **Claude Code, Codex, Gemini CLI, OpenCode, Cursor, VS Code or omp**, which it finds on your machine and gives isorite's notes to over MCP by writing the project's MCP config for you. Keys are typed with nothing shown, kept readable only by you, and tested with one tiny request only if you say yes.
3. **Can this machine run it?** Node, write access, the port, your proxy and company certificate, and whether the 53 MB model for search by meaning can be fetched (if not, search is by words, which works fine).
4. **Start.** It opens your notes in the browser.

Run `isorite setup` again any time; it changes only what isn't already right. `isorite doctor` checks everything and says what to change for each failure. For a script, CI or an AI helping you, the same setup runs with no questions:

```sh
isorite setup --yes --base . --agent claude-code      # or --agent own --provider anthropic --key-env ANTHROPIC_API_KEY --test
```

If something doesn't work, `isorite doctor --report` gives it all as one block to paste to whoever (or whichever AI) is helping, with your secrets hidden. At work (a proxy, a company's certificate authority, a gateway): [docs/setup.md](docs/setup.md). Written for an AI helping you: [docs/setup-for-agents.md](docs/setup-for-agents.md).

The first run of the installed executable takes a few seconds longer, while it unpacks itself. The same guide is also on the [public site](https://lachlanjs.github.io/isorite/), kept in your browser, with nothing to install; there the guide's finder stands in for an agent.

### The agent, in more detail

- **isorite's own agent.** Its settings are in the Agent pane (the icon at the right of its header) as well as in setup: provider, key, model, *Check*. It reads your notes, and the project's files to read; changing files and running commands are off until you switch them on. A company gateway that asks for a client certificate (mTLS and a `.pfx`) is set in `config.toml`: [docs/setup.md](docs/setup.md#isorites-own-agent). There is no Claude or ChatGPT subscription sign-in for it, since their terms don't allow it; to use a subscription, connect Claude Code or Codex.
- **An agent you already use.** Setup writes its MCP config (`.mcp.json`, `.cursor/mcp.json`, `.vscode/mcp.json`, `opencode.json`, `.gemini/settings.json`), or prints the one command for Codex. Commit the file with the project, then run the agent as you always do: its key and model stay as you set them there. isorite sees what the agent does through isorite's tools. Each, in full: [docs/terminal.md](docs/terminal.md).

**What the agent may do**, set by the switches in the Agent pane's header:

- **Edit the notes** (Alt+N): on unless you switch it off, and kept with the base. While it's off, isorite refuses writes to notes and artifacts.
- **Edit the project's files** (Alt+F) and **run commands** (Alt+R): off by default, for isorite's own agent.

### Optional

```sh
isorite model         # search by meaning, not just by words: a 53 MB model run on your machine
isorite memory        # the agent's memory: a base of its own, lent to every session
isorite help all      # every command; the few above are all most people need
```

## Use it on your own project

Keep the notes in a folder of their own, in the project's repository or beside it.

```sh
isorite serve ~/code/my-project/notes          # the browser, at http://localhost:4767/
isorite doctor ~/code/my-project/notes         # offers the project's MCP config, for your agent in its own terminal
```

Paste a screenshot or drop a picture into a note and it's kept beside the note, named as you say; `[[!` shows one that's there already. Ask your agent for a dashboard of a data file, a simulation or an explorable explanation and it builds an artifact with isorite's tools: a page beside the notes that works, in isorite's look, shown in the Note pane or in place in a note, and saved standalone with its data inside. isorite keeps what it knows about the notes (each note's history) in `.isorite/` inside the folder, to be committed with them. A study base from an earlier isorite is moved in with `isorite migrate <study base>`.

Everything runs on your own machine, and the server listens only there.

## Develop

```sh
npm install
npm run build            # the app
npm test                 # every package
npm run test:browser     # the app in Chromium
npm run serve -- <notes> # then, for hot reloading: npm run dev -w @isorite/app
```

How it fits together: [architecture](docs/architecture.md), [format on disk](docs/format.md), [decisions](docs/decisions.md), [releases](docs/release.md).

MIT licensed.

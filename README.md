<p align="center"><img src="docs/assets/logo.svg" alt="isorite" width="260"></p>

<p align="center"><b>An agentic harness for understanding.</b><br>
Your project's notes as a map, beside the agent you already use, which reads and writes them with you.</p>

<p align="center"><a href="https://lachlanjs.github.io/isorite/">Read the guide in your browser</a> · <a href="docs/terminal.md">Use it beside your agent</a> · <a href="https://www.npmjs.com/package/isorite">npm</a></p>

---

- **Notes:** plain Markdown files in a folder you own. Every change is kept, with who made it, yours or an agent's.
- **The Atlas:** your notes laid out as a map, with folders as regions and links as routes. What your agent reads lights up on it.
- **Iso:** the pane where your agent's session shows, beside the notes and the Atlas. Ask it there or in its own front end; it cites your notes in the sentence, asks questions back, and its words in your notes stay marked as its own.
- **Your agent:** Claude, Codex, OpenCode, omp, Hermes, or any agent that speaks ACP. isorite gives it your notes over MCP, and reaches it over ACP. isorite calls no model itself.

## New to AI agents?

- **Agent.** A language model that can use tools as well as talk: it can search and read your notes, write into them, and read and edit code and run commands. It works in turns. You ask, it does a few steps and shows each one, then it stops and answers.
- **Your agent's provider.** The agent sends your questions to a model, through its provider's API, and the provider bills you per use. isorite doesn't: the agent's key and model are set up as they are for its own terminal.

You stay in charge of your files. Every change to a note is kept, with who made it, you or an agent, and can be put back. Code the agent changes is in your repository, so `git diff` shows it and `git restore` undoes it: commit before you ask it for something big.

## Install

### 1. isorite

**macOS or Linux**, in a terminal:

```sh
curl -fsSL https://github.com/lachlanjs/isorite/releases/latest/download/install.sh | sh
```

This puts `isorite` in `~/.local/bin`. If that folder isn't on your `PATH`, the installer prints the line to add to your shell's profile.

**Windows**, in PowerShell:

```powershell
irm https://github.com/lachlanjs/isorite/releases/latest/download/install.ps1 | iex
```

This puts `isorite.exe` in `%LOCALAPPDATA%\isorite` and adds that folder to your `PATH`: open a new terminal after. The executable isn't signed, so Windows may say it's from an unknown publisher.

Either installer checks the download against the release's `SHA256SUMS`, and prints each address it fetches. Run it again to update.

**With npm instead**, on any of the three: install [Node 24](https://nodejs.org) or later, then `npm install -g isorite`. Run the same command to update.

Then check:

```sh
isorite --version
isorite doctor        # each thing isorite needs, and what to do about any that's missing
isorite guide         # the guide, a small knowledge base about isorite, in ~/isorite-guide, opened in your browser
```

The first run of the installed executable takes a few seconds longer, while it unpacks itself. The same guide is also on the [public site](https://lachlanjs.github.io/isorite/), kept in your browser, with nothing to install; there the guide's finder stands in for an agent.

### 2. Your agent

With no agent attached, Iso's pane offers one: an agent of the [ACP registry](https://agentclientprotocol.com/get-started/registry) (Claude, Codex and others), or the command of one it doesn't list. isorite starts it for the base, with your environment, so its key and model are as you set them for its own terminal. Or run your agent from an ACP front end (Toad, Zed) through `isorite acp`, or give it isorite's MCP in its own terminal. [docs/terminal.md](docs/terminal.md) has each.

### 3. Optional

```sh
isorite model         # search by meaning, not just by words: a 53 MB model, fetched once, run on your machine
isorite memory        # the agent's memory: a base of its own, lent to every session
```

If something doesn't work, `isorite doctor` says what to change. `isorite doctor --report` gives it all as one block to paste to whoever (or whichever AI) is helping, with your secrets hidden.

## Use it on your own project

Keep the notes in a folder of their own, in the project's repository or beside it.

```sh
isorite serve ~/code/my-project/notes          # the browser, at http://localhost:4767/
isorite doctor ~/code/my-project/notes         # offers the project's MCP config, for your agent in its own terminal
```

Paste a screenshot or drop a picture into a note and it's kept beside the note, named as you say; `[[!` shows one that's there already. Ask your agent for a dashboard of a data file, a simulation or an explorable explanation and it builds an artifact with isorite's tools: a page beside the notes that works, in isorite's look, shown in the Note pane or in place in a note, and saved standalone with its data inside. isorite keeps what it knows about the notes (each note's history, the sessions it carried) in `.isorite/` inside the folder, to be committed with them. A study base from an earlier isorite is moved in with `isorite migrate <study base>`.

From an ACP front end, in the project's folder:

```sh
isorite acp --agent "npx -y @agentclientprotocol/claude-agent-acp"
```

Setting up at work (a proxy, a company's certificate authority) is in [docs/setup.md](docs/setup.md), and [docs/setup-for-agents.md](docs/setup-for-agents.md) is written for an AI helping you.

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

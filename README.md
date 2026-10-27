<p align="center"><img src="docs/assets/logo.svg" alt="isorite" width="260"></p>

<p align="center"><b>An agentic harness for understanding.</b><br>
Your project's notes as a map, an agent that reads and writes them with you, and the coding agent in your terminal working from them.</p>

<p align="center"><a href="https://lachlanjs.github.io/isorite/">Read the guide in your browser</a> · <a href="docs/terminal.md">Use it beside your code</a> · <a href="https://www.npmjs.com/package/isorite">npm</a></p>

---

- **Notes:** plain Markdown files in a folder you own. Every change is kept, with who made it, yours or an agent's.
- **The Atlas:** your notes laid out as a map, with folders as regions and links as routes.
- **Iso:** isorite's own agent. Ask it about your notes, have it write into them (its words stay marked as its own), or have it check what you've understood.
- **The terminal:** OpenCode, a coding agent, with your notes as its tools. Its session shows in the browser too, where you can ask, stop it and answer what it asks.

## New to AI agents?

Three words come up throughout:

- **Agent.** A language model that can use tools as well as talk: it can search and read your notes, write into
  them, and in the terminal read and edit code and run commands. It works in turns. You ask, it does a few steps and
  shows each one, then it stops and answers.
- **Provider.** isorite doesn't include a model. It sends your questions over the internet to a model you choose,
  through that provider's API, and the provider bills you per use: usually cents for a question, more for a long
  session of the terminal agent working in your code. Set a spending limit with the provider.
  [OpenRouter](https://openrouter.ai) is the default, and gives one key for many models.
- **Key.** The password your provider gives you for its API. isorite keeps it in a file on your machine that only
  you can read, and sends it only to your provider.

You stay in charge of your files. Every change to a note is kept, with who made it, you or an agent, and can be put
back. Code the terminal agent changes is in your repository, so `git diff` shows it and `git restore` undoes it:
commit before you ask it for something big.

## Install

### 1. isorite

**macOS or Linux**, in a terminal:

```sh
curl -fsSL https://github.com/lachlanjs/isorite/releases/latest/download/install.sh | sh
```

This puts `isorite` in `~/.local/bin`. If that folder isn't on your `PATH`, the installer prints the line to add to
your shell's profile.

**Windows**, in PowerShell (Windows Terminal is best):

```powershell
irm https://github.com/lachlanjs/isorite/releases/latest/download/install.ps1 | iex
```

This puts `isorite.exe` in `%LOCALAPPDATA%\isorite` and adds that folder to your `PATH`: open a new terminal after.
The executable isn't signed, so Windows may say it's from an unknown publisher.

Either installer checks the download against the release's `SHA256SUMS`, and prints each address it fetches.
Run it again to update.

**With npm instead**, on any of the three: install [Node 24](https://nodejs.org) or later, then
`npm install -g isorite`. Run the same command to update.

Then check:

```sh
isorite --version
isorite doctor        # each thing isorite needs, and what to do about any that's missing
```

The first run of the installed executable takes a few seconds longer, while it unpacks itself.

### 2. A provider, for the AI

1. Run `isorite guide`. It writes the guide, a small knowledge base about isorite, into `~/isorite-guide` and opens
   it in your browser.
2. Open Iso's settings: the icon at the right of the head of Iso's pane.
3. Either **sign in with OpenRouter**, which makes a key for you, or paste a key you made at
   [openrouter.ai](https://openrouter.ai) (add some credit there first). Your company's own gateway works too:
   see [docs/setup.md](docs/setup.md).
4. Ask Iso something about the guide.

Before you set a provider, everything but the AI already works: the notes, the Atlas, search by words. Iso is the
guide's finder until then, which answers with the notes that match, and sends nothing anywhere. The same guide is
also on the [public site](https://lachlanjs.github.io/isorite/), kept in your browser, with nothing to install.

### 3. Optional extras

```sh
isorite model         # search by meaning, not just by words: a 53 MB model, fetched once, run on your machine
isorite opencode      # the coding agent for the terminal (OpenCode 2), for isorite alone
```

`isorite opencode` needs npm, so on the executable install it also needs [Node 24](https://nodejs.org). It installs
OpenCode in isorite's own folder, so your global npm packages are left as they are.

If something doesn't work, `isorite doctor` says what to change. `isorite doctor --report` gives it all as one block
to paste to whoever (or whichever AI) is helping, with your secrets hidden.

## Use it on your own project

Keep the notes in a folder of their own. It can start empty, and is best kept as its own git repository.

```sh
isorite serve ~/notes/my-project          # the browser, at http://localhost:4767/
```

Paste a screenshot or drop a picture into a note and it's kept beside the note, named as you say; `[[!` shows one that's there already. isorite keeps what it knows about the notes (each note's history, Iso's conversations) in `.isorite/` inside the folder, to be committed with them. A study base from an earlier isorite is moved in with `isorite migrate <study base>`.

To work in your code with the notes beside it, start the terminal from the repository (after `isorite opencode`, above; on Windows, in Windows Terminal). This also starts the browser's server if it isn't running. [docs/terminal.md](docs/terminal.md) has more.

```sh
cd ~/code/my-project
isorite term ~/notes/my-project
```

**The provider** you set in Iso's settings is kept in `~/.config/isorite/config.toml` (on Windows,
`%USERPROFILE%\.config\isorite\config.toml`), and the terminal uses it too. Any OpenAI-compatible endpoint works. A
company's gateway (other headers, a client certificate, a proxy) is in [docs/setup.md](docs/setup.md), and
[docs/setup-for-agents.md](docs/setup-for-agents.md) is written for an AI helping you set it up.

**Other agents:** `isorite mcp <notes> --agent claude-code` gives another agent, such as Claude Code, the notes' tools.

Everything runs on your own machine, and the servers listen only there.

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

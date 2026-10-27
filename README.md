<p align="center"><img src="docs/assets/logo.svg" alt="isorite" width="260"></p>

<p align="center"><b>An agentic harness for understanding.</b><br>
Your project's notes as a map, an agent that reads and writes them with you, and the coding agent in your terminal working from them.</p>

<p align="center"><a href="https://lachlanjs.github.io/isorite/">Read the guide in your browser</a> · <a href="docs/terminal.md">Use it beside your code</a> · <a href="https://www.npmjs.com/package/isorite">npm</a></p>

---

- **Notes:** plain Markdown files in a folder you own. Every change is kept, with who made it, yours or an agent's.
- **The Atlas:** your notes laid out as a map, with folders as regions and links as routes.
- **Iso:** isorite's own agent. Ask it about your notes, have it write into them (its words stay marked as its own), or have it check what you've understood.
- **The terminal:** OpenCode, a coding agent, with your notes as its tools. Its session shows in the browser too, where you can ask, stop it and answer what it asks.

## Install

You need [Node 24](https://nodejs.org) or later. For the terminal you also need OpenCode 2.

```sh
npm install -g isorite @opencode/cli
isorite --version                  # 0.2.0 or later
isorite model                      # optional: search by meaning (53 MB, once)
```

To update later, run the same `npm install -g isorite`.

Where npm is hard (a company's mirror, say), isorite is also one executable, with Node inside, on each release:
`curl -fsSL https://github.com/lachlanjs/isorite/releases/latest/download/install.sh | sh` (on Windows,
`install.ps1`), and `isorite opencode` puts OpenCode 2 beside it. See [docs/setup.md](docs/setup.md).

## Try it

```sh
isorite guide
```

This writes the guide, a knowledge base about isorite with things to do in it, into `~/isorite-guide`, and opens it in the browser. Iso is your provider's model once one is set up; until then it is the guide's finder, which answers with the notes that match, needs no key, and sends nothing anywhere. The same guide is on the [public site](https://lachlanjs.github.io/isorite/), kept in your browser.

## Use it on your own project

Keep the notes in a folder of their own. It can start empty, and is best kept as its own git repository.

```sh
isorite serve ~/notes/my-project          # the browser, at http://localhost:4767/
```

isorite keeps what it knows about the notes (each note's history, Iso's conversations) in `.isorite/` inside the folder, to be committed with them. A study base from an earlier isorite is moved in with `isorite migrate <study base>`.

To work in your code with the notes beside it, start the terminal from the repository. This also starts the browser's server if it isn't running.

```sh
cd ~/code/my-project
isorite term ~/notes/my-project
```

**A model provider.** Set Iso's provider and key in the browser, behind the logo. They are kept in `~/.config/isorite/config.toml`, and the terminal uses the same provider. Any OpenAI-compatible endpoint works, OpenRouter by default. A company's gateway (other headers, a client certificate, a proxy) is in [docs/setup.md](docs/setup.md). If something fails, `isorite doctor` says what to change, and `isorite doctor --report` gives it all as one block to paste to whoever, or whichever AI, is helping; [docs/setup-for-agents.md](docs/setup-for-agents.md) is written for an AI.

**Search by meaning** needs `isorite model` once (above); without it, search is by words and links. It comes from npm, or from Hugging Face if npm can't reach it. **Other agents:** `isorite mcp <notes> --agent claude-code` gives another agent, such as Claude Code, the notes' tools.

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

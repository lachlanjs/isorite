<p align="center"><img src="docs/assets/logo.svg" alt="isorite" width="260"></p>

<p align="center"><b>An agentic harness for understanding.</b><br>
Your project's notes as a map, an agent that reads and writes them with you, and the coding agent in your terminal working from them.</p>

<p align="center"><a href="https://lachlanjs.github.io/isorite/">Try the tutorial in your browser</a> · <a href="docs/terminal.md">Use it beside your code</a> · <a href="https://www.npmjs.com/package/isorite">npm</a></p>

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

## Try it

```sh
isorite --tutorial
```

This writes an example project (notes on an N-body simulation) into a folder, opens the terminal's tour, and opens the browser beside it. The model is scripted: no key is needed, and nothing is sent anywhere.

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

**A model provider.** Set Iso's provider and key in the browser, behind the logo. They are kept in `~/.config/isorite/config.toml`, and the terminal uses the same provider. Any OpenAI-compatible endpoint works, OpenRouter by default. See [docs/terminal.md](docs/terminal.md) for a work gateway.

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

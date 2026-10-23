# isorite beside your code: the terminal and Build mode

How to use isorite on a project of your own. OpenCode 2 is the coding
agent in your terminal; isorite gives it your notes, and shows its session in Iso's pane in the browser, where you
can also ask it things, give it notes and passages, stop it, and answer what it asks before it acts.

## What you need

- **Node 24** or later.
- **OpenCode 2**: `npm i -g @opencode/cli`. It installs as `opencode2` and `opencode`. If an older OpenCode is
  your `opencode`, isorite finds `opencode2`; or name one with `ISORITE_OPENCODE=/path/to/opencode`.
- **isorite** itself, 0.2.0 or later: `npm i -g isorite`.
- A model provider: see below.

## Your notes for the project

Keep the project's notes in a folder of their own, outside the repository (yours, nothing to commit), for example
`~/notes/<project>`. It can start empty.

```sh
mkdir -p ~/notes/my-project
isorite study init ~/notes/my-project     # its study base beside it: the notes' journals, your understanding
```

## The model

`isorite term` gives OpenCode the same provider Iso uses, set once in `~/.config/isorite/config.toml`:

```toml
[provider]
name = "work"
url = "https://gateway.example.com/v1"   # any OpenAI-compatible endpoint; leave out for OpenRouter
key = "…"                                # or set it in the browser: Iso's settings, in Iso's pane

[tiers]                                  # the models: mid is the terminal's default, max and low beside it
low = "…"
mid = "…"
max = "…"
```

The key is handed to OpenCode's server in its environment only; it is never written into OpenCode's settings.
`ISORITE_GATEWAY_URL`, `ISORITE_GATEWAY_MODELS` (comma-separated) and `ISORITE_GATEWAY_KEY`, when set, are used
instead. With no key at all, OpenCode uses its own free models.

OpenCode does not know a gateway's prices, so Iso's pane shows the session's tokens rather than its cost.

## Starting it

```sh
cd ~/code/my-project
isorite term ~/notes/my-project
```

This starts the isorite server for the notes (if none is running on port 4767; `--port <n>` for another), starts
OpenCode's own server on this machine with a password of its own, and opens the terminal on it. Open
`http://localhost:4767/` in the browser: while the terminal runs, Iso's pane has a fourth mode, **Build** (the `>_`
icon). Closing the terminal stops both servers.

## In the browser

- **Build mode** shows the terminal's session: each prompt (asked in the terminal, or from here), what the agent
  says, a line for each thing it does (a command, which opens on its output; a file, which opens on its diff; a
  look-up in your notes, which opens the note).
- **Ask from here:** what you type in Build mode goes to the terminal's session, with what you gave Iso (hold a
  note on the Atlas, or select a passage and *send to Iso*): notes by name, for the agent to read with isorite's
  tools, and passages as they are. Escape, or the square, stops it.
- **Permissions:** when OpenCode asks before doing something, the same question is in the pane: *Allow once*,
  *Always allow this*, *Don't allow*. Answered in either place, it is gone from both.
- **Notes the agent changes** are written at once, under its name, as Iso's are in Write mode: open the note in its
  Iso lens to see the agent's words marked, and its timeline to put it back.
- Ask, Write and Understand stay Iso's own, in the app, as before.

## OpenCode's settings

isorite keeps OpenCode's settings in `~/.config/isorite/opencode/`, rewritten at each start, so your own OpenCode
config is never read or changed. Anything of your own goes in `~/.config/isorite/opencode/local.json`, which is
never rewritten and is laid over what isorite writes. For example, to have OpenCode ask before every command
(by default it runs them):

```json
{ "permissions": [{ "action": "shell", "resource": "*", "effect": "ask" }] }
```

## Without the internet

Once installed, isorite needs no network, as long as the model's address in `config.toml` is one you can reach (a
gateway, or a model served on your own machine). What it fetches, it fetches once:

- isorite and OpenCode, from npm: through your company's npm mirror, if it has one.
- The model for search by meaning (optional): `isorite model` gets it from npm too (`isorite-model-granite`), so the
  same mirror serves it; else from Hugging Face. On a machine with neither, copy its files from one that has them:
  `isorite model --from <folder>`. Every file is checked against its SHA-256.

## Who can reach it

OpenCode's server listens on this machine only (127.0.0.1), and only the isorite server talks to it. The isorite
server listens on this machine only too, unless you put it on your tailnet (`tailscale serve`); then anyone on your
tailnet who opens the page can ask the agent to act in your project, as they could already edit your notes.

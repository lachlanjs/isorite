# Setting isorite up: for an AI helping someone

You're helping someone set up isorite: a local web app over a folder of Markdown notes (the browser), attached either to isorite's own agent (built in: a model's key from OpenRouter, Anthropic, OpenAI and others, or a company gateway) or to the agent they already use (Claude Code, Codex, OpenCode, omp, Hermes, or any ACP agent) over MCP and ACP. An agent of their own has its key and model set up as for its own terminal; isorite's own agent's are kept by isorite. This is everything isorite reads, writes and runs for the setup, and how each failure shows. `isorite help setup` prints this file.

**Start here:** ask them to run `isorite doctor --report` (add the notes folder if they have one) and paste what it prints. It shows isorite's and Node's versions, the platform, the configuration with secrets replaced by their lengths, the environment variables isorite reads, and a line for each check, ✓ passed, ✗ failed, ! a warning, – skipped. Most failures say what to change. Never ask them to paste a key or passphrase, and don't ask them to turn off certificate checking (`NODE_TLS_REJECT_UNAUTHORIZED=0`).

## Commands

| Command | What it does |
|---|---|
| `isorite new <folder>` | Makes the folder (and its parents), empty but for `.isorite/`. Refuses one with files in it already: that is opened as it is. |
| `isorite doctor [<notes>] [--report] [--offline]` | Checks the setup a step at a time (below), and offers the project's MCP config for the notes named, written on a yes at a terminal. Exit 1 if anything failed. `--offline`: fetches nothing. |
| `isorite serve <notes> [--port <n>]` | The browser app at `http://localhost:4767/`, on 127.0.0.1 only. Starts the agent chosen for the base's pane, if one is. |
| `isorite acp --agent "<command>" [<notes>] [--port <n>]` | Run by an ACP front end (Toad, Zed) as its agent: starts the real agent behind it, adds isorite's MCP to its sessions, and shows them in Iso's pane. Starts the isorite server if none answers on the port, and lets it go on exit. |
| `isorite mcp [<notes>] [--port <n>] [--agent <name>]` | isorite's MCP over stdio, a bridge to the server's, for an agent in its own terminal; what the project's config names. Starts the server likewise. |
| `isorite check <notes>` | Lints the notes: frontmatter, links, cycles, and artifacts' rules. |
| `isorite memory [<folder>]` | The agent's memory: a base (`~/isorite-memory` unless named), a git repository of its own, with its practice in `AGENTS.md`, listed in `bases.toml` as `memory`, lent. Run again, says where it is and changes nothing. |
| `isorite bases [lend\|keep <name>]` | The bases this machine knows, as `bases.toml` lists them; `lend` lends one to every session, `keep` stops. |
| `isorite guide [<folder>]` | The guide, a knowledge base about isorite, written into `~/isorite-guide` (or the folder named) and served. Good to check the install alone. `isorite --tutorial` is another name for it. |
| `isorite model [--from <folder\|.tgz>] [--url <url>]` | Optional: the model for search by meaning. Says which is installed and where, else fetches it (53 MB) from `ISORITE_MODEL_BASE_URL` (a mirror: the folder `isorite-model-granite-1.0.0.tgz` is in), npm, a GitHub release, then Hugging Face, saying why each failed. `--url`: that address only. `--from`: the release's `.tgz` fetched by hand (checked by its SHA-256), granite's files, or any compatible model (below). |
| `isorite help setup` | Prints this. |

`isorite term` and `isorite opencode` were retired in M25: OpenCode is attached as any agent (`opencode acp`).

## Files

| Where | What |
|---|---|
| `~/.config/isorite/config.toml` (or `$XDG_CONFIG_HOME/isorite/`) | This machine's `device` id, and `[provider]`: a gateway for isorite's own agent (url, key or `"$NAME"`, key_header, headers, query, pfx + pfx_passphrase or cert + cert_key, ca, models; see setup.md). Mode 600. The model names in `[tiers]` are offered in the settings; nothing else of it is read. |
| `~/.local/share/isorite/credentials.json` (or `$XDG_DATA_HOME/isorite/`) | isorite's own agent's keys, the provider and model chosen, and what it may reach in the project. Mode 600, in a folder of mode 700. A value is never logged or shown, only whether it is set. |
| `~/.config/isorite/bases.toml` | The bases this machine knows, a table each: `[<name>] path = "…"`, `lend = true` to lend it to every session, and `agent = "<registry id>"` or `agent_command = "…"` for the agent the pane starts. Each base opened is added, under its folder's name. |
| `<notes>/AGENTS.md` | The base's own instructions (notation, level, how notes are named), given to every agent in `brief_base`. Not a note: not on the Atlas, not linted. |
| `<notes>/.isorite/` | isorite's own folder in the notes: journals of every change, the agents' sessions it carried (`conversations/agents/`), Iso's conversations from before M25 (`conversations/`), and `settings.toml` (`repository = "<path>"`, where code links point when it isn't the git repository the notes are in, or for notes outside any, the one an agent was first attached in; `agents_write_notes = false`, the pane's switch). Made on first open; commit it with the notes. |
| `<repository>/.mcp.json`, `<repository>/opencode.json` | The project's MCP config, naming `isorite mcp <the base's folder>`; written by `doctor` or the pane on a yes. What else they hold is kept. |
| `~/.cache/isorite/acp-registry.json` | The ACP registry, kept an hour. |
| `~/.local/share/isorite/agents/<id>/<version>/` | A registry agent's program, fetched once and checked against its SHA-256. |
| `~/.local/share/isorite/models/` (or `$XDG_DATA_HOME/isorite/models/`) | The models for search by meaning, a folder each: `granite-embedding-small-english-r2/`, and any other installed with `--from`. `use` names the one used, if not granite. |
| `~/.cache/isorite/vectors-<hash>.json` | Each base's vectors, made by the model; made again when the model changes. |
| `$TMPDIR/isorite-server-<port>.log` | The isorite server's output, when `isorite acp` or `isorite mcp` started it. Look here when "the isorite server did not start". |

## Environment variables

| Variable | Effect |
|---|---|
| `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | Used by the `isorite` command: it re-runs itself once with `NODE_USE_ENV_PROXY=1`, and adds `localhost,127.0.0.1,::1` to `NO_PROXY`. The agent reads them itself. |
| `ISORITE_NODE_DEFAULTS=0` | Leave Node as it is: no system authorities, no proxy unless Node is told. |
| `NODE_EXTRA_CA_CERTS` | A .pem of extra authorities, read by Node at start. |
| `ISORITE_ACP_REGISTRY` | Another ACP registry: an address, or a file. |
| `ISORITE_EMBED_DIR` | The model for search by meaning is in this folder (and nowhere else is looked). |
| `ISORITE_EMBED=off` | No search by meaning, whatever is installed. |
| `ISORITE_BROWSER` | The Chromium to run artifacts in, unseen, when an agent writes one. |
| `XDG_CONFIG_HOME` | Where `isorite/config.toml` is looked for. |
| `SSH_CONNECTION` | Set over SSH: `serve` and `doctor` print the `ssh -L` command for the browser. |

The agent the pane starts is given the server's environment: its own keys (`ANTHROPIC_API_KEY`, `CODEX_API_KEY`, …) must be set where `isorite serve` runs.

## What working looks like

`isorite doctor <notes>` ends `nothing failed`, with lines like:

```
✓ config: /home/me/.config/isorite/config.toml
✓ proxy: http://proxy.corp:8080, used
✓ authorities: the system's (146), as well as Node's own
✓ port: 4767 is free: isorite acp and isorite mcp start a server there
✓ artifacts: run unseen when an agent writes one, in /usr/bin/chromium
✓ search by meaning: granite-embedding-small-english-r2 at /home/me/.local/share/isorite/models/granite-embedding-small-english-r2
✓ notes: /home/me/code/proj/notes, with its .isorite/
✓ agents: .mcp.json and opencode.json in /home/me/code/proj name this base
```

## Failures, and what to change

| Seen | Cause | Change |
|---|---|---|
| `! agents: .mcp.json … doesn't name this base` | The project's MCP config isn't written. | `isorite doctor <notes>` at a terminal, and yes; or the pane's *the project's config*. Commit the files. |
| The pane says "no agent is attached" | Nothing is attached to this base. | Choose one in the pane, or run `isorite acp` from a front end, or give the agent isorite's MCP. |
| The pane's chosen agent says `the agent stopped (1)` and a line of its output | The agent's command failed: not installed, no key, no model. | Run the command in a terminal where `isorite serve` runs, and fix what it says; its key must be in that environment. |
| `… is not offered for <platform>` | The registry has no way to run that agent here. | Install it yourself, and give its command. |
| `Authentication required` in the pane | The agent wants to be signed in, and has no API key method, or none set. | Sign it in from its own front end or terminal, or set its key (`CODEX_API_KEY` for Codex). |
| The agent never uses isorite's tools | It reads the Markdown with its own (OpenCode, omp, Hermes do). | Through `isorite acp` that still counts; in its own terminal, ask it to use isorite's tools, or attach it over ACP. |
| Claude asks before each of isorite's tools | Claude's own permissions. | Answer *always*, or allow `mcp__isorite` in its settings. |
| `isorite: starting…` and then nothing | The server it starts is stalled. | Read the log the line names (`isorite-server-<port>.log`). |
| `port 4767 is serving <other>, not <notes>` | An isorite from before M20 serves another base there. | Stop it, or `--port`. |
| `[provider] pfx: there is no file at …` (or `cert`, `ca`) | A path in `config.toml` that isn't there. On Windows, a path in double quotes loses its backslashes. | Write it in single quotes: `pfx = 'C:\certs\me.pfx'`. |
| `[provider] pfx_passphrase does not open …` | The passphrase is not the .pfx's. | Fix it (or the variable it names), then choose the gateway again. |
| `[provider] key is "$NAME", and NAME is not set` | The variable isn't set where `isorite` started. | Set it there, or put the key in the settings. |
| The settings' *Check* says the gateway wants a client certificate (mTLS) | `pfx` (or `cert` and `cert_key`) is not in `[provider]`, or the gateway doesn't trust it. | Add it, and `ca` if the gateway's own certificate is the company's. |
| `isorite term and isorite opencode are retired` | A command from before M25. | Attach OpenCode with `opencode acp`, from the pane or a front end. |
| `! search by meaning: no model …` | Not installed (optional). `doctor` says whether the release (or the mirror) answers from here. | `isorite model`. Its failures name each source; offline, `isorite model --from <the .tgz>` with the file it names. |
| `The model could not be fetched:` and a line for each source | None reachable from here. | Fetch the file it prints another way, check its SHA-256, and `isorite model --from <the .tgz>`. Or set `ISORITE_MODEL_BASE_URL` to a mirror's folder, or `isorite model --url <address>`. |
| `… SELF_SIGNED_CERT_IN_CHAIN` fetching the model or the registry | A company's authority not trusted. | Install it on the machine (isorite trusts the system's), or `NODE_EXTRA_CA_CERTS`. |
| `Proxy response (407)` | The company's proxy wants credentials of its own. | Credentials in `HTTPS_PROXY` (`http://user:password@proxy:port`). A proxy that signs in by Kerberos or NTLM can't be answered by isorite. |
| The link doesn't open, over SSH | `localhost` is the remote machine. | `ssh -L 4767:localhost:4767 <host>` from the person's own machine. |

The model, gateway or provider of an agent of their own failing is that agent's to fix, in its own settings: isorite passes what it said into the pane. For isorite's own agent, the settings' *Check* names the cause.

## Another model for search by meaning

Any ONNX model that gives 384 numbers for a text, with its `tokenizer.json`, can stand in for granite: `isorite model --from <folder>`. It's checked by use (loaded, and asked for one vector), copied into the models folder, and used from then on; each base's vectors are made again with it. An optional `isorite-model.json` beside its files gives `{"name": "…", "pooling": "cls" | "mean"}`: `cls` (the default) takes the first token's state, as granite is used; `mean` averages them all, as sentence-transformers models such as all-MiniLM-L6-v2 are used.

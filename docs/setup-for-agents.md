# Setting isorite up: for an AI helping someone

You're helping someone set up isorite: a local web app over a folder of Markdown notes (the browser), an agent in it
called Iso, and `isorite term`, which runs OpenCode 2 beside the notes. This is everything isorite reads, writes and
runs for the setup, and how each failure shows. `isorite help setup` prints this file.

**Start here:** ask them to run `isorite doctor --report` (add the notes folder if they have one) and paste what it
prints. It shows isorite's and Node's versions, the platform, the configuration with secrets replaced by their
lengths, the environment variables isorite reads, and a line for each check, ✓ passed, ✗ failed, ! a warning, –
skipped. Most failures say what to change. Never ask them to paste a key or passphrase, and don't ask them to
turn off certificate checking (`NODE_TLS_REJECT_UNAUTHORIZED=0`).

## Commands

| Command | What it does |
|---|---|
| `isorite new <folder>` | Makes the folder (and its parents), empty but for `.isorite/`. Refuses one with files in it already: that is opened as it is. |
| `isorite doctor [<notes>] [--report] [--offline]` | Checks the setup a step at a time (below). Exit 1 if anything failed. `--offline`: asks the provider nothing. |
| `isorite serve <notes> [--port <n>]` | The browser app at `http://localhost:4767/`, on 127.0.0.1 only. |
| `isorite term [<notes>] [--port <n>]` | OpenCode 2 in this terminal, in the current folder (the code), with the notes beside it. Starts the isorite server if none answers on the port, and stops it on exit. |
| `isorite check <notes>` | Lints the notes: frontmatter, links, cycles. |
| `isorite --tutorial` | A tour on an example base with a scripted model: no key or network needed. Good to check the install alone. |
| `isorite model [--from <folder>]` | Optional: the model for search by meaning. Says which is installed and where, else fetches it (53 MB) from npm, a GitHub release, then Hugging Face, saying why each failed. `--from`: granite's files, or any compatible model (below). |
| `isorite help setup` | Prints this. |

## Files

| Where | What |
|---|---|
| `~/.config/isorite/config.toml` (or `$XDG_CONFIG_HOME/isorite/`) | isorite's settings for this machine: `device`, `[provider]`, `[tiers]`, `[prices]`. Mode 600. Holds the key. |
| `~/.config/isorite/opencode/` | OpenCode's settings as isorite writes them at each `isorite term` start (`opencode.json`, theme, plugin link). Rewritten; don't edit. |
| `~/.config/isorite/opencode/local.json` | The person's own OpenCode settings, laid over isorite's. Never rewritten. |
| `<notes>/AGENTS.md` | The base's own instructions (notation, level, how notes are named), sent to Iso with every turn and named in OpenCode's `instructions`. Not a note: not on the Atlas, not linted. |
| `<notes>/.isorite/` | isorite's own folder in the notes: journals of every change, `settings.toml` (`repository = "<path>"`, where code links point). Made on first open; commit it with the notes. |
| `~/.local/share/isorite/models/` (or `$XDG_DATA_HOME/isorite/models/`) | The models for search by meaning, a folder each: `granite-embedding-small-english-r2/`, and any other installed with `--from`. `use` names the one used, if not granite. |
| `~/.cache/isorite/vectors-<hash>.json` | Each base's vectors, made by the model; made again when the model changes. |
| `$TMPDIR/isorite-term-<port>.log` | The isorite server's output, when `isorite term` started it. Look here when "the isorite server did not start". |
| `$TMPDIR/isorite-opencode-<port>.log` | OpenCode's server's output, under `isorite term`. |

isorite never reads or changes the person's own OpenCode settings (`~/.config/opencode/`).

## config.toml

```toml
[provider]
name = "work"                         # optional; what isorite calls the provider in messages
url = "https://…/v1"                  # OpenAI-compatible; /chat/completions and /models are added. Absent: OpenRouter
key = "…"                             # the key; also settable in the browser (behind the logo)
key_header = "api-key"                # send the key in this header, as it is, instead of Authorization: Bearer
stream_usage = false                  # don't send stream_options (some gateways answer 400 to it)
max_tokens = 16000                    # the least output budget any call gets, for models that think at length
cache_marks = true                    # send Anthropic cache marks (OpenRouter-style gateways only)
pfx = "~/certs/me.pfx"                # client certificate (mTLS), PKCS#12; or cert + cert_key (PEM)
pfx_passphrase = "$PFX_PASS"          # "$NAME": read from that environment variable
cert = "me.pem"                       # relative paths are from config.toml's folder
cert_key = "me.key"
ca = "company-root.pem"               # extra authority for the gateway's certificate (added to the trusted ones)

[provider.headers]                    # sent with every request; values may be "$NAME"
X-Team = "…"

[provider.query]                      # added to every request's URL
api-version = "…"

[tiers]                               # the provider's model names
low = "…"                             # quick
mid = "…"                             # Iso's default; the terminal's default
max = "…"                             # most able

[prices]                              # optional: US$ per million tokens in and out, for providers that don't say
"model-name" = [3.0, 15.0]
```

Rules:

- With `url` set and no `[tiers]`, OpenRouter's names are used (`anthropic/claude-…`). A gateway usually answers
  404 to them. Doctor warns: name the gateway's models under `[tiers]`.
- `pfx` and `cert` can't both be named. `cert` and `cert_key` go together.
- A `"$NAME"` value whose variable isn't set is an error naming both.
- Certificates are used only over https, and only for the provider's own address.

## Environment variables

| Variable | Effect |
|---|---|
| `HTTPS_PROXY`, `HTTP_PROXY`, `NO_PROXY` | Used by the `isorite` command: it re-runs itself once with `NODE_USE_ENV_PROXY=1`, and adds `localhost,127.0.0.1,::1` to `NO_PROXY`. OpenCode (Bun) reads them itself. |
| `ISORITE_NODE_DEFAULTS=0` | Leave Node as it is: no system authorities, no proxy unless Node is told. |
| `NODE_EXTRA_CA_CERTS` | A .pem of extra authorities, read by Node at start. |
| `ISORITE_GATEWAY_URL`, `ISORITE_GATEWAY_MODELS`, `ISORITE_GATEWAY_KEY` | The terminal only: OpenCode asks this OpenAI-compatible address directly, with these models (comma-separated) and key, instead of `config.toml`'s provider. No certificate or headers apply. |
| `ISORITE_EMBED_DIR` | The model for search by meaning is in this folder (and nowhere else is looked). |
| `ISORITE_EMBED=off` | No search by meaning, whatever is installed. |
| `ISORITE_OPENCODE` | The OpenCode 2 binary to run. Otherwise `opencode2`, then `opencode`, must be version 2. |
| `XDG_CONFIG_HOME` | Where `isorite/config.toml` is looked for. |
| `SSH_CONNECTION` | Set over SSH: `term`, `serve` and `doctor` print the `ssh -L` command for the browser. |

## How requests reach the provider

- **Iso** (in the isorite server) posts to `<url>/chat/completions?<query>`, streaming, with the key (in
  `Authorization: Bearer` or `key_header`), `headers`, and `stream_options` unless `stream_usage = false`. With a
  certificate or `ca`, it goes by `node:https` with them, through `HTTPS_PROXY` if set. Otherwise it uses Node's
  fetch.
- **The terminal**: OpenCode is configured with the provider at `http://127.0.0.1:<port>/api/gateway`, the isorite
  server's relay, and with the server's token as its key. The relay adds the real key, certificate, headers and
  query, and passes `/chat/completions` and `/models` on. So whatever works for Iso works for the terminal. The
  relay answers only on 127.0.0.1, and only that token.
- **Retries.** A 502, 503 or 504, a dropped connection or a timeout is asked again up to 3 times (after about 1, 2
  and 4 s), and a 429 once (after its `Retry-After`, if 10 s or less), but only before any of the reply has come.
  The relay does the same before it passes anything to OpenCode (which retries on its own as well). 4xx answers
  and names not found are the settings', and are not asked again.
- **An empty reply.** A reply cut off at its length limit with nothing written (a reasoning model that spent the
  budget thinking) is asked once more with three times the room.
- With no key and no certificate in `config.toml`, and no `ISORITE_GATEWAY_*`, OpenCode uses its own models.
  `isorite term` prints which models it uses, and from where.

## What working looks like

`isorite doctor` ends `nothing failed`, with lines like:

```
✓ config: /home/me/.config/isorite/config.toml: work at https://llm-gateway.corp.example/v1
✓ key: <48 characters>, sent in api-key
✓ certificate: /home/me/certs/me.pfx
✓ models: low small, mid medium, max large
✓ proxy: http://proxy.corp:8080, used
✓ authorities: the system's (146), as well as Node's own
✓ reached: https://llm-gateway.corp.example/v1/models answered with 12 models
✓ reply from medium: "ready", 14 tokens in and 2 out
✓ tools: medium called ping
✓ opencode: opencode2 2.0.32
✓ terminal: work's models, through isorite's server at http://127.0.0.1:4767/api/gateway, …
```

`isorite term` prints `isorite: http://localhost:4767/` and the terminal's models before OpenCode opens.

## Failures, and what to change

| Seen | Cause | Change |
|---|---|---|
| `could not be reached: … SELF_SIGNED_CERT_IN_CHAIN` or `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | The gateway's certificate is signed by an authority not trusted, usually the company's. | Install the company's root on the machine (isorite trusts the system's), or name its .pem as `ca`, or in `NODE_EXTRA_CA_CERTS`. Check `ISORITE_NODE_DEFAULTS` isn't 0. |
| `… CERTIFICATE_REQUIRED`, `… other side closed (UND_ERR_SOCKET)` on https, `HANDSHAKE_FAILURE`, `BAD_CERTIFICATE` | The gateway wants a client certificate (mTLS), and got none it accepts. | `pfx` + `pfx_passphrase`, or `cert` + `cert_key`. Ask the person where theirs is: often a .pfx or .p12 file. If it's only in the Windows certificate store or the macOS keychain, it must be exported to a file. |
| `pfx_passphrase does not open …` | Wrong passphrase, or the variable it names holds the wrong one. | Fix the passphrase. |
| `ENOTFOUND` | The host name isn't found. | Check `url`. The name may resolve only on the company's network or VPN. |
| `ECONNREFUSED` | Nothing listens there. | Check the URL's port. |
| `ETIMEDOUT`, `UND_ERR_CONNECT_TIMEOUT` | No answer: often a proxy is needed. | Set `HTTPS_PROXY` (and `NO_PROXY` for internal hosts reached directly). |
| `said 401` / `said 403` | The key, or where it's sent, isn't accepted. | Check the key, `key_header`, and any header the gateway wants. The gateway's own message usually names it. |
| `said 404 … no model called X, which is OpenRouter's name for it` | No `[tiers]`. | Name the gateway's models under `[tiers]`. `doctor` lists the models `/models` offers. |
| `… is unavailable (503 …), tried 4 times over N s: it is likely …, not your settings` | The gateway, or the model behind it, is down. | Wait, and send it again (↻ under the turn). If it lasts, the gateway's status page or owner. |
| `… used its whole output budget (N tokens) thinking, and wrote nothing` | A reasoning model ran out of room before it wrote. | A lower tier, or `max_tokens` under `[provider]`. |
| `! search by meaning: no model …` | Not installed (optional). | `isorite model`. Its failures name each source; offline, `isorite model --from <folder>` with a copy. |
| `The model could not be fetched:` and a line for npm, GitHub, Hugging Face | None reachable from here. | Copy the model's folder from a machine that has it (`isorite model` there says where), then `isorite model --from <folder>`; or any compatible model. |
| `said 400: … stream_options` | The gateway refuses `stream_options`. | `stream_usage = false`. |
| `✗ tools: … answered without calling the tool` | The model or gateway drops tools. | Choose a model that supports tool calls. Iso and the terminal need them. |
| `isorite term needs OpenCode 2` | OpenCode 1, or none. | `npm i -g @opencode/cli`, or `ISORITE_OPENCODE=…`. |
| `port 4767 is serving <other>, not <notes>` | Another base is served there. | Stop it, or `--port`. |
| The link doesn't open, over SSH | `localhost` is the remote machine. | `ssh -L 4767:localhost:4767 <host>` from the person's own machine. |
| The terminal works but uses an unexpected model | Check the line `isorite term` prints: `config.toml`, `ISORITE_GATEWAY_URL`, or OpenCode's own (no key or certificate). | Fix what it names. |

## Another model for search by meaning

Any ONNX model that gives 384 numbers for a text, with its `tokenizer.json`, can stand in for granite:
`isorite model --from <folder>`. It's checked by use (loaded, and asked for one vector), copied into the models
folder, and used from then on; each base's vectors are made again with it. An optional `isorite-model.json` beside
its files gives `{"name": "…", "pooling": "cls" | "mean"}`: `cls` (the default) takes the first token's state, as
granite is used; `mean` averages them all, as sentence-transformers models such as all-MiniLM-L6-v2 are used.

If the gateway isn't OpenAI-compatible (Bedrock's or Vertex's own APIs, for example), isorite can't use it directly.
An OpenAI-compatible proxy in front of it, such as LiteLLM, can.

# Setting isorite up

From nothing to Iso answering in the browser and OpenCode working in the terminal. If anything fails on the way,
run `isorite doctor`: it checks each step and says what to change.

## 1. Install

- **Node 24** or later (`node --version`).
- **isorite**: `npm i -g isorite`.
- For the terminal, **OpenCode 2**: `npm i -g @opencode/cli`.

`isorite --tutorial` now shows you around, on an example base, with a scripted model: no key, nothing sent anywhere.

## 2. A model provider

Iso and the terminal need an OpenAI-compatible provider. isorite's settings are in `~/.config/isorite/config.toml`
(or `$XDG_CONFIG_HOME/isorite/config.toml`), a file only you can read.

**OpenRouter** is the default. Open isorite in the browser, and set the key behind the logo (or sign in there with
OpenRouter, which makes one). Nothing else is needed.

**Any other provider or gateway** is named under `[provider]`, with its models under `[tiers]`:

```toml
[provider]
name = "work"                              # what isorite calls it
url = "https://llm.example.com/v1"         # /chat/completions is added to it
key = "…"                                  # or set it behind the logo in the browser

[tiers]                                    # the provider's own names for its models
low = "small-model"                        # quick replies
mid = "medium-model"                       # Iso's default, and the terminal's
max = "large-model"                        # the most able
```

Without `[tiers]`, OpenRouter's names are used, and another provider usually answers 404 to them.

### A company's gateway

Gateways inside companies often want more than a key. Each of these is optional:

```toml
[provider]
url = "https://llm-gateway.corp.example/v1"
key = "…"
key_header = "api-key"                     # the header the key goes in, as it is, instead of Authorization: Bearer
stream_usage = false                       # for a gateway that refuses stream_options; the gauge then counts nothing
max_tokens = 16000                         # the least room a reply is given, for models that think at length

# A client certificate (mTLS), for a gateway that asks for one: a .pfx (or .p12) ...
pfx = "~/certs/me.pfx"
pfx_passphrase = "$MY_PFX_PASSPHRASE"      # "$NAME" is read from the environment, so it isn't written here
# ... or a certificate and its key, as .pem files:
# cert = "~/certs/me.pem"
# cert_key = "~/certs/me.key"

ca = "~/certs/company-root.pem"            # the authority the gateway's own certificate is signed by, if needed

[provider.headers]                         # sent with every request
X-Team = "research"
X-Project = "$PROJECT_ID"

[provider.query]                           # added to every request's address
api-version = "2024-10-21"
```

Paths may start with `~`, or are taken from `config.toml`'s folder. Any value written `"$NAME"` is read from that
environment variable.

### Proxies and the company's certificates

The `isorite` command uses `HTTPS_PROXY` (and `NO_PROXY`) when they're set, and trusts the system's certificate
authorities as well as Node's own, so a company's authority installed on the machine is trusted. Node does neither
by itself. Set `ISORITE_NODE_DEFAULTS=0` to leave Node as it is.

If the company's authority isn't installed on the machine, name its certificate as `ca` above, or in
`NODE_EXTRA_CA_CERTS`.

## 3. Your notes

A folder of Markdown files. To start from nothing:

```sh
isorite new ~/notes/my-project
isorite serve ~/notes/my-project
```

`isorite new` makes the folder, empty but for isorite's own `.isorite/`. A folder of notes you have already is
opened as it is, with `isorite serve`.

It prints a link to click: `http://localhost:4767/`. isorite keeps what it needs in the folder's `.isorite/`.

## 4. The terminal

```sh
cd ~/code/my-project
isorite term ~/notes/my-project
```

It prints the same link, and which models the terminal uses. OpenCode uses the provider above, through isorite. More
is in [terminal.md](terminal.md).

## Search by meaning (optional)

```sh
isorite model
```

It says which model is installed and where, or fetches it (53 MB, once): from npm, else from a release on GitHub,
else from Hugging Face. Without it, Iso searches by words and follows links. Where none of those can be reached,
copy the model's folder from a machine that has it (`isorite model` there says where it is) and run
`isorite model --from <folder>`. Any compatible model works the same way: an ONNX model that gives 384 numbers,
with its `tokenizer.json` (for example all-MiniLM-L6-v2, with `{"pooling": "mean"}` in an `isorite-model.json`
beside it).

## When something fails

If a gateway is down for a moment (it answers 502, 503 or 504, or drops the connection), Iso and the terminal ask
it again, up to three times. When it stays down, Iso says it's likely the gateway, not your settings, and the ↻
under the turn sends it again.

```sh
isorite doctor ~/notes/my-project
```

It checks, in turn: the configuration, how Node reaches the network (the proxy, the authorities), the provider
(its list of models, a reply of a few words from each model, and a tool call: a few hundred tokens in all), the
terminal (OpenCode 2, the port, the models it will use), and the notes. Each line says what failed, and what to
change. `--offline` asks the provider nothing.

`isorite doctor --report` gives all of it as one block, with the configuration and the environment it read. The
key, passphrases and any other secrets are shown only by their length. Paste it to whoever is helping, or to an AI
helping you: [setup-for-agents.md](setup-for-agents.md) is written for it, and `isorite help setup` prints it.

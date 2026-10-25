# Milestone 13: setting isorite up at work

Written 2026-10-26, for approval. Branch `m13-setup`, from `main`.

Lachlan tried isorite at work on 2026-10-24 and called it "a nightmare". The details weren't to hand, but three
things stood out:
- connecting it to a corporate model gateway;
- the terminal integration;
- the lack of context given to the AI that was helping set it up.

This plan works from what the code does today, without the details of what failed. §5 asks for them.

## 1. What is wrong today

Found by reading the code at `fbb6434`.

**The gateway.**
- `complete()` (`engine/src/provider.ts`) sends exactly one form of auth: `Authorization: Bearer <key>`. Some
  gateways want another header instead, such as `api-key` (Azure OpenAI) or `Ocp-Apim-Subscription-Key` (Azure API
  Management), or an extra one, such as a team or project id. None of these can be set.
- The URL is used as `<url>/chat/completions`. A gateway that needs a query, such as Azure's `?api-version=…`,
  can't be named.
- Every request asks for `stream_options: { include_usage: true }`, and tools when the turn has any. A gateway
  that rejects an unknown field answers 400 on every turn. One that strips tools, or usage, fails later and more
  confusingly: Iso never looks anything up, or the gauge stays empty.
- When the gateway can't be reached, the message is "<name> could not be reached: fetch failed". Node keeps the
  real reason in `err.cause` (a certificate it doesn't trust, a name it can't find, a refused connection, a proxy),
  and isorite drops it.
- **Proxies and the company's own certificates.**
  - Node's `fetch` ignores `HTTPS_PROXY` unless `NODE_USE_ENV_PROXY=1` is set when it starts.
  - It doesn't trust the company's certificate authority unless it's started with `--use-system-ca` or given
    `NODE_EXTRA_CA_CERTS`.
  - Neither is set or mentioned anywhere.
- With `[provider] url` set and no `[tiers]`, the tiers keep OpenRouter's model names (`anthropic/claude-…`). A
  gateway answers 404 for them. The 404 advice says the model may not exist, but not that the names came from
  OpenRouter.

**The terminal.**
- `docs/terminal.md` tells you to run `isorite study init`. That command is gone since format 2 (M12), so the
  guide fails at its first step.
  - It also describes lenses and the Ask, Write and Understand modes, which M12 replaced.
- The terminal's gateway block in OpenCode's settings (`opencode/src/home.ts`) has the same gaps: Bearer only, no
  headers, no query.
- With no key in `config.toml`, `isorite term` quietly falls back to OpenCode's own free models. Those usually
  can't be reached from inside a company, and nothing says that's what happened.

**The AI helping.**
- The npm package carries only the README. An AI helping someone set isorite up has nothing to read about it:
  - the config file and its fields;
  - the environment variables;
  - the folder layout (`.isorite/`);
  - what `isorite term` starts;
  - what a working setup looks like.
- `docs/ISORITE_CONTEXT.md` and `docs/ISORITE_DOC.md` are about building isorite, not setting it up.

## 2. What to build

1. **`isorite doctor [notes folder]`.** It checks each of these in turn and prints a line for each: passed, or
   what failed and what to change.
   - The config file parses, and names a provider and models.
   - The gateway's address resolves, and a connection to it works. Through the proxy when `HTTPS_PROXY` is set,
     and with the certificate trusted; if not, Node's real reason and the setting that fixes it.
   - `GET /models` answers (optional: some gateways have none), and each tier's model is among the models listed.
   - One tiny streamed completion per tier: it answers, it streams, and it reports usage.
   - One tiny completion with a tool: the model calls it.
   - The terminal: an OpenCode 2 binary is found, its version, port 4767 is free or isorite's, and the gateway
     block OpenCode will be given.
   - The notes folder, when one is named: it opens, its `.isorite/` is format 2, and the repository in its
     `settings.toml` exists.

   `isorite doctor --report` prints the same results as one block to paste to an AI or into an issue. The block
   gives versions, the platform, the config with the key replaced by its length, and the environment variables
   isorite reads (values of keys hidden). The checks cost a few hundred tokens in all, said before they run.
2. **Gateway settings in `[provider]`**, used by Iso and passed into OpenCode's settings alike:
   - `headers = { … }`, sent with every request. A value may name an environment variable as `"$NAME"`, so a
     second secret needn't be written into the file.
   - `key_header = "api-key"` to send the key in that header, as it is, in place of `Authorization: Bearer`.
   - `query = { "api-version" = "…" }` added to every request's URL.
   - `stream_usage = false` for a gateway that rejects `stream_options`. The gauge then counts what it can and
     says, in its tooltip, that the gateway doesn't report usage.
   - The 404 advice names where the model's name came from: the tier set in `config.toml`, or OpenRouter's
     default.
   - **A client certificate (mTLS).** Many company gateways ask for one; Lachlan's does (a
     `.pfx`, on Linux, 2026-10-26). `cert = "…pem"` and
     `cert_key = "…pem"` (or `pfx = "…p12"`), with `cert_passphrase = "$NAME"` when the key has one, and
     `ca = "…pem"` for the gateway's own authority. Node's `fetch` can't be given a client certificate without
     the `undici` package, so Iso's requests to the gateway go through `node:https` with them (`complete()`
     already takes its fetch from `http`). OpenCode runs on Bun and can't be given one through its settings, so
     `isorite term` points OpenCode at a relay in isorite's own server, on localhost, which adds the
     certificate, the headers and the query and passes the request on. The relay answers only OpenCode, by the
     token isorite gives it.
3. **Network errors say why.** `err.cause`'s code and message are kept in Iso's error and in `doctor`. The common
   ones each get one line of advice:
   - an untrusted certificate: `--use-system-ca` or `NODE_EXTRA_CA_CERTS`;
   - a name that can't be found, or a refused connection: check the URL, or the proxy;
   - a timeout.
4. **Proxies and certificates without extra flags.** When `HTTPS_PROXY` or `HTTP_PROXY` is set, the `isorite`
   command runs with `NODE_USE_ENV_PROXY=1`. It always runs with `--use-system-ca` (Node 24 has both). It re-runs
   itself once with them set, and passes them on to the server it starts. OpenCode runs on Bun, which reads the
   proxy variables itself. Q56 asks whether to do this by default.
5. **`isorite term` says where isorite is, and which models it uses.**
   - Before OpenCode takes the screen, it prints the address of isorite in the browser as a link (OSC 8, which
     most terminals let you click), and prints it again when OpenCode exits. `isorite serve` does the same.
   - Over SSH (`SSH_CONNECTION` is set), it also prints the forwarding command to run on your own machine,
     `ssh -L 4767:localhost:4767 <host>`, since `localhost` there isn't this machine. Lachlan ran the terminal
     this way at work. A forwarded port arrives as `localhost`, which the server already accepts, and a
     different local port is fine because the Origin is checked against the Host as it arrives. A test covers it.
   - The models are said at start, with where they came from: `config.toml`, the
   `ISORITE_GATEWAY_*` variables, or OpenCode's own because no key was found.
6. **The guides.**
   - `docs/terminal.md` rewritten for M12: `.isorite/`, the switches, the gauge; no `study init`.
   - A new `docs/setup.md` for people: install, a key or a gateway, a first base, the terminal, and `doctor` when
     something fails.
   - `docs/setup-for-agents.md` for an AI helping someone. It covers every config field and environment
     variable, the files isorite writes and where, the commands, what working output looks like, and the common
     failures and their fixes. It ends with "run `isorite doctor --report` and read it first".
   - Both go into the npm package. `isorite help setup` prints the agents' guide, and the README points to both.
7. **Tests.** The scripted provider gains switches for each kind of gateway:
   - it wants `api-key`;
   - it wants an `api-version` query;
   - it rejects `stream_options`;
   - it drops tools;
   - it is behind an untrusted certificate.

   Engine tests cover the settings. `doctor` is tested against each kind, and with no network. `term`'s OpenCode
   settings are tested to carry the headers and the query.

## 3. Order of work

1. Network errors say why (item 3), with its tests. It's small, and it's what Lachlan would have seen.
2. The gateway settings (item 2), in Iso and in OpenCode's settings.
3. `isorite doctor` and `--report` (item 1).
4. Proxies and certificates (item 4), and `term` saying its models (item 5).
5. The guides (item 6): terminal, setup, setup for agents, `isorite help setup`, the README.
6. A real check, on Lachlan's OpenRouter key, against a temporary copy of a base. `doctor` passes, and one turn
   each with Iso and with the terminal works. Cost reported.
7. The write-up in §6.

No new npm packages are needed. Proxies, certificates and the checks all use what Node 24 has.

## 4. What is not in it

Nothing here is particular to one workplace. Each setting is one that company gateways commonly need (other
headers, a query, a client certificate, a proxy, the company's own authority), named as such, and the guides
describe them that way.


- **Signing in through the company** (OAuth, SSO, short-lived tokens refreshed by a command). Q55 asks whether
  the gateway needs it. If it does, a `key_command` setting would run a command for the key before each session.
- **Any gateway that isn't OpenAI-compatible**, such as Bedrock's or Vertex's own APIs. A gateway like LiteLLM in
  front of them is the way.
- The tutorial and M10d's items (T9–T11, V11–V12), and the phone L2 walk failure (the card covers the Undo button).
  That failure was found on `main` while fixing the zoom, on 2026-10-26.

## 5. Questions

- **Q54: Which gateway is it?** *Answered 2026-10-26: OpenAI-compatible, and it asks for a client certificate
  (mTLS). The product doesn't matter much beyond that. Still open: does it also want a key, and in which
  header? A redacted `curl` command that works would answer it.*
- **Q55: How do you get its key?** A long-lived key you paste, or one that comes from signing in and expires?
- **Q56: Proxy and certificates by default?** Run `isorite` with the system's certificate authorities and the
  proxy settings always (proposed), or only when `doctor` finds they're needed and you turn them on.
- **Q57: What went wrong with the terminal?** Did it start at all? Did OpenCode reach the gateway? Did Iso's pane
  show the session? If you don't remember, `doctor --report` at work will tell us.

- **Q58: The client certificate.** *Answered 2026-10-26: a `.pfx`, on Linux. Node reads `.pfx` with its
  passphrase as it is, so nothing needs converting.*

## 6. What was built

(Written as the work is done.)

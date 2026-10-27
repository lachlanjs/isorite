# Milestone 21: isorite at work

Written 2026-10-27; approved the same day. Branch `m21-work-setup`, from `main` at `8956a22` (0.8.0).

It comes from your notes on using isorite at work. Each point there was a place where isorite stalled, failed or
was hard to set up behind a company's network:
1. a `git` wrapper stalling startup;
2. npm's mirror serving a stale package, with 121 dependencies to resolve;
3. the model for search by meaning not being fetched;
4. an OpenCode 1 on the PATH, and nowhere private to put OpenCode 2;
5. a gateway that wants `Authorization: Bearer` with the key, set up with `key_header`;
6. `doctor` not seeing any of these;
7. the browser asking for a password when the terminal opened a page.

Your footnote stands: the proxy's 407 (realm "ASD Second Party (2P)") is a separate cause, and none of this fixes
it. §2.8 only makes isorite name it.

M21 changes no note, base or Atlas. It's the command, the server, the OpenCode plugin and `doctor`.

## 1. What is there today

- **Git at startup.**
  - `serve` runs one `git` command: `git rev-parse --show-toplevel` in `studybase.ts`. It's used only to look for
    a format-1 study base beside the repository, so that `serve` can say to move it.
  - The command has no timeout and runs whatever `git` is first on the PATH. A wrapper that waits on the network
    stalls `serve` and `term`, which start it, with nothing printed.
  - `isorite memory` runs `git init`, also with no timeout.
  - The only other subprocess with a timeout is OpenCode's `--version` (15 s).
- **Installing.**
  - The `isorite` package bundles every `@isorite/*` package, but its npm dependencies are installed by npm, as
    are theirs (`scripts/package.ts`).
  - OpenCode's plugin is TypeScript run by OpenCode's Bun from `plugin/`.
  - The server's embedding worker is a file of its own, and the built app is in `web/`.
- **The model** (`model.ts`) is tried in this order, each file checked against its SHA-256:
  1. npm (`isorite-model-granite@1.0.0`);
  2. the `.tgz` on a GitHub release (`RELEASE`, a fixed URL);
  3. Hugging Face.
  - When all three fail, `ModelFetchError` lists why each failed. It doesn't say which file to fetch by hand, or
    its checksum.
  - `--from` takes a folder of the files, not the `.tgz`.
  - There's no setting for a mirror's address.
- **OpenCode** (`opencode.ts`): `ISORITE_OPENCODE`, else `opencode2`, else `opencode`, the first whose
  `--version` is 2.x.
  - Otherwise it says "needs OpenCode 2" and `npm i -g @opencode/cli`. That's the global prefix, which at work
    may be locked, or may be the OpenCode 1 you use.
- **The key** (`provider.ts:218`):
  - with no `key_header`, the key is sent as `Authorization: Bearer <key>`;
  - with `key_header`, it's sent in that header *as it is*, with no prefix.
  - So `key_header = "authorization"` sends `Authorization: <key>`, which a gateway refuses with 401. The only
    way to get Bearer is to leave `key_header` out. The Iso settings field only says "left empty, Authorization:
    Bearer".
  - `doctor` reports a 401 by its number and a guess. The gateway's own message, which often says "missing Bearer
    prefix", isn't shown.
- **The browser and OpenCode** (`term.ts`):
  - `term` starts `opencode serve` on 127.0.0.1 with a password of its own (`OPENCODE_PASSWORD`, behind Basic
    auth). The terminal attaches to it, and so does the isorite server.
  - isorite's own pages never go to OpenCode.
  - But OpenCode's own "open in browser" action (`opencode.browser`) opens that server's web page. The browser asks
    for a user and password that you were never given.

## 2. What M21 does

### 2.1 Git can't stall startup (note 1)

- **No `git` at all to find the repository.** `defaultStudyPath` walks up from the folder looking for `.git`, which
  is a directory or, in a worktree or submodule, a file. It's the same answer for this use, and doesn't depend on
  any `git` or wrapper.
- **`git init` in `isorite memory`** gets a 10 s timeout and a plain environment: `GIT_CONFIG_NOSYSTEM=1`, and no
  `GIT_*` inherited from the shell.
  - If it times out or fails, the memory is made anyway. isorite says "not a git repository: `git init` it
    yourself" rather than failing.
- **Said at once.** `serve`, `term`, `mcp` and `guide` print `isorite: starting…` to stderr before anything else,
  including before the proxy's rerun (`network.ts`). From then on each slow step says what it's waiting for, if it
  takes more than 2 s: "waiting for OpenCode's server", "waiting for the isorite server (its output is in …)".
- **OpenCode's own `git`.** OpenCode may run `git` in the folder you start it in, and isorite can't time that out.
  - `term` passes `GIT_CONFIG_NOSYSTEM=1` and `GIT_TERMINAL_PROMPT=0` to OpenCode, so a credential prompt can't
    hang it.
  - If OpenCode's server still hasn't answered after 10 s, `term` says so and names its log.

### 2.2 One file to install (note 2)

- **A single executable for each platform** (linux-x64, linux-arm64, darwin-arm64, darwin-x64, win-x64), attached
  to the GitHub release for each version, with a `SHA256SUMS` beside them.
- **Built as a Node single executable application (SEA), not with `bun build --compile`.** *Recommended*
  (Q97):
  - isorite's network handling depends on Node: the system's authorities by `setDefaultCACertificates`, and the
    proxy by `NODE_USE_ENV_PROXY` (`network.ts`). Under Bun, both would have to be found again and tested again on
    your network.
  - A SEA runs the same Node and the same bundle that npm installs now. The app, the plugin, the guide, the
    example and the WebAssembly file go in as SEA assets.
  - The worker and the plugin are written out to `~/.cache/isorite/<version>/` the first time they're needed,
    since a worker and OpenCode both read files from disk.
  - The spike found that OpenCode doesn't provide the plugin's `@opentui/core`, `@opentui/solid` and `solid-js`.
    The plugin failed to load without them. So each platform's executable carries them, with `@opentui/core`'s
    native library for that platform: about 25 MB.
  - The executable is about 110 MB, against about 15 MB for npm. The model stays out of it (§2.3).
- **`install.sh`** (and `install.ps1`):
  - fetches the one executable for this machine and checks it against `SHA256SUMS`;
  - puts it in `~/.local/bin`, or the folder you name;
  - prints each URL it fetches, so it can be fetched by hand instead.
  - `--url <url>` gives it the executable's address directly, for a mirror. The installer has no environment
    variable of its own (Q98).
- **npm stays.** `npm i -g isorite` is unchanged. The docs give the executable first where npm is hard.
- **`isorite upgrade`** isn't in M21. The installer, run again, replaces the executable.

### 2.3 The model through a mirror (note 3)

- **`ISORITE_MODEL_BASE_URL`** (Q98), read by `isorite model` and `doctor`.
  - It's the folder the `.tgz` is in: the model is fetched from `$ISORITE_MODEL_BASE_URL/isorite-model-granite-1.0.0.tgz`.
  - When it's set, it's tried first, before npm. The GitHub release and Hugging Face are still tried after it.
  - No other mirror variable is read. Your company has none.
- **`isorite model --url <url>`** fetches the `.tgz` from that one address, checked by its SHA-256 as the release's
  is, and tries nothing else.
- **`isorite model --from <path>`** takes the `.tgz` as well as a folder.
- **The release's `.tgz` gets its SHA-256 in the code** (`RELEASE_SHA256`). It's checked before it's unpacked, as
  well as each file inside it.
- **When nothing works**, the error ends with something you can copy:

  ```
  Fetch this file another way (a browser, or a machine that can reach it):
    https://github.com/lachlanjs/isorite/releases/download/model-granite-1.0.0/isorite-model-granite-1.0.0.tgz
    SHA-256 4c1e…
  then run:
    isorite model --from ~/Downloads/isorite-model-granite-1.0.0.tgz
  ```

  The same lines are printed by `isorite model` before it starts, and by `doctor` when the model is missing.

### 2.4 OpenCode 2 without touching the global prefix (note 4)

- **A place of isorite's own:** `~/.config/isorite/opencode-cli/`, an npm prefix used only for OpenCode 2. It's not
  `~/.config/isorite/opencode/` as your note had it: that's the OpenCode config folder `term` writes
  (`OPENCODE_CONFIG_DIR`, with the plugin and theme), and an npm prefix there would put a `package.json` and
  `node_modules` among OpenCode's own configuration. It's looked
  in after `ISORITE_OPENCODE` and before `opencode2` and `opencode` on the PATH.
- **`isorite opencode`** installs or updates OpenCode 2 there, with
  `npm install --prefix ~/.config/isorite/opencode-cli @opencode/cli@<the version isorite is tested with>`. It says
  where it's put, and that nothing global was changed.
- **When `term` finds no OpenCode 2:**
  - if it finds an OpenCode 1, it says so in one line, and gives the line above;
  - it then asks `Install OpenCode 2 for isorite only, in ~/.config/isorite/opencode-cli? [y/N]`. When it isn't run
    in a terminal, it doesn't ask, and only says the line.
- **Pinned to one version.** Today OpenCode's `2.x` is accepted. The one isorite installs is the one its
  `@opencode/client` is (2.0.32), so a newer OpenCode can't break the plugin unseen. One you name with
  `ISORITE_OPENCODE` is still yours to choose.
- This uses npm too, so a stale mirror can still fail it. Then `ISORITE_OPENCODE` naming an OpenCode 2 executable
  fetched another way is the answer, and the message says so.

### 2.5 The key with Bearer, in any header (note 5)

- **`key_prefix`** under `[provider]`: the text sent before the key. The rules:
  - with no `key_header`, it's `"Bearer "` as today;
  - with a `key_header`, it's `""`, as today, unless you set it;
  - so `key_header = "Authorization"` with `key_prefix = "Bearer "` works, and so does any other header with any
    other scheme.
- **`key_header = "authorization"` with no `key_prefix`** is taken to mean Bearer. Sending a bare key in
  `Authorization` is almost never what a gateway wants, and it's an easy setting to reach for. *Recommended* (Q99);
  `key_prefix = ""` still sends it bare.
- **The Iso settings** get a "prefix" field beside the header's. It's filled with `Bearer ` when the header is
  `Authorization`, and its tooltip says what's sent: `Authorization: Bearer sk-…`.
- **The gateway's own words on a 401 or 403**:
  - the first 300 characters of the body, as its `error.message` or as text, with anything that looks like the key
    removed;
  - shown in `doctor`, in the settings' check, and in the error Iso shows.
  - `doctor` also says how the key went: "sent as `Authorization: Bearer <41 characters>`".
- **The docs.** `key_header` is set by hand and never written by isorite. The docs' example stays
  `key_header = "api-key"` (`docs/setup.md:60`, `docs/setup-for-agents.md:56`). They get a second example beside
  it for Bearer in another header: `key_header = "X-Gateway-Auth"` with `key_prefix = "Bearer "` (Q100).

### 2.6 `doctor` sees these (note 6)

One new step (`git`), and five that exist made to say more. Each says what to change:

| Step | ok | warn / fail |
| --- | --- | --- |
| `git` (new) | `git --version` answers within 3 s | warn: it took *n* s, or didn't answer, which is likely a wrapper. isorite no longer waits on it, but OpenCode may (§2.1) |
| `opencode` | which one, from where (`~/.config/isorite/opencode-cli`, the PATH, `ISORITE_OPENCODE`), its version | fail: only 1.x found, with the `isorite opencode` line |
| `search by meaning` | installed, where | warn: missing, with the URL, SHA-256 and `--from` lines of §2.3. With the network checked, whether the release URL (or the mirror's) answers |
| `key` | as now, plus the header and prefix it's sent with | warn: `Authorization` with no prefix (now meaning Bearer, §2.5) |
| `reached` | as now | fail: the gateway's own words (§2.5) |
| `proxy` | as now | fail: a 407 is named as the proxy asking for credentials, with its realm, apart from the gateway's 401 |
| `browser pages` (new) | a hint, always: "`isorite term` runs OpenCode's own web server on a random port, behind a password; open isorite's pages and panes, not OpenCode's". If an isorite server answers on the port, its page and `/api/session` are asked as a browser asks them, and neither asks for a password | fail: an isorite page answered 401 with `WWW-Authenticate` |

`doctor` can't see OpenCode's server itself. Its port is chosen afresh by each `term` and exists only while that
`term` runs, so that check is `term`'s (§2.7, Q101).

### 2.7 The browser stays on isorite's pages (note 7)

- **What the spike found** (§8, step 1) changed this section:
  - `opencode.browser` isn't a TUI action. It's the server plugin behind the agent's `browser.*` tools, which need
    OpenCode's desktop app, so there's nothing to override in the TUI.
  - What leads you to OpenCode's page is `/web`, the TUI's "Pair device" (`/pair`). It shows a link
    `/auth/connect/<token>` that logs the browser in once, with a cookie, and expires in 5 minutes. Opened a second
    time, or after it expires, or by going to the server's address directly, OpenCode's page loads, but its calls to
    `/api/*` are answered `401` with `WWW-Authenticate: Basic realm="Secure Area"`. That's the browser's prompt.
  - OpenCode's root is served to anyone (200). Only `/api/*` asks for the password. `opencode serve` has no flag to
    serve the API without the page.
- **In the plugin** (`packages/opencode/plugin/tui.tsx`), isorite registers `/web` itself, as "isorite in the
  browser", which opens the base's page (`Isorite.url`).
  - The spike checked this in OpenCode 2.0.32: isorite's `/web` is listed first and runs. OpenCode's pairing is
    still `/pair`, and the title says so.
  - A test in `term.test.ts` types `/web` and checks that the page opened is isorite's, with a stub `xdg-open`.
- **OpenCode's server stays on 127.0.0.1 with its password**, as now. It has to be reachable, because the terminal
  and the isorite server attach to it.
- **`term` checks the server it has just started** (Q101):
  - once OpenCode's server answers, `term` asks for `/api/session` as a browser would, with `Accept: text/html` and
    no credentials;
  - if the answer is `401` with `WWW-Authenticate: Basic`, the page on that port asks for a password, so `term`
    says once, before the TUI starts: "OpenCode's own web page is on port <n> and asks for a password: don't open
    it; isorite's page is <url> (/web in the terminal)".
  - Asking for `/` would not see it: OpenCode serves its page there without the password, and only `/api/*` asks.
- **Kept apart from §2.5**, as you asked: that's the gateway's 401, with Bearer; this is the browser meeting
  OpenCode's Basic auth.

### 2.8 Not in M21

- The proxy's 407 itself (your footnote). Only the doctor line of §2.6 names it.
- `isorite upgrade`, signing the executables (macOS Gatekeeper and Windows SmartScreen will warn), and a Homebrew or
  winget package.
- The model inside the executable. That would put 53 MB more in every upgrade.
- An OpenCode executable fetched without npm. That waits on OpenCode publishing one.

## 3. Tests

- **Unit, server:**
  - `defaultStudyPath` with `.git` as a directory, as a file (worktree), and absent, with a `git` on the PATH that
    sleeps for 60 s (the test fails if it's run);
  - `isorite memory` with a `git` that hangs, finishing within its timeout;
  - `starting…` printed before the proxy's rerun.
- **Unit, model:**
  - `ISORITE_MODEL_BASE_URL` (tried first) and `--url` (tried alone) against a local server;
  - `--from` given a `.tgz`;
  - a `.tgz` with the wrong SHA-256 refused before it's unpacked;
  - the failure message's URL, SHA-256 and command.
- **Unit, OpenCode:**
  - the order `ISORITE_OPENCODE`, `~/.config/isorite/opencode-cli`, `opencode2`, `opencode`;
  - the message with only a 1.x found;
  - the prompt not asked when not in a terminal.
- **Unit, engine:**
  - the headers for each combination of `key_header` and `key_prefix`, including `authorization` alone;
  - a 401's body read, cut to 300 characters, and the key removed from it.
- **`doctor`:** each new step, with a scripted `git`, OpenCode and gateway (the 401's body, and a 407 from a
  scripted proxy); `browser pages` against a server that answers 401 with Basic, and one that doesn't.
- **`term`:** the warning given when a scripted OpenCode server answers `401` with `Basic realm="Secure Area"`, and
  not given when it answers the page.
- **Browser:** the settings' prefix field, filled for `Authorization`, and saved to `key_prefix`.
- **The executable:**
  - `npm run package:sea` builds the one for this machine;
  - a test runs it from an empty folder with `HOME` set to a temporary one: `--version`, `doctor --offline`, and
    `serve` on the example base answering `/api/session`;
  - the release workflow builds all five and runs that test on the three it can (Linux, macOS, Windows, x64).
- **`install.sh`:** against a local server holding a release, including a wrong checksum refused.
- **The plugin:** `/web` opening isorite's page, in `term.test.ts`.

## 4. Docs

- **`setup.md` and `setup-for-agents.md`:**
  - installing from the executable first;
  - `ISORITE_MODEL_BASE_URL` and `isorite model --url`;
  - the installer's `--url`;
  - the model by hand;
  - `isorite opencode`;
  - `key_prefix`, with Bearer in another header as the example.
- **`terminal.md`:** where OpenCode 2 comes from, and that "open in browser" opens isorite.
- **`setup-for-agents.md`'s table of failures:**
  - "stalls at start" (git);
  - "said 401" with the gateway's words;
  - "407" (the proxy, not the gateway);
  - "the browser asks for a password" (OpenCode's web page).
- **The guide's *Starting a base*** gets a line on `isorite opencode`.

## 5. Order of work

1. **Spike**, half a day, written up here before the rest is built:
   - with OpenCode 2.0.32, whether a plugin can take `opencode.browser`, and whether `serve` can run without its
     web page, and what its root answers a browser without credentials;
   - a SEA of the server with its assets, starting `serve` on Linux.
2. **Git and `starting…`** (§2.1). This is the smallest change, and it unblocks you at work today. It can be
   released on its own as 0.8.1 if you want it before the rest (Q102).
3. **`key_prefix`** and the gateway's words on a 401 (§2.5), in the engine, the config, the setup form and `doctor`.
4. **The model's mirror, `--url`, the `.tgz` with `--from`,** and the failure message (§2.3).
5. **`isorite opencode`**, the private prefix, and `term`'s message and prompt (§2.4).
6. **The plugin's `/web`, and `term`'s check** of OpenCode's page (§2.7).
7. **`doctor`'s new steps** (§2.6).
8. **The executable:**
   - `package:sea`;
   - the release workflow for five platforms with `SHA256SUMS`;
   - `install.sh` and `install.ps1` (§2.2).
9. **Docs, tests and the write-up** as §7 here. Version 0.9.0.
   - The real check is yours, at work: the installer, then `isorite model`, `isorite opencode`, `isorite term` and
     `doctor`, through the mirror and the proxy.
   - No real-model spend is planned beyond `doctor`'s provider check (under $0.01).

## 6. Questions

- **Q97: how should the single executable be built?** *Recommended: a Node SEA.*
  - It keeps the Node that isorite's proxy and certificate handling were built and tested on.
  - `bun build --compile` (as OpenCode does) gives a smaller file (about 60 MB), but moves isorite to another
    runtime. Its handling of the system's authorities and `HTTPS_PROXY` would have to be checked again on your
    network.
- **Q99: should `key_header = "authorization"` alone mean Bearer?** *Recommended: yes.*
  - A bare key in `Authorization` is rarely right, and it's an easy setting to reach for.
  - `key_prefix = ""` still sends it bare.
  - The alternative is keeping today's meaning, with only a `doctor` warning.
- **Q102: release §2.1 alone as 0.8.1 first?** *Recommended: yes*, since the stall stops you using isorite at work
  at all, and the change is small.
- **Answered 2026-10-27:**
  - **Q98:** there's no GitHub-mirror variable. `ISORITE_MODEL_BASE_URL` is introduced instead, with
    `isorite model --url <url>` (§2.3).
  - **Q100:** there was no template. That was a mistake in the notes. The docs use `key_header = "api-key"`, set by
    hand, and §2.5 keeps it as the example.
  - **Q101:** yes, scoped. `term` warns when the OpenCode server it has just started answers a browser with Basic
    auth (§2.7). `doctor` gives a hint that never changes, and checks that isorite's own pages never ask for a
    password (§2.6).
  - **Q97, Q99, Q102:** as recommended (a Node SEA; `authorization` alone means Bearer; §2.1 released alone as
    0.8.1 first).

## 7. What was built

### 0.8.1: git can't stall startup (§2.1)

Released before the rest, as Q102 answered. On branch `m21-work-setup`.

- **`git.ts`:**
  - `repoOf` finds the repository by its `.git`, a directory or a worktree's file, without running `git`.
    `defaultStudyPath` uses it, so `serve` runs no `git` at all.
  - `gitInit` runs `git init` for `isorite memory` with a 10 s timeout and `plainGitEnv`: no `GIT_*` from the
    shell, `GIT_CONFIG_NOSYSTEM=1` and `GIT_TERMINAL_PROMPT=0`. When it fails, the memory is still made, and you're
    told to `git init` it yourself.
- **`isorite: starting…`** goes to stderr from `serve`, `term`, `mcp` and `guide` before anything else, and once
  only when the command runs itself again with the proxy on (`ISORITE_STARTING`).
- **What is being waited for:**
  - after 2 s, `term` and `mcp` say they're waiting for the isorite server, and name its log;
  - `term` says it's waiting for OpenCode's server after 2 s, and names its log after 10 s.
- **OpenCode's `git` (a departure).** OpenCode is given only `GIT_TERMINAL_PROMPT=0`, not the rest of
  `plainGitEnv`. Turning off the system's git configuration for OpenCode would also change the agent's own `git`
  commands, where a company's helpers and proxy settings are usually wanted.
- **The docs:** a row in `setup-for-agents.md`'s table of failures.
- **The check:** `serve` with a `git` on the PATH that sleeps for 300 s answered in 0.75 s, and the wrapper never
  ran. Before, it stalled until the wrapper returned.
- **Tests:** server, 103 passed and 2 skipped. `start.test.ts` is new, with 5 tests.

### The spike (step 1), 2026-10-27

- **OpenCode 2.0.32's browser.** Found in its binary and by trying its server and TUI in tmux:
  - `opencode.browser` is a server plugin for the agent's `browser.*` tools, not a TUI action;
  - `/web` (alias of `/pair`, "Pair device") shows a one-time link that sets a session cookie, and a second visit
    to it is `401`;
  - `/` is served without the password, and `/api/session` without it is `401` with
    `WWW-Authenticate: Basic realm="Secure Area"`;
  - `opencode serve` has no flag to leave the page out;
  - a plugin command with `slash: { name: "web" }` comes before OpenCode's in the list and runs. With a stub
    `xdg-open`, `/web` opened `http://127.0.0.1:4813/`, isorite's page.
  - §2.7 is rewritten from this.
- **The plugin outside a checkout.** `.npm/isorite`'s plugin, copied where there's no `node_modules`, didn't load
  ("2 plugins failed"). OpenCode doesn't provide `@opentui/*` or `solid-js`, so the executable carries them (§2.2).
- **A Node 24 SEA** loads an ES module from disk with `import()` and with `require()`. The executable is 127 MB. So
  the executable will be a small CommonJS start that unpacks the package `npm run package` builds (with its npm
  dependencies inlined, and the plugin's beside it) into `~/.cache/isorite/<version>/` once, and imports its
  `dist/main.js`. Every path isorite finds by `import.meta.url` then works as it does from npm.
  - Left for step 8: `process.argv` under a SEA, and the places isorite runs itself again (`network.ts`'s rerun,
    `term`'s server), which must run the executable rather than Node with a script.
- **A departure:** OpenCode 2's private prefix is `~/.config/isorite/opencode-cli/`, since
  `~/.config/isorite/opencode/` is already `term`'s OpenCode configuration (§2.4).

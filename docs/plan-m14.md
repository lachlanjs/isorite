# Milestone 14: what broke at work

Written 2026-10-26, for approval. Branch `m14-work-fixes`, from `main` at `5b6837f` (0.3.0).

Lachlan used 0.3.0 at work and sent two lists: their own notes, and what the LLM helping them found. This
milestone fixes what made the install look broken or got in the way. Managing Iso's context (what the list in Iso's
pane shows, its layout and the extra text) is the next milestone, M15, as agreed. So is the system prompt. Setting a
gateway up in the browser comes after that.

## 1. What is wrong today

Found by reading the code at `5b6837f`.

**The Atlas.**
- **With the context switch on, a click on a note doesn't open it.** `choose()` (`Atlas.svelte`) gives the note to
  Iso, or takes it back, and returns before the open. The switch was meant to show what Iso is sent, but it takes
  over the click as well.
- **Iso's path doesn't follow the trunks.** When Iso follows a link, the Atlas lights the route between the two
  notes. `litRoutes()` (`atlas/geometry.ts`) looks for the map's own route by `a|b`, and so does `tracePath()` for
  the trunk. Both lookups go one way only. Iso's steps are given as `{from: opened, to: from}`. When Iso follows a
  link against the way the trunk runs (from a note to one that links to it, say), nothing is found. The route is
  then asked of the router afresh, and it takes its own way across the map. This is the likely cause. Step 2 starts
  by checking it with a test.

**Errors from the gateway.**
- There are no retries. A 502 or 503, or a connection the gateway drops, ends the turn as "Iso could not answer:
  …". Lachlan saw a 15-second outage that recovered by itself. The terminal's relay (`server/src/gateway.ts`) passes
  the same failures straight to OpenCode.
- The message doesn't say whose fault it is. "The gateway is down, try again" reads the same as "your settings are
  wrong".
- A failed turn has no way to send it again except typing it out again.

**Empty replies.**
- A reasoning model can spend its whole output budget thinking. The reply then ends with `finish_reason: length`
  and no text. The budget is `REPLY_TOKENS * 2` (5,000) for a turn in Iso's pane (`engine.ts:1093`). The reply is
  marked cut (`provider.ts:232`), but empty, so what shows is "[Cut off at its length limit.]" and nothing else.

**Search by meaning.**
- `isorite model` always installs into `~/.local/share/isorite/models/…`. The server also looks in
  `ISORITE_EMBED_DIR` and beside the package (`embedder.ts:21`). A model that works from either of those is
  invisible to `isorite model`, which fetches another. That's probably the "re-fetches even when a working model is
  present" that Lachlan saw.
- On failure it prints Node's bare "fetch failed". It doesn't say where it looked, what it tried, or the network
  reason that M13's `unreachable()` gives elsewhere.
- Installing without the internet is fragile:
  - The model comes from one npm name, `isorite-model-granite`. It's new, so a company's npm allow-list probably
    won't have it yet.
  - `--from` accepts only that exact export: every file must match its SHA-256. A compatible model from somewhere
    else can't be used.
  - The name and the folder are fixed in the code.
- `isorite doctor` says nothing about the model, so a base without one reports "nothing failed".

**Certificates.** (Settled by Q63: nothing to fix. As first written:) Lachlan still sets `NODE_TLS_REJECT_UNAUTHORIZED=0`, which turns certificate checking off for
everything. The `isorite` command already trusts the system's authorities, for the whole process
(`network.ts:17`). Some other part must be failing, and it isn't known which yet. The possibilities:
- OpenCode reaching the gateway itself, through `ISORITE_GATEWAY_URL`. It runs on Bun, not Node, so it doesn't
  share Node's settings.
- The model download.
- The company's root not being in the system store at all.

**Starting from nothing.** There's no `isorite new`. `serve` and `term` take an empty folder, but not a missing one
("no folder at …"), and nothing says that an empty folder is the way to start.

## 2. What to build

1. **The Atlas's click.**
   - A click opens a note, with the context switch on or off.
   - **Shift+click** gives a note or folder to Iso, or takes it back, at any time. A shift+click is the browser's
     "new window" today; the Atlas takes it over.
   - On a phone, the hold menu's "Give to Iso" becomes "Take back from Iso" for a note already given.
   - With the switch on, the Atlas shows what Iso is sent and has read, as now. The legend's "tap to give or take
     back" goes. Instead, the given marks have a tooltip that says shift+click.
2. **Iso's path along the trunks.**
   - Look up the map's own route both ways, and turn it round when it is found the other way, in both
     `litRoutes()` and `tracePath()`.
   - Only a link the map doesn't draw is asked of the router. That can happen when a folder is folded, or the link
     isn't in the map.
   - A test: Iso following a link against a trunk lights the same points as the map draws.
3. **Retries.**
   - In `complete()` (`engine/src/provider.ts`), retry when the gateway answers 502, 503 or 504, drops the
     connection (`ECONNRESET`, `UND_ERR_SOCKET`), or times out. Up to 3 retries, after 1, 2 and 4 seconds, with a
     little jitter. A `Retry-After` of up to 10 seconds is honoured.
   - Only before any of the reply has come. Once text has streamed, a retry would repeat it, so the turn fails as
     now.
   - A 429 is retried once, after its `Retry-After`. Anything else, such as 400, 401, 403 or 404, isn't retried:
     it's the settings.
   - The relay does the same before it has passed anything to OpenCode.
   - Iso's pane shows "retrying (2 of 3)" in the turn's status line while it waits.
4. **Saying who failed.**
   - The error carries a kind:
     - `unavailable`: 5xx, a dropped connection, a timeout;
     - `limited`: 429;
     - `settings`: other 4xx, `ENOTFOUND`, a certificate refused;
     - `cut`: below.
   - An `unavailable` failure reads: "work's gateway is unavailable (503), tried 4 times over 7 s: it is likely
     the gateway, not your settings". `settings` messages stay as M13 made them.
   - A failed turn gets an icon button (↻) to send it again, with the same words and what was given.
5. **Empty replies.**
   - When a reply is cut with no text, send it once more with 3 times the budget.
   - If it is still empty: "<model> used its whole output budget (N tokens) thinking, and wrote nothing. Try a
     lower tier, or raise `max_tokens` under `[tiers]`."
   - A new optional setting, `[tiers] max_tokens = 16000`, raises every budget's ceiling for providers whose
     models think at length.
6. **`isorite model`.**
   - First it says what's installed: "search by meaning: granite-embedding-small-english-r2 at <path> (sha256
     <first 12 characters>)". It says that wherever the server would find it, `ISORITE_EMBED_DIR` included, and
     then it's done.
   - When nothing is found, it lists the folders it looked in, then each source it tries and how each failed,
     with M13's reasons. It ends with what to do: `--from <folder>`, or `ISORITE_EMBED_DIR`.
   - **Any compatible model**:
     - `isorite model --from <folder>` takes a folder with `model.onnx` and `tokenizer.json`.
     - If the files are the known export, they're checked against their SHA-256 as now.
     - If not, they're checked by use: the model is loaded and embeds a test sentence, and the output must be 384
       numbers. An optional `isorite-model.json` beside them names the pooling (`"cls"`, the default, or
       `"mean"`), for models like all-MiniLM-L6-v2.
     - The model's identity (name and hash) is kept in the search index. When it changes, the base's vectors are
       made again, not mixed.
   - **Another source.** The model's `.tgz` is attached to each GitHub Release. `isorite model` tries npm, then
     the release, then Hugging Face. `docs/terminal.md` says how to copy it by hand.
7. **`doctor` checks the model.**
   - "✓ search by meaning: <name> at <path>".
   - Or "! search by meaning: no model; `isorite model` fetches it (53 MB). Search by words works without it". It's
     a warning, not a failure, as search works without it.
   - With a notes folder, it also says whether the base's vectors are from the same model.
8. **Certificates.** Lachlan's report (Q63) showed there is nothing to fix: the client certificate and the
   company's authority work with certificate checking on. `NODE_TLS_REJECT_UNAUTHORIZED=0` was a setting of
   their own, for the whole machine. `doctor` warns when it is set: "! certificate checks are off for everything
   (NODE_TLS_REJECT_UNAUTHORIZED=0): isorite doesn't need it".
9. **`isorite new <folder>`.**
   - It makes the folder (and its parents) and `.isorite/` in format 2.
   - It prints the commands that come next: `isorite serve <folder>`, and `cd <your code> && isorite term
     <folder>`.
   - No notes are written. `serve` and `term` on a missing folder say "no folder at …: `isorite new` makes one".
   - `docs/setup.md` §3 starts with it.

## 3. Order of work

1. The Atlas click (item 1) and the routes (item 2), with browser tests. They are what Lachlan met first.
2. Retries and who failed (items 3, 4), with tests against a scripted gateway that fails, then recovers.
3. Empty replies (item 5).
4. The model (items 6, 7).
5. The certificate warning (item 8).
6. `isorite new` (item 9) and the guides.
7. A real check on Lachlan's OpenRouter key, against a temporary copy of a base: one turn, and one forced retry
   through a failing proxy in front of it. Cost reported.
8. The write-up in §6, then version 0.3.1.

The mood boards apply only to item 1's tooltip, item 3's status line and item 4's ↻ button. They follow the Iso
pane board's icon buttons and status line, as the Undo button does.

## 4. What is not in it

- **Iso's context** (M15):
  - seeing what Iso is reading, separately from editing it;
  - notes in the context list in Iso's pane;
  - that list's extra text and layout;
  - the system prompt.

  Item 1 only stops the switch from taking the click.
- **Setting a gateway up in the browser.** It comes after M15.
- **Pele and code highlighting** come after that, together.
- The tutorial's items from M10d and the phone L2 walk failure.

## 5. Questions

Answered 2026-10-26:
- **Q59.** Shift+click gives a note to Iso or takes it back. Dragging it to Iso's pane works as now.
- **Q60.** `isorite new` writes no notes.
- **Q61.** Any compatible model.
- **Q62.** github.com should be reachable at work: the model goes on each GitHub Release.
- **Q63.** No bug: mTLS and the company's authority work with certificate checking on. The setting was Lachlan's own.
- Still open from M13: Q54 (which header the gateway wants the key in) and Q55 (how the key is got).

## 6. What was built

Built 2026-10-26 on `m14-work-fixes`, in six commits after the plan (`4cde860` … `aaca5b4`), then version 0.3.1.

1. **The Atlas's click** (`4cde860`):
   - A click chooses a note, and a second one opens it, whether Iso's context is shown or not.
   - Shift+click gives a note or folder to Iso, or takes it back. On a phone, the hold menu has "Take back from
     Iso" for a note already given. Dragging works as before.
   - The legend's "tap to give or take back" is gone. A given note or folder has a tooltip saying shift+click
     takes it back.
2. **Iso's path along the trunks** (`4cde860`). The cause was simpler than the plan's guess: every one of Iso's
   steps along a link was turned round (`{from: opened, to: from}`, against the comment above it). So the map's
   own route was never found, and the router drew each step afresh. Fixed, and `litRoutes()` also takes a route
   found the other way round, turned round. A unit test shows that a link followed against the map's way lights
   the map's own points.
3. **Retries** (`e8a949c`).
   - `complete()` asks again after about 1, 2 and 4 s (plus up to 0.25 s at random) when the provider:
     - answers 502, 503 or 504;
     - breaks the connection (`ECONNRESET`, `UND_ERR_SOCKET`, …) or times out;
     - answers 429: once, after its `Retry-After` if that is 10 s or less.

     It does so only before any text or tool call has come.
   - A reply broken off after it began says "<provider> broke off its reply: …", and isn't asked again.
   - `ModelError` now carries a kind: `unavailable`, `limited`, `settings` or `cut`.
   - Down for good, the turn says "<provider> is unavailable (503: …), tried 4 times over N s: it is likely
     <provider>, not your settings."
   - The relay does the same before it passes anything to OpenCode.
   - Iso's pane says "Iso's provider did not answer: asking again (2 of 3)". A failed last turn has ↻ (Send it
     again), which sends its words, given parts, mode and tier, and leaves the failed turn out of what is sent.
   - **A fault found on the way:** under the server, Hono's Node adapter puts its own `Response` in place of the
     global one. So `instanceof Response` was false for `fetch`'s replies, and the relay took every reply for an
     error ("could not be reached: no reason given"). Its unit test called it outside the server and passed;
     OpenCode's end-to-end tests caught it. Replies are now told from errors by their shape (`isResponse`), and a
     test passes the relay a reply that isn't an instance of the global `Response`.
4. **Empty replies** (`0c4cb56`).
   - A reply cut off with nothing written and no tool called is asked once more with 3 times the budget. Empty
     again: "<model> used its whole output budget (N tokens) thinking, and wrote nothing. Try a lower tier, or
     raise max_tokens under [provider] in config.toml."
   - **Departure from the plan:** the setting is `max_tokens` under `[provider]`, not `[tiers]`. `[tiers]` holds
     model names only. It is the least budget any call is given.
5. **The model** (`b2dd76b`).
   - `isorite model` first says what is installed: the name, the path, the first 12 characters of the graph's
     SHA-256, the pooling, and which place it was found by (`ISORITE_EMBED_DIR`, `--from`, beside isorite, or
     `isorite model`). Then it fetches nothing.
   - Otherwise it tries npm, the GitHub release, then Hugging Face. On failure it lists each source with its
     reason (M13's `unreachable()` for network errors) and what to do.
   - `--from` takes granite's files, which are checked by hash, or any other model, which is checked by use: it
     loads and gives 384 finite numbers.
     - The other model is kept in `models/<name>/`, and `models/use` names it.
     - `isorite-model.json` gives its name and pooling (`cls` or `mean`). The worker pools either way, and no
       longer needs `tokenizer_config.json`.
     - The index's model id is granite's as before (so existing vectors stay), or `<name>-<sha12>-<pooling>`, so a
       base's vectors are made again when the model changes.
   - **Departure from the plan:** the model goes on one release of its own, `model-granite-1.0.0`, not on every
     isorite release (53 MB each). `.github/workflows/model-release.yml` makes it when run by hand from the Actions
     tab. It packs the package as npm serves it, so the upload is GitHub's, not from home. **It hasn't been run.**
     Until it is, that source fails with "it said 404", and the others are tried.
6. **doctor** (`b2dd76b`):
   - "✓ search by meaning: <name> at <path>", "! … no model in …: isorite model fetches it (53 MB). Search by words
     works without it" (a warning: nothing fails), or "– switched off".
   - With a notes folder, whether the base's vectors are the model's.
   - Its report lists `ISORITE_EMBED`, `ISORITE_EMBED_DIR`, `XDG_DATA_HOME` and `XDG_CACHE_HOME`.
   - The `NODE_TLS_REJECT_UNAUTHORIZED=0` warning was there from M13. It now says isorite doesn't need the
     setting.
7. **`isorite new <folder>`** (`aaca5b4`):
   - It makes the folder and its parents, with `.isorite/` and its `.gitattributes`, writes no notes, and prints
     the `serve` and `term` commands with the whole path.
   - It refuses a folder with files in it already (open it as it is) and a file.
   - `serve` and `term` on a missing folder say "isorite new … makes one".
8. **The guides** (`aaca5b4`):
   - `setup.md`: `isorite new`, the model, retries, `max_tokens`.
   - `setup-for-agents.md`: commands, files, settings, variables, retries, empty replies, three new failures, and
     another model.
   - `terminal.md`: the model's sources.
   - The npm README, and the tutorial's L2 text (shift+click).

**Tests:**
- Unit tests: 302 core, 104 engine (provider: retries, 429, broken-off replies, stopping while waiting, empty
  replies), 15, 51, 65 server (relay retries and a foreign reply, `max_tokens`, the model's sources, `isorite
  model`'s reports, a real compatible model with mean pooling, `isorite new`, doctor's lines), and 45.
- OpenCode 2's end-to-end tests: 11, through the relay.
- Browser: 168 passed, 8 skipped. New: the click and shift+click with the context shown, the hold menu's "Take
  back", and the outage in Iso's pane with ↻.
- Tutorial walks: 22 of 24. The two phone walks of L2 fail as they did on `main`, where the card covers Iso's Undo
  button (§4).
- `svelte-check` and `tsc` are clean, and the autofixer reports no issues on the changed components.

**The real check:**
- One Ask turn on the low tier (Haiku 4.5), on a copy of the example base, through the retry path: 8,591 tokens in
  and 226 out, **$0.0097**. It searched, read Symplectic integrators, and answered with a link to it.
- The failing proxy in front of it was left out: the scripted tests cover the retries, with the same code.

**Not checked:**
- A real gateway outage.
- The GitHub source of the model, until the workflow is run.
- `isorite new` from the npm package.

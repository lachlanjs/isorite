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

To be written.

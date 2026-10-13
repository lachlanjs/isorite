# isorite: architecture

How the parts fit, including the parts that are not built yet. Written in milestone 0 (2026-10-13) so that the first slice is built against the interfaces the later parts need.

Each section is labelled:

- **Built:** in the repository, with tests.
- **Slice:** to be built in milestones 1 to 5, as designed here.
- **Later:** designed far enough to keep the door open. Not in the first slice.
- **Open:** undecided.

`docs/format.md` says exactly what is on disk. `docs/decisions.md` says what was decided and by whom.

## 1. The shape

```
                     ┌────────────── the person's devices ──────────────┐
 knowledge base      │  app (SvelteKit SPA)      terminal agent (later) │
 (git, shared)  ◄──► │        │  Api                    │  MCP          │
                     │        ▼                         ▼               │
 study base          │  engine: notes, journal, Iso, search, study      │
 (git, private) ◄──► │        │ ports: Files, Http, Clock, Secrets      │
                     │        ▼                                         │
                     │  core: pure functions over text                  │
                     └──────────────────────────────────────────────────┘
                              │ Http
                              ▼
                     model provider (OpenRouter, a compatible endpoint, a gateway)
```

Three layers, each allowed to know only the one below it.

| Layer | Package | What it is | Runs in |
|---|---|---|---|
| core | `@isorite/core` | Parsing, the link graph, keyword search, the journal, placing Iso's text, understanding, the Atlas layout. Text in, data out. No file system, no clock, no network. **Built.** | anywhere |
| engine | `@isorite/engine` | Everything that has state or talks to the outside: the note store, the journal's writer, Iso's loop, providers, search by meaning, the study record. Written against five small ports, never against Node. **Built** in milestones 1 and 2: the note store, the journal's writer, sessions, events, Iso's loop, the provider, search by meaning. The study record's exercises are **slice**. | Node now; a Tauri webview later |
| shells | `isorite` (server and command), `@isorite/app`, later the terminal plugin and the Tauri app | Adapters. The server gives the engine Node's files and exposes it over HTTP. The app draws. **Slice.** | |

**Why an engine separate from the server** (a change from rdstudio, where all of it was in the command-line package). On a phone there is no local server to run. If the note store and Iso's loop are written against `node:fs` and Hono, mobile means writing them a second time, and the lesson recorded from rdstudio is that two implementations drift within days. Written against ports, the same engine runs in the Tauri webview with Tauri's file API behind `Files`. The cost now is one interface and the discipline of not importing `node:` in the engine, which a test enforces (the core already has that test).

### The ports

```ts
interface Files {                       // one per base: rooted at the base's folder
  read(path): Promise<string | null>
  write(path, text): Promise<void>      // atomic: write beside, then rename
  append(path, text): Promise<void>     // the journal and the record
  list(dir): Promise<Entry[]>
  remove(path): Promise<void>
  watch?(onChange): Unsubscribe         // optional; without it, changes are found on read
}
interface Http    { fetch: typeof fetch }               // providers; a webview has it already
interface Clock   { now(): number }                     // so sessions and the recall curve are testable
interface Secrets { get(name): Promise<string | null>; set(name, value): Promise<void> }
interface Embedder { model: string; dim: number; embed(text): Promise<Float32Array> }   // search by meaning
```

All five are built. The server's `Embedder` runs the model in a worker thread; a webview can run the same model.

### The Api

The app never calls the engine directly. It calls an `Api` object with one method per operation (`readNote`, `saveNote`, `ask`, `keep`, `layoutModel`, `events`, ...). There are two implementations:

- **HTTP** (**built**): a small client written by hand in the app (`app/src/lib/api.ts`), typed by the `Api` interface itself. rdstudio generated its client from an OpenAPI description; here the interface is shared code, so the compiler already holds the two ends together and a generated copy would be a second source of the same types. The server checks what it is sent with zod. An OpenAPI description can be added when something that is not TypeScript needs one.
- **In process** (later, for Tauri): the same methods calling the engine in the webview.

Every screen is written against `Api`, so nothing in the app knows which it has.

## 2. The two bases

| | Knowledge base | Study base |
|---|---|---|
| Holds | notes in OKF, artifacts, pictures | the journal of every note, the study record, exercises, later Iso's teaching notes |
| Whose | everyone's who has the repository | one person's |
| isorite writes into it | only a note's own text, only when the person saves or keeps | everything else |
| Git | the project's own repository | a private repository, `merge=union` on `*.jsonl` |

- A study base names the knowledge base it studies in `isorite.toml`. Nothing in the knowledge base names a study base, so the knowledge base is the same for every reader and exports clean.
- **Project mode** is a knowledge base opened with no study base: reading, the Atlas, editing and Iso work, and there is no study. **Decided (2026-10-13):** project mode still keeps a journal for each note, and with no study base it is kept in the knowledge base itself. **Later** (the slice always has a study base). Proposed place: `.isorite/journal/<note id>.jsonl`, the same entries as section 3 of `docs/format.md`, so the engine's journal writer only needs a different root. Still open: whether that folder is committed (the project's shared history, and then `who: you` must name a person) or ignored by git (each person's own).
- **Built:** `isorite study init`, the configuration, the paths, and the combined map model.

## 3. A note's life: one writer

All writes to a note go through one place, the engine's **note store**. This is what keeps the journal true.

```
save(note, text, who)
  1. read the file; if it is not what the journal last saw, enter an `external` change first
  2. write the file (atomically)
  3. append a `change` entry to the note's journal
  4. publish `note-changed` on the event stream
```

- **Your typing.** The editor sends the note's whole text a moment after you stop typing. Each save is an entry; the timeline folds a run of yours into one moment. (The document says "the person's saves in a row are one entry". The file is only ever added to, so this is done when reading, not when writing.)
- **Edits made outside isorite** (another editor, `git pull`, a terminal agent writing the file directly) are found in step 1 the next time the note is read or saved, and entered as `external`. With `Files.watch` they are found at once.
- **Two tabs or two devices at once.** A save carries the hash of the text it started from. If the file has moved on, the save is refused and the editor is given the newer text to merge. **Slice:** refuse and reload. **Later:** a three-way merge by block.
- **Journal entries from two devices** merge as a union of lines. A device that is missing an entry cannot replay past it; the next change it writes carries the whole text, which mends the chain. **Built** and tested.

## 4. Asking Iso

One request, the same from the editor and the Atlas.

```
ask { note | draft, form: insert | rewrite | note, place, asked, tier }
  │
  ├─ context is assembled (section 5)
  ├─ the loop runs: model → tool calls → model …  (rounds by tier: 3, 6, 8)
  │      each step is published as it happens:
  │        iso-step { how: keyword | meaning | link | read, note, section }   → the Atlas draws the path
  │        iso-text { delta }                                                  → the editor shows it arriving
  ├─ the reply is checked against the form (below)
  ├─ a `proposal` entry is appended to the note's journal   ← from here it survives closing the browser
  └─ iso-done { proposal id, cost }
```

- **The limit is enforced by the form, not by the prompt.** For `insert` the reply is text and its place was fixed before Iso was asked. For `rewrite` the passages the person chose are sent between numbered marks, and only what comes back between the same marks is used, each set exactly where its passage was; anything else in the reply is dropped and the person is told. What Iso says of its changes comes back between marks of its own and is offered as ordinary text. Iso has no tool that writes.
- **Unkept text never enters the note's file.** The editor reads the note and the journal's pending proposals and lays the proposals over the text at the place the core finds for them. If the place cannot be found the proposal is shown at the note's foot.
- **Keep** writes the proposal into the note through the note store (one `change` entry with `why: keep`). **Edit** appends a `revise` entry, so a half-edited proposal also survives a restart. **Remove** appends `discard`.
- **A note for Iso** (the draft started by holding on the Atlas) is the third form, `note`. The draft is a file in the study base (`drafts/<id>.md`) with its own journal, so it is "not in your base yet" in fact. Iso's reply is a proposal on the draft. "Keep as a note in `<folder>`" writes it into the knowledge base through the note store and removes the draft.
- **Stopping.** The request holds an abort signal. `[ stop ]` aborts the provider call; nothing is entered.
- **A streamed state a test can wait on:** every request has an id and ends in exactly one of `iso-done`, `iso-stopped`, `iso-failed`.

### What Iso can look at

Carried over from rdstudio: Iso is given the note and the place, and finds the rest with read-only tools.

| Tool | From |
|---|---|
| keyword search | core (`SearchIndex`) |
| search by meaning | engine (section 6) |
| outline of a note, one section of a note | core |
| a note's links, and what links to it | core |

Each note in an answer's sources carries a sentence quoted from it, checked against the note's text. A quotation that is not found is never shown as one.

## 5. Context, and what the header shows

The header shows the context's size in tokens and the session's cost. The count opens a breakdown.

The context of a request is assembled from five parts, and the breakdown is exactly these:

| Part | From |
|---|---|
| instructions and tools | the engine's prompt for the form and mode, and the tool descriptions |
| study record | a digest of the study record: what was practised, what is due, each tested note's level |
| your prompts and Iso's answers | this session's proposals in the journals, in order, as asked and as answered |
| this note | the note's text, with pending proposals marked as not yet the person's |
| linked notes | what the loop read with its tools during this request |

- **There is no separate conversation store.** The conversation is the session's journal entries. This is what makes "the prompt stays in the note's history" and "what was I asking about" the same data.
- **Clear the conversation** appends a `context-cleared` event to the study record. Earlier moments of the session are then left out of later requests. Nothing is deleted.
- **What is sent is bounded.** The conversation has a budget of 6,000 tokens: the last three exchanges go whole, older ones with Iso's text cut to 400 characters, and the oldest are left out with a line saying how many. A note has a budget of 12,000: past that, the lines round the place asked about are sent with every heading and the frontmatter, and each stretch left out is marked. Notes linked from a note for Iso share 8,000. Iso is always told what was left out, and can read the rest with its tools. **Built.**
- **A note is asked one thing at a time.** A second request while one is running is refused, so a prompt sent twice is one request.
- **Counting.** Before a request, the count is an estimate (characters over four, which is good to about 10%). After it, the provider's own figures replace the estimate for the parts it reports.
- **Cost** comes from the provider's usage figures and a price table, as in rdstudio. Per request it is on the proposal entry; per session and per base are sums over the journal.

## 6. Search

- **Keyword** (core, **built**): BM25 over notes, headings weighted.
- **By meaning** (engine, **slice**, carried over): `bge-small-en-v1.5`, 8-bit, 34 MB, run by `onnxruntime-web`'s WebAssembly build, so no native binary. Notes are cut at first- and second-level headings; each piece is embedded with its note's title and description.
- **The vectors are a cache, not data.** They are kept outside both repositories (`~/.cache/isorite/` on a desktop), keyed by a fingerprint of the text, so an edit re-embeds one section and nothing is ever committed.
- **The two searches are two tools,** not one merged list. rdstudio measured that offering both finds more than either or their merge.
- **Later, on a phone:** the model has to run on the phone in any case, because every query is embedded before it is compared, and a query is one short text. What is slow is the first pass over a whole base: about ten minutes in a phone's browser in rdstudio's measurement. **Decided (2026-10-13):** one full pass when a base is first opened on the phone, in the background and resumable, then only the sections whose text changed. This is how the cache already works (it is keyed by a fingerprint of each section's text), so the phone needs no design of its own. Keyword search and links work while the pass runs. Optional shortcut, not needed for correctness: copy the cache file from a desktop to skip the first pass. Nothing is embedded on anyone else's machine.

## 7. The Atlas

```
knowledge base bundle ─┐
study base bundle ─────┴─► mapModel (core) ─► gridLayout (core, in a worker) ─► drawing (components)
                                                                                   ▲
                 overlays, each a plain map from note id to a mark ────────────────┘
                   understanding step   (study record)
                   Iso's path           (event stream)
                   the session's moments (journals)
                   selection: what it requires, what builds on it (core graph)
```

- **The layout is rdstudio's, unchanged,** and now lives in the core so the browser, the server and a terminal read the same layout data. Its benchmark reproduces rdstudio's recorded numbers exactly. **Built.**
- **Study folders are ordinary folders** in the model, flagged, placed beside the folder they study. There is no second layout. **Built.**
- **A layout is kept by a key** made from a version number, the direction and the model. Bump the version when the layout's output changes.
- **Drawing (slice):** Svelte components over SVG, one component per kind of thing (folder, block, trunk). Only pan and zoom are imperative. Overlays never touch the layout: they are looked up by note id while drawing.
- **Measured before changed.** If SVG is slow at 225 notes, the trunk layer alone moves to a canvas under the SVG. Blocks and folders stay as elements so they keep focus, hit-testing and text.
- **Later:** stability under small edits (the layout is recomputed whole, which is accepted for now); only the open folder laid out in detail, for bases over a thousand notes.

## 8. Study

- **An exercise is a note** in the study base's `study/` folder, of `type: Exercise`, naming the notes it tests. It is edited in the same editor as any note. **Slice:** written response only.
- **Marking.** "Send for marking" is an Iso request of its own form. The reply marks lines of the working right or wrong and gives a result (right, partly, wrong). It says nothing else. The marks are a proposal-like entry in the exercise's journal, laid over the working. An `attempt` event is appended to the study record.
- **Iso speaks only when asked.** After marking, anything further is a prompt the person writes in the exercise, as in any note.
- **Understanding is a number derived from the record,** by one function in the core (**built**). The six squares, the Atlas's four steps and "due" all come from that one function. Winding back is an event, not an edit to a number.
- **Later:** the other five kinds; a recall queue; Iso's own teaching notes (`iso/` in the study base: its picture of the person, each claim citing record events); goals.

## 9. Events

One stream from the engine to every open view (server-sent events over HTTP; a plain callback in process).

| Event | Sent when | Who listens |
|---|---|---|
| `note-changed` | the note store wrote a note, or found it changed | editor, Atlas, notes list |
| `journal` | an entry was appended | editor (proposals), timeline |
| `iso-step`, `iso-text`, `iso-done`, `iso-stopped`, `iso-failed` | during a request | editor, Atlas (the path), header (cost) |
| `record` | a study event was appended | header squares, Atlas edges |
| `agent-step` (later) | a terminal agent's MCP call | Atlas (the same path drawing) |

The interface plays sound (later) by listening to this same stream and to its own interactions. The sound engine is a subscriber and nothing depends on it.

## 10. Providers and keys

- **One interface from the first line:** `complete(request, signal) → stream of text, tool calls and usage`. Adapters: OpenRouter, any OpenAI-compatible endpoint (which covers Ollama, vLLM, LM Studio and LiteLLM), an organisation's gateway. Carried over from rdstudio.
- **Three tiers** (low, mid, max), chosen by the person per request. Tier to model is configuration.
- **Keys are never in either repository and never sent to the browser.** Desktop: `~/.config/isorite/config.toml`, readable by the user only. Tauri: the system keychain behind the `Secrets` port.
- **On a phone** Iso goes through OpenRouter or a self-hosted gateway (decided). With the engine in the webview this is the same code with a different base URL.

## 11. Later parts, and what the slice must not break

### Sync

- Both bases sync by plain git. The study base is one private repository per person.
- The knowledge base can conflict like any text in git. isorite shows a conflicted note as conflicted and does not resolve it silently.
- The study base cannot conflict in its `.jsonl` files (union merge, ids). Exercises are notes and can.
- **What the slice must hold to:** every entry and event has a ULID and a device; nothing personal is written to the knowledge base; caches stay outside both repositories.

### The terminal

- An MCP server over the same engine: `brief`, `search`, `outline`, `read`, `links`, `record`. Carried over from rdstudio when this is built.
- **A terminal agent's edit to a note is a proposal** (`who: agent:<name>`) in the same journal, kept or removed in the same way. Its edits to code are the harness's own business.
- Its lookups are `agent-step` events, drawn on the Atlas with Iso's drawing.
- The one-note Atlas in a terminal calls the core's layout. It does not have a layout of its own.
- First, the experiment scoped in rdstudio and never run: what a plugin, a launcher and a custom TUI can each deliver on OpenCode and Pi.
- **What the slice must hold to:** proposals carry `who`; the engine has no notion of "the browser" as the only client.

### Mobile and desktop application

- Tauri, with the engine in the webview behind the in-process `Api`.
- The named risk is git inside Tauri on Android. One day's test before any mobile work.
- **What the slice must hold to:** no `node:` import in the engine or the core; every screen checked at 390 px as well as 1280; nothing that needs a hover to be reachable.

### Sound, automata

- Web Audio, started from the first interaction, off until chosen. A subscriber to the event stream.
- **What the slice must hold to:** interface events have names (a small list in the app), so sound can be attached without touching the screens.

### Building a base by research

- An Iso request of a form that may create many notes, each a proposal on a draft, with every claim sourced. Uses the `note` form's machinery (section 4) many times over. Needs web tools the slice does not have.

## 12. Security

- The server binds to localhost. Writes are accepted only from its own pages: the Origin must match, the body is JSON, and the request carries a token the page was given. Carried over from rdstudio.
- Note ids are checked before they become paths (**built**, in the core): no `..`, no absolute paths.
- Rendered Markdown is sanitised. Artifacts, when they arrive, are shown in a sandboxed frame.
- Text from a note is data to Iso, not instructions. Iso has no tool that writes, so the worst a hostile note can do is a bad proposal the person declines.

## 13. Testing

| What | How |
|---|---|
| core | vitest; conformance fixtures for the note reader; the layout's own tests and its benchmark against a baseline |
| engine | vitest with an in-memory `Files`, a fixed `Clock` and a scripted provider, so Iso's loop and the journal's writer are tested without a model or a disk |
| server | vitest against the real HTTP routes on a temporary folder |
| app | `@playwright/test`, selecting by text and role; each streamed state has a name a test can wait on; every screen at 1280 and 390 px on both grounds |

## 14. Questions

Answered by Lachlan on 2026-10-13:

| Question | Answer |
|---|---|
| Does project mode keep a journal? | Yes, attached to the notes in the knowledge base (section 2). |
| How the marked answer line of an exercise is recorded | As proposed: in the `attempt` event, as the working at that moment and the answer's block. The exercise's file stays plain Markdown. |
| Is a suggestion that was never kept recorded? | A suggested link (on a new note from the Atlas) is not recorded once it disappears. Text from Iso stays pending until the person keeps or discards it. |
| A "mentions" link kind | Not added. "see also" covers it. |
| How far back a journal is kept | Nothing is trimmed. See below for what to watch. |
| Vectors for search by meaning on a phone | One full pass, then only what changed (section 6). |

**What never trimming a journal costs.**

- *Size.* Each save is a line, and every 40th carries the whole note. A model run in milestone 1 (not a person: prose typed steadily at 40 words a minute for an hour into one note, in 400-character paragraphs) gives, per hour of writing:

  | A save every | Entries | Journal |
  |---|---|---|
  | 3 seconds | 1,200 | about 1.0 MB |
  | 10 seconds | 360 | about 0.3 MB |
  | 30 seconds | 120 | about 0.1 MB |

  The editor saves 1.5 seconds after the typing stops, so real writing falls somewhere in this range depending on how often you pause. Most of each entry is the paragraph being typed, written out twice (the line removed and the line added). If the week of use shows this is too much, the first remedy is to record a change within a line as the characters changed, not the whole line; the second is fewer whole-note copies. Neither changes what an entry means.
- *Reading.* The timeline replays from the nearest whole text, so opening a late version is cheap however long the file is. Listing every moment of a long-lived note reads the whole file.
- *Deleted text is not gone.* Anything typed or pasted into a note and then removed stays in its journal, and in git once committed. This is the one that matters: a pasted key or a private remark survives deletion.
- *If it becomes a problem:* old sessions can be folded to one entry each, because a `change` entry may carry the whole text and restart the chain. That rewrites a file that is otherwise only added to, so it must be done on one device and synced. A "forget this" command for one note's history is the same operation. Neither is built.

Still open:

1. Whether the project-mode journal folder is committed or ignored (section 2).
2. Whether to add a command that removes text from a journal for good.

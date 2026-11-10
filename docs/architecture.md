# isorite: architecture

How the parts fit, as built. `docs/format.md` says exactly what is on disk, `docs/decisions.md` what was decided and by whom, `docs/history.md` how it came to be. Designs that were retired (the built-in agent's own loop and its providers, study and the learner record, proposals to keep or remove, the OpenCode terminal) are in `docs/archive/`; nothing below depends on them.

## 1. The shape

```
                     ┌──────────────── the person's device ────────────────┐
 the notes           │  app (SvelteKit SPA)         the agent's own terminal │
 (a folder, git) ◄──►│        │ Api                       │ MCP             │
                     │        ▼                           ▼                 │
                     │  engine: notes, journal, search, the agent's tools   │
                     │        │ ports: Files, Clock, Embedder               │
                     │        ▼                                             │
                     │  core: pure functions over text                      │
                     └──────────────────────────────────────────────────────┘
                              │ the agent's model calls (its provider's API)
                              ▼
                     isorite's own agent (pi), or the agent you already use
```

Three layers, each allowed to know only the one below it.

| Layer | Package | What it is | Runs in |
|---|---|---|---|
| core | `@isorite/core` | Parsing, the link graph, keyword search, the journal, the Atlas layout. Text in, data out. No file system, no clock, no network. | anywhere |
| engine | `@isorite/engine` | Everything with state: the note store, the journal's writer, sessions, events, search by meaning, the agent's tools. Written against small ports, never against Node. | Node now; a webview later |
| shells | `isorite` (server and command), `@isorite/app`, `@isorite/guide` | Adapters. The server gives the engine Node's files and exposes it over HTTP, MCP and the agent routes. The app draws. | |

Beside them: `@isorite/kit` (the kit an artifact is built on), `@isorite/example` (an example base) and `@isorite/model` (the embedding model's files, published apart).

**Why an engine separate from the server.** On a phone there is no local server to run. Written against ports, the same engine runs in a webview, and the app runs in a page over files kept in IndexedDB (the guide's public site does this today). The cost is one interface and the discipline of not importing `node:` in the engine or the core, which a test enforces.

### The ports

```ts
interface Files {                       // one per base: rooted at the base's folder
  read(path): Promise<string | null>
  write(path, text): Promise<void>      // atomic: write beside, then rename
  append(path, text): Promise<void>     // the journal
  list(dir): Promise<FileInfo[]>
  remove(path): Promise<void>           // and bytes, mkdir and rmdir
}
interface Clock { now(): number }       // so sessions are testable
interface Embedder { model: string; dim: number; embed(text): Promise<Float32Array> }   // search by meaning
```

The server's `Embedder` runs the model in a worker thread.

### The Api

The app never calls the engine directly. It calls an `Api` object with one method per operation (`readNote`, `saveNote`, `layoutModel`, `events`, ...). There are two implementations: **HTTP**, a small client written by hand in the app (`app/src/lib/api.ts`), typed by the `Api` interface itself so the compiler holds both ends together; and **in process**, the same methods calling the engine in the page (the guide's site, and the tests). The server checks what it is sent with zod.

## 2. One base

The notes are a folder of Markdown. isorite's own files for them are in a hidden `.isorite/` inside it, committed with them by default (the person may keep it in a repository of its own). The journals merge by union of lines. Nothing personal is written into a note's file. What is where: `docs/format.md`.

## 3. A note's life: one writer

All writes to a note go through the engine's **note store**. This is what keeps the journal true.

```
save(note, text, who)
  1. read the file; if it is not what the journal last saw, enter an `external` change first
  2. write the file (atomically)
  3. append a `change` entry to the note's journal
  4. publish `note-changed` on the event stream
```

- **Your typing.** The editor sends the note's whole text a moment after you stop typing. Each save is an entry; the timeline folds a run of yours into one moment.
- **An agent's edit** is written at once, under its name, with what it was asked, and the person sees the words marked as the agent's and can undo them from the timeline. An agent's edit to a note is refused while the notes switch is off.
- **Edits made outside isorite** (another editor, `git pull`, an agent writing the file directly) are found in step 1 the next time the note is read or saved, and entered as `external`.
- **Two tabs or two devices at once.** A save carries the hash of the text it started from. If the file has moved on, the save is refused and the editor is given the newer text to merge by paragraph (`app/src/lib/merge.ts`). A note git left in conflict is marked and goes on being a note.
- **Journal entries from two devices** merge as a union of lines. A device missing an entry cannot replay past it; the next change it writes carries the whole text, which mends the chain.

### The timeline

- **Worked out from the journal, never stored.** `moments()` folds a note's entries into moments (your edits in a row within a session are one). `touched()` carries the lines a moment put in forward through every later change, so pointing at a moment marks those lines in today's text.
- **A version is replayed in the browser** from the journal the page already holds (`textAt`). **A restore** is the engine's: a `change` with `why: restore`, undone the same way.
- **The Atlas's timeline** is the last session's moments across notes.

## 4. The agent

isorite does not own the person's agent. There are two routes, and the app shows both the same way.

- **isorite's own agent** (`packages/server/src/pi/`, built on pi): runs inside isorite with a provider's key or a company gateway. What the person selects in a note goes straight into its prompt as a pointer, and what it may do is set by three switches (notes, project files, commands). Its sessions are kept in `.isorite/conversations/`.
- **The agent you already use**, in its own terminal, reaches the notes over MCP (`mcp.ts`, `mcp-http.ts`): a brief of the base, search by words and by meaning, the outline and text of a note, changing a note, asking a question back (made a note at once), offering text, and artifacts. `connect.ts` writes the project's MCP config.

Both use the same tools (`Engine.agentTools`, `agentLook`), so a look-up is published as an `agent-step` and the Atlas draws the path the same way whoever the agent is: a note found by keyword (dashed frame), by meaning (dotted), or reached along a link (solid, with a line along the route). A reading is shown, not hidden: what the agent read lights on the map.

These are the only two routes (decided 2026-11-09). The in-pane route to an outside agent over ACP (`acp.ts`, `acp-wrap.ts`, `isorite acp`) is retired. The pane talks to its host through `PaneSessions` (`sessions.ts`): `PiHost` is the host once a model is chosen, `NoAgent` until then, and `switchable` swaps one for the other with no restart.

**The limit is enforced by the switches, not by the prompt.** With the notes switch off the server refuses writes to notes and artifacts; project files and commands are off until switched on. Text from a note is data to the agent, not instructions.

## 5. Search

- **Keyword** (core): BM25 over notes, headings weighted.
- **By meaning** (engine): IBM's granite-embedding-small-english-r2, 8-bit, run by onnxruntime in a worker, fetched once as `isorite-model-granite` from npm (`isorite model`). Without it, search is by words. Notes are cut at first- and second-level headings; each piece is embedded with its note's title and description.
- **The vectors are a cache, not data.** Kept outside the notes (`~/.cache/isorite/`), keyed by a fingerprint of the text, so an edit re-embeds one section and nothing is committed.
- **The two searches are two tools,** not one merged list: offering both finds more than either or their merge.

## 6. The Atlas

```
the notes ─► mapModel (core) ─► layout (core, in a worker) ─► drawing (components)
                                                                   ▲
         overlays, each a plain map from note id to a mark ────────┘
           the agent's path (event stream), the session's moments (journals),
           selection: what a note requires, what builds on it (core graph)
```

- **The layout lives in the core** so the browser, the server and any other reader get the same layout. How it works: `atlas-layout.md`.
- **A layout is kept by a key** made from a version number, the direction and the model. Bump the version when the layout's output changes.
- **Drawing:** Svelte components over SVG, one per kind of thing (folder, block, trunk). Only pan and zoom are imperative. Overlays never touch the layout: they are looked up by note id while drawing.
- **The agent's path** is followed for the whole app (`app.agent`, from the `agent-*` events), so the map draws a request sent from any page or tab.

## 7. Events

One stream from the engine to every open view (server-sent events; a plain callback in process).

| Event | Sent when | Who listens |
|---|---|---|
| `note-changed` | the note store wrote a note, or found it changed | editor, Atlas, notes list |
| `journal` | an entry was appended | editor, timeline |
| `hidden` | the hidden list changed | Atlas, notes list |
| `agent-start`, `agent-step`, `agent-done` | an agent's turn, and each look-up in it | Atlas (the path), status line |
| `agent-sent`, `agent-received`, `agent-item`, `agent-taken` | something passed between a note and the agent's prompt, and what it asked back or offered | the agent pane |
| `terminal` | the agent's session changed | the agent pane |

## 8. Security

- The server binds to localhost. Writes are accepted only from its own pages: the Origin must match, the body is JSON, and the request carries a token the page was given.
- Note ids are checked before they become paths (core): no `..`, no absolute paths.
- Rendered Markdown is sanitised. Artifacts are shown in a sandboxed frame that reaches nothing but the files their manifest names.
- Keys are never in the notes and never sent to the browser: `~/.config/isorite/config.toml`, readable by the user only.

## 9. Testing

| What | How |
|---|---|
| core | vitest; conformance fixtures for the note reader (`fixtures/`); the layout's own tests and its benchmark against a baseline |
| engine | vitest with an in-memory `Files` and a fixed `Clock`, so the journal's writer and the tools are tested without a disk |
| server | vitest against the real HTTP routes and a scripted agent on a temporary folder |
| app | vitest for pure code; `@playwright/test` for the screens, selecting by text and role, at 1280 and 390 px on both grounds |
| example, guide | vitest: the example base and the guide load with no issues and every note is reached; Playwright (`npm run test:site`) drives the built site as Pages serves it |

## 10. Later

- **Sync** is plain git: the notes and `.isorite/` as one repository. What it must hold to: every entry has a ULID and a device, nothing personal in the notes' files, caches outside the repository. Ideas for a merge view are in `ideas.md`.
- **A phone or desktop app** (Tauri) would put the engine in the webview behind the in-process `Api`. The risk to test first is git inside Tauri on Android. Every screen is already checked at 390 px.
- **Sound and cellular automata** would listen to the event stream; nothing depends on them.

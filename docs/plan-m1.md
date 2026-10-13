# Milestone 1: the shell, and writing a note

Approved by Lachlan on 2026-10-13, with the change to frontmatter in section 3. Branch: `m1-shell`.

**Done when:** `isorite serve` opens a base in the browser; a note with maths and typed links can be written, closed and reopened; and its journal in the study base shows your edits as entries.

## 1. What you will be able to do

1. Run `isorite serve <study base>` and open the address it prints.
2. See the header (the logo, the path of where you are, the atlas / notes / study switch) on the lapis or the quartz ground, following the system.
3. Open **notes**: every note in the base by folder, filtered by typing.
4. Open a note and write in it. Markdown is shown as it will read (headings, emphasis, lists, code, maths, links) and turns back into source where the cursor is.
5. Make a link by typing `[[` or `[`, pick the note, and set its kind (requires, uses, see also) on the link itself.
6. Make a new note in a folder.
7. Stop typing, and the note is saved. Reopen it and it is as you left it.

**atlas** and **study** in the switch lead to a page that says which milestone builds them.

## 2. What is built

### `packages/engine` (`@isorite/engine`), new

The engine agreed in `architecture.md` section 1. In this milestone it holds:

| Part | Does |
|---|---|
| ports | `Files`, `Clock`, `Secrets`, `Http` as interfaces, and an in-memory `Files` for tests |
| base | opens a knowledge base and its study base through two `Files`; gives the bundle (notes, links, lint) and rebuilds it when a note changes |
| note store | the one writer: `read`, `save`, `create`. A save finds an outside change first, writes the file, appends the journal entry, publishes the event (architecture, section 3) |
| sessions | the current session's id: a new one after 30 minutes with no entry anywhere in the study base |
| events | one stream: `note-changed`, `journal` |
| `Api` | the interface the app is written against: `session`, `notes`, `readNote`, `saveNote`, `createNote`, `journal`, `search`, `events` |

A test fails the build if anything in the engine imports `node:`.

### `packages/server` (`isorite`)

- `isorite serve <study base>`, or `isorite serve <notes>` when a study base sits beside it. Binds to localhost and prints the address.
- Node's `Files` (atomic write, append), the clock, and the device id (made on first run, kept in `~/.config/isorite/config.toml`).
- Hono routes over the engine, described in OpenAPI, and the event stream as server-sent events.
- The write checks carried over from rdstudio: the Host, the Origin, a token given to the page, JSON only, a size limit.
- Serves the built app.

### `app` (`@isorite/app`)

SvelteKit as a single-page app with hash routes (`#/notes`, `#/n/<id>`, `#/atlas`, `#/study`, `#/parts`), Svelte 5, built with the static adapter. The same arrangement as rdstudio, so it can go into Tauri later.

| Part | From |
|---|---|
| style tokens under their final names, both grounds, with malachite | the boards' `isorite.css` and rdstudio's theme. No old names kept. |
| cut corners as layered backgrounds | rdstudio's `app.css` (the boards use `clip-path`, which is the stand-in) |
| the three faces | rdstudio's font files |
| the logo | the boards |
| the editor: CodeMirror, live preview, rendered blocks, maths, link completion, the link control, formatting keys | rdstudio's `app/src/lib/editor/`, with its tests |
| the typed client | generated from the server's OpenAPI description |
| the header, the notes list, the note page, the parts page | new, drawn from the boards (`Desktop-Editor`, `Note-Rich`, `Mobile-Note`) |

Not carried over from the editor: pins, marked places and suggestions. They belonged to rdstudio's way of showing Iso's text; milestone 2 builds proposals on the journal instead.

## 3. Choices in this milestone that need your eye

1. **Saving.** No save button. The note is saved 1.5 seconds after you stop typing, when you leave the note, and on Ctrl+S. Unsaved text is also kept in the browser, so a closed tab loses nothing. The header's path shows "saved" or "saving".
2. **Frontmatter.** The server deals in the whole file. The relevant fields (title, type, description, tags) are editable, shown in a very minimal form that can be hidden (Lachlan, 2026-10-13); other fields are left exactly as they are. A source toggle shows the file as it is on disk.
3. **A note changed elsewhere while it is open.** With nothing unsaved, the editor takes the new text. With unsaved text, the save is refused and you choose yours or theirs. No merging yet.
4. **Outside changes are found when a note is read or saved,** not by watching the folder. Watching arrives with the Atlas in milestone 3, where a live view needs it.
5. **Not in this milestone:** renaming, moving and deleting notes; pictures and artifacts; Mermaid; the logo menu. Until then a note is renamed in a file manager, and the journal enters it as a new note.
6. **The base to write in.** Milestone 1 needs a real base. I would make an empty one at `~/Repositories/information-theory` with its study base beside it at `~/Repositories/information-theory-study`, both as local git repositories with no remote. Say if they belong somewhere else.

## 4. Order of work

1. The engine: ports, the base, the note store, sessions, events, with tests against in-memory files.
2. The server: Node's ports, the routes, the checks, the event stream, with tests against real HTTP on a temporary folder.
3. The app's frame: tokens, faces, cut corners, the parts page. Looked at on both grounds at 1280 and 390 px.
4. The header and the notes list.
5. The editor, carried over, then saving and the conflict choice.
6. Browser tests, and the write-up.

## 5. How it is checked

- **Engine:** a save writes the file and one journal entry; an outside change is entered as `external` before your edit; a save from stale text is refused; replaying the journal gives the file's text; a session rolls over after 30 minutes on a fixed clock.
- **Server:** each route; each refused write (wrong Origin, no token, not JSON, too large, a path that leaves the base).
- **Editor:** rdstudio's editor tests, carried over.
- **Browser (`@playwright/test`):** write a note with a displayed equation and a `requires` link, reload, find both rendered; read the journal and find the entries; the notes list filters; every page at 1280 and 390 px on both grounds, with screenshots I look at.
- **Measured, not guessed:** how much the journal grows in a timed stretch of real typing at this save interval (the open point from `architecture.md` section 14).

## 6. Risks

- **Untangling the editor.** rdstudio's live preview leans on its 1,900-line stylesheet and its Markdown renderer. Carrying it over cleanly is the largest piece of work here.
- **The save interval and the journal.** If 1.5 seconds makes the journal grow too fast, the interval lengthens or runs of saves are folded when written. The measurement decides.
- **Svelte.** Every `.svelte` file is checked with the Svelte tool before it is committed.

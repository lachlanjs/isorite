# Milestone 22: pictures in notes

Written 2026-10-27; approved the same day. Branch `m22-images`, from `main` at `a347226` (0.9.1).

It comes from your question about how easy it is to put an image in a note, and the idea that images should
work the way web and code links do. Today a picture is a link that is understood but never drawn. M22 draws it,
lets you paste or drop one into a note, lets a note show a picture from the repository (`code:`), and puts
pictures on the Atlas beside their note, as web and code links already are.

## 1. What is there today

- **The syntax is understood.**
  - `![a sprite](sprite.png)` is a cite of kind `image` (`packages/core/src/bundle.ts:241`), as is a plain link to
    a picture. The path is relative to the note, as a link to a note is. The types are png, jpg, gif, svg, webp
    and avif (`citeKind`).
  - A cite records whether it is shown (`embed`) and its place (`align`): the title `"left"` or `"centre"`.
  - A cite to a file that isn't there is a `broken-link` warning: in `isorite check`, and to Iso.
  - The editor's link control (`app/src/lib/editor/linkControl.ts:111`) switches "Shown here" and the place.
- **It is never drawn.**
  - The app has no `<img>` anywhere. Live preview (`livePreview.ts`) handles `Link` (web, code and note links
    styled, the brackets hidden away from the cursor) but not `Image`, so the source stays as typed.
  - The server has no route that returns a file from the notes folder. `/api/*` gives notes as text only, and
    the rest of the server is the built app (`http.ts:319`).
  - An artifact (`![…](fig.html)`) is in the same state: its "Shown here" switch says it is shown, working, and
    it isn't.
- **Nothing puts a picture in the folder.** There's no paste, drop or upload. The engine's `Files` port
  (`packages/engine/src/ports.ts`) reads and writes text only; the journal records text only.
- **Code links are a kind of their own** (M12): `code:src/sim.py#L40`, against `repository` in
  `.isorite/settings.toml`. The engine checks their files every ten seconds at most (`brokenCode`), the editor
  strikes a broken one through, and the Atlas draws each as a satellite beside its note, with a switch. A
  `code:` picture is a code link like any other: `![x](code:assets/p.png)` is not a cite, and isn't shown.
- **The Atlas** draws web and code satellites (`app/src/lib/atlas/kinds.ts`) from `MapReport.notes[id].links`.
  Pictures aren't in the report.
- **The guide** (lachlanjs.github.io/isorite) runs its own engine in the browser (`app/src/lib/guide/engine.ts`)
  with the guide's notes built in. It has no server to fetch a file from.

## 2. What M22 does

### 2.1 A picture is drawn where it's shown

- **The server gives a picture**: `GET /api/file?path=<path in the notes>`.
  - Only the picture types `citeKind` knows, by extension, with their own `Content-Type`. Anything else is 404,
    so it never becomes a way to read a note's folder (`.isorite/`, keys) by another road.
  - The path is resolved as the engine resolves every path: relative to the notes folder, `/` between parts,
    never `..`, never out of the root. A path into `.isorite/` is refused.
  - Behind the host check every `/api/*` route has. A GET needs no token, so an `<img src>` works.
  - With `X-Content-Type-Options: nosniff`, `Cache-Control: no-cache` and an `ETag`, so a changed picture
    shows the change and an unchanged one costs a 304.
  - **An SVG can hold a script.** In an `<img>` it never runs, but opened on its own at isorite's address it
    would run there, beside the token. So every answer from `/api/file` carries
    `Content-Security-Policy: sandbox; default-src 'none'; style-src 'unsafe-inline'`, which keeps an SVG drawn
    and its scripts off.
  - At most 20 MB a file.
- **The engine reads bytes**: `Files.readBytes(path)` beside `read`, in the Node port and `MemoryFiles`.
- **Live preview draws `Image`**, as it draws maths and diagrams: away from the cursor, the source is replaced
  by the picture, as a block of its own on its line; on the cursor's line, the source shows, with the picture
  still below it, so you see what you're changing.
  - The alt text is the `<img>`'s `alt`, and its hover.
  - `"left"`: floated left at most half the width, the text beside it. Otherwise centred, at most the column's
    width, never scaled up.
  - Broken: a small box with the path struck through and "not in the notes", as a broken code link is.
  - A picture loads lazily (`loading="lazy"`), so a long note with many is quick.
- **A plain link to a picture** (`[the sprite](sprite.png)`) stays a link. Followed, it opens the picture in a
  view of its own in the app, not in the browser's address bar.
- **The note's reading view and the version view** (`NoteVersion.svelte`) draw it the same way.

### 2.2 Paste or drop a picture

- **Pasting a picture** (a screenshot, or one copied from a page) or **dropping a file** on the editor saves it
  and puts `![](name.png)` at the cursor, or where it was dropped.
- **Where it goes**: beside the note, in a folder named for it: `combat/hitboxes.md` puts its pictures in
  `combat/hitboxes/`. That keeps a folder of notes readable, and the link short (`hitboxes/name.png`). (Q103)
- **You name it first.** Before anything is saved, a small box opens at the cursor, with a thumbnail of the
  picture and:
  - **its name**, filled in and selected so typing replaces it: a dropped file's own name, or for a pasted
    picture `pasted-<date>-<time>`. The extension is the picture's type, shown beside the field and not typed.
    The name is made safe as you type (lower case, `-` for spaces and anything outside `a-z0-9._-`), and the
    box shows the file it will be: `combat/hitboxes/player-idle.png`. If that's taken, it says so and offers
    `-2`;
  - **its description** (the alt text), empty, with the hint "what it shows: Iso reads this, not the picture"
    (§2.6). Left empty, the name is used, with its `-` as spaces;
  - Enter saves it and puts `![description](hitboxes/player-idle.png)` at the cursor, or where it was dropped.
    Esc saves nothing.
  - Dropping several files opens one box for each, in turn.
- **The same picture twice is one file.** The app takes the picture's SHA-256 as it opens the box. If a
  picture in the notes has the same bytes, the box says "This picture is already in the notes as
  `art/sprites/player-idle.png`" and its Enter links to that one, saving nothing. "Save a copy" is beside it
  for when you want one of your own to change.
- **The server takes it**: `POST /api/file`, the same origin and token checks as every write. Its body is the
  bytes themselves, not JSON: `Content-Type` must be one of the picture types, and the folder and name are in the
  query. At most 20 MB. It never replaces a file: a name that's taken is a 409, and the app picks the next.
- **The engine writes bytes**: `Files.writeBytes(path, bytes)`, atomic as `write` is.
- **Undo**: the note's change is journaled as any edit is, so undoing it takes the link away. The picture's
  file stays. (Q104)
- **In the guide**, which has nowhere to save one, paste and drop do nothing and say why.

### 2.2b Choosing a picture to show: `[[!`

Today `[[` offers notes by title and puts in a Markdown link to the one chosen (`links.ts`), and `[[!name]]` on a
line of its own embeds a question or a problem (M12), with nothing offered as it's typed.

- **Typing `[[!` opens a picker** of what can be shown in the note: the notes folder's pictures first, then its
  questions and problems.
  - **A picture** is listed by its file name, with its folder after it, muted, and a thumbnail at its left
    (32 px, cropped square, loaded lazily as the list scrolls). The one selected shows larger beside the list,
    at most 240 px, with its size in pixels.
  - What's typed after `[[!` narrows the list, matched against the name and folder, as `[[` matches titles.
  - The pictures this note's folder holds come first, then the rest by name.
  - **Choosing a picture puts in Markdown**, as `[[` does: `![player idle](/art/sprites/player-idle.png)`, the
    description from the file name, selected so typing replaces it. The `[[!` and the `]]` bracket closing
    added are replaced. A link from the top of the notes folder (`/…`) reads the same from any note, so a
    picture several notes show has one link wherever it's written.
  - **Choosing a question or a problem** puts in `[[!name]]`, as typing it does now.
  - The last entry is always "Paste or drop a picture to add one", which does nothing but say how.
- **The app learns the pictures** from `GET /api/pictures`: each picture in the notes with its path, its size
  in bytes, its width and height, and its SHA-256 (for §2.2's same picture twice). The engine keeps them,
  reading a file's header and hash again only when its size or time changes. The list is the bundle's own
  files that `citeKind` calls pictures, so `.isorite/` is never in it.
- **The link picker** (`](` offering paths, and the link control's target) offers pictures too, by path, so a
  link can point at a picture without remembering where it is.
- **Pictures in the repository** are not in the picker in M22: a game's assets folder can hold thousands.
  `![x](code:assets/player.png)` is typed by hand. (Q108)

### 2.3 A picture from the repository

- `![the player](code:assets/player.png)` shows the repository's file, as §2.1 shows the notes'.
- It's still a code link: one of the note's outward links, with its own kind, in `brokenCode`'s check, struck
  through when the file is gone, and on the Atlas as a code satellite.
- **The server gives it**: `GET /api/file?code=<path in the repository>`, with every rule of §2.1. The path is
  `codeTarget`'s, so never `..`. With no repository named, a 404.
- `#L40` on a picture means nothing and is ignored.
- Paste and drop always save into the notes (§2.2), never the repository: isorite doesn't write to your code.

### 2.4 Pictures on the Atlas

- **The report carries them**: `MapReport.notes[id].pictures`, each `{ href, path, text, broken? }`, for every
  picture a note *shows* (image syntax), from its notes' cites and its `code:` images. A plain link to a picture
  isn't one.
- **Drawn as satellites** beside their note, after its web and code links, in the same column rules
  (`satellites` in `kinds.ts`). Each is the picture itself, small, cropped to the satellite's square, with its
  alt text as its hover. A broken one is the code link's broken mark.
- **A switch of its own**, "Pictures", beside "Web links" and "Code links". Off by default, as theirs are.
- Clicking one opens its note at the picture.

### 2.5 `isorite check` and doctor

- A broken picture is already a `broken-link` warning. Its message says "picture" where it's one, so it reads
  as the editor's mark does.
- A broken `code:` picture is as a broken code link is: struck through, and told to Iso and the terminal's
  agent once.
- **Pictures no note shows** are listed by `isorite check --unused` as information, never as a warning: they're
  yours to keep or delete. (Q104)

### 2.6 Iso and the terminal's agent

- They read the note's text, as now, so they see `![alt](path)`. The alt text is what they know of a picture.
  That's why the naming box asks for one (§2.2).
- The plugin's `read_note` tool (and Iso's own) says so: "a picture is shown as `![alt](path)`; it's described
  by its alt text, and you can't see it".
- Giving them the picture itself (a model that sees) is not in M22 (§2.8).

### 2.7 The guide

- The guide's notes can show pictures too: `build:guide` copies every picture a guide note cites into the site
  beside the app, and the guide's engine answers `/api/file` from there, so the same `<img>` works.
- A guide note gets one picture to prove it: the Atlas with its satellites on, in `atlas/the-switches.md`.

### 2.8 Not in M22

- **Artifacts drawn in place.** `![…](fig.html)` needs a sandboxed frame given the light or dark mode, and its
  own rules for what a frame may do. It's the same gap, and the next thing after M22. (Q106)
- **Iso seeing pictures**, through a model that takes images. Its cost, which models, and how much of a picture
  to send are a milestone of their own.
- **Resizing** by syntax (`=300x`, `{width=…}`). None is CommonMark; the place (`"left"`, `"centre"`) is.
- **Pictures in the terminal.** OpenCode draws text.
- **Moving a picture, or a note with its pictures' folder.** Several notes may show one picture, so moving it
  means rewriting the link in every note that shows it, as `moveNote` does for links to a note. Until then a
  moved picture is broken in the notes that show it, and says so. You can still move a picture many notes show
  to a shared folder (`pictures/`) by hand and fix its links once. (Q105)

## 3. Tests

- **core:** `citeRefs` and `citeKind` already; a `code:` image is an outward link of kind `code` and not a cite;
  the report's `pictures` from both.
- **engine:**
  - `readBytes` and `writeBytes` on `MemoryFiles` and the Node port, with an atomic write.
  - `/api/file` resolution: a picture is given, a note is not, `.isorite/` is not, `..` is not, a path out of
    the root is not; `code=` with and without a repository.
  - The paste's folder and name: safe names, `-2` when taken, never a replace.
  - `pictures()`: path, size, width and height, hash; read again only when a file changes; never `.isorite/`.
- **server (http):**
  - GET: the type, `nosniff`, the sandbox CSP, the ETag and a 304, a 404 for a `.md`, a 403 from another host.
  - POST: refused cross-origin, without the token, with a type that isn't a picture, over 20 MB, and with 409
    when the name is taken.
  - An SVG with a `<script>` is served with the sandbox CSP.
- **app:**
  - Live preview: an `Image` is a widget away from the cursor, the source and the widget on its line; `"left"`
    floats; a broken one is marked.
  - The link control's "Shown here" still turns a link into an image and back (`editor.test.ts`), and the
    picture appears and goes.
  - Paste and drop: the box's name made safe, `-2` offered when taken, Esc saves nothing, Enter saves and puts
    `![description](…)` at the cursor; the same bytes as a picture already there link to it and save nothing.
  - `[[!`: pictures with thumbnails, this folder's first, narrowed by what's typed; a picture puts in
    `![…](/….png)`, a question or problem `[[!name]]`, and the `]]` is replaced.
  - `satellites` with pictures switched on, after web and code links.
- **By hand**, in the app: paste a screenshot, drop a file, move the cursor through it, `"left"`, a `code:`
  sprite, the Atlas switch, and the guide's picture on the built site. On Windows too, through the windows
  workflow's served example (one picture in the example's notes).

## 4. Docs

- `docs/format.md`: pictures, the place, `code:` pictures, and where pasted ones go.
- `README.md`'s "Use it on your own project": one line, "paste a screenshot into a note".
- The guide: the picture in `atlas/the-switches.md`, and pictures in `notes/diagrams-and-code.md`.
- `docs/ISORITE_CONTEXT.md`: pictures drawn; artifacts still not.
- This plan's "What was built".

## 5. Order of work

1. `Files.readBytes` and `GET /api/file` for the notes, with their tests (§2.1).
2. Live preview draws `Image`, and the reading and version views (§2.1). The example gets a picture.
3. `GET /api/pictures` and the `[[!` picker (§2.2b): with step 2, a picture put in the folder by hand can be
   found and shown without typing its path.
4. `writeBytes`, `POST /api/file`, paste and drop with the naming box and the same picture found (§2.2).
5. `code:` pictures (§2.3).
6. The Atlas's pictures (§2.4).
7. Check, the plugin's word, the guide (§2.5–2.7).
8. Docs, the windows workflow's picture, and 0.10.0.

## 6. Questions

- **Q108 (answered 2026-10-27: not in M22): should the `[[!` picker list the repository's pictures too?** A game's
  assets folder can hold thousands, and listing it means walking the repository. Later, typed `[[!code:` could
  list them, narrowed by the folder typed.
- **Answered 2026-10-27, as recommended:**
  - **Q103:** a pasted picture goes in a folder named for the note, beside it (`combat/hitboxes/`), and you name
    it before it's saved (§2.2).
  - **Q104:** a picture stays when its link goes. `check --unused` lists the pictures no note shows; one shown
    by any note is used.
  - **Q105:** moving a picture, or a note with its pictures, and rewriting every note that shows it, is after
    M22 (§2.8).
  - **Q106:** artifacts drawn in place are after M22.
  - **Q107:** one release, 0.10.0.
  - **Several notes, one picture** (your question): any note shows any picture by its path; paste finds the same
    bytes and links to them instead of copying (§2.2); `[[!` and the link picker offer every picture (§2.2b).
  - **Your additions:** the `[[!` picker with thumbnails (§2.2b), and naming a picture as it's pasted (§2.2).

## 7. What was built

On `m22-images`, step by step as §5 has it. All tests pass (core 307, engine 136, server 117, app 55, guide 9); `npm run check` is clean.

- **Drawn (§2.1):**
  - `GET /api/file?path=` (or `?code=`) gives only a picture. A note, `.isorite/`, a hidden folder, `..` and a path out of the root are all 404. Every answer carries `nosniff`, an ETag (304 when unchanged) and `Content-Security-Policy: sandbox; default-src 'none'`.
  - `Files` reads and writes bytes in the Node port and in `MemoryFiles`, and `sha256` takes bytes.
  - Live preview draws `![…](…)` away from the cursor; on its line, the source shows with the picture below it. `"left"` floats it beside the text. One that can't be had is a dashed box with its path struck through. The version view draws them too.
- **`[[!` (§2.2b):**
  - The pictures come from `GET /api/pictures`: path, bytes, pixels (PNG, GIF, JPEG, WebP, SVG; `pictureSize` in core) and SHA-256, kept while a file's size and time are the same.
  - The list is found afresh each time, so a picture put in the folder by hand is listed. From then on it's in the bundle, and a link to it is no longer broken (before, only reopening the base did that).
  - Each picture shows a 32 px thumbnail, with a larger preview and its size beside the list. This note's own pictures come first, then its folder's.
  - Choosing one puts in `![described](/path)` with the description selected. Questions and problems follow the pictures, as `[[!name]]`.
  - The `](` completion offers pictures too.
- **Paste and drop (§2.2):** the naming box (`PictureName.svelte`) has:
  - the name, made safe (`Player Idle (1).png` is `player-idle-1`), and the file it will be;
  - "is taken: Enter makes it …-2";
  - what it shows;
  - the same picture already there ("Show it", or "Save a copy").
  
  `POST /api/file` takes the bytes, of the type the name says, with the same origin and token checks, and never writes over a file. Drafts and Understanding notes put theirs in `pictures/` or the note's folder, linked from the top. On the guide's site it says why it can't.
- **`code:` (§2.3):** `![…](code:…)` is one of the note's code links (`picture: true`), so `brokenCode` checks it. It's drawn from the repository.
- **Atlas (§2.4):**
  - `MapReport.notes[id].pictures` lists them; the Pictures switch (Alt+I) draws them as thumbnails after the web and code satellites.
  - A repository's picture is among the pictures, not the code links.
  - **Not in the plan:** a folder that holds only pictures, or only such folders, isn't drawn on the Atlas. Otherwise every note's pictures folder showed up as an empty folder. An empty folder still is.
- **Check, Iso, guide (§2.5–2.7):**
  - A missing picture is "picture not in the notes: …"; `isorite check --unused` lists pictures no note links to or shows.
  - Iso's format rules, `read_note` and the terminal agent's context say a picture is its words only.
  - The guide's pictures go into `isorite guide`'s folder and into the site's engine (fetched each load, never kept in the browser). `atlas/the-switches.md` has one, and `notes/diagrams-and-code.md` a section on pictures.
- **Docs and CI:** `format.md`, `ISORITE_CONTEXT.md` and the README have been updated. The windows workflow checks that the example's picture is served as `image/svg+xml` and that a note is 404 there. The example's quadtree note has a picture (`writeExample` copies pictures), and it's in the npm package.
- **Not done, or left as it was:**
  - A picture on the web (`![…](https://…)`) isn't drawn and stays a link, so a note never makes the browser fetch from elsewhere.
  - Iso's replies don't draw pictures.
  - 0.10.0 isn't released.
- **Checked by hand:** headless Chromium on Linux against the example. I checked drawing, "left", broken boxes, `[[!` with thumbnails and narrowing, a paste found to be the same picture (linked), a new picture dropped and named, the Atlas's switch, and the guide's site. Not yet checked: a real OS drag and paste, Safari, Firefox and Windows (beyond its workflow).

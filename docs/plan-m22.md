# Milestone 22: pictures in notes

Written 2026-10-27. Branch `m22-images`, from `main` at `a347226` (0.9.1).

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
- **Its name**: a dropped file keeps its own, made safe (lower case, `-` for spaces and anything outside
  `a-z0-9._-`). A pasted picture has none, so it is `pasted-<date>-<time>.png`. If the name is taken, `-2`,
  `-3`, ….
- **The alt text** is left empty, with the cursor in it, so the next thing you type describes the picture. Iso
  and the terminal's agent read the alt text, not the picture (§2.6).
- **The server takes it**: `POST /api/file`, the same origin and token checks as every write. Its body is the
  bytes themselves, not JSON: `Content-Type` must be one of the picture types, and the folder and name are in the
  query. At most 20 MB. It never replaces a file: a name that's taken is a 409, and the app picks the next.
- **The engine writes bytes**: `Files.writeBytes(path, bytes)`, atomic as `write` is.
- **Undo**: the note's change is journaled as any edit is, so undoing it takes the link away. The picture's
  file stays. (Q104)
- **In the guide**, which has nowhere to save one, paste and drop do nothing and say why.

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
  That's why paste leaves the cursor in it (§2.2).
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
- **Moving a note moves its pictures' folder.** `moveNote` rewrites links to the moved note, not the links in
  it. Until it does, a moved note's pictures are broken and say so. (Q105)

## 3. Tests

- **core:** `citeRefs` and `citeKind` already; a `code:` image is an outward link of kind `code` and not a cite;
  the report's `pictures` from both.
- **engine:**
  - `readBytes` and `writeBytes` on `MemoryFiles` and the Node port, with an atomic write.
  - `/api/file` resolution: a picture is given, a note is not, `.isorite/` is not, `..` is not, a path out of
    the root is not; `code=` with and without a repository.
  - The paste's folder and name: safe names, `-2` when taken, never a replace.
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
  - Paste and drop: the request sent, and `![](…)` put at the cursor with it in the alt text.
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
3. `writeBytes`, `POST /api/file`, paste and drop (§2.2).
4. `code:` pictures (§2.3).
5. The Atlas's pictures (§2.4).
6. Check, the plugin's word, the guide (§2.5–2.7).
7. Docs, the windows workflow's picture, and 0.10.0.

Steps 1 and 2 alone are worth having: a picture you put in the folder by hand is drawn. If it helps, they can go
out first as 0.9.2.

## 6. Questions

- **Q103: where does a pasted picture go?** *Recommended: a folder named for the note, beside it*
  (`combat/hitboxes/`).
  - The other choices: beside the note itself (a folder of notes fills with pictures), or one `pictures/` folder
    for the whole base (the links get long, and a picture is far from the note that shows it).
- **Q104: what happens to a picture when its link goes?** *Recommended: it stays, and `check --unused` lists
  it.*
  - Deleting it when the link is undone or removed would lose a picture another note might show, or that you
    meant to keep. A journal of binary files is a larger change than M22.
- **Q105: should moving a note move its pictures' folder, in M22?** *Recommended: no, later.* `moveNote` would
  need to rewrite the moved note's own links as well as links to it. Until then a moved note's pictures show as
  broken, which `check` names.
- **Q106: artifacts drawn in place, in M22 or after?** *Recommended: after.* They share the route but need a
  sandboxed frame and the theme passed in; pictures are the larger part of what people ask for.
- **Q107: one release (0.10.0), or §2.1 first as 0.9.2?** *Recommended: one*, unless your friend wants pictures
  sooner.

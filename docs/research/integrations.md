# Integrations: Tern, Obsidian, VS Code, and the phone

Researched 2026-11-09. Sources: the code in this repository, Tern's docs (docs.stencil.so/tern, read with its `.md` variants) and the Tern 0.9.9 Linux tarball inspected statically (extracted, never run), Obsidian's and VS Code's developer docs, and web searches. Where a fact comes from my own knowledge and I could not confirm it in a source this session, it is marked (unverified).

Effort tiers: S is days, M is one to two weeks, L is a month or more.

## Summary

| Integration | Best tier to build | Effort | Verdict |
|---|---|---|---|
| VS Code (and Cursor, Windsurf, VSCodium through Open VSX) | extension that installs and starts isorite, registers the MCP endpoint, shows the Atlas and agent pane in a webview, adds "send to isorite" | M | Build first |
| Obsidian: read a vault as it is (no plugin) | a wikilink and optional-frontmatter dialect in `packages/core` | S to M | Build second: it widens who can try isorite at all |
| Obsidian: plugin that embeds the local server in a view | iframe view, desktop only | M | Only after the dialect work, and only on evidence of demand |
| Obsidian: plugin that bundles the engine | engine over `Vault.adapter` | L | No |
| Tern | documentation, a `.mcp.json` the user already gets, optionally a 100-line Luau plugin | S | Do the docs; do not build more |
| Phone | a responsive read-and-capture PWA served by a desktop or hosted isorite | S to M | The cheapest credible step; the native-engine phone app is L and risky |

The thread through all of it: isorite's engine is a Node server that agents reach over MCP and ACP, and the app is a static SPA over an `Api` interface. Anything that can start a local process and show a web page (VS Code, Tern, Obsidian desktop) can host isorite with little code. Anything that cannot (Obsidian mobile, vscode.dev, a phone) has to run the engine in the page, which is the guide site's mode, and then has no agent.

## 1. What isorite exposes today (the integration surfaces)

- **HTTP API** (`packages/server/src/http.ts`): about 60 JSON routes (`/api/notes`, `/api/note`, `/api/map`, `/api/find`, `/api/agent/send`, ...) and a server-sent-event stream. Reads need only a loopback Host. Writes need the page's own Origin and a token that `GET /api/session` hands out. A non-browser client (an extension host, a Luau plugin) can set `Origin` to match `Host` and fetch the token itself, so the token is a CSRF guard and not a barrier. Nothing sets `X-Frame-Options` or `frame-ancestors` on the SPA, so it can be framed.
- **MCP over Streamable HTTP** at `/mcp` and `/b/<name>/mcp` (`packages/server/src/mcp-http.ts`): stateless, JSON replies, no token, answered only to this machine. `?agent=<name>` labels who is asking so the Atlas can draw that agent's path. This is the cleanest surface for any host that speaks MCP.
- **ACP wrapper** (`isorite acp --agent "<cmd>" <base>`, `packages/server/src/acp.ts`, `acp-wrap.ts`): isorite sits between an ACP front end and an agent and shows the session in its own pane at once.
- **`isorite doctor`** (`packages/server/src/connect.ts`): writes the project's `.mcp.json` and `opencode.json` after asking.
- **The engine behind ports** (`packages/engine/src/ports.ts`): `Files` (read, write, readBytes, writeBytes, append, list, remove, optional mkdir and rmdir), `Clock`, and the embedder (`meaning.ts`). The app talks only to `Api` (`packages/engine/src/api.ts`), and the guide site already runs the whole app in a page with the engine over IndexedDB files (`app/src/lib/guide/`). That seam is what makes an in-page or in-plugin engine feasible.
- **What is Node-only today:** git is `execFileSync("git", ...)` in `packages/server/src/git.ts` (no isomorphic-git anywhere in the repository), the embedder runs in a worker thread (`embed-worker.ts`), agent processes and the built-in agent (`packages/server/src/pi/`) are spawned or run by the server, and `readFolder` in `packages/core/src/node.ts` uses `node:fs`.
- **A PWA manifest already exists** (`app/static/manifest.webmanifest`, standalone, icons), and the viewport meta uses `viewport-fit=cover`. The architecture's standing rule is "every screen checked at 390 px as well as 1280; nothing that needs a hover to be reachable".

## 2. Tern

### What Tern is

Tern is Stencil's terminal (Rust, closed beta; a hands-on review dated 2026-10-20 describes it as a Rust terminal from the team behind the omp agent CLI). It keeps sessions in a background daemon so panes survive window close, has native "blocks" for git, SQLite, Jupyter notebooks and kanban, remote hosts, and a browser client built as WebAssembly drawn with WebGPU. `docs/tui-research.md` already records an earlier look (macOS, iOS, browser, QUIC and Tailscale sessions).

### What the tarball holds (static inspection only)

- One file: `tern/tern`, a 203 MB stripped x86-64 ELF, dynamically linked against libc only. WebKitGTK is loaded at run time (`WebKitGTK is unavailable` strings, `webkit_*` symbols), so it is not Electron or Tauri: there is no `app.asar`, no `package.json`, no bundled docs or resources to read. Drawing is its own (wgpu, Vulkan, GL), with WebKitGTK only for browser panes.
- Version 0.9.9. The strings show the closed-beta gate: it signs in to a Stencil account (`TERN_AUTH_URL`, default `https://auth.stencil.so`) and updates from `https://build.stencil.so`. A tool that needs a closed-beta account is a small audience and an unknown licence.
- The built-in help text is embedded, which gave the real command list.

### Integration surfaces that exist (docs plus the binary's own help text)

- **Plugins:** a folder with `plugin.toml` (schema 1, unknown keys are errors) and up to two Luau entries: a host half (runs in the session daemon; defines blocks and lenses) and a window half (UI thread; commands, key binds, routes, chrome, CSS). Installed with `tern plugin install github.com/OWNER/REPO[/PATH]` or `tern plugin link DIR`. No registry and no review: the community list is `awesome-tern` on GitHub plus the `tern-plugin` topic; installing runs the code with full user rights and the docs say so.
- **Plugin API** (`tern.*`): `fs`, `process`, `fetch` (any HTTP(S), including localhost), `kv`, `secrets` (system keychain), `ui` (a view tree), `block.define`, `lens.define`, `pane.write`, `command`, `bind`, `override`, `route.open`, `route.link`, `chrome.*`, `css`. Each call into a host function has a 2 s budget and a plugin VM a 256 MiB cap.
- **View elements** a block can draw: `md`, `code`, `diff`, `math` (TeX), `table`, `tree`, `list`, `chart` (bars, sparkline, heatmap, line, donut), `image` (from a blob), `media` (a file in Tern's viewer), `editor`, `input`, `el` (a plain HTML tag), plus agent-chat elements (`message`, `tool`, `trace`, `questions`, `checklist`). There is no canvas, no SVG node, no iframe or web element in the element list, and no diagram element. So the Atlas cannot be drawn by a block; at best a block shows a note list, search results and a note's Markdown.
- **Routing:** `tern.route.open(fn)` sees file opens (command palette, Files pane, drops, a path printed in a terminal) and `tern.route.link(fn)` sees link clicks, OSC 8 hyperlinks and registered URL schemes. A handler can return `{ url = ... }`, `{ block = ... }`, `{ path = ... }` or `{ handled = true }`. So "open a `.md` of an isorite base in isorite instead" is a ten-line handler returning `{ url = "http://localhost:4767/n/<id>" }`.
- **Surface Protocol (TSP):** any program on a pty can draw native elements by sending APC escape sequences (`ESC _ tsp;<verb>;<JSON> ESC \`); SDKs exist in Rust, Python, Go and TypeScript (`@stencil-hq/tern`, in the `stencil-hq/tern-sdk` repository) with a `plain` text fallback outside Tern. Keys come back as ordinary pty input. Hover and scroll are never reported. This is how `isorite find` or `isorite check` could print cards.
- **Control and scripting:** `tern ctl`, `tern serve --control EP` (a Unix socket or loopback TCP port; commands are text lines, replies are one JSON line), `tern shot` scenarios producing PNG plus layout JSON, `tern open [--split] [--wait] PATH[:LINE]` (so `EDITOR='tern open --wait'` works), `tern ls|new|split|run|send|capture|events|browser`.
- **Agents:** `tern acp <agent> [--resume|--fork|--continue|--sessions] [--model] [--mode] [--prompt] [--add-dir]` hosts an ACP agent from the ACP registry as a native chat (the binary has an "Open as ACP chat" action and caches the registry); strings show it passes MCP servers to the agent and drops those whose transport it cannot reach. There are built-in omp agents. I found no way to register an MCP server from a plugin.
- **Remote and browser:** `tern remote ...` and `tern web serve [--listen ADDR:PORT] [--token FILE]` serve the web client and the daemon; the docs say the web tab and iOS mirror plugin blocks and lenses but not window-half CSS. iOS keeps plugins in `Documents/Plugins` and has no CLI. There are browser panes (`tern browser`, a `webview` harness command), so isorite's SPA at `localhost:4767` can already be shown in a pane.

### What would be possible

- Zero code: Tern's `tern acp <agent>` runs the agent, the agent reads the base's `.mcp.json` (written by `isorite doctor`), and isorite's Atlas lights up the agent's reads exactly as it does for any MCP client. What I could not establish without running it: whether `tern acp` accepts an arbitrary command (so `isorite acp --agent ...` could be the agent) or only registry names. Test on a real Tern.
- Open the isorite SPA in a Tern browser pane beside the agent: works today, same as a browser tab. Link and file-open routing from the terminal into the SPA: small Luau plugin.
- A block that lists notes, shows search results (`/api/find`) and renders a note with `md`, talking to the HTTP API or `/mcp` through `tern.fetch`.
- TSP cards from the isorite CLI (`isorite check`, `find`, `doctor`), with a plain fallback.

### What would not be possible, or poor

- The Atlas, the editor and the artifact frames cannot be drawn natively: no canvas, SVG or iframe element. Anything spatial needs the browser pane.
- No plugin way to register an MCP server was found; a plugin cannot sandbox itself (no permission model), so a published plugin asks users to trust arbitrary code.
- The API is young (0.9.9, `schema = 1`, a closed beta); no stability promise was found. The tarball is a single closed binary, so I could not read the plugin runtime itself, only its docs and strings.
- Closed beta behind a Stencil account: the audience cannot be counted and the licence terms for distributing against it are unknown.

### Tiers

- **S (a day):** a `docs/terminal.md` section: "In Tern: `tern acp <agent>` (or the SPA in a browser pane), with `isorite doctor` for the MCP config". An entry in `awesome-tern`. Nothing to maintain except the doc.
- **S to M (3 to 5 days):** a `tern-isorite` Luau plugin repository: palette commands "isorite: find" and "isorite: open note", a route that sends links to notes of a running base to the browser pane, a block that lists and reads notes through `/api/*`. The repository is separate from isorite, versioned with Tern's schema.
- **M (1 to 2 weeks):** TSP output from the CLI through the TypeScript SDK.
- **Maintenance:** high for its size, because both sides are moving. **Distribution:** a git repository; no review and no store.
- **Verdict:** do the S doc and the `awesome-tern` listing; build the plugin only if a Tern user asks. The audience is small and gated, but it is exactly isorite's early adopter (people who run agents in terminals), so the listing is cheap and well aimed. Tern also matters for mobile: its iOS client and `tern web serve` are an existing way to reach a desktop daemon from a phone, which is the same shape as isorite's own cheapest mobile step (section 6).

## 3. Obsidian

### (a) isorite reads an Obsidian vault as a base, as it is

What `packages/core` already does with a vault:

- **`.obsidian/` and other dot-folders are skipped** (`bundle.ts` line 235 skips any path part starting with `.`; `engine.ts` lines 77 and 105 too). `.isorite/` is added beside them, and Obsidian hides dot-folders, so the two coexist. Whether Obsidian Sync carries a hidden `.isorite/` folder between devices is (unverified); plain git does it, with `merge=union` on the journals.
- **Frontmatter:** isorite requires it and a `type` (`bundle.ts` lines 323 and 324: `frontmatter-missing` and `type-missing`, both level error). A note without them still loads (empty meta, title from the file name), but every plain Obsidian note is reported as an error and `isorite check` fails.
- **Links:** `markdown.ts` reads CommonMark only (markdown-it, `"commonmark"`). Wikilinks (`[[Note]]`, `[[Note|alias]]`, `[[Note#Heading]]`, `[[Note#^block]]`) are plain text to it, so a vault has no edges on the Atlas, and the Atlas is most of the value. Markdown links resolve absolute within the base (`/folder/note.md`) or relative to the note; Obsidian's "absolute path in vault" has no leading slash, its "shortest path" setting is not relative either, and spaces may be `%20` (partly handled by `unquote`).
- **Embeds:** `![[Note]]` and `![[img.png|300]]` are Obsidian's; isorite's are `[[!name]]` on a line of its own (`kinds.ts`) and Markdown images. They do not collide (`[[!` is rare in Obsidian) but nothing reads the Obsidian form.
- **Tags:** isorite reads `tags` in frontmatter only (`Concept.tags`); inline `#tag` is ignored. **Callouts** (`> [!note]`) read as blockquotes; whether the app styles them I did not check. **Canvas** files (`.canvas`, JSON) are a `misc` file kind (`citeKind`); their `file` nodes could become edges. **Block references** (`^id`) have no counterpart. **Dataview, Templater, Excalidraw**: ignored.
- **Writing back:** what isorite's agent writes is `[text](/path.md "requires")`. Whether Obsidian resolves a leading-slash vault path and renders it as a link is (unverified; test it first). Obsidian would show `type:` and `generated:` frontmatter as properties, which is harmless.
- **Two writers:** isorite already records a file changed by something else as a journal entry with `why: external`, which is the honest model for Obsidian editing the same files.

What it takes (S to M, about a week): a markdown-it wikilink and `![[...]]` rule in `packages/core/src/markdown.ts` feeding `linkRefs` and `citeRefs`; a resolver in `bundle.ts` `resolve()` using Obsidian's rules (name or path match, case-insensitive, shortest unique) behind a base setting such as `dialect = "obsidian"` in `.isorite/settings.toml`; `type` defaulting to `Note` for such a base and `frontmatter-missing` turned off; inline `#tags`; optionally `.canvas` files read as links. The fixtures in `fixtures/` pin the OKF reading and would need a second set; the Python-parity comment at the top of `markdown.ts` shows the core is held to a second implementation's reading, which the dialect must not break (keep it behind the setting).

Value: a user opens `isorite serve ~/Vault` and sees their vault as a map with an agent beside it, without installing a plugin or converting a note. This is the best single acquisition lever in this document, because it removes "I would have to move my notes". It is also what `docs/ideas.md` already says to check first.

### (b) A plugin embedding the local server as a view

- Obsidian's API gives `ItemView` (a pane with arbitrary DOM), `registerView`, `workspace.on("file-open")`, `vault.on("modify" | "create" | "rename" | "delete")`, `app.workspace.openLinkText`, commands, ribbon icons, settings tabs, and CodeMirror 6 extensions (`registerEditorExtension`) in the editor itself. Plugins are TypeScript bundled to one `main.js` plus `manifest.json` and `styles.css`.
- Design: an `ItemView` holding an iframe at `http://127.0.0.1:4767/...` for the Atlas and agent pane (the framing is allowed by the server today). The plugin follows the active note (`file-open` to the iframe) and sends clicks the other way (a new "embedded host" mode in the SPA with a `postMessage` contract: open-note, pointed-note, selection-as-pointer). Starting the server needs `child_process`, which exists only in desktop Obsidian, so the manifest says `isDesktopOnly: true` and the user installs isorite separately (or the plugin runs an `isorite` it finds on PATH).
- A CodeMirror 6 extension could draw isorite's marks (whose words, pending proposals) inside Obsidian's own editor. The app's editor is CM6 already (`app/src/lib/editor/`), so the code is reusable, but it would be a second integration to maintain and its journal and proposal model needs the engine behind it. Not worth it before the iframe.
- **Review and distribution:** a pull request to Obsidian's community plugin list (Obsidian says the number of plugins and themes has more than doubled since its community hub relaunched in May 2026, to over 8,000 projects; the process may have changed since the old `obsidian-releases` repository, so read the current submission requirements first). The guidelines I could read forbid building DOM from user input with `innerHTML`; (unverified, from memory) the policy also asks plugins to disclose network use, accounts and files outside the vault in the README, and to avoid fetching and running code. BRAT lets beta users install from GitHub before approval. Review time varies from days to months (unverified).
- **Mobile:** impossible as designed: no Node, no child process, no local server on iOS or Android. A plugin could be non-desktop-only and point its iframe at a remote isorite (Tailscale), but mobile Obsidian's webview framing of plain `http://` addresses and the server's own Host and Origin rules (`hostOk`, `local`, `--allow-host`) make this fragile (unverified).
- Effort M (about two weeks): the plugin (small), the SPA host mode and its tests, the release process. Maintenance: Obsidian's API is stable and additive; the cost is the contract between plugin and SPA.

### (c) A plugin that bundles the engine

- **Feasibility of the `Files` port:** good. `Vault.adapter` (`DataAdapter`) has `read`, `write`, `readBinary`, `writeBinary`, `append`, `list`, `mkdir`, `rmdir`, `remove`, `rename`, `exists`, `stat`, and it can reach dot-folders such as `.isorite/` that the indexed `Vault` API hides. The one gap is the port's "atomic write" promise: write a temp file and `rename` it. `Clock` is trivial. So a `ObsidianFiles implements Files` is about 100 lines.
- **Feasibility of the rest:** the engine has no `node:` import (the architecture's rule), and the guide site proves it runs in a page. But the app is a SvelteKit SPA with its own routes and global CSS, so it would be mounted in an iframe loaded from the plugin's own files, with a `postMessage` bridge implementing `Api` in the plugin host (the engine in the plugin, the UI in the frame). That bridge, plus bundling a roughly 8 MB static app build (`app/build` is 8.2 MB) into a plugin, is the cost.
- **Embedding model:** the 53 MB granite model must be fetched at run time (a plugin cannot ship it comfortably), run by onnxruntime-web's WASM in the plugin or a worker; fetching and disclosing is allowed in principle but is a review conversation.
- **What is missing:** the agent. ACP and MCP clients are processes; on desktop the plugin could spawn them, on mobile it cannot. isorite's built-in agent runs in the Node server (`packages/server/src/pi/`), so it would have to be ported or reached remotely.
- **Git on mobile:** obsidian-git is the precedent (isomorphic-git on mobile, with known slowness and memory problems on large vaults; unverified in detail) and shows both that it is possible and how it hurts.
- Effort L, with a permanent second host to keep in step with the engine. Verdict: no. If the engine ever has to run on a phone, it is better done once, in Tauri or the PWA, than again inside Obsidian.

### Obsidian: audience and verdict

- Roughly 1 to 1.5 million users by unofficial estimates (no official count found); more than 8,000 plugins and themes combined per Obsidian's October 2026 blog post; the top ten plugins have 2.8 to 8.8 million downloads each. Discovery is in-app (a plugin browser and the community hub), which is a strong channel, but the shelf is crowded and AI plugins (chat over a vault, semantic search) are a major category.
- What distinguishes isorite there: an agent you already use (Claude Code, Codex) attached over MCP, provenance for every word, the Atlas as a map with folders as regions, not a force-directed graph. What works against it: most Obsidian users do not run agents in a terminal, and the plugin does not remove installing isorite and an agent; mobile Obsidian, where many people capture, gets nothing.
- Verdict: (a) yes, soon; (b) only if (a) produces users who ask; (c) no.

## 4. VS Code

### What the platform offers (checked in the docs this session, or marked)

- **MCP:** an extension calls `vscode.lm.registerMcpServerDefinitionProvider(id, provider)` and declares `contributes.mcpServerDefinitionProviders` in `package.json`; definitions are `McpStdioServerDefinition` (a local process) or `McpHttpServerDefinition` (Streamable HTTP), with `resolveMcpServerDefinition` for authentication or prompting. Users can also write `.vscode/mcp.json`. One search result described the registration API as proposed; my recollection is that it was finalised in 2025 (unverified; read `engines.vscode` when building).
- **Webview panels** (`createWebviewPanel`): a sandboxed iframe with a `vscode-webview://` origin; `portMapping` forwards a `localhost` port (including through Remote-SSH, Dev Containers and Codespaces); a nested iframe to `http://localhost:4767` needs a CSP `frame-src` allowing it. `simpleBrowser.show` is a built-in alternative with no code.
- **Others:** `TreeDataProvider` (a notes tree), `CustomTextEditorProvider` (a custom editor for `.md`), `DocumentLinkProvider`, `DiagnosticCollection`, `CompletionItemProvider`, `vscode.chat.createChatParticipant` (an `@isorite` participant in Copilot Chat), `vscode.lm.registerTool` (language-model tools), file system watchers, `vscode.workspace.fs`, terminals, `vscode.env.asExternalUri`.
- **Cursor and the forks:** Cursor does not support VS Code's `lm.registerMcpServerDefinitionProvider` (a feature request has been open since September 2025; one comment in February 2026; I found no confirmation it shipped) and does not support `lm.registerTool` either. It has its own `vscode.cursor.mcp.registerServer`, and a forum report says an extension-hosted HTTP server registered that way showed 0 tools when installed as a built `.vsix`. Cursor and Windsurf read their own MCP files (`.cursor/mcp.json`; Windsurf's is a global file, unverified). So the portable MCP route is files, not the API: `isorite doctor` can write `.vscode/mcp.json` (key `servers`) and `.cursor/mcp.json` (key `mcpServers`) next to the `.mcp.json` it already writes. This is a half-day change that needs no extension.
- **Distribution:** the Visual Studio Marketplace (publisher account, an Azure DevOps token, `vsce publish`) reaches VS Code and VS Code-based products licensed by Microsoft. The Marketplace's terms bar other products, so Cursor, Windsurf and VSCodium use Open VSX (`ovsx publish` with an Eclipse Foundation account and a signed publisher agreement) (unverified in detail; I did not find a page on it this session). Plan two publish steps from one `.vsix`. Review: the Marketplace runs an automated scan and a publisher verification; Open VSX scans too. Both are days, not months.

### Tiers

- **S (3 to 5 days): "isorite for VS Code"** (a thin extension):
  - Detect or install isorite: download the release binary into the extension's global storage and verify its `SHA256SUMS` (the installers already publish one), or run `npx isorite`. This removes the install step that the README puts first.
  - Start `isorite serve <folder>` in an integrated terminal, or as a child process, and keep it for the window. The base is the workspace folder or the `notes/` folder inside it.
  - Register the base's `/b/<name>/mcp?agent=vscode` as an `McpHttpServerDefinition` when the API exists, else write the config file.
  - A webview panel holding the SPA (the Atlas and the agent pane), with `portMapping` for remote workspaces. Commands: "isorite: Open", "Open in the Atlas" for the active note, "Send selection to isorite" (calls `/api/agent/send`, or the pointer path the app already uses; a pointer already carries a file and lines per `docs/ideas.md`).
  - Needed in isorite: nothing but a stable list of routes; the extension host sets `Origin` itself. Optional: a `--print-url` or `--json` start line so the extension need not parse output.
- **M (2 weeks): navigation that belongs in an editor:**
  - `DocumentLinkProvider` for `/folder/note.md` (VS Code resolves a leading slash against the workspace root, which is wrong whenever the base is a subfolder) and for `code:src/sim.py#L40` links, which VS Code cannot follow at all. This alone makes the notes usable in the plain Markdown editor.
  - A tree view of notes grouped by folder with hidden notes respected, diagnostics from `isorite check` (broken links, merge conflicts, `frontmatter-invalid`), a status bar item for the agent (the `agent-start`, `agent-step`, `agent-done` events already stream), the Atlas following the active editor through an embedded-host `postMessage` contract (shared with Obsidian (b)).
  - A VS Code editor for the notes (the Markdown editor VS Code already has) with isorite's journal still recording each change as `external`: the engine already treats a file changed outside the app that way, so the history stays complete without the app's editor.
- **L (a month or more), each separately questionable:**
  - A custom editor wrapping isorite's CodeMirror editor in a webview (to keep marks and pending proposals inside the VS Code tab). It duplicates what VS Code's editor does, and CM6 in a webview has focus, shortcut and IME problems; skip.
  - A `@isorite` chat participant. It is Copilot-only, absent in Cursor and the forks, and duplicates MCP. Skip.
  - A web extension for vscode.dev and github.dev: no child process and no localhost, so the engine must run in the extension worker over `vscode.workspace.fs`, which fits the `Files` port well (read, write, createDirectory, readDirectory, delete). No agent. This is the same engine-in-a-page work as the phone, so build it once for both if ever.
- **Remote and Codespaces:** the extension host runs beside the files, so the extension starts the server where the notes are and `portMapping` or `asExternalUri` shows it locally. The binary must match the remote's platform. This works better than most places, and is the main reason VS Code is the strongest host.
- **Maintenance:** the VS Code API is stable and versioned; the burden is two registries, the binary download and its checks, and Cursor's API drift. **Distribution:** as above.

### VS Code: audience and verdict

- Tens of millions of users (the widely cited survey figure for the most used editor is well over half of developers; I did not re-verify it this session). Discovery is by search in the Extensions view and by "recommended for this workspace" prompts. Notes-in-VS Code extensions exist (Foam is the best known); isorite's difference is the Atlas and an agent that is already in the same window.
- The audience overlaps the target nearly exactly: people with a repository, an agent and notes about the code, who already use MCP. A first run in VS Code becomes: install the extension, press "isorite: Open", ask the agent. It removes the install step and the terminal. This is the most direct user-acquisition path of the three.
- Verdict: build. It is also what `docs/ideas.md` already ranks first.

## 5. Ranked recommendation

1. **VS Code extension, tier S then M** (about 3 weeks in all). Highest audience overlap, MCP is native there, and it turns "install isorite" into one click.
2. **Obsidian vault dialect in `packages/core`** (S to M, about a week), shipped as a base setting with a documented "open your vault" path. No plugin to maintain. Do it as soon as the extension's first version is out, because it feeds both ecosystems.
3. **The phone's read-and-capture PWA** (section 6), alongside, because it is the cheapest answer to "where can I use it away from the desk".
4. **Tern: the doc and the `awesome-tern` listing** (S, one day).
5. **Obsidian plugin (b)** only after (2) shows demand; **Obsidian engine plugin (c) and a VS Code chat participant or custom editor**: do not build.

## 6. One-page scope for the top pick: the VS Code extension

**Goal.** Someone with a repository and an agent installs one extension and, with no terminal, has the Atlas, the agent pane and the MCP connection for their notes.

**Milestones.**

- **M1, one week: starts and shows.** Scaffold (`yo code`, TypeScript, esbuild bundle). Locate or install the isorite binary into global storage with SHA-256 verification (reuse the release's `SHA256SUMS`). Command "isorite: Open" starts `isorite serve <folder>` as a child process (output in an output channel), waits for `/api/session`, opens a webview with the SPA through `portMapping`. Status bar item with the base's name. `.vscodeignore`, icon, README with the screenshot set. Publish a pre-release to the Marketplace and Open VSX.
- **M2, one week: the agent.** Register the MCP endpoint (provider API where it exists; otherwise write `.vscode/mcp.json`, `.cursor/mcp.json` and the existing `.mcp.json` through `isorite doctor`'s logic). "Send selection to isorite" and "Send file". Show agent activity in the status bar from the event stream. Test against Copilot agent mode, Claude Code's VS Code extension, and Cursor.
- **M3, one week: the notes in the editor.** `DocumentLinkProvider` for base-absolute and `code:` links, the notes tree, `isorite check` diagnostics, the Atlas following the active editor (needs the SPA's embedded-host `postMessage`: open-note, active-note, selection). Remote and Codespaces test; a Windows test.

**What isorite must change.** A `--json` start line with the URL, the base and the token-less MCP path; an embedded-host mode in the SPA (hide the logo chrome, accept `postMessage`); optional: a `check --json` output. Nothing in the engine.

**Risks.**

- The binary download is the supply-chain surface: verify the checksum, pin the version, and prefer `npx` where Node exists. Windows executables are unsigned (the README already says so), which a Marketplace review does not mind but users will notice.
- The webview's CSP and nested iframe: artifacts use a sandboxed frame inside the SPA inside the webview; test before promising.
- Two registries and Cursor drift (the MCP API gap; the 0-tools report for built `.vsix` files).
- Support load: the first thing users hit is "no agent attached"; the extension should open the agent chooser, not an empty pane.
- A second version surface: the extension and the binary must agree. Make the server report its version and refuse an extension older than it, as the app already does for itself.
- Competition for attention with Copilot Chat's own notes features; the answer is the Atlas and the provenance, so lead with them.

**Not in scope.** A custom editor, a chat participant, vscode.dev.

## 7. Mobile: the specific challenges ahead

The plan on record (`docs/architecture.md` section 11, `docs/decisions.md`): Tauri with the engine in the webview behind the in-process `Api`; Iso through OpenRouter or a self-hosted gateway; one full embedding pass on first open then only changed sections; "one day's test of git inside Tauri on Android before any mobile work"; Stage 1 of the phone is mentioned in `docs/ideas.md` but is not a document in `docs/`. The app already has some of the touch work: a swipe between panes, a hold on the Atlas that shows tags (`app/src/lib/gesture.svelte.ts`), `touch-action: none` on the Atlas, a manifest and a `viewport-fit=cover` meta.

### Ranked by difficulty (hardest first)

1. **Agent attachment.** There is no CLI harness on a phone: Claude Code, Codex, OpenCode and the rest are processes, and iOS forbids spawning them (and Android makes it impractical). The built-in agent (`packages/server/src/pi/`) is Node and would have to move into the page or run remotely. So a phone is a client of an agent that runs elsewhere (a desktop or hosted isorite reached over its HTTP, MCP and ACP; or a gateway) or it has the weaker in-page agent. Provider keys belong in the keychain (the architecture already names a `Secrets` port for Tauri). Background limits: iOS suspends a webview within seconds of leaving the app, which drops the server-sent event stream and any in-flight request; the app must treat a turn as something to resume from the server's record (the conversation is already journalled, `GET /api/terminal`) and not as a stream. Push notifications for "the agent finished" need a relay.
2. **Git sync.** The server shells out to `git`; a phone has none. isomorphic-git in a webview works over smart HTTP only (CORS proxy needed for browser-origin requests unless Tauri's HTTP plugin is used), no SSH, tokens or OAuth for auth, and it is slow and memory-hungry on large or binary-heavy repositories (obsidian-git users report this; unverified in detail). Conflicts: a note in conflict is already marked (`merge-conflict` issue, the Atlas marks), but there is no merge UI (`docs/ideas.md` defers it) and a phone is the worst place to resolve markers by hand. `.isorite/journal/*.jsonl` merges by `merge=union` through `.gitattributes`, which isomorphic-git does not apply (it has no merge drivers for attributes; unverified), so it would need a merge written in code (union by entry id, which the format already allows); the same for `hidden.txt`'s line merge. Rename-against-edit on journals after a folder move (the ideas note) gets worse with more devices.
3. **File access and sandboxing.** iOS: an app sees only its own container unless the user picks a folder through the Files picker (security-scoped bookmarks, with iCloud and other providers delivering files lazily, so a read can stall or fail offline); no watcher on an external folder. Android: Storage Access Framework gives URIs, not paths, listing is slow, and there is no atomic rename across providers. So the `Files` port needs a platform adapter with a local cache and its own sync with the picked folder, and the port's "atomic write" and `list` costs must be re-measured. Hidden dot-folders are fine in an app container but may not show in a Files provider. The pragmatic answer is that a phone base lives in the app's own storage and syncs by git, not as a window onto a shared folder.
4. **Embedding model on device.** The 53 MB granite model through onnxruntime-web's WASM is the architecture's plan; rdstudio measured about ten minutes for a first full pass on a phone's browser. Memory limits (a mobile webview is killed above a few hundred MB), thermal throttling and battery make a resumable background pass fragile, and iOS gives no background time for it. Keep keyword search always on; let search by meaning wait, or copy the desktop's cache file (the format keys vectors by a fingerprint of each section's text, so a cache copied from a desktop is valid). WebGPU would speed this but is uneven across mobile browsers.
5. **Atlas on touch.** Pinch and pan are done (60 fps at 230 notes measured on desktop; no phone figure), and a hold now shows tags. What remains is the hover-dependent surface, found by grep (the list below), and size: a 1000-note base on a 390 px screen needs the "only the open folder in detail" optimisation that the architecture lists as later. `touch-action: none` on the whole Atlas also blocks the page's native scroll and the accessibility zoom gesture.
6. **Editor on touch.** The editor is CodeMirror 6 (`app/src/lib/editor/`). CM6 supports touch, but the known trouble spots are: selection handles and the system loupe against its own selection layer, IME composition on Android keyboards (Gboard predictive text replacing words and breaking `domEventHandlers` that assume key events), the iOS keyboard covering the editor (`interactive-widget=resizes-content` in the viewport meta already helps), no Alt chords (the editor's shortcuts are Alt-L, Alt-E, Alt-1..3, and the agent switches are Alt-N, Alt-F, Alt-R), and the editor's marks and link control that appear beside a link "while the pointer is over it" (`linkControl.ts`). The app's pointers (selections sent to the agent) need a touch way to select a passage and send it; today the hold gesture is on notes and folders, not on a selection.
7. **App Store and Play review.** An app that runs an agent and shows web content is allowed, but: Apple's guideline against downloading or executing code that changes the app's behaviour (artifacts are HTML run in a sandboxed frame inside the app's own webview, which is generally fine; an agent that writes and runs new code on the device would not be) and its rule that a note-taking app with account sign-in needs a way to delete the account if it has accounts (isorite has none). Keys for model providers are the user's own; no in-app purchase is needed unless a subscription is sold. Android is lighter. A PWA avoids review altogether.
8. **Small-screen layout and offline.** The panes already collapse to tabs at 760 px (`+layout.svelte`, `PaneHead.svelte`) and the Atlas hides its side column at 600 px; the remaining work is checking each pane's header and menu at 390 px with a keyboard up. Offline is natural for notes (they are local) and unnatural for the agent, which needs the network, so the offline state must say so at the pane instead of failing at send. A service worker is not registered today (`grep serviceWorker app/src` finds nothing); a PWA needs one to open offline.

### Hover-only and hover-first interactions found by grep (`app/src`)

Already guarded or given a touch alternative:

- `lib/components/AtlasBlock.svelte` lines 53 and 54: pointer enter and leave act only for `pointerType === "mouse"`; a touch uses the hold.
- `lib/editor/pointing.ts` line 80: the link under the pointer lights its note on the Atlas, mouse only.
- `lib/components/TerminalTurns.svelte` line 172: the pointer over a part of a turn lights its source, mouse only.
- `app.css` line 333 (`@media (hover: none)`): the code block's copy button is shown without hover. `lib/components/AgentSessions.svelte` line 111 does the same for its drop control.
- `lib/gesture.svelte.ts` and `Atlas.svelte` line 583 onward: a held finger offers move, delete, send, hide and rename tags; a finger let go on none opens a menu.
- `lib/lustre.ts` line 127: the "touched" pulse of light fires for the mouse only.

Reachable only with a pointer, or degraded on touch (to fix or check):

- `lib/components/Timeline.svelte` line 40: `pointerenter` and `pointerleave` (with focus and blur) are how a moment on the timeline marks its lines and notes; `docs/decisions.md` says "what was asked, or a note's title on the Atlas, shows beside a mark only while it is pointed at", which a finger cannot do. Needs a tap-to-select.
- `lib/components/ContextView.svelte` line 40: the strata bar's `onpointerover` shows what a layer is.
- `lib/components/AtlasFolder.svelte` line 79 (`.closed:hover`), `TerminalTurns.svelte` line 440 (`.part:hover`), and `Petal.svelte` line 36 (a tag's name appears on `:hover` and grows as the pointer nears): feedback only, but the Petal name is how a tag is identified, so on touch it must show without hover.
- `lib/editor/linkControl.ts` line 180 (`mouseleave`): the link control appears "with the cursor in a link (or the pointer over one)"; on touch it relies on the cursor, which works, but there is no Alt chord to fall back on.
- `HiddenPicker.svelte`, `FindBar.svelte` and `FolderField.svelte`: hover moves the selected row; harmless on touch.
- About 58 `title=` attributes in `lib/components/*.svelte` are tooltips, which touch never shows; any that carry meaning with no visible label need one.
- `.code-block:hover` in `app.css` line 330 swaps the language label for the copy button; the `hover: none` rule above covers it.

### Platform choice

- **PWA:** no review, no keychain, no background execution, iOS storage can be evicted after weeks unused unless installed to the Home Screen, no File System Access API on iOS, the engine in the page needs the IndexedDB-backed `Files` the guide site already has. Good for read, capture and ask over a remote isorite.
- **Tauri 2 mobile:** the architecture's choice. Gives the keychain, a native HTTP client (no CORS), a file picker and the same webview; maturity on Android and iOS is lower than on desktop, plugin gaps (the git question) are the named risk, and the webview is still WKWebView or Android System WebView, so all the touch issues above remain.
- **Capacitor:** the same webview with a mature plugin set (filesystem, secure storage, share target, push); a good alternative if Tauri's mobile plugins fall short, at the cost of a second shell and a Node-free native build.
- **Native:** not justified; it would mean re-doing the Atlas, the editor and the app.

### The cheapest credible first step

A responsive read-and-capture PWA served by a desktop or hosted isorite:

- It reaches a desktop isorite over a tailnet (the server already accepts `….ts.net` names through `tailscale serve`, and `--allow-host` for another name; `hostOk` and `local` in `http.ts` implement it) or a hosted base.
- No engine, git, embeddings or agent runs on the phone, which removes the first four hard problems above. The agent stays on the desktop, so the phone asks, reads, captures a note or a picture, and sees the agent's reply when the page is reopened (the conversation lives on the server).
- Work: add a service worker for the shell, a "capture" view (a new note or a share-target entry from the phone's share sheet), fix the hover list above, and check each pane at 390 px with the keyboard up. About one to two weeks. Tern's iOS client and `tern web serve` is another existing route to the same desktop, and the cheapest way to test it before building.
- Then, in order: the guide-mode engine over IndexedDB for a read-only offline copy of a synced base (no agent); isomorphic-git sync as an explicit Pull and Push; the Tauri shell last.

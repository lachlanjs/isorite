# Design audit: toward Tern's clarity, with motion and fewer words

Read-only audit, 2026-11-09. Sources: `docs/taste.md`, `app/src/app.css`, `app/src/routes/+layout.svelte`, the components in `app/src/lib/components/`, the `inspiration/` boards, the owner's captures in `screenshots/`, 42 frames from the four `tern-recordings/*.mp4`, and live screenshots of the built app (guide base, 1440x900, lapis and quartz). Every proposal keeps isorite's own identity (lapis/quartz grounds, four mineral accents, the chamfer, Lyth Mono + Charter, the three durations): the aim is Tern's *clarity*, not its look.

Where this doc and `docs/taste.md` disagree, taste.md wins until the owner says otherwise; the places where a proposal bends a taste.md rule are marked **(taste)**.

## (a) What Tern does

- **Tone, not lines, separates things.** Panes are raised a step from the ground (near-black page, panes a few percent lighter, rounded ~8 px); tables have no row rules, the header row is set apart by colour alone; a pane has one hairline edge at ~6-8% white. There are perhaps five visible lines on a full screen of six apps.
- **One lit edge says where you are.** The focused pane gets a 1 px teal edge and a soft outer glow; nothing else on screen has a coloured outline. Moving focus moves that glow (it fades over ~200 ms).
- **Colour is for state only.** The chrome is greys. Colour appears only for meaning: a green "✓ Done" pill, a purple "Running" pill, +1 / −1 diff counts in green/red, branch tags, a green dot before "Python 3.14.7", the user avatars. Syntax colour is the only "decorative" colour and it is inside code.
- **Hierarchy by brightness and weight, not by size.** Pane titles are ~13-14 px semibold white; secondary text (tabs not chosen, column heads) ~60% grey; tertiary (timestamps, "48×37", "12ms", elapsed time) ~40% grey and often tabular mono. Three levels of grey do most of the work, so the eye finds the one bright thing per region.
- **Two faces with clear jobs.** A neo-grotesk sans for chrome and prose; mono only for data, code, paths, commands and small uppercase badges (`ANSI`, `NATIVE`, `TSP`). Mono is a signal ("this is machine text"), not the default.
- **Chosen = a quiet filled pill.** Tabs (`Structure / Browse / Execute`, `Board / List`, `omp / zsh`) are plain words; the chosen one sits on a slightly lighter rounded fill. No underline, no saturated block, no border.
- **Icons are monochrome, uniform and unlabelled in toolbars** (16 px, thin stroke, ~28 px hit area, right-aligned group), while *actions that matter* are words with an icon (`▷ Execute`, `↓ Save results`, `+ New Record`).
- **Status is one short line with a live number.** "••• Working 3.4s", "Execute finished without errors. 5 rows returned in 1ms", "7 open · 3 done". The animated dots and the ticking timer carry "it's alive" without a spinner or a paragraph.
- **Agent turns are cards with a one-line head.** `✎ Edit packages/tui/src/native/backend.ts  +1 −1  ✓ Done`, `⊕ Browser open http://localhost:4828/tern  Running`: verb, target, counts, status pill, all on one row; the body (diff) below in a tinted block. The user's prompt is a right-aligned soft bubble; the agent's prose is plain text with no avatar.
- **The composer is one quiet line with its context inside it.** "Ask omp anything" left, `π · opus · ~/work/pi` right in faint mono, inside the same box. No help text around it.
- **Motion is tied to state and is small.** Text streams in; diagrams build node by node; the "typing.." label appears on the presence chip; dashed connector lines march to show data flowing to the daemon; focus glow moves between windows. No entrance choreography for chrome, no bounces.
- **Density with breathing room.** Rows ~24-26 px, generous 12-16 px pane padding, numbers right-aligned and tabular, every long string ellipsised in one line; empty states are one bright line plus one faint hint ("No results yet / Statements that return rows show them here").

## (b) Visual-style changes, prioritised

Principle tags: **H** hierarchy, **P** Gestalt proximity/common region, **S** signal-to-noise, **R** recognition over recall, **Hk** Hick's law, **PD** progressive disclosure, **F** Fitts, **C** consistency.

| P | File / selector | Current | Proposed | Why |
|---|---|---|---|---|
| P0 | `PaneHead.svelte` `.sw[aria-pressed="true"]`, `+layout.svelte` `button.icon[aria-pressed="true"]` | A switch that is on is a solid block in its accent (rose `?`, white `!`, gold feather, gold `≡`, blue drawer): the loudest things on screen are settings toggles (see live shot, Atlas header) | On = tinted chip: `background: color-mix(in srgb, var(--c) 18%, transparent); color: var(--c);` keep `clip-path: var(--chosen-cut)`; add a 2 px bar under it in `var(--c)` (taste: "Open: a bar"). Off = `--text-faint`, no tint (drop `.named .sw:not([aria-pressed])` 55% tint). Solid fill stays only for *the chosen row/kind* in content (list selection, kind slot) | H, S: chrome should recede so content leads; Tern's chosen = quiet pill |
| P0 | `NoteList.svelte` `li a { border-bottom }`, `h2 { border-bottom }` | Every row and every folder head has a 1 px rule: a ladder of lines | Remove row rules; rows separated by `padding: 10px 44px 10px 16px` + `gap: 2px`; hover/chosen use `.vein-row` ground (already there). Folder head: no rule, `margin-top: var(--space-6)`, label `12px/500 var(--text-soft)`, uppercase not needed | P, S: whitespace groups better than lines (Tern has none) |
| P0 | `NoteList.svelte` folder head `.acts` (`+ rename delete`) and per-row `NoteMenu` `…` | Always visible on every folder and every row (see `no-artifacts-in-list-view.png`) | Show `.acts` and `.menu` only on `:hover, :focus-within` of the row/head (opacity 0 → 1 over `--t-ack`), always on `(hover: none)`. Replace `rename` with a pencil icon, `delete` with the trash glyph, `+` stays | S, PD: actions at the point of use, not repeated 20 times |
| P0 | `AttachAgent.svelte` `.cards` | Six equal cards incl. three "NOT FOUND" with disabled buttons; ~180 words of prose (live shot) | List of rows: found agents first with one primary `Use` button and a malachite dot; "not installed" agents collapsed under one row `3 more not installed ▸`; "in my terminal" becomes a terminal-glyph icon button opening the steps. See (f) | Hk, PD: fewer equal choices, the likely one first |
| P0 | `+layout.svelte` `.pane`, `.pane.focus` | Focus shown only by the `■` before the pane name turning blue | Focused pane: `box-shadow: inset 0 2px 0 0 color-mix(in srgb, var(--lattice) 70%, transparent)` on `.phead` (a line along its top that draws in over `--t-change`, left to right, per taste "lines extend"); unfocused panes' `.phead` text at `--text-faint` | H: one lit edge says where keys go (Tern's teal edge) |
| P0 | `+layout.svelte` `.pbody` | `overflow: auto` both ways: the note pane scrolls sideways and the title is cut at its left (`scrollbar.png`, "heck it out") | `.note-body { overflow-x: clip; }` (keep `overflow-y: auto`) | Bug; nothing should scroll sideways under the reader |
| P1 | `app.css` `body`, `.label` | Body 13 px mono, `.label` 12 px faint mono: labels and body text are the same face, nearly the same size and similar grey, so "choose your agent" reads like a sentence | Three greys with jobs (tokens in (c)): `--text` primary, `--text-soft` secondary, `--text-faint` meta only. `.label { font: 500 11px/1.4 var(--font-ui); letter-spacing: .04em; color: var(--text-faint); }` | H: weight + brightness, not more sizes |
| P1 | `PaneHead.svelte` `.pname` | 15 px pixel face, soft, with a 6 px square | `font: 600 13px var(--font-ui); color: var(--text-soft)`; focused `--text`. Square stays (identity) | H: title weight, not size |
| P1 | `NoteList.svelte` `.title` 18 px serif, `.desc` 13 px mono | Big serif titles + mono descriptions: two faces per row, both large | Title `16px/1.35 var(--font-text)`; desc `12.5px var(--font-text)` italic `--text-faint` (description is prose, as on the note page) | C: description is italic serif under the title on the note, so here too |
| P1 | `NotePage.svelte` `.tools` (`read`, `source`) | Two words floating top right above the title | Segmented control `edit · read · source` (one chosen, quiet pill), 24 px tall, `--text-faint`; or icons (book, `</>`) with tooltips | R, C: three modes of one thing are one control |
| P1 | `NoteLabel.svelte` `.label` row | Kind slots in boxes, the name, corner-bracket tags, `+`, then a rule under it | Drop the rule; slots borderless 28x28 with the chosen one tinted (as switches); tags keep brackets (identity) | S |
| P1 | `PaneHead.svelte` `.settings` popover content (`NoteSettings.svelte`) | Rows of unlabelled buttons ("the system's / lapis / quartz", "serif / sans", "in colour / in ink", icon groups) (live shot) | Each row gets a left label in `.label` style: `ground`, `notes in`, `code`, `layout`; buttons become a segmented control (one tinted pill) | R: a choice with no name has to be recalled |
| P1 | `app.css` `.frame` cards in `AgentSessions.svelte` `.spec` | 44 px crystals, uppercase meta `OMP · LIVE · TODAY · 11:33`, two columns | One-column list, 28 px crystal, title 14 px, meta one line `omp · 11:33 · 2 turns` in `--text-faint` sentence case; live = malachite dot | S, Hk |
| P1 | `IsoPane.svelte` `.composer` | Composer: framed box + bar; model/mode selects only when an agent offers them; copy icon in gold | Footer row inside the box: `[agent ▾] [mode ▾]  …  [ctx 34%] [send]`; agent name chip moves here from the header. Copy-for-agent icon in `--text-faint`, not gold (gold = the agent) | P, C: what the box will do sits in the box (Tern) |
| P1 | `PaneHead.svelte` Atlas switches | Seven icon switches + labels compete with the map | Keep, with the P0 quiet-on style; group as two clusters with an 8 px gap: kinds (`? ! web code files artifacts`) and lens (`context`) | P |
| P1 | `TerminalTurns.svelte` `.tool` | `· searched   [1: /notes/…]` verb in a 5.5em column, raw query text | Tool row = 16 px kind glyph + target + right-aligned meta (`+3 −1`, duration); verb only in the tooltip. See (f) | R: a glyph is read faster than a verb column |
| P1 | `app.css` `.btn` default `--fill: var(--ground-3)` | Secondary buttons are solid lighter blocks ("use in this pane", "Keep key", "Check") | Default `.btn` = `--fill: color-mix(in srgb, var(--text) 7%, transparent)`, hover 11%; `.btn.primary` unchanged. One primary per view | H: only one thing is the next step |
| P2 | `app.css` `.dots` ground in the Atlas | Dotted ground everywhere on the Atlas | Keep (identity), lower to `color-mix(var(--line) 60%, transparent)` | S |
| P2 | `AttachAgent.svelte` `.attach` | Dashed top border separates it from the session | Remove; the section is the whole pane when shown | S |
| P2 | `ContextView.svelte` | Headings `notes`, `in the tray` over empty lists | Hide a heading whose list is empty; show the tray only with items | S |
| P2 | `app.css` `.code-block > pre` | 2 px left rule + ground-1 | Keep; add `border-radius: var(--round)` all round and the copy button (exists) | C |
| P2 | (optional experiment) `--font-ui` for *long* UI prose only | All UI prose in mono (setup texts, settings notes) | Try `IBM Plex Sans` 13 px (already shipped) for multi-sentence UI paragraphs (`.attach p`, `.settings .note`), mono kept for chrome, labels, paths **(taste)** | Readability of prose; Tern uses sans for chrome. Only if the owner likes it |

Cross-cutting, Atlas (owned by another agent, noted only): the map's default zoom in a three-pane 1440 window shows empty boxes with no labels (live shot); hovering lights many routes with heavy glow at once (`pulses-in-flight-on-hover.png`, `two-pulses-in-flight.png`); "1 builds on it" orange labels compete with titles. The same "tone not lines, one lit thing" rule applies: at most one pulse in flight, glow at `--glow-a` 20%, labels at overview zoom for folders only.

## (c) Design tokens proposal

Additive: nothing existing is renamed, so the change can land in one commit and components adopt tokens one by one. Values for lapis; quartz overrides follow.

```css
:root {
  /* Text: three greys with jobs. --text-faint is for meta only (times, counts, paths), never for a sentence to read. */
  --text-mute: #6A7A92;                    /* new: disabled, placeholder, the dot of a separator */
  /* Lines: the hairline that is left, fainter than --line, for the few rules that stay (pane edges, the composer). */
  --line-faint: color-mix(in srgb, var(--line) 60%, transparent);
  /* Fills for states, by mixing ink into the ground, so they follow both grounds: hover, chosen (quiet), pressed. */
  --fill-hover: color-mix(in srgb, var(--text) 5%, transparent);
  --fill-chosen: color-mix(in srgb, var(--text) 9%, transparent);
  --tint: 18%;                             /* a coloured thing that is on: its colour at this strength over the ground */
  /* Type: one scale, five steps for the interface (prose keeps --text-size). Weight does the hierarchy. */
  --fs-meta: 11px; --fs-small: 12px; --fs-ui: 13px; --fs-lead: 15px; --fs-title: 34px;
  --fw-regular: 400; --fw-medium: 500; --fw-strong: 650;   /* Lyth Mono is variable 100-900 */
  --lh-ui: 1.45;
  /* Rows and controls: one height each. */
  --row: 32px; --row-dense: 26px; --control: 28px;
  /* Focus of a pane: the one lit edge. */
  --pane-lit: color-mix(in srgb, var(--lattice) 70%, transparent);
  /* Motion: the three durations stay; a stagger for lists, and a cap so a list never takes long to arrive. */
  --stagger: 24ms; --stagger-max: 160ms;
}
:root[data-ground="quartz"] { --text-mute: #8A93A0; --tint: 12%; }
@media (prefers-color-scheme: light) { :root:not([data-ground="lapis"]) { --text-mute: #8A93A0; --tint: 12%; } }
/* Shared quiet states, to replace the solid on-blocks. */
.is-on   { background: color-mix(in srgb, var(--c, var(--lattice)) var(--tint), transparent); color: var(--c, var(--lattice)); }
.label   { font: var(--fw-medium) var(--fs-meta)/1.4 var(--font-ui); letter-spacing: .04em; color: var(--text-faint); }
```

Kept on purpose: the four accents (and their meaning: blue you/structure, gold the agent, malachite done, rose open/failed), `--round: 2px` and the chamfers (Tern's 8 px radius would erase the habit), the glows (only for what is live), `--t-ack 120 / --t-change 260 / --t-result 600` (the brief's 150-250 ms sits between `--t-ack` and `--t-change`; taste.md's three durations already meet it). Raise `--text-faint` on lapis from `#8796AD` to `#8A9AB2` only if contrast checks of 11 px meta fail WCAG 4.5:1 on `--ground-0` (currently ≈ 6.4:1, so likely no change needed).

## (d) Motion plan

All transitions honour `prefers-reduced-motion: reduce` (information kept, movement dropped: crossfades become instant, FLIP off). Durations from taste.md. Mechanism column: **CSS** = transition/keyframes, **flip** = `animate:flip` from `svelte/animate`, **slide/fade** = `svelte/transition`, **VT** = View Transitions API via SvelteKit `onNavigate`, **interp** = `interpolate-size: allow-keywords` + `::details-content` (Chromium 131+, progressive).

| # | Interaction (file) | Now | Proposed | Mechanism, timing |
|---|---|---|---|---|
| 1 | A note moved, renamed, made or deleted in the list (`NoteList.svelte` `{#each notes as n (n.id)}`, `{#each folders}`) | Rows jump to their new place | Other rows glide to their places; a new row fades in after; a deleted row folds its height away (taste "folds away") | flip `{ duration: 260, easing: cubicOut }` on `<li>` and `<section>`; `in:fade={{ duration: 260, delay: 130 }}`; `out:slide={{ duration: 260, easing: cubicIn }}` |
| 2 | Opening a note from the list or a link (`+layout.svelte`) | Note fades in (`arrive`, 260) | Title morphs from its list row / link position to the `h1`; the rest crossfades | VT: `onNavigate` → `document.startViewTransition`; `view-transition-name: note-title` on `.notes li.on .title` and `.note .title`; `::view-transition-group(*) { animation-duration: 260ms; animation-timing-function: var(--ease-out) }`. Fallback: current `arrive` |
| 3 | Pane focus changes (`+layout.svelte` `.pane.focus .phead`) | Square turns blue | The lit line along the head's top draws left to right; the old one fades | CSS `transform: scaleX(0→1)` on `.phead::after`, `--t-change` ease-out; fade out `--t-ack` ease-in |
| 4 | A switch turned on/off (`PaneHead.svelte` `.sw`) | Instant fill | Tint fades in, the under-bar grows from the centre | CSS `background-color --t-ack`; `::after scaleX --t-change` |
| 5 | Settings popover and fold menu close (`PaneHead.svelte` `.settings`, `.foldmenu`; `BaseSwitch.svelte` `.bases`) | Open has `appear`; close vanishes | Close: opacity → 0 and 4 px down, ease-in | `out:fly={{ y: 4, duration: 120, easing: cubicIn }}` |
| 6 | Agent pane view swap (session / context / drawer) (`IsoPane.svelte`) | Fade in 120 | Keep; add the header icon's tint transition (#4) so cause and effect move together | CSS |
| 7 | Sessions drawer reorders when a session goes live or new (`AgentSessions.svelte`) | Jump | Cards glide; new one fades in | flip 260 on `[role=listitem]`, `in:fade` 260 |
| 8 | "In my terminal" steps and "another agent" form open (`AttachAgent.svelte` `.steps`, `.pick`) | Appear instantly and push content | Height grows, content fades in after | `transition:slide={{ duration: 260 }}`; inner `in:fade={{ delay: 130 }}` |
| 9 | Tool call / thinking `<details>` expand (`TerminalTurns.svelte` `.tool details`, `.think`) | Instant | Height grows over 260, ease-out; caret already turns | interp: `:root { interpolate-size: allow-keywords } details::details-content { block-size: 0; overflow: clip; transition: block-size 260ms var(--ease-out), content-visibility 260ms allow-discrete } details[open]::details-content { block-size: auto }` |
| 10 | Send ↔ stop button (`IsoPane.svelte` `.corner`) | Swaps between frames | Crossfade of the two glyphs in place (the button doesn't move) | `{#key busy}<svg in:fade={{duration:120}}>` with both stacked in a grid cell |
| 11 | Agent running status line (`TerminalTurns.svelte` `.doing`) | Gem turns; text changes in place | Add a ticking elapsed time `· 12s` (tabular) and crossfade the step text when it changes | `{#key now.what+now.to}<span in:fade={{duration:120}}>`; timer via `setInterval(1000)` |
| 12 | Context strata and gauge (`ContextView.svelte` `.s`, `IsoGauge.svelte`) | Gauge transitions 300 ms linear-ish; strata widths jump | Widths ease over `--t-result` when tokens change (a result worth noticing) | CSS `transition: width var(--t-result) var(--ease-out)` |
| 13 | Tray chips added/removed (`ContextView.svelte` `.rows`, `PromptBox` pointers) | Jump | Chip fades in; removal folds | flip + fade 260 / slide out 260 |
| 14 | Note saved mark (`+layout.svelte` `.saved i`) | Colour swaps | Colour eases over `--t-ack`; on "saved" one malachite blink then back to `--line-strong` over `--t-result` | CSS keyframes, once |
| 15 | Kind slot chosen (`NoteLabel.svelte` `.slot`) | Instant fill | Fill eases `--t-ack`; the glyph in the title row fades in | CSS |
| 16 | Errors and statuses appear (`.bad`, `.problem`, `.offline` everywhere) | Blink on | `animation: appear var(--t-ack) var(--ease-out)` (exists in app.css) on every `[role=alert]`, `[role=status]` | CSS, one global rule: `[role="alert"], [role="status"] { animation: appear var(--t-ack) var(--ease-out); }` |
| 17 | Read / source / edit toggle (`NotePage.svelte` `{#key}`) | Remount, arrive fade | Crossfade both layers (old out 120 ease-in, new in 260) so the page never blanks | VT scoped: `document.startViewTransition` around the toggle; or `out:fade` 120 |
| 18 | Selection tags (`SelectionTags.svelte`) | Grow out | Keep the growth; avoid overlap (see (h)) | — |

Not to animate: hover on rows beyond the existing vein (taste: nothing of yours loops), the Atlas layout (owner's rule), list filtering while typing (flip would make search feel slow: disable flip when `query` is non-empty).

## (e) Verbiage inventory

Voice per taste.md: short, concrete, dry. Line numbers at time of audit.

| File:line | Current | Proposal |
|---|---|---|
| `AttachAgent.svelte:98` | choose your agent | Agent |
| `AttachAgent.svelte:99` | The agent you already use. In this pane its conversations show here, with the notes it reads lit on the Atlas. In its own terminal it has the same tools, and the pane isn't its conversation. | Delete. (The cards say it; put the distinction in the "in my terminal" tooltip: "Same tools; its chat stays in your terminal") |
| `AttachAgent.svelte:102` | Looking for agents on this machine… | Drawing (`Drawing.svelte`) + "Looking…" |
| `AttachAgent.svelte:106` | isorite's own agent / built in | isorite agent · `key` badge |
| `AttachAgent.svelte:107` | Any model by its key: OpenRouter, Anthropic, OpenAI and others, or your company's gateway. Nothing to install. | Any model, with an API key |
| `AttachAgent.svelte:108` | set it up / its settings | Set up / Settings (icon) |
| `AttachAgent.svelte:113` | in this pane · running / found / not found | State dot: malachite = running, lattice outline = found; not found rows collapsed (no word) |
| `AttachAgent.svelte:113` (found note) | Claude Code is installed; ANTHROPIC_API_KEY isn't set here, which is fine if you've signed in with it. | Delete when ready; show only if it fails to start |
| `AttachAgent.svelte:117` | start it again · stop | ↻ (restart icon) · ■ (stop icon), tooltips |
| `AttachAgent.svelte:119` | use in this pane / starting… | Use / Drawing glyph |
| `AttachAgent.svelte:121` | in my terminal | terminal glyph `>_`, tooltip "Use in your terminal" |
| `AttachAgent.svelte:125-129` | 1. Give X isorite's tools. Add this MCP address… 2. Then run X as you do… Live in both places? Run it from an ACP front end… | Two rows, each a code line with a copy icon: `MCP  http://…/mcp  ⧉` and `ACP  isorite acp claude  ⧉`; one faint line: "Add the MCP address to its config." |
| `AttachAgent.svelte:136-137` | another agent · the project's config | `+ Other agent` · `Write .mcp.json` (name the file it writes) |
| `AttachAgent.svelte:147/152` | An agent of the ACP registry… / or its command: hermes acp | From registry… / or command, e.g. `hermes acp` |
| `AttachAgent.svelte:153` | It runs on this machine, in the base's repository, with the server's environment: its key and model are set up as for its own terminal. | Runs here, in the base's repo. (tooltip on the Use button) |
| `AttachAgent.svelte:163` | Written: X. Commit them with the project. | ✓ X written |
| `AttachAgent.svelte:166` | With no agent, the notes, the Atlas and search by meaning work as they are. Nothing to set up. | Delete (or one faint line at the very bottom: "Optional: notes work without one.") |
| `IsoPane.svelte:84` | Attach an agent to ask it here | When no agent: box disabled, placeholder "Pick an agent to ask" ; with one: `Ask Claude Code` (exists) |
| `IsoPane.svelte:99` title | Copy for an agent in your own terminal: the message with what it points to, to paste there | Copy with pointers |
| `IsoPane.svelte:115` | Enter adds it for when the agent stops. Steer now | Footer hint while busy, faint: `↵ queue · ⌃↵ steer` |
| `IsoPane.svelte:117` | Lost touch with isorite; reconnecting… | Reconnecting… (rose dot in pane head, not a line in the composer) |
| `IsoPane.svelte:28` (sent text) | From my isorite knowledge base. Read what I point to with the isorite tools (read_note, outline_note, search_notes), not from this message alone: the notes may have changed since I chose them. | Keep for the agent, but never render it in the turn (see `pointer-agent-advice-refinement.png`) |
| `TerminalTurns.svelte:270` | X's session shows here: what is asked in its front end or here, what it does, and what it asks before doing. Notes put in the tray go before the next prompt. | Empty state: crystal + "Ask X anything." |
| `TerminalTurns.svelte:272` | A conversation with the agent, from before isorite attached your own agent: kept to read. | Read only (badge in the pane head) |
| `TerminalTurns.svelte:273` | Kept here; X isn't attached to carry it on. | Read only · Attach X to continue (button) |
| `TerminalTurns.svelte:279` | Following the agent / Newest | ↓ Newest (both cases) |
| `TerminalTurns.svelte:288` | 1 pointer / N pointers | Render pointers as the same chips as in the prompt box; drop the disclosure |
| `TerminalTurns.svelte:292` | from here / in its front end | Delete "from here"; an icon (terminal glyph) for front-end turns, tooltip "Sent from its terminal" |
| `TerminalTurns.svelte:166` | Not run: running commands is switched off in this pane's header (Alt+R). | Blocked: commands are off. [Turn on] (button flips the switch) |
| `TerminalTurns.svelte:166` | Not written: editing the project's files is switched off in this pane's header (Alt+F). | Blocked: file edits are off. [Turn on] |
| `TerminalTurns.svelte:204` | X wants to `run …`. | `run …` (the card's gold edge already says it is asking) |
| `TerminalTurns.svelte:205` | Allow once · Always allow this · Don't allow · answered… | `Allow` (primary, ↵) · `Always` · `Deny` (Esc); after answering the card collapses to "✓ allowed" / "✕ denied" |
| `TerminalTurns.svelte:220` | Summarising the earlier conversation to make room… / Earlier conversation summarised: 18.2k → 3.1k tokens | Compacting… / Compacted 18.2k → 3.1k |
| `TerminalTurns.svelte:308` | The turn failed; X says why in its front end. | Failed. (tooltip: "Details in X's terminal") |
| `TerminalTurns.svelte:295` | `<p class="faint end">stopped</p>` | ■ Stopped (one glyph + word, in the turn foot) |
| `AgentSessions.svelte:51` | No sessions yet: attach an agent, and its sessions are kept here. | No sessions yet. |
| `AgentSessions.svelte:58` | not carried here yet | in its terminal |
| `AgentSessions.svelte:65` | Remove what isorite kept of this? The agent's own history stays. remove · keep | Remove from isorite? (Agent's history stays) Remove · Cancel |
| `AgentSessions.svelte:74` | earlier, with the agent | Before 0.13 (or "Archived") |
| `AgentSessions.svelte:91` | Started for this pane: `omp acp` · stop it | Move to the agent chip menu in the composer: "omp · running · Stop" |
| `AgentSessions.svelte:93` | change agent | Change agent (put in the agent chip menu, not at the drawer's foot) |
| `ContextView.svelte:45` | X hasn't said how full its context is yet. | — (strata empty and grey, tooltip "Not reported yet") |
| `ContextView.svelte:47` | What X dropped when it compacted can't be seen from here. | Delete; show only after a compaction, as a faint footnote "Compacted: earlier content not shown" |
| `ContextView.svelte:56` | With an agent attached, what it has in hand shows here: isorite's part, the notes it was given and read, and the room left. | Nothing in hand. |
| `ContextView.svelte:58` | in the tray | Next prompt (heading hidden while empty) |
| `+layout.svelte:179` | X is reading Y in its own terminal / X's turn is done | `◆ Y` (gem turning) · tooltip "X, in its terminal"; done: hide after 3 s |
| `+layout.svelte:179` title | click open ground on the Atlas to let its path go | Delete; Esc or click the map clears it (document in the guide) |
| `+layout.svelte:181` | `CLAUDE CODE ▾` uppercase chip, title "X is attached: change agent" | Sentence-case chip with status dot, moved to composer footer |
| `+layout.svelte:186/190` titles | The agents' sessions, and earlier conversations / What the agent has in hand, and what the tray gives it | Sessions / Context |
| `+layout.svelte:195` title | A new session with X, from here | New session |
| `+layout.svelte:225-227` | the map / N notes | Delete the Atlas settings popover (it holds one number); show "N notes" as a tooltip on the fit icon |
| `+layout.svelte:156` title | All notes, and search | All notes (⌘K finds) |
| `+layout.svelte:167` | N steps back | `−N` badge on the back button |
| `PaneHead.svelte:21-23` (SAYS) | e.g. "The agent's context: what it was given, what it read and changed (Alt+C)"; "Pictures, data and other files beside the notes (Alt+I)" | Tooltips ≤4 words + key: "Context  Alt+C", "Files  Alt+I", "Questions  Alt+Q", "Agent edits notes  Alt+N" (the fold menu then fits; see `bad-dropdown.png`) |
| `NoteList.svelte:189` | find a note | Find (⌘K) |
| `NoteList.svelte:190-191` | new folder / new note | Folder icon `+` / `New note` |
| `NoteList.svelte:196-197` | a new folder / name, with / for one inside another | New folder / placeholder `geometry/surfaces` says the rest |
| `NoteList.svelte:200,215` | make it / cancel | Create / Esc |
| `NoteList.svelte:212` | none: the top of the base | (top level) |
| `NoteList.svelte:220` | This base has no notes yet. Make the first one. | Empty: a drawn "+ New note" button (taste: a drawn first move) |
| `NoteList.svelte:239` | the top of the base (folder head) | Hide the head for the top level; its notes come first with no label |
| `NoteList.svelte:239` | rename / delete words | pencil / trash icons on hover |
| `NoteList.svelte:253` | in the text | Matches in text |
| `NoteList` `.conflict` | merge conflict (uppercase rose box) | rose `!` glyph + tooltip "Merge conflict" |
| `NotePage.svelte:225` | Git could not put two versions of this note together, and left both in the text. Choose what to keep between the lines <<<<<<<, ======= and >>>>>>>, and delete the lines of the markers. This stays until none is left. | Merge conflict: keep one side between `<<<<<<<` and `>>>>>>>`, then delete the markers. |
| `NotePage.svelte:245` | X.md: the frontmatter cannot be read, so the file is shown as it is | X.md · frontmatter broken: fix it here |
| `NotePage.svelte:249` title | The note as it is read, to be read and not edited | Read mode |
| `NoteLabel.svelte:56` | ◇ open / ◆ resolved / ◇ unsolved / ◆ solved | Keep (good: state + glyph) |
| `NoteSettings.svelte:89` | start the guide again / start again: your changes go | Reset guide / Reset? Your changes go |
| `NoteSettings.svelte:143` | the parts | Parts (design sheet) |
| `IsoSettings.svelte:57` placeholder | instructions for every agent | Instructions for every agent (keep) |
| `IsoSettings.svelte:87` | No key is set. / A key is saved. / Using the key in X. | Placeholder of the key field: "No key" / "•••• saved" / "from $X" (the state lives in the field) |
| `IsoSettings.svelte` buttons | Keep key / Remove key / Check / Use this model | Save / Remove / Test / Use |
| `HoldTags` / Atlas move error (seen in `want-to-move-folder-error.png`) | iso/artifacts holds 2 files that aren't notes (pictures, say); move those by hand first | Move the 2 files too? [Move all] (and do it); no longer found in source, so check it is gone |

## (f) The agent pane: presentation and function

What the good ones do: **Claude Code desktop** shows each tool call as one collapsed row (icon, target, status), groups runs of reads, puts the permission prompt inline with numbered keyboard answers, and keeps mode + model in the composer footer with a context meter. **Cursor** has `@` chips in the composer, a mode switch (Agent / Ask) and model picker in the composer, a "review changes" bar with Accept / Reject all over the diff, and a "Restore checkpoint" on every user message. **Zed's agent panel** shows a thread list as plain rows, a token meter `12k / 200k` in the toolbar, tool cards that expand, a "follow the agent" toggle that moves the editor where the agent works, and external ACP agents behind one `+` menu.

isorite already has strong, distinctive parts that these lack: pointers as chips, the gold gem at work, parts in corner brackets lit with their phrase, strata for context, questions the agent asks becoming notes, offers to insert. The critique is about presentation and a few missing affordances.

1. **First run is a wall (P0).** Live shot: a heading, a four-line paragraph, six equal cards (three not installed, with disabled buttons), and a disabled composer below. Proposal: a short list. Row = name, state dot, one `Use` button; the most likely agent (first found, or the last used) gets `.btn.primary`. Not-installed agents fold into `3 more not installed ▸`. "isorite agent (API key)" is one row with `Set up`. The terminal route is an icon per row opening a 2-line popover (MCP address, ACP command, each with copy). The composer stays visible but dimmed with "Pick an agent to ask". Principles: Hick, progressive disclosure, one primary action.
2. **Who is attached is in the wrong place.** The `CLAUDE CODE ▾` chip lives in the header among switches, and "Started for this pane: omp acp · stop it" lives at the foot of the drawer. Proposal: an agent chip in the composer footer (`● Claude Code ▾`) whose menu holds: model / mode selects (now separate selects in the bar), Restart, Stop, Change agent, New session. Principle: proximity (what the box will talk to sits in the box), as Claude Code / Cursor do.
3. **The three permission switches are cryptic (P0).** The gold feather (agents may edit notes), file and run icons in the pane head are coloured blocks with no words; the owner's own note says "Send to Iso now unclear". Proposal: one "reach" control in the composer footer: `Notes ✓ · Files · Run` as three small toggles with words, or a shield-icon menu listing the three with checkboxes; tinted when on. When a call is blocked, the turn shows `Blocked: commands are off [Turn on]`. Principle: recognition over recall; the fix is where the problem shows.
4. **Tool rows: glyph, target, meta (P1).** Replace the verb column (`searched`, `read`, `ran`, min-width 5.5em) with a 16 px glyph per kind on the Glyph grid (read = open book, search = lens, edit = pencil, run = `>_`, web = globe), the target in the soft colour, and right-aligned faint meta: `+3 −1`, `0.4s`, a malachite ✓ or rose ✕. Consecutive reads/searches fold into one row `read 4 notes ▸` (Claude Code). Raw search queries that are the handoff text (`[1: /notes/… L14] Where I wrote…`) must be trimmed to the user's words.
5. **Show time while it works.** `.doing` says "Claude is reading X"; add the elapsed `· 12s` and, at the end of a turn, one summary line `◆ 14s · read 3 · changed 1` before the parts. Tern's "Working 3.4s" is the model.
6. **Permission card answers by keyboard (P1).** Buttons are lattice text links today. Make `Allow` a primary button with `↵`, `Always` secondary, `Deny` quiet with `Esc`; after an answer the card folds to one line. The two-glow `ask` animation is right.
7. **The user's turn shows plumbing (P0).** `pointer-agent-advice-refinement.png`: the prompt bubble shows the expanded pointer block and the handoff preamble ("Where I wrote [1], [2]…"); `askedOf` already parses refs into a `N pointers` disclosure. Render them as the same pointer chips as in the composer (inline, where they were), never the preamble. Delete "from here" (it is the default); mark only front-end turns with a terminal glyph.
8. **Changes need a review bar in the pane.** When a turn changed notes, add under it `2 notes changed · Review · Undo turn` (Cursor's review bar + checkpoint). Review opens the note in the provenance lens (already wired via `open()`); Undo uses the timeline. The Note pane's "N changes from X waiting · keep all / remove all" is the same idea on the other side.
9. **Follow the agent.** Zed's "follow" maps to isorite well: a toggle in the agent chip menu that opens each note the agent reads/edits in the Note pane as it goes (the Atlas already lights them). Off by default.
10. **Context in numbers.** `IsoGauge` is a 32x3 px bar with no number. Show `34%` beside it (tabular, faint, rose above 85%); click opens Context (as now). Zed shows `12k / 200k`; a percentage is enough here.
11. **Sessions drawer as a list (P1).** `isorite-conversations.png`: four identical "Hello" cards with uppercase meta. List rows: 28 px crystal, the first prompt (or title), right-aligned relative time, a malachite dot when live; `fork` and `remove` on hover. Sort live first, then by last used; search when > 10.
12. **Duplicate prompt (bug).** `initial-iso-duplication-issue.png` shows the same prompt twice with keep/edit/remove on each. Dedupe by prompt id before render.
13. **Copy for your agent.** The gold copy icon appears whenever text is typed; gold means the agent, so it reads as "send". Make it faint, and show it in the composer only when no agent is attached in the pane (that is when it is the way to reach a terminal agent).
14. **Empty states.** Session: the crystal of the session at rest + "Ask Claude Code anything." Context with nothing: one line. No paragraphs.

## (g) Dragology verdict

What it is: *Declarative dragging* (Horowitz, Blinn, Heer; UIST 2026, Best Paper). You declare, for a draggable element, which model states dragging it can lead to; the engine renders those candidate states speculatively, finds where the dragged element would be in each, treats those as drop targets, and interpolates a smooth drag between them, with composable modifiers (snapping, floating, transitions). The library is `dragology` on npm.

Maturity and fit, checked 2026-11-09: version **0.2.0** (8 releases since 2026-03), MIT, 577 stars, README says "we have not yet prepared documentation" (points to an LLM-written `docs/AGENTS.md`). It is **SVG-only** and has **peer dependencies on `react` and `react-dom` 18/19**, plus `immer`, `lodash-es` and five `d3-*` packages (153 kB unpacked before those). isorite is Svelte 5 with HTML (not SVG) lists and an Atlas whose layout must not change.

Where it could help: the only interaction it fits conceptually is *moving a note or folder into a folder* (the hold tag "move", M33), where "the states it can become" are "this note in folder F" for each F, and on the Atlas the drop would show the note already laid out in its new folder. Everything else in isorite that moves (lists reordering, panes, popovers, the agent pane) is a state change, not a drag, and is better served by `animate:flip`, `svelte/transition`, View Transitions and CSS.

Recommendation: **don't adopt.** Bringing React into a Svelte app for one gesture, on a 0.x undocumented SVG library, conflicts with the Atlas's fixed layout and with the bundle; and isorite's move gesture already exists (`gesture.svelte.ts`, `flight.ts`). **Borrow the idea instead**: during a move-drag, preview the destination (the list section the note would join opens a gap where it would land, via `animate:flip` on a placeholder row; on the Atlas, the target folder's frame outlines a ghost box where the layout would put it, if the layout engine can answer "where would it go" cheaply). Revisit if a framework-free core is published.

## (h) Problems seen in `screenshots/`

| Capture | Problems |
|---|---|
| `copy-for-your-agent.png` | (1) "Copy for your agent" is an underlined gold link floating between the tray chip and the box: unclear what it copies or why it's gold (the agent's colour). (2) The tray chip "◆ Web and code links ×" is an outlined box unlike the pointer chips in the composer: two looks for "given to the agent". (3) Placeholder "Attach an agent to ask it here" in a box that looks enabled. The current build has an icon instead of the link (`IsoPane.svelte:99`), still gold. |
| `frontmatter.png` | (1) Path shown as "· / start-here" at the top level: a stray dot and slash. (2) A lone `+` for tags with no label. (3) Kind slots as three words in boxes, the chosen one solid blue (now icons in the build; still solid). (4) "read source" float as two loose words. (5) Rule under the label row: one more line. |
| `no-artifacts-in-list-view.png` | (1) The folder `iso/artifacts` shows its head (`+ rename delete`) but none of its files: artifacts aren't listed in the list view. (2) `delete` offered on a folder that holds files (it fails later, see below). (3) `…` and `+ rename` repeated on every row/head. (4) "the top of the base" style folder labels and rules. |
| `pointer-agent-advice-refinement.png` | (1) The user turn prints the handoff boilerplate and expanded pointer (`[1: /notes/check-it-out.md L14] Where I wrote [1], [2]…`). (2) The `searched` tool row shows that same raw text as the query. (3) "from here" under the prompt adds nothing. (4) Parts under the reply with uppercase "NOTES" folder captions repeat the same word three times. |
| `pulses-in-flight-on-hover.png` | Atlas (other agent's): hover lights many routes at once with thick blue glow; glow bleeds and doubles where routes run together; orange "1 builds on it" labels compete with note titles; labels at this zoom are clipped ("Make, move and dele…"). |
| `scrollbar.png` | (1) A wide grey classic scrollbar with arrow buttons in the Note pane despite the thin-scrollbar rule (check `scrollbar-width` with the platform's overlay setting, and `::-webkit-scrollbar` styling for Chromium on Windows). (2) The note pane has scrolled sideways: the title reads "heck it out" and the text is cut at the left (`.pbody` `overflow: auto` lets x scroll; use `overflow-x: clip`). (3) The Atlas header's solid pink `?` block shouts. |
| `selection-overlap.png` | The selection tags overlap each other and the selected text; the shortcut tooltip ("to … agent Ctrl+[") is cut by the clipboard tag and partly hidden. Tags should place below the selection's last line, side by side with ≥ 4 px gap, and the tooltip above all tags. |
| `selection-icons.png` | Same: the two tags sit over the text "of its own." and overlap each other; icons ambiguous (clipboard vs send). |
| `two-pulses-in-flight.png` | Atlas: two pulses travel at once in different colours (orange, violet): which one is the answer? One pulse at a time (cancel the previous), as taste.md says pulses are few. |
| `want-to-move-folder-error.png` | The error is a rose banner at the Atlas's foot, far from the folder, and it tells the user to leave the app ("move those by hand first"). Offer "Move the 2 files too" and do it; show the message by the folder. (String no longer found in source: may be fixed; recheck.) |
| `bad-dropdown.png` | The Atlas fold menu is wider than its pane and covers the Agent pane; its rows are full sentences ("The agent's context: what it was given, what it read and changed"); a column of small blue squares runs down the right edge (stray markers, likely the `.row .on` dots or lustre canvases misplaced). Short labels (see (e), `PaneHead.svelte:21-23`) and `max-width: calc(100% - 16px)` relative to the pane, not the viewport. |
| `initial-iso-duplication-issue.png` | (1) The same prompt rendered twice with its own keep/edit/remove. (2) Code fences shown literally (```` ```python ````) inside the note's code blocks. (3) Keep / edit / remove are three solid pastel blocks per item: heavy for a per-paragraph decision. |
| `isorite-agent-setup-screenshot.png` | Older setup: three bullet routes in prose, inline command strings, a select + an input + "attach it". The current cards are better but still prose-heavy (see (f) 1). |
| `isorite-conversations.png` | Four "Hello" sessions indistinguishable; uppercase meta `OMP · LIVE · TODAY · 11:33` repeated; "Started for this pane: omp acp · stop it" loose under the grid. |
| `notes-to-self.png` | The owner's list, mapped: no way to delete a note (exists now in `NoteSettings` trash and hold tags, but hidden: add it to the note's `…` menu); "Send to Iso" unclear (f 3, 13); folders unintuitive (b: list heads, NoteList new-folder copy); code links; frontmatter colons; Atlas top bar icons (b P0 quiet switches); moving notes (g, borrowed preview); terminal TUI; read mode (b: segmented edit/read/source); lustre less overt (done: pulse round the edge, `lustre.ts`). |

Seen live and not in the captures: the Note settings popover has unlabelled rows of choices; the Atlas settings popover holds only "the map / 31 notes"; the Atlas at default zoom in three panes shows boxes with no names; the Agent pane's first view has no single next step.

## Implemented 2026-11-09

The app shell's part (tokens, the Note pane, the list, the pane heads, the settings, the selection tags); the Agent pane and the Atlas are left to their owners, who should adopt the tokens below.

### Tokens (app.css), for the Agent pane and Atlas owners to adopt

- Motion: `--dur-1: 120ms`, `--dur-2: 260ms`, `--dur-3: 600ms`, `--ease-out: cubic-bezier(.2,.8,.2,1)`, `--ease-in`; `--t-ack/--t-change/--t-result` are now aliases of the three. `--stagger`, `--stagger-max`. A global `prefers-reduced-motion: reduce` rule ends every transition and animation at once and sets the durations to 0.
- Text: `--text`, `--text-soft`, `--text-faint` (meta only), new `--text-mute` (disabled, placeholder).
- Surfaces: `--surface`, `--surface-raised`, `--surface-float` (aliases of `--ground-0/1/2`); `--line-faint` for the few rules that stay.
- States: `--fill-hover`, `--fill-chosen` (ink mixed into the ground), `--tint` (18% lapis, 12% quartz) for a coloured thing that is on; the `.is-on` class; `.segs` (segmented control: the chosen one a quiet chip with the chamfer); `.setting` (a row: a `.label` at the left, its control after).
- Type and size: `--fs-meta/-small/-ui/-lead/-title`, `--fw-regular/-medium/-strong`, `--lh-ui`, `--row`, `--row-dense`, `--control`; `.label` is now 500 11px with letter-spacing, faint.
- Focus: `--pane-lit`. `.btn` defaults to a 7% ink fill (11% on hover) instead of `--ground-3`; `.btn.quiet` hovers with `--fill-hover`.
- Motion helpers in `app/src/lib/motion.ts`: `fadeIn`, `flyOut`, `foldAway`, `growOpen`, `glide` (flip), all zero-length with reduced motion; `swap()` (a scoped View Transition crossfade) and `carryTitle()` (the title morph).
- Global rules: `:where([role=alert],[role=status])` comes in with `appear`; `<details>` grows open where `::details-content` is supported (this also covers the Agent pane's tool and thinking folds, motion #9); the scrollbar is drawn by `::-webkit-scrollbar` in Chromium (no arrows) and by `scrollbar-width` elsewhere.

### Table (b)

- Done: P0 quiet switches (`PaneHead` `.sw`, the shell's `button.icon`, NoteSettings' icons, BaseSwitch's lend): tint + 2 px bar growing from the middle; the Atlas's off-tint dropped; the context switch set 8 px apart from the kinds (P1 Atlas switches).
- Done: P0 note list without rules (space and `--fill-hover`/`--fill-chosen` tone instead); folder heads in the label voice with room above; the top level has no head (shown only while a note is carried).
- Done: P0 row and folder actions on hover/focus-within only, always on `(hover: none)`; rename and delete are pencil and trash icons with names and tooltips.
- Done: P0 focused pane: a lit line along the head's top that draws from the left (fades from the pane that lost it); unfocused pane names faint.
- Done: P0 `overflow-x: clip` on the note pane's body.
- Done: P1 `.label`, `.pname` (600 13px, faint unless focused), list title 16px and description italic serif faint, `edit · read · source` segmented control, NoteLabel without its rule and with borderless tinted kind slots (the question/problem mark is a tinted chip too), NoteSettings rows labelled (`note`, `base`, `ground`, `layout`, `panes`, `window`) with segmented ground, `.btn` default fill.
- Left to their owners: P0 AttachAgent, P1 AgentSessions, IsoPane composer, TerminalTurns tool rows, P2 Atlas dots, AttachAgent border.
- Done: P2 ContextView headings hidden while their list is empty. Not done: P2 code-block radius, the sans for long UI prose (optional, taste).

### Motion plan (d)

- Done: #1 (`animate:flip`, fade in after, fold away on rows and folder sections; all off while the list is narrowed by typing and for 600 ms after), #2 (title morph via View Transitions in `onNavigate`, from a list row or a link in a note, with a feature check and `pointer-events: none` on the overlay so it never takes a click), #3, #4, #5 (settings, fold menu, bases, note menu leave with `flyOut`), #9 (global, see above), #12 (strata widths ease over `--dur-3`), #13 (tray rows in ContextView), #14 (saved mark blinks malachite once), #15, #16 (global), #17 (`swap()` crossfade for edit/read/source).
- Left to the Agent pane owner: #6, #7, #8, #10, #11 and the PromptBox side of #13.
- Moving a note between folders: done in the list as a contained change, changed from the audit's gap: while a note is carried over a folder, a blue line with its title marks the place it would land (the list is ordered by path). It is drawn over the list, not in its flow: a gap opening in each folder passed over moved the folder aimed at from under the pointer. On the Atlas it is deferred to the Atlas owner (it needs the layout to answer "where would it go").

### Verbiage (e)

- Done: `+layout` (`−N` with "N steps back" as its title; the Atlas settings popover deleted, the note count is in the fit button's tooltip; the agent's terminal turn as `◆ <note>` with "X, in its own terminal" as its title, "done" hidden after 3 s; sessions/context/new session tooltips; chip in sentence case), `PaneHead` tooltips (≤4 words + key), `NoteList` (Find, folder icon, New note, Create/Cancel, `(top level)`, a drawn `+ New note` for an empty base, `Matches in text`, the merge conflict as a rose `!` with its name), `NotePage` (merge conflict, broken frontmatter, Read mode), `NoteSettings` (Reset guide / Reset? Your changes go), `ContextView` (Nothing in hand; empty strata with "Not reported yet"; the compaction line deleted; `next prompt`), FindBar and BaseSwitch tooltips.
- Changed: the agent chip's move into the composer footer is left to the Agent pane owner (only its case and tooltip changed here). NoteMenu's delete wording kept (its tests name it).
- Not in these files: every AttachAgent, IsoPane, TerminalTurns, AgentSessions, IsoSettings row; the HoldTags move error (no longer in the source).

### Screenshots (h)

- Done: `scrollbar.png` (the pseudo-element scrollbar and the sideways scroll), `frontmatter.png` (no rule, quiet slots, read/source as one control, `+` with a tooltip), `selection-overlap.png` / `selection-icons.png` (the tags in a row under the selection's last line, 10 px apart, the name of the one pointed at drawn over the others), `no-artifacts-in-list-view.png` (row and folder actions on hover only, no rules; files beside the notes were already listed).
- Others are the Atlas's or the Agent pane's.

## Agent pane implemented 2026-11-09

The Agent pane's part of (b), (d), (e) and (f), on the shell's tokens (`--dur-*`, `--ease-*`, `--fill-*`, `--tint`, `--fs-*`, `--row-dense`, `--surface-*`, `--line-faint`, `.btn`, `.label`, `.hidden-label`, `motion.ts`). Files: `IsoPane`, `TerminalTurns`, `PromptBox`, `IsoGauge`, `AgentSessions`, `AttachAgent`, `IsoSettings`, `terminal.svelte.ts`; server `pi/host.ts`, `pi/scripted.ts`, `pi/index.ts`, the `/api/terminal/scripted` route in `http.ts` and its wiring in `serve.ts`; two optional fields in the engine's `TerminalItem` (`ms`) and `TerminalTurn` (`took`).

### Composer footer ((f) 2, 3, 10, 13)

- Under the box, one row: the agent (a malachite dot, gold while it works, and its model's name; its menu holds `Model and key…`, `New session`, `Sessions`), the reach as three word switches `notes · files · run` (on = gold tint, the chamfer and a 2 px bar that grows from the middle, as the shell's switches; files and run only while an agent is set up), then the context gauge as a short bar and a percentage (warning colour when long, rose from 85%), then the send arrow and the stop square cross-fading in one cell.
- The reach switches left the header: `SWITCHES.iso` is empty and `REACH` lists them (`panes.svelte.ts`); Alt+N/F/R still flip them. `IsoGauge` draws only where it is put with `inline` (the composer), so the header's copy draws nothing.
- Copy for your agent: faint, and only with no agent set up. While the agent works and something is typed: "Enter queues it for when it stops. Steer now".

### Turns ((f) 4, 5, 7; motion #10, #11)

- A tool call is one row: a 14 px glyph in the gutter (book, outline, lens, pencil, page, `>_`, globe, map), what it acted on (a note as a button that opens it and lights it on the Atlas, a query in quotes trimmed of the handoff's preamble and footnote marks, a path or a command in mono), and at the right `+3 −1`, the time it took, a breathing gold point while it runs or a rose ✕; opened, its diff or output. The verb is the row's tooltip and hidden name.
- Two or more look-ups in a row fold into one row, "Read 2 notes · searched once", opened to each.
- While a turn runs, the line under it is the turning gem, the step ("Reading *Surprise*", "Thinking", "Working") and the seconds so far; once over the same line (same height, so nothing moves) says "2.8s · read 3 · changed 1", or "Stopped · 4.1s".
- The prompt shows what was written, with each footnote mark a pointer chip where it stood (title and lines; where it is and its words in the tooltip; pressed, it opens the note). The handoff preamble and "from here" are gone; a turn sent from the agent's own terminal has a `>_` glyph.
- Streaming keeps its steady pace; the session follows the newest only while you are at the end, also when the pane itself gets shorter (the box grown by lines), and "Newest" takes you back.
- A refused command or file edit says "Blocked: commands are off. Turn on" under its row (the button flips the switch).

### Changed notes ((f) 8)

- A turn that changed notes has a bar under it: "Channel capacity changed" (or "2 notes changed") · Review · Undo turn. Review opens the first in the Note pane's provenance lens.
- Undo turn needs no engine change: for each note the turn changed, the journal (`api.journal`) gives the agent's entries inside the turn's time; the note is restored (`api.restore`) to the entry before the first of them, or deleted if the turn made it. Where the note was changed again after the turn, nothing is undone and it says to use the note's timeline. The bar then says "Undone: … put back". Undone is remembered in the page only (a reload shows the bar again; pressing it again is refused by the journal check, since the restore is itself a later entry).

### Errors, empty states, keys ((f) 14; (e))

- A failed turn says why in a few words with one action: a missing or refused key, "No key for this model. Open settings" (opens the pane's settings with the provider focused); a rate limit or an unreachable provider, "Rate limited by the provider. Retry" (asks the turn again). The raw message is the tooltip, not the agent's words.
- No agent yet: a crystal, "Ask about your notes", one primary `Use isorite's agent`, and one faint line with `isorite setup` and a copy icon. An empty session: its crystal and "Ask <model> anything." A send with no agent: "No agent yet. Set up".
- Keys: Enter sends, Shift+Enter is a new line, Escape closes the agent menu or stops, Up in an empty box brings back the last thing sent (pointers and all).

### Sessions drawer ((f) 11; motion #7)

- A list, not cards: a 28 px crystal, the first prompt in the serif, the time at the right with a dot when live (gold while it works); fork and remove as icons on the row under the pointer (always on touch); live first, then by last used; rows glide and fade in. "Archived" for Iso's old conversations; "No sessions yet."

### Settings copy ((e))

- `Save` / `Remove` (only when a key is saved) / `Test` / `Use`; the key's state as "No key.", "Key saved.", "Key from $X."; "In use" with a malachite dot.

### Tests

- `pi/scripted.ts`: a scripted model for isorite's own agent (pi-ai's faux provider, a factory per request that reads the person's last message as a script: `read`, `search`, `edit <note> <old> => <new>`, `write`, `ask`, `offer`, `run`, `file`, `wait`, `think`, `cite`, `draw`, `long`, `say`, `fail`). It exists only where `ISORITE_SCRIPTED=1`; the browser tests' server sets it, and `POST /api/terminal/scripted {on}` puts it in the pane or takes it out (`tests/agent.ts` `attach()` / `detach()`).
- Re-enabled: `agent-pane`, `pointers`, `follow`, `kinds`, `diagrams`. New in `agent-pane`: tool rows and the folded run, the changed bar with Review and Undo turn, Escape stopping a turn, Up recalling, the two failures and their actions, the refused command and its switch, and the footer holding agent, reach and gauge. `tests/serve.ts` takes `ISORITE_TEST_PORT` for a run of its own beside another.
- The pi host now marks a question made a note, or words inserted, in its turn (`agent-taken`), which the ACP follower did and the host did not.

### Left over

- `+layout.svelte` (not this pane's file) still has the header's agent chip (`pi (scripted)`, calling `terminal.change()`, which now opens the settings at the provider) and `<IsoGauge />` (which draws nothing there now); both can go. `terminal.acp` is still read by the layout; it keeps that name.
- Not done: follow-the-agent ((f) 9), permission answers by number keys (the buttons are there: Allow primary, Always, Deny), the dedupe of (f) 12 (not seen with the native agent).

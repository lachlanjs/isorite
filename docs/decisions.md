# isorite: decisions

Transcribed on 2026-10-13 from the two decisions boards in the design artifact (https://claude.ai/artifact/Bh1SFQUWZGy1RBUFK4BSJC), with Lachlan's answers of the same day applied. The boards have the drawings; this file is what the code is held to.

- **decided:** Lachlan said so.
- **my call:** the agent's recommendation, not yet confirmed. Treat as a proposal.
- **open:** undecided.

`ISORITE_DOC.md` is older than some of these. Where they differ, this file is followed; `plan-first-slice.md` section 7 lists the places.

## Design


### settled this round

| | What | Decision |
|---|---|---|
| decided | your prompt, once you keep the answer | The kept text becomes ordinary prose. The prompt leaves the note and stays in its history, reached from the timeline. |
| decided | when Iso speaks | Only when asked. No nudge after a wrong answer: you ask in the exercise, as in any note. The two multiple-choice boards now show your question first. |
| decided | the row of squares | Iso's read of how well you understand what the exercise tests. Exercises and study-base activity (reviews, the recall curve) fill it. You can wind it back if Iso rates you too highly. Redrawn on all twelve exercise boards. |
| decided | exercise kinds | Multiple choice, single answer, written response, find the error, explain it back, open investigation. |
| decided | study folders on the Atlas | A sibling of the folder they study. Same surface as any folder; a solid title band and a small grown mark set them apart. Items keep cut corners, a kind label and dotted links. |
| decided | suggested links | Dotted until kept. You keep one by writing the link in the note; the rest disappear. Recommended ones carry a gold edge. |
| decided | gold | Several gold marks at once are fine (the timeline). |
| decided | hover colours | Purple for "requires", orange for "builds on". Good enough for now. |
| decided | key hints | Terminal only. None in the desktop or mobile interface. |
| decided | settings | Behind the logo on desktop. On a home screen on mobile. Model tier and cost live there. |
| decided | layout moving between edits | Accepted, as long as each layout looks sensible by itself. |

### settled earlier

| | What | Decision |
|---|---|---|
| decided | the logo | Turtle-word letters, round ends, a gold diamond on the first i (Iso) and a malachite one on the second. |
| decided | asking Iso | No sidebar. Hold on the Atlas to start a note for Iso; watch it work on the Atlas; review, edit in place, keep or discard. |
| decided | Iso's text in a note | Between two drifting dotted rules, never in a box. Keep, edit, remove as solid light buttons. |
| decided | exercises | Plain editable notes. Anything that can be dialogue in the note is. A right answer is rewarded by a flash and a sound; "next" sits in the header. |
| decided | the timeline | In the note's margin on desktop, swiped in from the left on mobile, and on the Atlas. Pointing at a moment shows what it changed. |
| decided | the terminal | Note view, one-note Atlas and notes in play. The full Atlas, study mode and long writing stay in the browser. |

### still open

| | What | Decision |
|---|---|---|
| decided | one scale for understanding, or two | A block's edge on the Atlas has four states; the new row has six squares. I would make them one scale: the squares are the fine reading, the edge its four coarse steps. |
| decided | what the squares belong to | A note, not an exercise. An exercise that tests two notes shows the lower of the two. |
| my call | winding back | One square per press, recorded as an event in your study record so the recall curve can use it. |
| my call | squares on Atlas blocks | They now mean "one per exercise, passed or wrong". With the level on the edge I would drop the red ones and keep a plain count. |
| decided | cost and context | In the header, kept minimal: the context's token count and the session cost. Clicking the count opens a breakdown of what the context holds. Drawn on its own board in this row. |
| my call | streaks, daily goals | None. |
| open | kinds inside a study folder | "note", "goal", "explain" and "open" are my labels. Use will show which are real. |
| open | sound | Not started. I can build the engine and an audition board; only you can judge it. |
| open | how the gold edge on a recommended link looks | Not drawn yet. |

### not drawn yet

| | What | Decision |
|---|---|---|
| open | the logo menu and settings | Desktop menu behind the logo; mobile home screen. |
| open | first run | Choosing or making a base and a study base, the provider key, sync. |
| decided | project mode | Keeps a journal for each note, in the knowledge base itself since there is no study base (2026-10-13). Open: how study mode differs from it at a glance, and whether that journal is committed. |
| open | empty, error and offline states | A base with no notes; Iso unreachable; a failed sync. |
| open | "what changed while I was away" | The session tour. The first-run tour exists for desktop only. |
| open | the Atlas at scale on a phone | And the timeline on the mobile Atlas. |

none of these blocks the first slice except the logo menu and first run.


### the visual pass · 12 October

| | What | Decision |
|---|---|---|
| fixed | every board rendered and looked at | All 46, on the lapis ground, at their canvas size. Nothing was broken outright: fonts, logo, cut corners, routes and the terminal blocks all draw as intended. |
| fixed | found and corrected | Overflowing text on the bases board; a missing space after a citation in terminal chat; Iso speaking unasked on the choice boards; the counter squares. |
| left | mobile Atlas | "3 notes" under "impurity problems" collides with the card edge: the two-line title needs a taller card. |
| left | two older Atlas boards | "A larger base" and "study items on open ground" are hand-placed and show overlaps. The nested board replaces both; I would delete them. |
| left | quartz | Only five boards were checked on the light ground. |
## Implementation


### files on disk · decide before any code

| | What | Decision |
|---|---|---|
| decided | unkept text | Never written into the note's file. It lives in the journal and the editor lays it over the note; the file changes only when you keep. Git then never sees unkept text, and "prompt in history, answer as prose" falls out for free. |
| decided | the journal | Append-only, one file per note, in the study base. It is personal, and the knowledge base stays the same for everyone. |
| decided | exercises | Only in the study base. |
| decided | understanding | A number, always derived from events in the study record (attempts, reviews, wind-backs). Never edited by hand or stored as the truth. |
| decided | which study base goes with which base | Written in the study base itself ( isorite.toml : the knowledge base's remote and path). A phone has no ~/.config . |
| my call | a terminal agent's edits to notes | Wait to be kept, through the same journal. Its edits to code use the harness's own accept and reject. |
| decided | suggested links | Not recorded once they disappear. Text from Iso is different: it stays pending until kept or discarded (2026-10-13). |
| decided | a "mentions" link kind | Not added; "see also" covers it (2026-10-13). |

these change what is committed, so they are expensive to change later.


### then

| | What | Decision |
|---|---|---|
| my call | drawing the Atlas | SVG for the first slice. Measure on the 225-note base; move only the link layer to canvas if it is slow. |
| decided | layout | rdstudio's nested layout and router, carried over with their benchmark. A full recompute on each change is accepted. |
| my call | study folders in the layout | Ordinary sibling folders with a flag. No second layout. |
| decided | Iso on a phone | Through OpenRouter or a self-hosted gateway. |
| my call | providers | One provider interface from the first line, so desktop and phone differ only in configuration. |
| my call | the terminal | After the first slice. Run the experiment that was scoped and never run: plugin, launcher or custom, against OpenCode and Pi. |
| my call | mobile | After the first slice. One day's test of git inside Tauri on Android before any mobile work. |
| my call | sync | Plain git, one private repository per person for the study base. |

### against rdstudio

| | What | Decision |
|---|---|---|
| keep | the core | TypeScript, pure functions, files in as text. Carried over with its tests. |
| keep | the Atlas layout | Carried over unchanged. It produced the nested board here without modification. |
| keep | Iso's server side and the MCP server | Carried over. |
| keep | the stack | npm workspaces, Node 24, Hono, a SvelteKit single-page app on Svelte 5, CodeMirror 6, markdown-it and KaTeX. |
| change | a new repository | Final names from the first line. No aliases for old tokens or packages. |
| change | the map's drawing | Rewritten as components; only the canvas stays imperative. |
| change | one implementation of everything | The terminal's one-note Atlas reads the same layout data. |
| change | no agent panels | Notes for Iso and the journal are the only agent interface. |
| change | the study base | A second repository beside the first, with study folders on the map. rdstudio kept exercises in the base and off the map. |
| change | cut corners | Not by clip-path where focus rings and menus matter. These boards use it everywhere. |
| change | a fourth hue | Malachite, for right and kept. |

### the first slice

| | What | Decision |
|---|---|---|
| decided | what is in it | One base and its study base. The editor with notes for Iso, kept and discarded. The Atlas with study folders. One exercise kind: written response. Search by meaning. The timeline. Desktop only. |
| decided | what is not | The terminal, mobile, sound, the tours, settings beyond a provider key. |
| decided | the condition | Use it on information theory for a week (changed from DMFT on 2026-10-13: a subject Lachlan knows well shows the tool's faults more clearly). Starting a base from nothing is tested after. |

### working rules

| | What | Decision |
|---|---|---|
| decided | plan, then build | A written plan and your approval before each milestone. |
| decided | git | A branch per milestone, merged with --no-ff . Never pushed; no remotes unless you say so. |
| my call | checking | Tests find things by text and role. Streamed states are testable. Every screen is looked at at 1280 and 390 pixels. |
| decided | browser tests | Written in TypeScript (`@playwright/test`). No Python in the repository. |

## Decided on 2026-10-13, in conversation

| What | Decision |
|---|---|
| search by meaning | In the first slice, carried over from rdstudio. "Fairly fundamental to Iso's ability to get information." |
| the MCP server | Stays in rdstudio until the terminal is built. |
| architecture | The complex parts and how they fit are worked out and written down (`architecture.md`), not left until after the slice. "It will be hard to properly test until those features are implemented." |
| the repository | `github.com/lachlanjs/isorite` is its remote. Milestone branches are local and nothing is pushed unless Lachlan says so. |

## Decided on 2026-10-14, in conversation

Lachlan found the Atlas's lighting unreadable on real bases: lines drawn at rest that did not light, lit lines along paths that were not there before, and on "Stokes' theorem" 32 lit links at one weight. This replaces what `Atlas-Nested` shows for a chosen note (the whole chain of what it requires, drawn).

| What | Decision |
|---|---|
| lines for a chosen note | One step each way: what it requires itself (purple) and what requires it (orange). |
| the rest of the chain | Outlined, not drawn: thinner and fainter with each step back. |
| walking | Clicking a note the chosen one requires steps back to it; the way walked stays lit. Clicking a note already walked returns to it. |
| folders apart from the note's own | Stand for their notes: the frame takes the colour and says "N required here". |
| the whole chain | Drawn only when asked for (`[ whole chain ]` in the status line, or the key w), without the links a longer way already makes. |
| the three kinds of link | "Requires" is drawn as before; a route carrying only "uses" is drawn lighter; "see also" is not drawn. A chosen note's own "uses" light as a plain line and its "see also" as a dotted outline, one step only. |
| pointing | Previews a note only while none is chosen, so the walk does not flicker. |


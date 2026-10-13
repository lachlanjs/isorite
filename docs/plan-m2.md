# Milestone 2: Iso in the note

Approved by Lachlan on 2026-10-13 with the answers in section 4. Branch: `m2-iso`. Steps 1 to 3 of section 5 are built; see section 8.

**Done when:** both ways of asking Iso work against a real model on the information theory base; a test shows a note's file is byte-identical until you keep; and closing the browser with a proposal waiting, then returning, shows the proposal again.

The boards followed: `Desktop-Editor` and `Header-Context` (Iso's text in a note, the header's count), `Desktop-Ask` and `Desktop-Review` (a note for Iso), `Mobile-Note` (the prompt field on a phone).

## 1. What you will be able to do

1. **Ask in a note.** Put the cursor where the text should go and press Ctrl+Enter (or the prompt field at the foot on a phone, as on `Mobile-Note`). A line opens for the prompt. Send it.
2. **Watch it arrive** between two drifting dotted rules, never in a box. The status line says what Iso is reading, and `[ stop ]` stops it.
3. **Keep, edit or remove.** Three solid light buttons under the text, with the gold diamond and the answer / prompt switch beside them, as on `Desktop-Editor`. Keep makes it ordinary prose in the note. Edit lets you change it in place first. Remove takes it away; it stays in the journal.
4. **Ask for a rewrite.** Select one or more paragraphs, press Ctrl+Enter, and say what to change. The rewrite arrives beside the paragraphs it would replace, and nothing else in the note can change.
5. **Write a note for Iso.** "new note for Iso" on the notes list opens a draft marked "for Iso · not in your base yet" (`Desktop-Ask`). You write what you want, link the notes it should rest on, and send it. Iso's reply arrives under your folded prompt (`Desktop-Review`), and you keep it as a note in a folder you choose, or discard it.
6. **See what it costs.** The header shows the context's token count and the session's cost. The count opens the breakdown on `Header-Context`, with `[ clear the conversation ]`.
7. **Set the key.** One field, behind the logo. The key is kept in `~/.config/isorite/config.toml` and never reaches the browser again.

## 2. What is built

### In the engine

| Part | From | Notes |
|---|---|---|
| provider | rdstudio's `models.ts`, reduced | One interface: `complete(request, signal)` gives a stream of text, tool calls and usage. Two adapters over the `Http` port: OpenRouter, and any OpenAI-compatible endpoint. |
| tiers and prices | rdstudio | low, mid, max, chosen per request. Defaults as in rdstudio: Haiku 4.5, Sonnet 5.5, Opus 5.5 through OpenRouter. |
| the loop | rdstudio's `assist.ts` | model, tool calls, model, for 3, 6 or 8 rounds by tier. Publishes `iso-step`, `iso-text`, and exactly one of `iso-done`, `iso-stopped`, `iso-failed`. |
| lookup tools | rdstudio's `lookup.ts` | keyword search, search by meaning, a note's outline, one section, a note's links and what links to it. All read-only. |
| the check on quotations | rdstudio | A sentence quoted from a note is checked against the note's text before it is shown as a quotation. |
| search by meaning | rdstudio's `embed.ts` | The pieces, the cache by fingerprint and the search are in the engine. Running the model is behind a new port (below). |
| context | new | The five parts of `architecture.md` section 5, assembled per request, each counted. |
| proposals | the core, built in M0 | The engine enters `proposal`, `revise`, `discard`, and `change` with `why: keep`. Placing is the core's. |
| drafts | new | `drafts/<id>.md` in the study base, with its own journal. |

### In the server

- The routes for asking, stopping, keeping, revising, discarding, drafts, the context breakdown and the key.
- The embedding model run by `onnxruntime-web` in a worker process, as in rdstudio, and its cache in `~/.cache/isorite/`.

### In the app

- The proposal between dotted rules in the editor, laid over the note from the journal. It is a block the cursor cannot type into until "edit" is pressed.
- The prompt line, the tier choice on it, and the rewrite's side-by-side view.
- The draft page and the review page.
- The header's count, cost and breakdown.
- The key field.

## 3. Where rdstudio's code does not carry over as it is

`plan-first-slice.md` says "carried over" for Iso's server side. Having read it, three parts need more than moving:

1. **rdstudio's provider code is written against Node** (its own TLS, proxies, client certificates, a command that prints a short-lived key). The engine may not import Node. For the slice I would carry over the protocol, the streaming parser, the price table and the tests, over plain `fetch`, and leave the enterprise transport for when it is wanted. It would then live in the server, behind the `Http` port, with no change to the engine.
2. **The embedding model needs a fifth port.** `Embedder { embed(texts) }`. The server runs it in a worker process now; a webview can run the same model later. This is the "model has to run on the phone" point from `architecture.md` section 6, made concrete.
3. **rdstudio's loop wrote into notes through tools.** Here Iso has no tool that writes: the form of the request decides where its text can go. So the loop is carried over, and its writing tools are not.

## 4. Choices that need your eye

1. **How a prompt is started.** Ctrl+Enter at the cursor, or with paragraphs selected. On a phone, the field at the foot of the note. `ISORITE_DOC.md` says "with a key or a button"; the boards show the result but not the gesture on a desktop.
2. **The tier** is chosen on the prompt line (low, mid, max) and remembered. The boards put tier and cost in settings; I would keep the default there and the choice on the prompt, since it changes per question.
3. **A note for Iso starts from the notes list in this milestone.** The boards start it by holding on the Atlas, and pick linked notes on the Atlas. The Atlas is milestone 3. Until then: a button on the notes list, and linked notes chosen by typing `[[` in the draft. The Atlas gestures are added in milestone 3 on the same draft.
4. **Suggested links are not in this milestone.** `Desktop-Review` shows links in Iso's reply as dotted suggestions. In the slice a link in Iso's text is an ordinary link you keep with the text.
5. **The key.** `~/.config/rdstudio/openrouter.key` exists on this machine. I have not read it. Either you paste a key into the new field, or you tell me to copy that file's key into isorite's configuration.
6. **Testing against a real model costs money.** The automated tests use a scripted provider and cost nothing. For "done when" I would run each of the three forms once or twice on the mid tier and report the cost; I expect well under a dollar. Say if you want a ceiling.
7. **The answer / prompt switch.** On `Desktop-Editor` a proposal shows either Iso's answer or your prompt. I would build that as drawn.

### Lachlan's answers (2026-10-13)

1. Ctrl+Enter: agreed.
2. The tier on the prompt line: agreed, and may change later.
3. A note for Iso from the notes list for now: fine.
4. No suggested links for now. When they come, they come from what Iso reads in the knowledge base during the conversation.
5. Use the key from rdstudio. The field for it is still to be built, **and a settings menu, with the choice of ground (light or dark) in it.**
6. Test against real models as needed, within the key's $10 limit. Be careful, say if it gets expensive, and work out how Iso's context is managed.

## 5. Order of work

1. Provider, tiers, prices, the key, with rdstudio's provider tests against a scripted server.
2. The loop and the lookup tools, with keyword search only, tested with a scripted provider.
3. Asking at a point: the routes, the events, the proposal in the editor, keep, edit, remove. The byte-identical test and the close-and-return test.
4. The rewrite of selected paragraphs.
5. The header's count, cost and breakdown; clearing the conversation.
6. Search by meaning: the port, the worker, the cache, the second tool, and rdstudio's retrieval measure re-run.
7. The note for Iso: draft, send, review, keep as a note.
8. A real model on the information theory base. Screens checked against the boards at both widths on both grounds. The write-up.

Each step ends with its tests passing and a commit. I would stop and show you after step 3, since it is the first time Iso's text is on the page.

## 6. How it is checked

- **Engine:** the loop against a scripted provider (rounds by tier, a tool call answered, a stop mid-stream, a provider error); each form's limit (a rewrite that tries to change an unticked paragraph is cut back and the cut is reported); a proposal placed after the note changed; the context's five counts.
- **Server:** each route and each refusal; the key is written with owner-only permissions and no route returns it.
- **Browser:** ask at a point and keep; edit then keep; remove; rewrite two paragraphs; the file on disk is read before and after each and is unchanged until keep; reload with a proposal waiting; the draft flow end to end; the breakdown opens and its parts sum to the count; all at 1280 and 390 px on both grounds.
- **Retrieval:** rdstudio's measure on its fixture, to show search by meaning was carried over without loss.

## 7. Risks

- **The proposal in the editor** is the hardest part: a block that is not in the document, sits between two blocks of it, survives the document changing under it, and becomes editable on request. CodeMirror block widgets do the first three; "edit" is an editor inside the widget.
- **Size.** This is the largest milestone of the slice, perhaps twice milestone 1. The stop after step 3 is there so a wrong turn is caught early.
- **Streaming through the event stream** rather than through the request means a second tab sees Iso working too, which is wanted, and that a dropped connection must not lose the proposal, which the journal already guarantees.

## 8. Progress

**Steps 1 to 3, built 2026-10-13.**

- The provider over plain `fetch`, the read-only lookup tools and the loop, in the engine, tested against a scripted provider.
- Asking at a point: Ctrl+Enter opens a prompt line under the paragraph the cursor is in (on a phone, a field at the foot of the note). The reply arrives between dotted rules, with what Iso is looking up beside `[ stop ]`. Keep, edit, remove, and the answer / prompt switch, as on `Desktop-Editor`.
- Settings behind the logo: the ground (the system's, lapis, quartz), the provider key (held, replaced or forgotten; never shown again), and which model each tier is.
- Tested: 27 engine tests and 16 server tests; 44 browser tests (11 tests at two widths on both grounds), among them that the note's file is byte for byte unchanged until keep, and that a waiting proposal, and an edit to it, are there after a reload.
- One request to a real model (Haiku, through OpenRouter, on a temporary base): answered in 4.5 seconds for $0.004, after one keyword search of its own.

**Not built yet:** the rewrite of selected paragraphs (step 4); the header's count, cost and breakdown, and clearing the conversation (5); search by meaning (6); the note for Iso (7); the run on the information theory base (8).

**Known gaps in what is built:**

- Editing Iso's text is a plain box of Markdown, not the live preview.
- Iso's conversation is this note's earlier requests in this session, not yet the whole session across notes.
- Nothing limits how much is sent: a very long note is sent whole. This is part of step 5.
- While Iso's reply is arriving its Markdown is drawn as it stands, so an unfinished `**` shows for a moment.

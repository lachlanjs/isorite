# New ideas for isorite

Written 2026-11-09 for the owner. These are ideas not already in `docs/ideas.md` (the VS Code and Obsidian extensions, the merge view, journals that follow a move) or in `ISORITE_DOC.md`'s own list (seeds, the timeline and session tour, study mode, lenses, the TUI). Where an idea touches something planned, it says what is different.

The thesis used as the test: isorite is "an agentic harness for understanding", the point being that the human's understanding must keep pace with what an agent does to the base. So an idea scores well when it measures, protects or builds the person's understanding, and badly when it only stores or retrieves more. What isorite has that comparable tools lack, and what most ideas below lean on: the per-note journal of changes (who, what was asked, when), the Atlas (a stable, spatial map), pointers (notes, folders, files and lines), an agent attached over MCP and ACP whose reads are visible, and a study record.

Effort: S is days, M is a milestone, L is several. Risk is the chance it is built and not wanted, or that it fights a decision.

Inspiration is noted where it is real. I searched the web for Matuschak's mnemonic medium and Orbit (prompts embedded in prose and reviewed later), and for Heptabase, Tana, Readwise, Reflect and NotebookLM; the searches returned mostly comparison pages, so the comparable-tool claims below are from general knowledge of those products and should be checked before anyone quotes them.

## Top 7, with reasons

1. **Comprehension debt ledger (1.1).** It turns the journal into the number the thesis is about: how much of what the agent changed has the person looked at. Nothing else in the field can compute it, and it makes the Atlas lens "Health" real.
2. **Predict before the agent answers (1.3).** A cheap, tiny interaction that attacks the poker-machine problem named in the doc, and it produces data for the study record.
3. **Prompts inside prose (2.1).** Matuschak's mnemonic medium, but in the person's own notes, written by the agent from a note and kept as plain Markdown. It joins the Atlas to the study record without a separate study base.
4. **Agent's diff reading order (1.2).** Review exists as a plan; this is the missing half, ordering a session's changes so they are learnable (prerequisites first), using the Atlas's own order.
5. **Teach-back gate for big agent changes (1.4).** Asks the person to say the change back before it is kept; ties the keep action to understanding, the one place a harness can enforce the thesis.
6. **Claims with confidence and sources (3.1).** The agent marks what it asserts as read, inferred or guessed, and the Atlas shows where the base rests on guesses. Fits "understanding" as knowing how much to trust.
7. **Note blame (4.2).** Per-sentence authorship from the journal, as a gutter. Cheap, because the data exists; it answers "which of this did I write and which did I only approve".

## 1. Understanding, measured and protected

### 1.1 Comprehension debt ledger

- **Pitch:** a running count, per note, folder and session, of agent-made change the person has not yet read, with a "pay down" queue.
- **Why it fits:** the thesis names the failure (speed outrunning understanding) but nothing measures it. A change is "seen" when the note was opened with that change in view for a real dwell, or the person edited near it.
- **Shape:** a derived value from the journal plus open events; shown as a notch or a quiet number on Atlas blocks, and a list of the worst-debted folders. Never a streak or a score to chase.
- **Effort:** M. **Risk:** low to medium. The risk is the measure being gamed or nagging; keep it unobtrusive and off by default.

### 1.2 Agent diff reading order

- **Pitch:** after an agent session, order its changes so a person can learn them: prerequisites first, using `requires` links, with the smallest closed set of notes to read to understand the rest.
- **Why it fits:** the session tour shows changes in time order; understanding wants dependency order, and only a layered Atlas knows it.
- **Effort:** S to M. **Risk:** low. It reuses the layout's layer order.

### 1.3 Predict before the agent answers

- **Pitch:** before an agent answer is shown, a one-line optional box: "what do you expect it says?" Afterwards the two sit side by side and the gap is recorded.
- **Why it fits:** prediction is a well-supported learning method (the generation and pretesting effects), and it breaks the "one more prompt" slot-machine loop with a small act of thought. It feeds the study record with real data about what the person does and does not know.
- **Effort:** S. **Risk:** medium; friction. Make it a setting and skippable in one key.

### 1.4 Teach-back gate

- **Pitch:** for a change above a size, keeping it asks for a two-sentence explanation, which the agent marks against the diff; a poor one shows what was missed and lets the person keep anyway.
- **Why it fits:** this is the Feynman technique placed at the exact point where understanding is otherwise skipped, the keep button. "Explain it back" already exists as an exercise kind; this applies it to real work.
- **Effort:** M. **Risk:** medium to high; it must never block. Always overridable, and the override is recorded, not shamed.

### 1.5 Confusion marks

- **Pitch:** select text in a note and press one key to say "I don't follow this". Marks collect on the Atlas as a notch, and the agent can be asked to rewrite or to lay a path of prerequisites to it.
- **Why it fits:** the signal that matters most for understanding (where the reader got lost) is thrown away by every notes app. A questions-and-problems feature exists; this is the lighter gesture below a question, with no wording needed.
- **Effort:** S. **Risk:** low.

### 1.6 Stale understanding

- **Pitch:** when a note a person understood changes underneath them (by an agent, a teammate or a git merge), mark the notes that depend on it as "built on something that changed", and say what changed in a line.
- **Why it fits:** `ISORITE_DOC.md` has a notch for "changed since you understood it" but it is tied to study mode; this brings the same propagation to project mode using the link graph and the journal, so a change travels to its dependents.
- **Effort:** M. **Risk:** low.

## 2. Study without a separate study base

### 2.1 Prompts inside prose (mnemonic medium in your own notes)

- **Pitch:** a note can carry small recall prompts as a plain Markdown construct (a question and an answer in a block), which the agent proposes from the note and the person keeps; they are due on a schedule and reviewed from the note, the Atlas or a daily queue.
- **Why it fits:** Matuschak and Nielsen's point is that prompts belong in the text, so that reading and remembering are one activity, and prompts written by the reader beat generic ones. isorite has the notes, the agent that drafts prompts, and the journal that notices when the text changed and the prompt is stale.
- **Shape:** keep the format readable as Markdown without isorite (an agent or Obsidian sees ordinary blockquotes). Review state lives in `.isorite/`, not in the note.
- **Effort:** M to L. **Risk:** medium; the decisions file moved study into notes already, so check it against that, and the format must be settled early.

### 2.2 Interleaved sessions from the Atlas

- **Pitch:** a study session that picks prompts from a chosen region of the Atlas and interleaves neighbouring notes, rather than a flat deck.
- **Why it fits:** interleaving and spacing are among the best-supported techniques in the learning literature, and the Atlas gives a real notion of "neighbouring concept" that a deck lacks.
- **Effort:** M. **Risk:** low once 2.1 exists.

### 2.3 Desirable difficulty dial for the agent

- **Pitch:** a setting that changes how the agent answers: full answer, hint only, a leading question, or "show me the note to read". The setting is per question, from a key.
- **Why it fits:** a tutor withholds. The agent here is also a work tool, so the dial lets one agent be both, and the choice is the person's, in line with "what Iso may change is decided before Iso answers".
- **Effort:** S. **Risk:** low.

### 2.4 Worked examples that fade

- **Pitch:** for a procedure note, the agent generates a sequence of the same problem with more steps removed each time (the completion-problem effect).
- **Effort:** S to M, as exercises. **Risk:** low.

### 2.5 The reading you did not do

- **Pitch:** for a source the base cites (a web link or paper), keep a short log of whether the person actually read it, and the agent's summary is shown only when the person asks, with a note saying it is a summary.
- **Why it fits:** a base full of cited sources nobody opened is a base of borrowed claims. This keeps provenance honest. Inspired by what Readwise does for highlights, but inverted: it tracks what was not read.
- **Effort:** M. **Risk:** medium; web access and privacy.

## 3. Trust and provenance of what the agent writes

### 3.1 Claims with confidence and sources

- **Pitch:** the agent's writes carry a per-claim tag: read in a note, found on the web with a URL, inferred, or guessed. The Atlas lens "Grounding" shows the notes that rest on guesses.
- **Why it fits:** NotebookLM's strength is source-grounded answers; isorite already checks quotations against notes. Extending the same check to every claim in a write is the same machinery, applied before keeping.
- **Effort:** M. **Risk:** medium; models mislabel themselves, so the check is mechanical wherever it can be (quote found or not), and the rest is stated as the agent's own claim.

### 3.2 Contradiction watch

- **Pitch:** when a note is kept, the agent (cheaply, on a small model) looks for notes elsewhere in the base that say something incompatible, and raises a problem (the `!` kind) linking both.
- **Why it fits:** a graph of notes accumulates conflicts silently; understanding a base means knowing where it disagrees with itself. Questions and problems already exist, so the surface is built.
- **Effort:** M. **Risk:** medium; false positives. Limit to semantic neighbours and rate-limit.

### 3.3 Where the base is thin

- **Pitch:** a lens that finds notes referred to by many but never explained (many inbound links, few words, no examples), and notes that rest on one source.
- **Effort:** S. **Risk:** low. A pure query over the graph, no model.

### 3.4 Decision records from the journal

- **Pitch:** when a note changes direction (a claim reversed, a requires link removed), the agent offers a short "what we thought, what changed, why" entry attached to the journal, built from the asked-for text.
- **Why it fits:** the journal knows what was asked; most projects lose the why. This is the feature that makes the history useful in a year.
- **Effort:** M. **Risk:** low.

## 4. History as a first-class view

### 4.1 Time-travel on the Atlas

- **Pitch:** a scrubber that redraws the whole Atlas as it stood on a date, or at a session boundary, and plays the growth of the base as an animation.
- **Why it fits:** the layout is deterministic and stable, so past maps are reconstructable from journals; no other map tool can show how understanding of a field grew. Also a good demo and a good tool for "what did I miss while away".
- **Effort:** M to L (layout from past state, performance). **Risk:** medium.

### 4.2 Note blame

- **Pitch:** a gutter in the editor that shows, per paragraph or sentence, who last wrote it (you, which agent, which session) and the request that produced it, as git blame does for code.
- **Effort:** S to M, since the journal holds diffs. **Risk:** low. It makes "iso's words stay marked as its own" permanent, not only until kept.

### 4.3 Weekly letter to yourself

- **Pitch:** a generated page (an artifact) at the end of a week: what the base learned, what is stale, what was asked and not resolved, three questions to think about. It is a note in the base, so it is itself kept and linked.
- **Why it fits:** a reflection practice in the product's own idiom; a cheap model over journal entries. Reflect and similar tools resurface notes; this resurfaces change and the unanswered.
- **Effort:** S. **Risk:** low.

## 5. The Atlas and pointers, used harder

### 5.1 Reading routes

- **Pitch:** select a note and ask for a route: the Atlas draws and numbers a path through prerequisites to it, and exports it as a single linear document, a generated "course" for one target, that the person can read top to bottom or give to someone else.
- **Why it fits:** the doc has study paths but as numbering on the map; the linear export is the missing form, and it is the way a team brings a newcomer up to speed, which is project mode's biggest education use.
- **Effort:** M. **Risk:** low.

### 5.2 Pointer inbox from code

- **Pitch:** a CLI command `isorite point src/file.ts:10-40` (and a git hook or editor command) that drops a pointer into an inbox on the Atlas, so a developer in a terminal can say "this is what I am confused about" without opening the app.
- **Why it fits:** pointers already carry files and lines; this adds the cheap entry from where developers actually are, independent of the VS Code extension in `ideas.md`.
- **Effort:** S. **Risk:** low.

### 5.3 Code drift watch

- **Pitch:** a note linking to code lines is flagged when those lines change in git (the code link's content hash changed), and the agent can propose the update to the note.
- **Why it fits:** project notes about code rot first at the code links; isorite is the one tool whose notes point at lines and whose agent is attached. This is the difference between a wiki and a harness.
- **Effort:** M. **Risk:** medium; line pointers drift under edits, so anchor with a content snippet as well as line numbers.

### 5.4 Spatial arrangement the person owns

- **Pitch:** an optional per-folder "canvas" where the person places notes by hand (as Heptabase whiteboards do) alongside the deterministic Atlas, stored as a plain file of positions.
- **Why it fits:** a counterpoint to the Atlas's rule that layout is not authored: sometimes the person's own arrangement is the understanding. Kept clearly apart, so the Atlas stays the same-base-same-map promise.
- **Effort:** L. **Risk:** high; it competes with the Atlas's identity. Listed for completeness, not recommended soon.

## 6. The agent as a visible collaborator

### 6.1 Agent trace replay as a note

- **Pitch:** a finished session is savable as a replayable trace (what it read, in what order, what it wrote) attached to the note it produced, so "how did it get that" is answerable later, and as a teaching artifact for how to ask.
- **Why it fits:** the Atlas already draws the path live; keeping it makes provenance of agent work durable. The doc says a question can be replayed without calling the model.
- **Effort:** M. **Risk:** low.

### 6.2 Agent memory you can read and veto

- **Pitch:** agents (Claude Code's memory, Cursor rules, the project instructions file) keep their own notes about a project. Show them in the base as a read-only folder, diffed over time, with a one-key "that is wrong, remove it".
- **Why it fits:** hidden agent memory is the opposite of understanding. Where `isorite doctor` already writes an agents file, isorite is the natural place to audit it. Compare Cursor and Claude Code memory, which are editable files and nobody reads them.
- **Effort:** S to M. **Risk:** low to medium.

### 6.3 Questions the agent should ask you

- **Pitch:** the agent, after a session, proposes the three questions a reviewer would ask about its work ("why a map, not a set?"), as `?` notes, to answer or dismiss.
- **Why it fits:** questions already become notes at once, so the mechanism exists; this aims it at the person's understanding of the agent's work and not only at the agent's own gaps.
- **Effort:** S. **Risk:** low.

### 6.4 Cheap-model janitor

- **Pitch:** scheduled, cost-capped maintenance by a small model: broken links, near-duplicate notes, orphaned notes, titles that no longer match content. It proposes, never writes; proposals arrive as one reviewable batch.
- **Effort:** M. **Risk:** low if it only proposes. Cost shown, by the doc's own rule.

## 7. Sharing

### 7.1 Publish a route as a reader-only site

- **Pitch:** export a folder or a reading route as a static site with the Atlas and the guide's reader (the guide build already does this for isorite's own guide), under the base's own style.
- **Why it fits:** `build:guide` already exists; turning it into `isorite publish <folder>` makes any base a shareable learning artifact, and the reader's progress stays in their browser.
- **Effort:** M. **Risk:** low.

### 7.2 Review by a person, not only an agent

- **Pitch:** a teammate can mark a note "checked by me" with a hash of the text; it lapses when the text changes. The Atlas shows human-checked against agent-written.
- **Why it fits:** the doc's Health lens speaks of "checked by a person"; this defines how, with the journal and git for a team.
- **Effort:** S to M. **Risk:** low.

## What I would not do

- Gamification beyond the study record (points, leaderboards). The doc's case against engagement mechanics argues against it, and 1.1 must stay quiet for the same reason.
- A general plugin system now. The product has no users yet to need one; MCP already is the extension point for agents.
- Voice or audio summaries in the NotebookLM style. It fits listening, not the structured reading the Atlas is for.

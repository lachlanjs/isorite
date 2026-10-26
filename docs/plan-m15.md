# Milestone 15: Iso's context, and what Iso is told

Written 2026-10-26, for approval. Branch `m15-context`, from `main` at `e989a07` (0.3.1).

Two items from the list of directions, done together as agreed, because each needs the other:
- **Context management:** what Iso is sent, seen and chosen part by part.
- **System prompts:** what Iso is told about isorite, about keeping a knowledge base, and about learning.

A prompt that explains isorite and good practice needs room in the context. The context controls decide what that
room holds.

Lachlan's notes from work come into it:
- It isn't clear which notes are in Iso's context. The Atlas's context switch took over the click; that was fixed
  in M14.
- The notes aren't detailed in the context list in Iso's pane.
- That list has unneeded text, and its layout could be better.

The direction from 2026-10-13 holds too: the person decides what Iso sees, and the automatic budgets are a
stopgap.

**Revised 2026-10-26 after Q64–Q69** (answers in §5), drawing on Drew Breunig's "The State of Context Engineering"
(2026-10-24). Three of its points shape this plan:
- **Decide in code what can be decided in code**, and leave to the model only what needs judgement. Here, what is
  sent and when parts age off are code. Compaction is the model's.
- **Of its six tactics, isorite already has some.** Tool loadout is the modes' tools. Augmentation is looking
  things up. It needs the rest:
  - **offloading:** the base is the store, and a note left out is a pointer, read again when needed;
  - **pruning:** age-off;
  - **summarisation:** compaction.
- **Context inertia and distraction grow with length.** The post cites repeated actions beyond about 100k tokens,
  and its author resets at 200k. Resetting while keeping what was made is the fix (Memento, "Scaling discovery
  requires forgetting"). In isorite, what was made is in the notes already.

## 1. What is wrong today

Found by reading the code at `e989a07`.

**What Iso is sent.**
- What Iso reads during a turn doesn't stay with the conversation. A turn is sent the instructions, the earlier
  turns' words, what you gave, and your message (`turnMessages()`, `engine/src/turn.ts`). The notes Iso read with
  `read_note` are gone by the next turn. So it reads them again, spending a round and the tokens. And you can't
  see what it's working from: the Atlas numbers only the last turn's reads.
- **The automatic budgets are still there** (`engine/src/iso.ts`):
  - `conversation()` keeps the last three turns whole within 6,000 tokens, shortens older ones, and drops what
    doesn't fit.
  - `windowed()` cuts any given note over 12,000 tokens to the lines around its start.

  Only the model is told, in a bracket. You see neither.
- Sizes are estimated at four characters a token. Lachlan saw 725 shown against 1,128 counted on a note heavy with
  maths. The provider's own count (`prompt_tokens`) comes back after every call and is not used.

**The Context view** (Iso's pane, the ≡ in its header):
- It lists parts by kind: instructions, earlier turns, "what you gave", your message. Earlier turns can be
  switched off. Given notes are listed apart from that, under "what you gave", and notes Iso read aren't listed at
  all.
- Text that explains controls: "Nothing yet. Hold a note on the Atlas, or drag it here…", "how able a model",
  "all that is sent".
- The tier (low, mid, max) is chosen here, though it isn't part of the context.
- Its layout is not the board's. The **Header-Context** board shows one row per part: its name, a faint detail,
  its size on the right, and a thin bar of its share of the limit under each.

**What Iso is told.** The system prompt is put together from WHO, the mode's rules, ASKING, CHECKING (with a
problem), UNDERSTANDING (with an Understanding note), FORMAT_RULES and LOOKING (`turn.ts`). The prompts for
writing in place, in the Note pane, are in `iso.ts`. What they say is accurate, but there is little of it:
- **Of isorite itself:**
  - nothing on the link kinds (`requires`, `uses`, `see also`) and how they're written;
  - nothing on the kinds of note (question, problem) or their frontmatter (`about`, `uses`, `done`);
  - nothing on embeds (`[[!name]]`), what the Atlas shows, or that every change is marked and can be undone.

  Iso learns these from the notes, if it reads the right ones.
- **Of keeping a knowledge base:** one line in Write mode on frontmatter, notation and links. Nothing on:
  - one idea a note, and a title that names it;
  - a description line;
  - where a note belongs;
  - extending a note rather than writing a second one;
  - linking what it rests on with `requires`;
  - when to suggest splitting or merging.
- **Of learning:** the UNDERSTANDING section, sent only when an Understanding note is given (ask before
  explaining, start from where they are). Otherwise nothing, for example:
  - their own words first;
  - recalling before rereading;
  - a problem before the explanation;
  - explaining in their notation and at their level.
- **Of the person's own conventions** (their notation, level, language, how they name notes): nowhere to put
  them, except saying them again in each conversation.
- **The terminal's agent** is told only what `brief_base` returns and the tools' descriptions. Nothing of how the
  base is kept, so its notes don't match the base's ways.
- **No way to check a change to a prompt** other than trying it by hand.

## 2. What to build

### A. The conversation's working set

1. **What a conversation holds**, kept in its file in `.isorite/conversations/` as lines added and taken out:
   - the notes in hand, each whole or by sections;
   - folders;
   - passages;
   - Understanding notes;
   - its earlier turns.

   Each part says who brought it: you (given, as now) or Iso (read with `read_note`). Each is on or off for the
   next turn. Every turn is sent what is on, and nothing else is added or cut.
2. **What Iso reads joins it** (Q64). A note it reads is in hand from then on, at the sections it read, or whole if
   it read the whole note. Reading more of it adds sections. Iso is told what it has in hand, so it doesn't read a
   note again. The switch is per note, not per section (Q68).
3. **Age-off, by a rule in code**, for what can be had again.
   - **The principle.** The base is where context is offloaded to. A note Iso read is in the base, so leaving it
     out loses nothing: it becomes a pointer, read again if needed.
   - **What never ages off:** what you gave, your passages, Understanding notes given, the base's instructions,
     and the turns. These can't be had again by reading.
   - **The rule.** A note Iso read is used in a turn when Iso reads it again, links to it in what it writes, or
     changes it. When it hasn't been used for 3 turns, it is switched off. Its row stays, dimmed and marked as
     aged off, and one click puts it back.
   - **What Iso is told.** While a note is off, Iso is sent one line for it: "Read earlier, set aside: <title>
     (/id.md)".
   - **The provider's cache.** Age-off is applied only when a turn starts, all at once. The parts in hand keep the
     order they came in, so the provider's prompt cache holds up to the first change.
   - **Letting Iso choose for itself** (a tool to set a note aside, or keep it) is left out (§4). The rule is
     there to see, and the same each time.
4. **Compaction** (Q65): earlier turns summed up into a briefing that stands for them.
   - **A turn to Iso of its own, on the low tier**, with typed output (a JSON schema: `settled`, `open`,
     `preferences`, `notes`), in the post's two steps:
     1. From the turns to be summed up, it picks what still matters: what was asked and settled, the threads still
        open, preferences said along the way, and the notes the talk turned on.
     2. It writes that as a briefing. The notes appear as links, which are pointers into the base.

     Its cost is shown, as any turn's is.
   - **In the Context view**, the briefing is a row under "conversation" that stands where the turns were. The
     turns it replaces stay in the file and in the conversation, switched off and grouped under it. Switching the
     briefing off and the turns back on undoes it.
   - **Preferences said in the conversation** that sound like the base's ways ("always use ∂ for the boundary")
     are offered for `AGENTS.md` with `offer_text`. The person inserts them, or not.
   - **When it happens:**
     - **By hand:** the Context view's compact icon, at any point. All turns but the last are summed up.
     - **On its own, at the limit.** When a turn would pass the model's limit, the earliest turns are compacted
       before it is sent. If what is left is still over, the turn isn't sent, and the Context view says what is
       too large: a note, or the message.
   - **The warning.** At 100k tokens, or half the limit if less (the post's point where repetition begins), the
     gauge takes the warning colour and its tooltip suggests compacting. It's a warning only: nothing is done.
   - **A new conversation from here** (the "Memento" reset): a fresh conversation that starts with the briefing
     and the notes you gave. It's a second choice under the pane's + icon. It suits a long conversation that has
     stuck to one track.
   - **No other trimming.** `conversation()`'s shortening and dropping, and `windowed()`'s cut of given notes, go.
     Drafts in the Note pane (insert and rewrite) keep their budgets for now (§4).
4. **Sizes as counted.**
   - After each call, the provider's `prompt_tokens` against the estimate gives a ratio for the conversation.
     Every size shown is estimate × ratio, marked "counted" once there is one.
   - The limit is the model's `context_length` from the provider's `/models` (OpenRouter gives it), or
     `[provider] context`, else 200,000 as now.
5. **The engine's API.**
   - `turnContext()` returns the working set part by part, with a size, a share and who brought each part.
   - New: `setContext(conversation, part, on)` and `dropContext(conversation, part)`.
   - The app's `tray` stays as the parts given before a conversation's first turn, and then becomes its working
     set.

### B. Seeing and choosing it

6. **The Context view**, after the Header-Context board:
   - A row per part, grouped under three faint labels:
     - **notes**: the notes, folders, passages and Understanding notes;
     - **conversation**: the earlier turns, each by its first words;
     - **fixed**: the instructions, the base's instructions (C below), and your message.
   - Each row has its name, its detail (sections, "read by Iso" as a ◇ or "given" as a ◆), its size on the right,
     and a bar of its share of the limit.
   - A click switches a row on or off. ✕ takes it out of the conversation. A note's detail names the sections it
     holds.
   - Aged-off rows are dimmed, with a tooltip saying why ("not used for 3 turns").
   - The briefing row has the turns it stands for folded under it.
   - A compact icon is at the head of "conversation".
   - The totals stand at the top: "18.4k of 200k".
   - No sentences: what a control does goes in its tooltip.
   - Empty, the view shows only the fixed rows.
7. **The tier** leaves the Context view for a small low · mid · max switch in Iso's header, beside the gauges
   (Q66). If the header is too narrow (a phone, or a narrow pane), the tier is the one letter of the tier chosen,
   which cycles through them; its tooltip names the model.
8. **The Atlas's context switch** shows the working set:
   - ◆ given and ◇ read by Iso, held or switched off (dimmed);
   - changed by Iso and pointed to, as now;
   - and, for the last turn, the order it read in.

   Shift+click (M14) gives a note or takes it back, read ones included.
9. **The gauge** in Iso's header is the working set's total against the limit, the same figure as the Context
   view. Over the limit it turns the warning colour, and a click on it opens the Context view.

### C. What Iso is told

10. **The base's own instructions:** `AGENTS.md` at the top of the notes folder (Q67), the file other agents
    look for.
    - It's written by the person: their notation, level, language, what they're working towards, how they name
      notes.
    - It's sent with every turn as a fixed row of the Context view, switchable like any part.
    - It isn't a note: the base's loader leaves it out, so it's not on the Atlas, and `isorite check` doesn't lint
      it. Opening it means editing it, in Iso's settings (the icon at the right of its header), in the editor the
      notes use.
    - Iso may suggest a line for it with `offer_text`, which the person inserts or not, as now.
    - The terminal's agent is given the same file: the plugin names it in OpenCode's `instructions`. Any other
      agent run in the notes folder, such as Claude Code, finds it there by itself.
11. **The system prompt, rewritten in layers.** Each layer is short and plain, and in its own constant, so a mode
    takes the ones it needs:
    1. **isorite**:
       - a note's file (frontmatter `type`, `title`, `description`);
       - the link kinds, as written (`[entropy](/basics/entropy.md "requires")`);
       - questions and problems (`about`, `uses`, `done`), and embeds;
       - Understanding notes;
       - that every change is marked as Iso's, and can be undone;
       - what the Atlas shows them.

       Its facts come from `docs/format.md`. A test checks that each kind and field named is one `core` knows.
    2. **Keeping a knowledge base:**
       - one idea a note, with a title that names it and a description line;
       - link what it rests on with `requires`, and what it merely uses with `uses`;
       - extend a note rather than make a second;
       - put a new note beside its neighbours;
       - suggest a split or a merge, and don't do it unasked;
       - an open question marks where the base ends.
    3. **Learning:**
       - their words are theirs: don't put words in their notes they haven't asked for;
       - explain in their notation, at the level of their notes;
       - where understanding is in play, ask before explaining, one question at a time;
       - prefer a problem, or a question back, to a summary;
       - check a solution, never solve it for them.

       It goes in every mode, not only with an Understanding note given. The UNDERSTANDING section keeps only
       what is about the reading itself.
    4. The mode's rules, asking back, checking, looking things up and the format, much as now. LOOKING now says
       what is in hand, so Iso doesn't read it again.
12. **The terminal's agent.**
    - `brief_base` returns the second layer (keeping a base) with the base's folders.
    - The plugin gives OpenCode the base's instructions (item 10).
    - OpenCode's own system prompt is left alone.
13. **Checking a prompt: `npm run eval:iso`.**
    - About a dozen situations on the example base. Each is a conversation that ends with one turn to judge:
      - asked about a note it has, and one it hasn't;
      - asked to write a new note, which must have frontmatter, be linked, sit in the right folder, and not
        duplicate one;
      - asked to edit a passage minimally;
      - given a problem with a wrong step;
      - given an Understanding note;
      - a request against the base's instructions (another notation);
      - a long conversation with notes already in hand, which mustn't be read again;
      - a long conversation compacted: the briefing must name the open thread and the notes it turned on, and the
        next turn must carry on from it.
    - Each has checks that need no judge: which tools it called, links that resolve, frontmatter that parses,
      the notes it didn't touch, no note read twice. It also keeps the transcript, to read.
    - Run on a real model, on a copy of the example base, before the rewrite and after it.
    - It writes a table of checks passed and the cost to `.eval/` (ignored by git).

## 3. Order of work

1. **The working set in the engine** (items 1–5):
   - lines in the conversation's file;
   - reads joining it;
   - age-off and its pointers;
   - the turn built from it;
   - trimming removed;
   - the limit, and sizes as counted.
2. **Compaction in the engine**:
   - its turn on the low tier;
   - the briefing as a part;
   - compaction on its own at the limit;
   - a new conversation from here.

   Tests with the scripted provider.

   Unit tests, including a conversation file from M12 read as before (its turns in hand, no reads).
3. **The Context view, the tier switch, the Atlas and the gauge** (items 6–9).
   - Browser tests.
   - The autofixer on each component.
   - Screenshots compared with the Header-Context board's sizes and rows.
4. **`npm run eval:iso`** (item 13), and a first run with today's prompt, as the baseline.
5. **The base's instructions** (item 10), the prompt's layers (item 11) and the terminal (item 12). Then a second
   run of the eval, against the baseline.
6. **The guides**, and the tutorial's L2 step on what is sent, whose text names the Context view.
   - The tutorial walk tests (`npm run test:tutorial`) are retired here, and not run. They are costly, and M16
     replaces the tutorial they test.
   - The coach stays in the app until then. Its steps are checked by hand against this milestone's Iso pane.
7. A real check in the browser on a copy of the example base: three turns, one of them over a note Iso read in
   the first, which it mustn't read again. Costs reported. Then the write-up in §6 and version 0.4.0.

No new npm packages are needed.

## 4. What is not in it

- **Iso choosing its own context**: a tool to set a note aside or keep it, or the context as a note-graph Iso
  edits (the "Context Language Models" idea of 2026-10-13). The post's advice is to keep in code what code can
  decide, so age-off comes first. Once it has been used, the eval can compare the rule with Iso's own choices.
- **Subagents** (the post's quarantine): Iso sending a look-up off with a fresh context and taking back only what
  it found. It may suit long research turns later.
- **The terminal's own context.** OpenCode keeps and compacts its own. Iso's pane goes on showing its tokens.
- **The budgets of drafts written in place** in the Note pane.
- **The tutorial's redesign** is M16, straight after (agreed 2026-10-26). The tutorial becomes a knowledge base
  about isorite that you explore, with problem notes as the things to do. Its walk tests go in this milestone.
- **Setting a gateway up in the browser**, and **Pele with code highlighting**, which come next as agreed.

## 5. Questions

Answered 2026-10-26:
- **Q64.** What Iso reads stays in hand. Lachlan asked whether Iso should manage its own context, or have some
  age-off, if there's a principled way. The rule in item 3 is that way: only what can be read again from the base
  ages off, and it leaves a pointer. Iso managing its own context is left for later (§4).
- **Q65.** Compaction is essential: item 4.
- **Q66.** The tier goes in the header, if there's room. Where there isn't, it narrows to the one letter of the
  tier chosen (item 7).
- **Q67.** The base's instructions, in keeping with the tradition: **`AGENTS.md`** at the top of the notes folder
  (item 10).
- **Q68.** A switch for each section is too granular: whole notes only.
- **Q69.** Yes: the eval on the mid tier, twice, about $0.60 a run.

- **Q70.** The age-off rule as recommended: 3 turns unused, a pointer line left.
- **Q71.** `AGENTS.md`.

Asked alongside: whether DSPy has a bearing. Not as a dependency: it is Python, and Iso's turn is open-ended. But
two things are done here so that a later experiment could use it:
- The eval's cases and checks are kept as plain JSON (`eval/iso/*.json`), so DSPy's optimizers (GEPA) could tune a
  prompt against them offline, unchanged.
- Compaction is a call with typed output: a JSON schema of `settled`, `open`, `preferences` and `notes`, from
  which the briefing is put together. This is DSPy's signature idea, in TypeScript.

## 6. What was built

To be written.

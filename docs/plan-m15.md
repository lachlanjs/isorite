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
   note again.
3. **No automatic trimming.** `conversation()`'s shortening and dropping, and `windowed()`'s cut of given notes,
   go.
   - If what is on would pass the model's limit, the turn isn't sent (Q65). The gauge in Iso's header shows it
     over, the message says by how much, and the Context view opens.
   - Making room is yours: switch parts off.
   - Drafts in the Note pane (insert and rewrite) keep their budgets for now. They are short and one-off, and
     §4 leaves them out.
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
   - A click switches a row on or off. ✕ takes it out of the conversation.
   - A note's row opens to its sections, each switchable (Q68).
   - The totals stand at the top: "18.4k of 200k".
   - No sentences: what a control does goes in its tooltip.
   - Empty, the view shows only the fixed rows.
7. **The tier** leaves the Context view for a small low · mid · max switch in Iso's header, beside the gauges
   (Q66).
8. **The Atlas's context switch** shows the working set:
   - ◆ given and ◇ read by Iso, held or switched off (dimmed);
   - changed by Iso and pointed to, as now;
   - and, for the last turn, the order it read in.

   Shift+click (M14) gives a note or takes it back, read ones included.
9. **The gauge** in Iso's header is the working set's total against the limit, the same figure as the Context
   view. Over the limit it turns the warning colour, and a click on it opens the Context view.

### C. What Iso is told

10. **The base's own instructions:** `.isorite/instructions.md` (Q67).
    - It's written by the person: their notation, level, language, what they're working towards, how they name
      notes.
    - It's sent with every turn as a fixed row of the Context view, switchable like any part.
    - It's edited in Iso's settings (the icon at the right of its header), in the editor the notes use.
    - Iso may suggest a line for it with `offer_text`, which the person inserts or not, as now.
    - The terminal's agent is given the same file: the plugin names it in OpenCode's `instructions`.
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
      - a long conversation with notes already in hand, which mustn't be read again.
    - Each has checks that need no judge: which tools it called, links that resolve, frontmatter that parses,
      the notes it didn't touch, no note read twice. It also keeps the transcript, to read.
    - Run on a real model, on a copy of the example base, before the rewrite and after it.
    - It writes a table of checks passed and the cost to `.eval/` (ignored by git).

## 3. Order of work

1. **The working set in the engine** (items 1–5):
   - lines in the conversation's file;
   - reads joining it;
   - the turn built from it;
   - trimming removed;
   - the limit, and sizes as counted.

   Unit tests, including a conversation file from M12 read as before (its turns in hand, no reads).
2. **The Context view, the tier switch, the Atlas and the gauge** (items 6–9).
   - Browser tests.
   - The autofixer on each component.
   - Screenshots compared with the Header-Context board's sizes and rows.
3. **`npm run eval:iso`** (item 13), and a first run with today's prompt, as the baseline.
4. **The base's instructions** (item 10), the prompt's layers (item 11) and the terminal (item 12). Then a second
   run of the eval, against the baseline.
5. The tutorial's L2 step on what is sent, which names the Context view, and the guides.
6. A real check in the browser on a copy of the example base: three turns, one of them over a note Iso read in
   the first, which it mustn't read again. Costs reported. Then the write-up in §6 and version 0.4.0.

No new npm packages are needed.

## 4. What is not in it

- **Iso choosing its own context**, editing or pruning it as a note-graph (the "Context Language Models" idea of
  2026-10-13). This milestone makes the working set explicit and kept, which that would build on.
- **Summing up earlier turns** to make room (Iso writes a summary that stands for them, visible and undoable).
  Q65 asks whether you want it.
- **The terminal's own context.** OpenCode keeps and compacts its own. Iso's pane goes on showing its tokens.
- **The budgets of drafts written in place** in the Note pane.
- **The tutorial's redesign**, which is in the chat.
- **Setting a gateway up in the browser**, and **Pele with code highlighting**, which come next as agreed.

## 5. Questions

- **Q64. What Iso reads stays in hand** until you take it out. *Recommended*: you see what it works from, and it
  doesn't read a note twice. The other way: reads last for the turn only, and you pin the ones to keep.
- **Q65. Over the limit, the turn isn't sent:** the gauge and the Context view show what to switch off.
  *Recommended*: nothing is cut that you didn't cut. Either way, should summing up earlier turns come in a later
  milestone?
- **Q66. The tier moves to Iso's header**, as low · mid · max beside the gauges. *Recommended.* The other way: it
  stays in the Context view.
- **Q67. The base's instructions in `.isorite/instructions.md`**, edited from Iso's settings and shared with the
  terminal. *Recommended*: it's the base's, not a note. The other way: a note in the base (say `iso.md`), on the
  Atlas and edited like any note.
- **Q68. A note's sections can be switched one by one.** *Recommended.* The other way: whole notes only, which is
  simpler.
- **Q69. The eval on the mid tier** (Sonnet 5.5 on OpenRouter): about a dozen turns of some 15k tokens in, so about $0.60 a run, twice. *Recommended.* The other
  way: the low tier, for a few cents, which shows less of what the prompt changes.

## 6. What was built

To be written.

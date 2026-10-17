# Milestone 4: one exercise, the record, the squares

Approved by Lachlan on 2026-10-15, with the answers in section 4. Branch: `m4-study`.

**Done when:** on a temporary copy of information theory, an exercise can be made by Iso and kept, attempted, marked by Iso, and reattempted; each marking is an event in the study record carrying Iso's judgement of how the attempt moves each note it tests; and the header's squares and the Atlas block's edge follow that judgement.

The boards followed:

| Board | What it settles |
|---|---|
| `Study-Written` | The exercise screen: the kind and "Iso's read of you" with six squares and `[ wind back ]` in the header; "written response · tests" and links to the notes tested; the question in serif at 23 px; "your working" with "select a line to mark it as your answer"; the marked line in soft blue with "your answer" beside it; `send for marking` at the foot; the status line "write as much as you like · only the marked line is your answer".  The board says "line"; the answer is any selection (section 4, answer 7). |
| `Mobile-Study` | The working after marking: right lines underlined with a double malachite line; a wrong line underlined in rose with "× wrong" at its end; "2 right" and "× 1 wrong" as chips beside "your working"; the tier and cost; `mark it again`; "moves: …" naming the notes the attempt moves. |
| `Study-Fit` | Where study shows elsewhere: the study page's one list (kind, title, "tests …", the last result's square); a note's margin with its squares and "3 exercises". Not its squares on blocks (section 4, choice 4). |
| `Bases` | The key: a block's four edges, and an exercise's square as not tried, passed or last try wrong. |
| `Tour-5` | The same screen as `Study-Written`, with the older squares. |
| `Decisions-Design` | Iso speaks only when asked; the squares belong to a note, and an exercise that tests two shows the lower; one square per wind back, as an event. |

Not followed:
- The other five kinds' boards (`Study-Choice`, `-Answer`, `-Error`, `-Explain`, `-Open` and their phone versions): they come after the slice.
- The paragraph from Iso on `Mobile-Study` ("The impurity side gives …"). It is Iso speaking unasked, which `decisions.md` rules out. The board was missed when the choice boards were corrected.
- `Tour-5` and `Mobile-Study` draw the squares as passed, wrong and current. `Study-Written`'s six blue squares are the redrawn version, and are followed.

## 1. What you will be able to do

1. **Open the study page** from the header. It lists every exercise in the study base, as on `Study-Fit`'s "next for you": the kind, the title, "tests …", and a square for the last result. Below the list, each folder of the base has `[ + an exercise ]`.
2. **Ask Iso for an exercise.** `[ + an exercise ]` opens a page like a note for Iso. It shows the folder, the notes to test (chosen from that folder's notes, or picked on the Atlas as in milestone 3), and an optional line saying what you want. On `send`, Iso writes a question. You see it as a proposal and keep or discard it. Kept, it is `study/<folder>/<name>.md` in the study base. A note's margin also has `[ + an exercise ]`, with that note chosen.
3. **Attempt it.** The exercise opens in the same editor as any note: the tests above, the question, then "your working" (the file's `## Working` heading, drawn as the label). Write as much as you like.
4. **Mark your answer.** Select any part of the working, as you would to copy it, and press `[ mark as answer ]`, which appears beside the selection. The selection turns soft blue with "your answer" beside it. `send for marking` stays off until something is marked.
5. **Send it for marking.** Iso marks passages of the working right or wrong and gives the attempt a result: right, partly or wrong. It also judges, for each note the exercise tests, whether the attempt shows a change in your understanding of it, and how much. Nothing else is shown. The marks are laid over the working, with the two chips, and "moves:" names each note with its move. A right result flashes the squares once. The button becomes `mark it again`.
6. **See the squares move.** The header shows the lower reading of the notes the exercise tests, as six squares, with `[ wind back ]`. Clicking the squares shows, for each attempt, Iso's one-line reason for its move. The block of each tested note on the Atlas takes its new edge.
7. **Reattempt.** Edit the working. Lines you change lose their marks, and the rest keep theirs until you send again.
8. **Ask Iso in the exercise,** as in any note: a prompt, with Iso's reply as a proposal. This is the only way Iso says more than the marks.

## 2. What is built

### In the core

| Part | Does |
|---|---|
| `exercise(text)` | Reads an exercise: kind, tests, the question (the text before `## Working`) and the working's blocks (after it). A file without `## Working` has an empty working, which the first save adds. |
| `markingReply(text, working, tests)` | Reads Iso's reply to a marking: a result, passages of the working each quoted exactly and marked right or wrong, and for each note tested a move and a one-line reason. A reply that is not in that shape is an error, and nothing is recorded. A quoted passage not found in the working is dropped, and the count of dropped ones is kept with the marks. |
| `understanding()` changed | An attempt moves each note by the move Iso judged for it, not by a fixed step for its result. A move is −1, −½, 0, +½ or +1 squares (choice 4). An attempt without moves moves nothing. Wind back stays one square down. The rest of the rule (how long evidence holds, due, lapsed, the four steps) is unchanged. `format.md` and `decisions.md` are updated to say so. |
| `placeMarks(marks, working)` | Lays a marking over the working as it is now. Each mark, and the answer, is anchored to its exact text and which occurrence of it it is (`{text, nth}`), so a passage that changed loses its mark. |
| `studyList(exercises, record, now)` | The study page's order: due first, then never tried, then the fewest squares, then the oldest attempt. Worked out from the record. Iso does not order it. |
| the grown mark | Its depth comes from the exercises passed in the folder, as milestone 3's plan deferred. |

### The record and the journal

The `attempt` event's fields, which `format.md` left to this milestone:

```json
{"id":"…","at":"…","device":"91d4235f","event":"attempt","exercise":"Fundamentals/entropy-of-a-coin",
 "tests":["Fundamentals/entropy"],"result":"partly","by":"iso:openrouter/anthropic/claude-sonnet-5.5",
 "moves":{"Fundamentals/entropy":{"by":0.5,"why":"Right definition, but needed one hint to sum over both outcomes."}},
 "answer":{"text":"So H = 1 bit.","nth":0},"working":"…the working as it was…","marks":"01K7…"}
```

`marks` names an entry in the exercise's journal, of kind `marks`. It holds each marked passage, anchored to its text, plus the request's cost. The working is kept in the event as it was, as agreed in milestone 0. `wind-back` is unchanged: one event per note.

**How Iso judges a move.** Its instructions ask it to weigh three things, which you named:
- how accurate the attempt is, from its marks and the answer;
- how much guidance it needed. The engine sends the prompts you asked in this exercise since its last marking, and Iso's kept answers to them, so Iso can see the help given;
- how closely each tested note bears on the exercise. A note the exercise only touches moves less than the one it is about.

It is also told the note's current squares, so a right answer at a level already shown can hold. The result (right, partly, wrong) stays separate. It is the exercise's own square on the study list, and says nothing about understanding by itself.

### In the engine and the server

- Two new forms of request, beside `insert`, `rewrite` and `note`:
  - `mark` (an exercise and its answer's anchor);
  - `exercise` (a study folder, the notes to test, and what you asked).
- Both are **one round with no tools**. Iso is sent the exercise, or the request, and the notes it tests, and nothing else. What you choose is exactly what is sent, and the header's count and breakdown show it. No trimming is added: the notes tested are sent whole.
- `windBack(exercise)`: one `wind-back` event for each note the exercise tests (choice 2, still open).
- `study()`: the study page's list, with each exercise's last result and its squares.
- `map()` already reads understanding from the record. The `record` event, already in the stream, now makes the Atlas and the header read again.
- Routes for these over HTTP, typed as the rest are.

### In the app

- `ExercisePage`: `NotePage`'s editor and header, plus:
  - the tests row;
  - the working label;
  - the answer and the marks, as CodeMirror decorations over the text they cover, not text in the file;
  - `send for marking` or `mark it again` at the foot;
  - the flash;
  - the status line.
- The header's squares and `[ wind back ]` on an exercise. They are also in a note's margin, beside "N exercises", as on `Study-Fit`.
- The study page: the list and `[ + an exercise ]`.
- The exercise request page: `DraftPage`'s layout, with the notes to test in place of linked notes, and an optional "comes after" exercise (choice 5).
- `next` in the header on an exercise whose frontmatter names one (choice 5).
- The Atlas:
  - edges read again after a marking (blocks show the four tiers and nothing more);
  - the grown mark sized by passes.

## 3. Where rdstudio's code does not carry over as it is

rdstudio's tutor (`packages/cli/src/tutor.ts`) gave feedback, hints and discussion. It pinned its comments to the draft by quoting a few words after a `[red]` or `[green]` marker, and kept each draft as JSON in its teacher folder. Here the working is the note itself, and Iso only marks it. Its instructions are a starting point. Its pins become marks: Iso quotes a passage exactly and marks it right or wrong, with no comment. Hints and discussion become prompts you write in the exercise.

## 4. Choices

### Lachlan's answers (2026-10-15)

1. **The marked answer is held in the browser until you send.** Agreed. The mark lives in the page, and in local storage per exercise so a reload keeps it. It reaches disk only in the `attempt` event.
2. **Wind back** is your own correction beside the squares, for when Iso rates you too highly: one square down per press, as an event, for every note the exercise tests. Iso does not judge it. A failed attempt moves understanding only by Iso's judgement at marking.
3. **No marking it yourself in this milestone.** Agreed, as a later part. It is for working offline or without spending on the API. Without a key, `send for marking` says that one is needed.
4. **No squares on blocks.** A block shows the four tiers of understanding and nothing else. Understanding is not stepped up or down by a fixed amount for a pass or a fail. Iso judges, at each marking, whether the attempt is a real change in understanding of each tested note. It weighs how accurate the attempt is, how much guidance it needed, and how closely the note bears on the exercise (section 2, "How Iso judges a move"). This replaces the fixed steps in `understanding.ts` and `format.md`, and the "my call" row on squares on blocks in `decisions.md`.
5. **`next` is a link in the exercise's frontmatter** (`next: <exercise id>`), naming the exercise that follows it in teaching order. Many exercises will have none, and those show no `next`. It is set when you ask for an exercise ("comes after" on the request page adds `next` to that earlier exercise when you keep the new one), or by hand in the frontmatter. On a phone, moving to the next will be a swipe, built when phones are; the desktop `next` is built now. The flash on a right result is built; sound is not.
6. **Where you ask for an exercise.** Agreed: the study page offers `[ + an exercise ]` on every folder of the base, and so does a note's margin.
7. **The answer is any selection,** a general highlighted selection, not a line or a block. Iso's marks are passages it quotes, so they too cover as much or as little as it needs.

## 5. The base

`~/Repositories/information-theory` has one note, `Fundamentals/entropy.md`, and its study base has no exercises. That is enough for "done when": one exercise testing entropy, made, attempted twice, and marked twice. The browser tests use a scripted provider on a temporary base with several notes and exercises, so that the lower of two readings, Iso's moves and the list's order are checked too.

## 6. Order of work

1. Core:
   - `exercise`, `markingReply`, `placeMarks` and `studyList`, with tests;
   - `understanding()` moved by Iso's judged moves, with tests;
   - the `attempt` event's fields, the moves and the `marks` entry written into `format.md`; `decisions.md` updated.
2. Engine and server:
   - the `mark` and `exercise` forms, `windBack` and `study()`;
   - tests against a scripted provider: the record and journal lines written, and the knowledge base's files byte-identical.
3. The exercise page:
   - marking the answer, sending, the marks laid over the working, the header's squares, wind back.
   - **I would stop here and show you,** with a scripted marking, since it is the first new screen since the Atlas.
4. The study page, the exercise request page with "comes after", keeping an exercise, `[ + an exercise ]` in a note's margin, `next` and the flash.
5. The Atlas: edges after a marking, the grown mark.
6. A real model, compared with the boards at both widths on both grounds, and the write-up.

Each step ends with its tests passing and a commit.

## 7. How it is checked

- **Core:**
  - reading an exercise with and without `## Working`;
  - a marking reply that is well formed, one quoting a passage not in the working, one with a move for a note it does not test or outside −1 to +1, and one with text around it;
  - marks and the answer placed after the working was edited above, inside and below a marked passage, and where the passage occurs twice;
  - the list's order on a scripted record, with time passed for "due".
- **Engine and server:**
  - a scripted marking writes one `attempt` and one `marks` entry, and nothing in the knowledge base;
  - a reply that cannot be read records nothing but its cost (`iso-unused`, as now);
  - wind back writes one event per tested note;
  - a kept exercise is a plain OKF note in `study/<folder>/`;
  - understanding follows the judged moves, not the result: a right attempt Iso moves by 0 holds, and a wrong one it moves by −½ drops half;
  - the guidance sent with a marking is this exercise's prompts and kept answers since its last marking, and nothing else.
- **Browser,** against a scripted provider, at 1280 and 390 px on both grounds:
  - an exercise is asked for, kept, opened and attempted;
  - `send for marking` is off until something is marked;
  - a selection marked as the answer is what the request sends;
  - marks appear over the passages quoted;
  - editing a marked passage drops its mark;
  - the squares and the Atlas edge follow a scripted move, and wind back lowers them;
  - clicking the squares shows each attempt's reason;
  - `next` shows only on an exercise whose frontmatter names one, and "comes after" sets it on keep;
  - a reload keeps the marked answer;
  - the study page lists in order.
- **By eye:** screenshots beside `Study-Written`, `Mobile-Study` and `Study-Fit`, with sizes measured and not judged.
- **Every `.svelte` file** through the Svelte tool.
- **A real model,** on the mid tier, on a temporary copy of information theory:
  - one exercise made on entropy, then two markings: one wrong answer, then a right one after asking for a hint in the exercise, to see whether Iso's move accounts for the help;
  - each is one round with no tools, with about 1,700 characters of note;
  - on milestone 3's lesson I estimate $0.03 to $0.07 for the four requests (the hint is one more), and will stop and tell you if the first passes $0.05.

## 8. Risks

- **Decorations over live preview.** The answer and the marks sit over CodeMirror's live preview, as proposals do. Milestone 2 showed this works for whole blocks. Marks and the answer can start and end inside a block, and inside rendered maths: a mark that cuts into maths widens to the whole formula when drawn.
- **Quotes that do not match.** A model can quote a passage with its spacing or maths changed. Matching ignores runs of white space; a quote still not found is dropped and counted, never guessed at.
- **A model that will not answer in the shape asked.** The reply is small and strict: quotes, marks and moves. A reply that cannot be read is shown as a failed marking with its cost, and you send again. Nothing half-read is recorded.
- **Marking quality, and the judgement of moves,** cannot be tested with a scripted provider. The real run shows two cases, which is all the slice can claim before the week of use. Iso's moves are the place the week is most likely to find fault: each carries its reason, so a move you disagree with can be read, and wound back.
- **Size.** Smaller than milestone 3 in new mechanism. The exercise page is milestone 2's editor with decorations, and the requests are milestone 2's loop with one round. The study page and the request page are the most new screen.

## 9. Not in this milestone

- The other five kinds, marking it yourself, sound.
- A review queue and the recall curve's reviews (the slice plan, section 6). "Due" is shown, from the rule already in `understanding.ts`.
- Iso's teaching notes, and Iso ordering the study list.
- The timeline (milestone 5), which will show the `marks` entries and the attempts.

## 10. What was built (2026-10-17)

All six steps of section 6, on the branch `m4-study`. One thing was added at Lachlan's asking while step 6 waited on an expired key: a key can be made by signing in at OpenRouter, beside pasting one (below).

**What you can do:**

- **Open the study page** from the header: every exercise in order (due first, then never tried, then the fewest squares), each with its kind, title, "tests …" and the square of its last result (half malachite for partly). Below the list, the requests not kept yet, then `[ + an exercise ]` on every folder of the study base. `/study?note=` lists only what tests one note.
- **Ask Iso for an exercise** from a folder, or from a note's margin with that note chosen. The request page chooses the notes to test (from the folder, or picked on the Atlas), the folder, and the exercise it comes after. `send to Iso` is one round with no tools; the reply shows its title and question. `keep the exercise` writes `study/<folder>/<name>.md` and sets `next` on the one it follows.
- **Attempt it** in the editor: the tests row, the question at 23 px (18 px on a phone), "your working". Select any part of it and `[ mark as answer ]`; the selection is soft blue with "your answer", and is kept in this browser until sent.
- **Send it for marking.** Iso's marks lie over the passages it quotes (a double malachite line for right, rose with "× wrong" for wrong), with the chips beside "your working", "moves:" with each note's move, and the tier and cost. A right result flashes the squares. Editing a marked passage drops its mark.
- **Read the squares** in the header (the lower reading of the notes tested), with `[ wind back ]`; clicking them shows each attempt's reason. A knowledge-base note's margin shows the same squares, "N exercises", its step and "due".
- **On the Atlas,** a tested note's block takes its new edge after a marking, and a study folder's grown mark deepens with each exercise passed (it starts at two steps, as one looks like a bare shoot).
- **Make a key by signing in** at OpenRouter from the settings (OAuth with PKCE). The engine holds the verifier and exchanges the code that comes back, so the page never holds the key; the page reopens where the sign-in began. A sign-in lasts ten minutes and a code is good once. Lachlan signed in this way on 2026-10-17 and the real-model run below used that key.

**Checked:**

- 436 unit tests pass: 312 core, 57 engine, 21 server, 46 app. The type checks are clean, and every changed `.svelte` file passes the Svelte tool apart from its known false positives.
- 138 browser tests pass, 2 skipped, at two widths on both grounds against a scripted provider. New in this milestone: the whole of section 7's list, the margin → request → comes after → send → keep → `next` → study order path, the Atlas edge and grown mark after a marking and after wind back, and the sign-in (the scripted provider stands in for OpenRouter's page and checks the verifier against the challenge).
- **A real model,** on the mid tier (`anthropic/claude-sonnet-5.5`), on a temporary copy of information theory. Nothing of Lachlan's was written. **The four requests cost $0.045,** inside the $0.03–$0.07 estimated:

  | Request | Tokens in / out | Cost |
  |---|---|---|
  | An exercise on Entropy | 1128 / 152 | $0.0038 |
  | Marking a wrong working | 2130 / 1127 | $0.0159 |
  | A hint, asked in the working | 2704 / 392 | $0.0103 |
  | Marking the corrected working | 2457 / 1136 (824 cached) | $0.0147 |

  - The exercise, "entropy of a loaded die" (face 6 at ½, the rest equal), keeps to the note: H(X), the gap below log₂ 6, and why.
  - The wrong working used ln 10 for log₂ 10. Iso marked it **partly**, each of five passages right or wrong; the two wrong ones were exactly the slip and the gap that came from it. "log₂ 10 is about 3.32, not 2.30, so your value and the gap are off." Entropy moved +½.
  - The hint named the step and gave a check (2³ = 8, 2⁴ = 16) without the answer.
  - The corrected working was marked **right**, and Entropy moved only +½: "the log value needed a hint, and that slip was arithmetic rather than about entropy". **The move accounts for the help,** which is what this run was to show.
  - **The header's estimate was low:** 725 tokens shown for the first request, 1128 counted. Four characters a token undercounts notes heavy in maths.
  - **A marking's output is about 1,100 tokens,** most of it the model's reasoning; it is about $0.01 of each marking.
- **Against the boards,** at the boards' sizes (1440 × 900 and 390 × 844) on both grounds, measured:
  - `Study-Written`: the 680 px column, the question in Charter at 23 px and 1.4, the 12 px labels, the answer in soft lattice with its 2 px lattice line, `send for marking` 44 px tall at the foot, the 44 px bar, the 28 px status line, and the six 8 px squares match. **Fixed:** the label beside "your working" sat 9 px above it; now on its row. **Different:** the tests row is 44 px tall (it holds details and source), so the question sits 12 px lower than the board's. The header also carries the context count and cost (milestone 2), and the status line says "only what you mark is your answer", as the answer is any selection.
  - `Mobile-Study`: the wrong line's 2 px rose underline, the right lines' 3 px double malachite, the 22 px chips, the working at 18 px and 1.55, `mark it again` across the width and "moves:" match. **Fixed:** the question was 23 px; it is 18 px on a phone, as the board's. **Different:** the tests row and details/source are shown (the board has none); "× wrong" wraps under a passage too long to share its line, beside "your answer"; the tier and cost sit under "moves:" rather than at the right of the text; the prompt field and status line (milestone 2) sit between the button and the tabs. Iso's unasked paragraph is not built, as the boards' notes at the top of this plan say.
  - `Study-Fit`: rows 36 px, the kind in 7ch at 12 px, the 8 px square, the frame's padding (24, 22, 14), the margin's squares, "N exercises" at 12 px and the step label match. **Fixed:** titles in the list were in the reading face, the board's are in the interface face; the margin sat 44 px below the title, now level with it, 8 px down. **Different:** on a phone the "tests …" label wraps under the title (rows 51 px). From 1100 px the margin sits in the page's own gutter, left-aligned, where the board's is right-aligned inside the frame beside the text. Squares on blocks are not built (choice 4), nor the other kinds.

**Not checked or not built:**

- **The token estimate** stays at four characters a token. Counting better would make the header honest; it would trim nothing.
- **Only the written kind,** and only Iso marks. A recall queue, Iso's teaching notes and goals are later parts (section 9).
- **The sign-in to other providers.** `[provider] auth` names a sign-in page for a provider that makes keys as OpenRouter does; none other was tried.
- **One real run,** of four requests, as planned. Marking quality and the judging of moves are what the week of use is for.

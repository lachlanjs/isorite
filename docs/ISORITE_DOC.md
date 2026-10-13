## What is Isorite?

Isorite is an agentic harness for enhanced understanding.
It can be used as a tool for project management, learning and planning.
Isorite can be self-hosted within your codebase, or installed on your device (including mobile), driven through a web-based interface and connected to your familiar terminal-based workflow.
It can be used by a team, or the individual, for learning and project enterprises (or both!).
It can be connected to your Github or Gitlab project and operates on data you solely own.
The platform is free, with LLM services provided through a paid API of your choice.

## Brand, aesthetic, theme and design purpose

Isorite is a portmanteau of "isomorphism" (the mathematical word for a structure-preserving one-to-one mapping between two sets of things) and "dendrite" (a branching structure associated with the neuron cell body which integrates inputs in complex and non-linear ways).
In the very name, Isorite stands for human understanding which precisely maps onto progress and agent understanding.
"Isorite" also sounds a bit like a form of mineral (like Pyrite or Celestite or Dolerite). 
This, in addition to mathematical and neuronal themes, inpires the aesthetic of Isorite.

The interface presents as clean, minimalistic, geometric and natural.
It feels like an appropriate home for grand, intelligent and structured thinking, rather than productivity-motivated speed.
Isorite's design in terms of form and function aims to engage the user in a healthy manner, and adopts tried and true psychological tricks to do so.
This informs the minimalism, engaging visual elements, and cohesive engagement of senses.

The colorscheme of Isorite conforms to mineral-like palette.
Veins of pyrite gold, icy white, and smoky obsidian, with malachite, rhodochrosite and and azurite surfaces atop quartz and lapis backgrounds (depending on colour palette).

Lines are straight, taken either NWSE or at 45 degrees in some locations (such as Atlas paths).
Corners of boxed areas are trimmed at 45degrees.

L-systems and cellular automata are used in opportune locations to provide visual flair and identity. (logo, ends of routes, hidden in background, loading animations, agent-thinking).

The GUI uses animations in appropriate locations where they provide meaningful effects.
For example, when the agent's thinking is shown, its visual trace through the knowledge base (through RAG semantic search and knowledge base traversal) is displayed with an animation reflecting the path taken.

Some aspects of the UI adopt a terminal-feel inspired by Alien-Isolation's UI design, which emulates low-fidelity computer systems which get the job done without needing to be unnecessarily complex or flashy.
Alien isolation grabs the user's attention with clear vector-style graphics, labels inline to box edges, and flashing animations to draw visual attention.

Sound design is employed in Isorite to engage the user's senses further.
Sounds are provided for typical UI interactions, as well as other distinguishing events such as Agent thinking, and study practice / success.
The timbre of the sound aims to reflect the minimal, organic and crystalline mood of the interface.
Sounds should have an emphasis on variation, either being largely generative or having a healthy sample selection, while maintaining distinct identity connected to their event/purpose.
Some candidate sounds include subtle space drums, subtle percussive hits on organic surfaces and low-pass-filtered piano embellishments where melodic sound is appropriate.
Some candidate effects include reverb, granulation, generative randomness and frequency filtering associated to different UI layers.
Background sound should provide a stimulating but unobtrusive canvas which blends with the sounds attributed to UI events.
It should evolve freely and conform to 1/f scaling (which is known to be stimulating to human beings - search Komerebi or Ocean Waves).

## Why Isorite?

Isorite aims to address a fundamental issue with AI-driven development, which is that it undermines human understanding in favour of productivity and speed.
Isorite also offers a solution to the issue that LLMs are not having the positive effect on education that they should.
Lastly, Isorite also offers new ways of mapping and visualizing knowledge which are cleaner and more digestible than that of force-directed graph representations popularized by wiki-style personal-knowledge-management tools such as Obsidian.

### Chat-style Agentic harnesses

Agentic chat-interfaces bear striking resemblance to poker machines.
Minimal user-input sits between long waits with flashy presentation as the agent thinks and returns with a *possible* solution.
Users become addicted to this process, as "one-more-prompt" feels like it could be the difference between leaving with nothing and striking gold.
The simplistic interface discourages deeper structured thinking in other interfaces.
Isorite aims to encourage the user to work more hand-in-hand with the LLM.
It does not go as far as an LLM autocomplete would, where the AI is assistant to the human, but it does not strip away the human's agency in thought entirely.
Isorite sits in the middle.
Isorite does provide a TUI interface purely for programming-based (or similar) work where the abilities to edit files outside the knowledge bundle, execute commands, and integrate other tools from the AI ecosystem are required.
This TUI still connects to the browser-based GUI interface and demonstrates the way in which the agent is retreiving and surfacing critical information.

### Education/learning apps

Education has not reaped the reward of LLMs as of late-2026.
In theory, a wide cohort of students and learners should have access to their own personal experts tutors (a service as of yet approached only by the most prestiguous schools and higher-education institutions in the world - or for those who can afford personal tutoring services).
Isorite aims to help address this in its learning/study functionality.
Through the knowledge bundle, the agent can form a clearer picture of the shape and quality of the learner's understanding.
The agent can then make tailored decisions about next steps for the user in terms of developing their understanding and problem-solving capabilities. 
Isorite does not adopt a one-dimensional approach to learning, where other education apps tend to.
For instance, many education apps opt for quiz-style recall or association questions, incentivised by "streaks" (which are a poor measure of learning outcomes).
"Micro-learning" apps adopt a philosophy of bite-sized chunks of information while employing reminder/notification systems to encourage the user to stick to their habit.
Isorite takes lessons from these attempts and modifies their delivery while adding its own learning functionality and agent systems to enhance the learning experience both for projects and for pure scholarly enterprises.

### Personal Knowledge Management

Personal Knowledge Management (or PKM) has made for a zeitgeist in recent years.
Apps such as Obsidian, LogSeq and Notion have popularized the use of technology to build "second-brains" which are curated and interacted with in the same manner as a wiki. 
The premise suggested by network-visualisations, wide plugin ecosystems, and broad applications and generality, is tantalising.
Moreover, the rise of LLMs reinvigorated this hype, with a leading researcher (Andrej Karpathy) popularising the attractive concept of the LLM-wiki.
"Let the agent manage your second brain" became a sexy slogan hypnotizing technological early adopters in an unsophisticated manner.
However, in practice many of these features fall flat.
For one, the network-style visualisation is ineffective and uninterpretable when the number of nodes/connections exceeds a threshold.
Secondly, the extensibility of these systems compromises structure and leads to a trap wherein an overengineered PKM system detracts from the actual goal of learning and understanding.
Isorite keeps the feature set as minimal as possible, encourages and rewards user-engagement, reinvents the visualisation of the knowledge bundle, as well as the relationship between the user, the agent, and the "wiki".

## Supporting Isorite

Isorite is not a paid application.
Users may donate to the developer if they wish.
Users pay for their own LLM usage through their chosen API.

## Isorite - Knowledge Base and document format

Isorite was inspired by the publication of "Open Knowledge Format" (or OKF) by Google.
This represented a leading AI company acknowledging the promise of the concept of the LLM-wiki as an extension of RAG.
Isorite adopts the OKF format for its notes.
If departures from the OKF 0.2 standard are necessary, then Isorite will have its own standard.
Primarily, the concept of linked notes qualified by edge identities (requires, uses, mentions, see also) is of use.
Frontmatter which might aid search, as well as rich markdown formatting allowing for LaTeX, mermaid diagrams, code blocks with highlighting, tables, headings, line breaks, image embeds - are all important.
Additional notes / information may be attached for educational purposes for use behind the scenes by the agent, and these must be tailored to the particular user, and not shared.
Properties of understanding, last date of review, etc.
Additionally, some tags may be inserted which code for information which the GUI uses to render AI-generated content until it is reviewed and accepted into the document.
This allows the user the leave the application and come back to it without losing progress that was half-way through.

At the end of the day, it is essential that the user is able to export the knowledge base in a raw format, with and without the teaching metadata associated with it. 
The user should always have sovereignty over their data.

In addition to the primary markdown documents are *artifacts*. These are based in HTML instead of markdown, but inherit the style of Isorite. 
These should allow for even richer formats, but will not be editable. 

## Isorite - Atlas

The Atlas displays a visual map of the knowledge bundle.
The Atlas aims to significantly improve upon the concept of the force-directed network representation.

### Why not a force-directed graph

A force-directed graph shows every note and every link at once, at one scale, in positions that mean nothing.
It stops being readable at a few hundred notes, and it looks different every time it is opened.
The Atlas is a map instead: where a note sits says something, the same base always gives the same map, and no more is drawn than can be read at the current zoom.

### What it is made of

- **A square grid.** Everything sits on cells. Lines run in eight directions only.
- **Notes are blocks.** Each is the same size, with room for its whole title.
- **Folders are regions.** A folder is a rectangle with cut corners and its title in its top edge. Folders nest, each level a tone lighter. Nesting is always drawn as containment, never implied by lines alone.
- **Links are routes.** A link is drawn between the two notes it joins as a path over the grid that never passes through a note.

### How it is laid out

- **Each folder is laid out on its own,** and is then a single block in its parent's layout. This is what lets the map scale: a closed folder costs one block.
- **Prerequisites flow one way.** Inside a folder, notes are put in layers so that what is required comes before what requires it. The order is the reading order. `requires` and `uses` links shape the layout; `see also` links do not.
- **The direction turns at each level.** The top level runs bottom to top, its folders' contents left to right, theirs bottom to top again, so a chain of folders is a column of rows and not a tower.
- **Links are bundled.** All the links between the same two items are one line (a trunk) carrying a count. A link belongs to the lowest folder that holds both its ends, and is drawn at that level.
- **Links that say nothing new are hidden.** If A requires B and B requires C, a direct link from A to C is implied and left out unless asked for.
- **Routes are kept simple.** A route leaves the late side of one item, runs along a track of its own in the channel between two layers, and enters the early side of the other. Two items in line are joined by one straight run. A route that shifts by only a few cells crosses at 45 degrees.
- **Unconnected groups stand apart.** Each connected group in a folder is a small diagram of its own, and notes linked to nothing are shelved together.

### Detail follows zoom

- A folder is one titled block until it is large enough on screen, then it opens and shows its contents. Zooming out closes it.
- A note shows its title only once the title can be read.
- Links inside a closed folder are not drawn. Links between closed folders are one line whose weight shows how many it stands for.
- The current place is always shown as a folder path, and stepping out is one action.

### What a note's block says

State is carried by fill and by line, never by hue alone, so the map reads in monochrome.

| | Shown as |
|---|---|
| Not reached | a dotted edge, no fill |
| Opened | a solid edge |
| Worked through | a solid edge and a fill |
| Understood, or reviewed | a double edge |
| Needs work, or changed since you understood it | a notch cut from the top right corner |
| Kind of note (definition, theorem, example, reference, ...) | a small glyph |

**Lenses** choose what the tones mean, one at a time:
*Understanding* (the default in Study mode) shows where you stand;
*Activity* (the default in Project mode) shows what changed this week, month and quarter;
*Health* shows what has been checked by a person, tested by an exercise, and is current.

### Using it

- **Pointing at or selecting a note** lights everything it depends on, all the way back, and what builds on it directly. The rest steps back. A card gives its state, what it requires, what builds on it, and opens it.
- **A study path** (everything a note requires, in order) numbers its notes on the map and lights the links among them.
- **Hiding what you have not reached** leaves a map of only what you know.
- **Study documents** (exercises and the like) are not blocks in the layout, which stays the knowledge base's own shape. They are shown as marks on the notes they test.
- **On a phone** the map is pinched and tapped, at 390 px wide.

### Iso on the Atlas

Iso is asked on the map itself, with no side panel.
What is pointed at is the subject: a note, a folder, or open ground for the whole base.
The same three kinds of request as in the editor apply (see below):

| Kind | Iso may change | What you see |
|---|---|---|
| Answer | nothing | a card beside the subject, and numbers on the notes the answer rests on |
| Insert | one new note, with its links | the note where the layout puts it, dotted gold until kept |
| Transform | the links and folders of the notes you ticked, not their text | added links dotted gold, removed links crossed, until kept |

**Iso's path is drawn as it is made.** This is the main animation of the Atlas, and it is information, not decoration:

| On the map | Means |
|---|---|
| A dashed frame | found by a keyword search |
| A dotted frame | found by meaning (semantic search) |
| A solid frame, and a line along the route | reached by following a link from a note already in hand |
| A fill and a number | the answer rests on this note; the number is its place in the answer |
| Fainter | opened and not used |

Each note the answer rests on carries a sentence quoted from it, checked against the note's text so that a quotation is always real.
A question that was asked is kept and can be played again on the map without calling the model.
The same drawing shows a terminal agent's path through the base, live, while it works (see the TUI).

### What it must hold to

- **Stable.** The same base gives the same map, and a small edit should move little.
- **Legible at scale.** A subject is 50 to 300 notes and a whole field about 1,300. Both must be usable on a phone.
- **Fast.** The layout is worked out off the main thread and kept, so the map appears without waiting.
- **Measured.** Straight routes, bends per route and crossings are counted on kept example bases, so a change to the layout is judged by numbers and not by eye alone.

## Isorite - Editor Agent integration

The Isorite editor is a rich markdown live-preview editor (similar to Obsidian) but with a specific agent-editing system built in.

### The editor

- **Live preview.** Markdown is shown formatted as it is typed, and the line under the cursor shows its source. Maths, Mermaid diagrams, highlighted code, tables, images and embedded artifacts are drawn in place.
- **Prose is the exception to the terminal.** Notes are read and written in a serif face; the interface around them is monospace.
- **Links say what they mean.** A link to another note is completed from the note's title as it is typed, and its kind (requires, uses, see also) is chosen in place from a small control on the link.
- **The file is the truth.** What is edited is the markdown file, saved as it is typed. Nothing the editor shows exists only in the editor.

### Seeds: Iso asked in place

There is no chat panel.
Iso is asked where the work is, by a *seed*: a prompt planted in the note, on a new line or under a selection, with a key or a button.
(The name is a working one. A seed crystal is what a crystal grows from, and the axiom of an L-system is its seed.)

Before asking, the kind of reply is chosen. This is the heart of the system: **what Iso may change is decided by the person, before Iso answers.**

| Kind | What you point at | What Iso may change | What you see |
|---|---|---|---|
| **Answer** | a selection, or nothing | nothing | the reply folded under the question |
| **Insert** | a point in the note | new text at that point | the text in the note's flow, with a dotted gold edge until kept |
| **Transform** | one or more whole paragraphs | those paragraphs, and nothing else | each changed paragraph, the old struck through above the new, until kept |

- **A selection is the subject.** Asked with nothing typed, the selected prose is itself the question.
- **Paragraphs have handles.** Each block (a paragraph, list, table, code block, displayed equation or heading) has a handle in the margin. Ticking handles is how the paragraphs of a Transform are chosen; they need not be adjacent.
- **The limit is enforced, not requested.** The server accepts back only what the kind allows. An Answer that tries to change the note changes nothing.
- **A question can be parked.** A seed can be kept unanswered, as a note to self, and answered later by Iso or by hand.
- **An answer can become an insert** when it turns out to belong in the note.

### Keeping

Iso's text is never silently the person's.

- **Unkept text is in the file from the moment it arrives,** marked, so that leaving the application and coming back loses nothing.
- **Keep, edit first, or remove** (put back, for a Transform). Kept text loses its mark and is the person's from then on. The word is *keep*: verifying is something a person does to a whole note.
- **A note with unkept text says so,** and cannot be marked as reviewed until each piece is kept or removed.
- **Everything that reads the file is told.** Search, the Atlas and other agents see which text is not yet kept, so an agent does not mistake Iso's draft for the person's knowledge.
- **A seed folds** to one line (its kind, the question, its state) and stays in the note until deleted. Deleting a seed does not remove text that was kept.

### What a seed shows

- **What Iso looked at.** Iso is given nothing but the note and the place; it finds the rest itself with read-only tools (keyword search, search by meaning, reading a section, following links). Each lookup is listed, and can be shown on the Atlas.
- **What it cost.** Tokens and currency, the model, and the tier, at the seed's foot.
- **How strong a model.** The person picks a tier (low, mid, max) per request. Isorite does not guess how hard a request is.

### In Study mode

In an exercise Iso does not write the answer.
The same in-place interface offers a hint, feedback on the working so far, and discussion, each attached to the passage it is about.

### Not settled

- What replaces a long conversation. A seed is one question and one answer.
- Whether a seed can be followed up in a thread.
- Whether kept answers and parked questions are passed to other agents.
## Isorite - Review feature

The Isorite review feature allows the user to peer into the history of their knowledge/study base.
It provides them with a detailed tour of what was accomplished in the last session.

It exists to slow the user down in the right place.
Seeing each change again, with what was asked for it, encourages changes made in purposeful and logical chunks, and it is where the user finds out whether they still understand what their base now says.

### The journal

Every change to a note is an entry in a history kept for that note, which is only ever added to.
Each entry records:

- **who:** the person, Iso (and which model), or another agent (a terminal harness, by name);
- **what was asked,** where the change came from a seed;
- **what changed,** as a difference from the note before to the note after, so any earlier state can be rebuilt;
- **when,** and in which session.

Rules that keep it readable:

- The person's saves in a row are one entry, so the history reads "you edited" between two of Iso's changes, not a hundred keystrokes.
- Keeping Iso's text is the entry. Asking is not. An answer that changed nothing is still an entry, so it has a place in the history.
- A change made outside Isorite (another editor, a terminal agent) is found the next time the note is read, and entered under whoever made it.

Git stays what it is: the project's history by commit.
The journal is finer, is about one note, and knows what was asked.

### The timeline

Optional, beside the note, off by default.

- Points in order, evenly spaced: order matters, not the time between.
- **Iso's changes** are the gold diamond: filled when kept, outlined while not.
- **The person's changes** have a mark of their own in blue.
- **Another agent's** are a diamond with its name.
- Selecting a point shows the note as it was after that change, with the change marked and what was asked. From there: step forward or back, restore the note to that point (itself a new entry), or open the seed.

### The session tour

"What you did in the last session", across every note, one change at a time.

- **A session** is a run of changes with no gap longer than half an hour. The tour offers the last session, or today.
- **Each step** shows the note, what was asked, what changed, and whether it was kept.
- **Iso's account** accompanies each step: a sentence or two on what the change did and how it sat with the changes around it. It is written by a cheap model from the entry and its neighbours, kept with the entry, and told not to praise.
- **On the Atlas,** the tour can show where the session went: the notes touched, in order, as a path.
- **In Study mode** the same tour covers what was practised: the exercises attempted, how they were marked, and which notes moved.
- **In a team** it also answers "what changed while I was away": the notes changed by others since the user last looked at them.

### Not settled

- Where the journal is kept, and whether it travels with the base in git or stays on one device.
- How far back it is kept.
- Whether a terminal agent's edits should also wait to be kept, as Iso's do.
- The word. "Review" also means recalling a note that is due, and checking a note as correct. Three meanings is two too many.

## Isorite - TUI

Isorite ships a TUI (either standalone custom, or an overhaul plugin for existing agent harnesses) - which provides the brand of Isorite as well as specific connectivity to the web interface which demonstrates the agent's use of the knowledge base live while doing other agentic work (such as tool calling, editing, command execution).
Additional features are also implemented where possible to reflect what can be done in Isorite's web interface, but the Atlas is probably mostly out of scope here.
The TUI would also naturally lack sounds.
The TUI aims to preserve as much style as possible in monospace.
It is recommended that the user have fully featured nerd fonts enabled to facilitate this.
The user is able to highlight relevant knowledge from the knowledge base and this will be made directly available to the agent running in the connected TUI session. 
They are also able to see how the agent thinks through the highlighting of nodes and paths in the Atlas.

## Isorite - Study Base, Mode and format

A study base is a distinct but connected entity to a knowledge base.
When associated with a knowledge base, it should exist *adjacent* to it in the filesystem, not within it (separate repositories).
The mapping from knowledge base to its associated study knowledge base should be stored in the user's ~/.config directory.
If a knowledge base does not have a known study base associated with it, then the user can be prompted when trying to switch to study mode to choose and existing study base or to create a new one. 

If a study knowledge base is present, then study mode can be enabled.
Study mode adds certain learning-related features while also stripping away certain unnecessary parts of Isorite, presenting a "zen"-friendly space for study with a distinct feel.

A study knowledge base adds new notes to the existing set of documents in the knowledge base.
These appear (but are visually distinct) in the Atlas.

Study documents contain things like:

- Exercises
- Multiple choice questions
- Open ended investigations

They are stored also in the same OKF-esque format but with additional data for Iso's teacher knowledge, as well as metadata for tracking exercise completion.

Exercises contain a specialised format in tags which are not rendered in raw form to the user - they point to the question and the answer prescribed by the student.

Multiple choice is similar.

The important thing to note about these documents is that they are mostly raw markdown, and it is the data added on top which makes a difference.
The user will be free to write as much as they like in the form of working in these documents, before highlighting their given answer when appropriate.
This allows Iso to review the full thought process and provide more detailed feedback on what went wrong if necessary.
This is what the perfect tutor would do, but it remains essential that the user puts in the effort to facilitate that.
I think this is what most education apps lack.

The study base should also house a hidden knowledge base purely for Iso's teaching purposes.
This helps Iso to get up to speed in a fresh session about where the user is at in their learning journey, what should be studied next, how regular the user's study habits are, etc.
This is all available for the user to export if they wish.

The study base also adds extra data on top of the knowledge base notes to identify which concepts the user has learned, and what their level of understanding is about them.

Notes in the study base can link to notes in the knowledge base, but not vice versa.

When a knowledge base is initially created for study purposes, a feature for building the initial knowledge base (and later for expanding it) will be available.
This process will be driven by the agent and will use web search and research tools to gather relevant context and documents before assembling it into the Isorite format.
All references for such knowledge must be given in the relevant documents in which they are used.
The user can elect to supply suggested resources in the form of URLs and PDFs.
Iso must report to the user that they can access and read these resources reliably.

## Isorite - Agent (Iso)

Iso is Isorite's LLM agent.
Iso is tailored to Isorite's specific mission and use case.

Iso can be used in the Atlas, note editor, and in exercises, each of which have slightly modified system prompts.

Iso is generally interacted with in an *inline* fashion.

Usage (in currency and tokens) should always be shown for:

- The project
- The current session
- The current prompt/task

### Providers

The user could be pointed to a detailed guide on which LLM providers are *safe* in the sense of their data not being sold.
This should accompany pricing information.
Later on, it may be useful to note which LLMs are best for providing a good learning experience.
At the end of the day, the user is completely free to choose which provider they want to use, and they can limit and control the cost of their usage through their API key on the OpenRouter platform for instance.

### Context

The management of Agent context is essential for providing a relevant agentic experience and saving the user's money.
The Isorite format will be leveraged to improve both the retrieval of relevant information as well as the compaction of context. 
Context comprises:

- The Isorite system prompt (provides the Iso identity and purpose for either Project mode or Study mode)
- The user's prompt
- Documents found using RAG on the knowledge base (where link based search might not suffice)
- Documents found through knowledge base traversal through specialised agent skills and tools


## Platforms

Isorite will be distributed as a github repo, npm package, and Tauri App, as well as shipping either a custom TUI harness or overhaul plugins for existing popular TUI agent harnesses (OpenCode, Claude Code, Pi, Hermes).
On mobile platforms in particular, Isorite will connect with the user's Github account to find, download and create knowledge/study bases.

## What is Isorite?

Isorite is an agentic harness for enhanced understanding. It is a tool for building and keeping an understanding of a project or a subject. Isorite can be self-hosted within your codebase, or installed on your device (including mobile), driven through a web-based interface and connected to your familiar terminal-based workflow. It can be used by a team or by an individual. It can be connected to your Github or Gitlab project and operates on data you solely own. The platform is free, with LLM services provided through a paid API of your choice.

## Brand, aesthetic, theme and design purpose

Isorite is a portmanteau of "isomorphism" (the mathematical word for a structure-preserving one-to-one mapping between two sets of things) and "dendrite" (a branching structure associated with the neuron cell body which integrates inputs in complex and non-linear ways). In the very name, Isorite stands for human understanding which precisely maps onto progress and agent understanding. "Isorite" also sounds a bit like a form of mineral (like Pyrite or Celestite or Dolerite). This, in addition to mathematical and neuronal themes, inpires the aesthetic of Isorite.

The interface presents as clean, minimalistic, geometric and natural. It feels like an appropriate home for grand, intelligent and structured thinking, rather than productivity-motivated speed. Isorite's design in terms of form and function aims to engage the user in a healthy manner, and adopts tried and true psychological tricks to do so. This informs the minimalism, engaging visual elements, and cohesive engagement of senses.

The colorscheme of Isorite conforms to mineral-like palette. Veins of pyrite gold, icy white, and smoky obsidian, with malachite, rhodochrosite and and azurite surfaces atop quartz and lapis backgrounds (depending on colour palette).

Lines are straight, taken either NWSE or at 45 degrees in some locations (such as Atlas paths). Corners of boxed areas are trimmed at 45degrees.

L-systems and cellular automata are used in opportune locations to provide visual flair and identity. (the logo, the crystal that grows while the agent works, loading animations).

The GUI uses animations in appropriate locations where they provide meaningful effects. For example, when the agent's thinking is shown, its visual trace through the knowledge base (through RAG semantic search and knowledge base traversal) is displayed with an animation reflecting the path taken.

Some aspects of the UI adopt a terminal feel inspired by Alien-Isolation's UI design, which emulates low-fidelity computer systems which get the job done without needing to be unnecessarily complex or flashy. Alien isolation grabs the user's attention with clear vector-style graphics, labels inline to box edges, and flashing animations to draw visual attention.

Sound design is employed in Isorite to engage the user's senses further. Sounds are an idea for typical UI interactions and for events such as the agent thinking; none are built. The timbre of the sound aims to reflect the minimal, organic and crystalline mood of the interface. Sounds should have an emphasis on variation, either being largely generative or having a healthy sample selection, while maintaining distinct identity connected to their event/purpose. Some candidate sounds include subtle space drums, subtle percussive hits on organic surfaces and low-pass-filtered piano embellishments where melodic sound is appropriate. Some candidate effects include reverb, granulation, generative randomness and frequency filtering associated to different UI layers. Background sound should provide a stimulating but unobtrusive canvas which blends with the sounds attributed to UI events. It should evolve freely and conform to 1/f scaling (which is known to be stimulating to human beings - search Komerebi or Ocean Waves).

## Why Isorite?

Isorite aims to address a fundamental issue with AI-driven development, which is that it undermines human understanding in favour of productivity and speed. Isorite also offers a solution to the issue that LLMs are not having the positive effect on education that they should. Lastly, Isorite also offers new ways of mapping and visualizing knowledge which are cleaner and more digestible than that of force-directed graph representations popularized by wiki-style personal-knowledge-management tools such as Obsidian.

### Chat-style Agentic harnesses

Agentic chat-interfaces bear striking resemblance to poker machines. Minimal user-input sits between long waits with flashy presentation as the agent thinks and returns with a *possible* solution. Users become addicted to this process, as "one-more-prompt" feels like it could be the difference between leaving with nothing and striking gold. The simplistic interface discourages deeper structured thinking in other interfaces. Isorite aims to encourage the user to work more hand-in-hand with the LLM. It does not go as far as an LLM autocomplete would, where the AI is assistant to the human, but it does not strip away the human's agency in thought entirely. Isorite sits in the middle. Work that needs more than the notes (editing code, running commands, other tools) is better done in the agent you already use, in your own terminal; isorite gives that agent the notes over MCP and shows, in the browser, how it uses them.

### Learning with an agent

Education has not reaped the reward of LLMs as of late-2026. Isorite does not build a learner model or a quiz machine. It carries the posture of a good tutor into the agent's instructions (ask what the person thinks first, show where understanding stops, offer the next question as a note), and keeps the evidence of understanding where it can be read: in the notes themselves, who wrote which words, and the open questions and problems beside them. A fuller learning layer (exercises, a record of what was practised, review) was built and retired; the idea is kept in `ideas.md`.

### Personal Knowledge Management

Personal Knowledge Management (or PKM) has made for a zeitgeist in recent years. Apps such as Obsidian, LogSeq and Notion have popularized the use of technology to build "second-brains" which are curated and interacted with in the same manner as a wiki. The premise suggested by network-visualisations, wide plugin ecosystems, and broad applications and generality, is tantalising. Moreover, the rise of LLMs reinvigorated this hype, with a leading researcher (Andrej Karpathy) popularising the attractive concept of the LLM-wiki. "Let the agent manage your second brain" became a sexy slogan hypnotizing technological early adopters in an unsophisticated manner. However, in practice many of these features fall flat. For one, the network-style visualisation is ineffective and uninterpretable when the number of nodes/connections exceeds a threshold. Secondly, the extensibility of these systems compromises structure and leads to a trap wherein an overengineered PKM system detracts from the actual goal of learning and understanding. Isorite keeps the feature set as minimal as possible, encourages and rewards user-engagement, reinvents the visualisation of the knowledge bundle, as well as the relationship between the user, the agent, and the "wiki".

## Supporting Isorite

Isorite is not a paid application. Users may donate to the developer if they wish. Users pay for their own LLM usage through their chosen API.

## Isorite - Knowledge Base and document format

Isorite was inspired by the publication of "Open Knowledge Format" (or OKF) by Google, a leading AI company acknowledging the promise of the LLM-wiki as an extension of RAG. Isorite adopts the OKF format for its notes. If departures from the OKF 0.2 standard are necessary, then Isorite will have its own standard. Primarily, the concept of linked notes qualified by edge identities (requires, uses, see also) is of use. Frontmatter which aids search, and rich Markdown (LaTeX, mermaid diagrams, code blocks with highlighting, tables, headings, image embeds) are all important. A note is also a question or a problem when its type says so.

It is essential that the user can take the knowledge base away as plain Markdown. The user always has sovereignty over their data. What isorite keeps beside the notes (the journals, the agent's sessions) is in a hidden `.isorite/` folder; `format.md` says exactly what is on disk.

In addition to the primary Markdown documents are *artifacts*. These are based in HTML instead of Markdown, and are built on isorite's kit so that they inherit its style. They allow for richer formats (charts, simulations, 3D), and are not editable in the app.

## Isorite - Atlas

The Atlas displays a visual map of the knowledge bundle. The Atlas aims to significantly improve upon the concept of the force-directed network representation.

### Why not a force-directed graph

A force-directed graph shows every note and every link at once, at one scale, in positions that mean nothing. It stops being readable at a few hundred notes, and it looks different every time it is opened. The Atlas is a map instead: where a note sits says something, the same base always gives the same map, and no more is drawn than can be read at the current zoom.

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
| A note | a block with its title |
| A question or a problem | a small glyph, and a green mark once resolved or solved |
| A note git left in conflict | marked as conflicted |
| Hidden by the person | not drawn (`.isorite/hidden.txt`) |
| Lit | the note pointed at or open, what it requires and what builds on it; the rest steps back |

Each kind of file beside the notes (artifact, data, document, picture, web and code links) is a node of its own. The map's layers, switched on and off from the pane's header, choose which of these are shown.

### Using it

- **Pointing at or selecting a note** lights everything it depends on, all the way back, and what builds on it directly. The rest steps back.
- **Press and hold** on a note, a folder or open ground gives a few choices at that point (move, delete, send to the agent, make a note).
- **On a phone** the map is pinched and tapped, at 390 px wide.

### The agent on the Atlas

**The agent's path is drawn as it is made.** This is the main animation of the Atlas, and it is information, not decoration:

| On the map | Means |
|---|---|
| A dashed frame | found by a keyword search |
| A dotted frame | found by meaning (semantic search) |
| A solid frame, and a line along the route | reached by following a link from a note already in hand |
| Fainter | opened and not used |

It is the same for isorite's own agent and for the agent you already use, over MCP.

### What it must hold to

- **Stable.** The same base gives the same map, and a small edit should move little.
- **Legible at scale.** A subject is 50 to 300 notes and a whole field about 1,300. Both must be usable on a phone.
- **Fast.** The layout is worked out off the main thread and kept, so the map appears without waiting.
- **Measured.** Straight routes, bends per route and crossings are counted on kept example bases, so a change to the layout is judged by numbers and not by eye alone.

## Isorite - The editor and the agent

The Isorite editor is a rich Markdown live-preview editor (similar to Obsidian) with the agent beside it.

### The editor

- **Live preview.** Markdown is shown formatted as it is typed, and the line under the cursor shows its source. Maths, Mermaid diagrams, highlighted code, tables, images and embedded artifacts are drawn in place.
- **Prose is the exception to the terminal.** Notes are read and written in a serif face; the interface around them is monospace.
- **Links say what they mean.** A link to another note is completed from the note's title as it is typed, and its kind (requires, uses, see also) is chosen in place from a small control on the link.
- **The file is the truth.** What is edited is the Markdown file, saved as it is typed. Nothing the editor shows exists only in the editor.

### Asking the agent

There is no chat in the note. The agent is asked in its own pane, beside the note and the Atlas, and what the person is looking at goes into the prompt as a *pointer*: a mark standing for a selected stretch of a note, a whole note or a folder, carried with its text. A selection in the note and Ctrl+Enter, or a note dropped on the prompt, makes one. The agent can be isorite's own, or the one the person already uses in its terminal.

- **The agent cites the notes in the sentence,** as links, and what it read lights up on the Atlas.
- **The agent can ask back.** A question it asks becomes an open question, a note, at once.
- **What it may do is the person's to set,** by three switches in the pane's header: notes, the project's files, commands.

### The agent's words are marked, and undoable

The agent's text is never silently the person's.

- **An agent's edit to a note is written at once,** under its name, with what it was asked. The words are marked as the agent's in the note (the provenance switch), and the person can see the note as it was before and restore it from the timeline.
- **Everything that reads the file sees the same text.** Search, the Atlas and other agents read what the note says now, and the journal says who wrote which part.

## Isorite - History

Every change to a note is an entry in a history kept for that note, which is only ever added to. Seeing each change again, with what was asked for it, slows the user down in the right place: it is where they find out whether they still understand what their base now says.

### The journal

Each entry records **who** (the person, the agent by name, or a change found already made outside isorite), **what was asked** where an agent made the change, **what changed** as a difference from the note before to the note after (so any earlier state can be rebuilt), and **when** and in which session.

- The person's saves in a row are one moment, so the history reads "you edited" between two of the agent's changes, not a hundred keystrokes.
- A change made outside Isorite (another editor, a terminal agent writing the file) is found the next time the note is read, and entered under whoever made it.

Git stays what it is: the project's history by commit. The journal is finer, is about one note, and knows what was asked.

### The timeline

Optional, beside the note, in the Note pane's header. The note's history as strata: a layer for each moment, the newest on top, as thick as the change was large; yours in blue, the agent's in gold, what was changed outside isorite hatched. Pointing at a layer marks what it changed in the note and says what was asked; choosing one shows the note as it was, and the note can be restored to it (itself a new entry). The Atlas shows the last session's moments across notes as marks along its edge, oldest first.

## Isorite - Beside your agent

Work that needs more than the notes (editing code, running commands, the rest of the AI ecosystem) is done in the user's own agent, in their own terminal, with their own skills. Isorite gives that agent the notes over MCP (`isorite setup` writes the project's MCP config) and shows in the browser what it reads and writes. That, and the agent of its own below, are the only two ways to use an agent (decided 2026-11-09). Isorite also has an agent of its own, for tending the notes, with the highlight in a note going straight into its prompt.

## Isorite - Agent

Isorite's own agent is built on pi and needs a model provider's key (OpenRouter, Anthropic, OpenAI and others) or an organisation's gateway; nothing else to install. It is tailored to the notes: it reads them with the same tools an MCP agent has, cites them, and asks back. The person is free to choose any provider, and controls the cost through the key. A guide to which providers are *safe*, in the sense of not selling data, with pricing, would be a useful addition.

## Platforms

Isorite is distributed as a GitHub repository, an npm package and a single executable (installers for macOS, Linux and Windows), and runs in a browser, on a phone too. A Tauri app is a later possibility. On a phone, isorite would connect with the user's GitHub account to find, download and create bases.

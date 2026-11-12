---
type: Concept
title: What a pointer sends
tags: [agents, context]
description: What isorite's own agent is sent for each kind of pointer, and why a note it already has is not sent again.
uses: [agents/give-it-notes]
---

A pointer in your message is sent to the agent as a footnote: a mark like `[^1]` where it stood, and under the message where it points. What the footnote carries depends on the pointer and on what the agent already has in hand. isorite remembers, for each note, the version the agent was last given whole in this session.

**A whole note** (from the Atlas): the first time, the note itself. After that, if the note is as the agent last saw it, a line saying so; if it changed, only what changed, as a diff with its line numbers. If the change is most of the note, the note whole again.

**A passage of a note** (selected, then Ctrl+[): the words you chose, with the note's path and lines. If the agent has not seen the note, the three lines either side of the passage come with it (each cut at about 200 characters) and the note's length. If it has, a line saying the note is unchanged, or what changed in it.

**A passage of code, a folder, or a passage of the agent's own answer**: as before, the path and lines and the words quoted, or the folder's path. The agent reads the file or the folder if it needs more.

**Reading again.** If the agent reads a note whole that it already has and that has not changed, it is told so in a line instead of being sent the note again. A note it changes itself stays counted as seen, since it knows what it wrote.

**After compaction.** When the session is compacted, automatically or with `/compact`, what the summary replaced is no longer in the agent's hands, so those notes are forgotten too: the next pointer to one sends it whole.

Earlier turns are never rewritten. The part of each request that repeats the last one stays the same, which is the part a provider can serve from its cache at a lower price. Pointing at one note over twenty turns of appending to it now sends less than half the input it did; `node bench/tokens/sessions.ts` in isorite's repository measures it.

An agent of your own, over MCP, is given the footnotes as you copy them (Ctrl+]) and keeps its own context.

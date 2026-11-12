---
type: Concept
title: The Agent pane
tags: [agents, panes]
description: The pane where an agent works in your base, and the way of working isorite asks of it.
---

isorite has an agent of its own, which needs only a model's key; the one you already use connects over MCP: see [your own agent](/agents/your-own-agent.md "uses"). The pane shows the session, and isorite asks of the agent a way of working: cite the notes in the sentence, ask a question back rather than supply what you don't know, offer your own words rather than write over yours.

The agent has your base as tools: it searches the notes, reads them, follows their links, and answers with links to the notes it used. What it reads lights on the Atlas, and once a turn is over, the notes it drew on stand under its reply.

Ask in the box at the foot of the pane. Enter makes a new line; Ctrl+Enter (Cmd+Enter on a Mac) sends, and on a phone the send button does. While the agent works, sending queues your message for when it would stop, and Ctrl+Shift+Enter (or Steer now) puts it in after the step running now. Drag the box's top edge to make it taller, or focus it and use the arrow keys (Home lets it size itself again); this browser remembers the height. Maths (`$…$`, `$$…$$`, `\(…\)`, `\[…\]`) and code fences are shown rendered in a strip under the box while you write them, and your message reads rendered in the session, as the agent's replies do. Notes you give it stand in your message as [pointers](/agents/give-it-notes.md "see also"). What each pointer sends, and why a note it already has is not sent again, is in [what a pointer sends](/agents/what-a-pointer-sends.md "see also"). A picture you paste or drop in the box goes with the message if the model sees pictures (png, jpeg, gif or webp, up to 5 MB); where it does not, the thumbnail says so.

**What it has in hand.** The gauge by the box shows how full its context is, and beside it what the session has cost so far (where the model has no price, as a local one, only the gauge). Click it for the Context view, a column in layers: isorite's instructions and tools, the notes, the conversation, and the room left. On the Atlas, the context switch marks what the session gave, read and changed.

**Making room.** When the session nears the model's window, the agent summarises the earlier turns before the next prompt and keeps the recent ones as they were. Type `/compact` to do it now; words after it say what the summary should keep (`/compact keep the decisions about units`). The session then has a line saying it was compacted and how many tokens it freed, with the summary folded under it, and the gauge drops. It is a command of the pane, so it wins over a skill named compact. An agent of your own, over MCP, keeps its own context.

**What it does.** It may change your notes, and [its words are marked](/editing/every-change-is-kept.md "see also"). It builds [artifacts](/agents/artifacts.md "see also"). How it should work in your base is [AGENTS.md](/agents/agents-md.md "see also"); what it does on request is [skills](/agents/skills.md "see also"). What it may do in the project around the base is set by the [switches](/general/the-switches.md "see also").

**How it reads you.** isorite keeps no score of you apart from your notes. The agent reads where you stand from your words, your [questions and problems](/atlas/questions-and-problems.md "see also") open and solved, and asks before it explains. Where your understanding stops, it offers a question to keep or a problem to try. It checks a problem's solution rather than solving it.

The sessions are under the agent's menu, Sessions: each says when it began beside what it was first asked, and when it was last added to.

On this site no agent can be attached, and the finder stands in: it answers with the notes that match what you ask, and says so.

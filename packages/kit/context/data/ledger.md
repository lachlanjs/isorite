---
type: Concept
title: Stream processing learning ledger
description: What I want from stream processing, where I stand on each part, and what each term means here.
---

Goal (nebulous): to follow what our pipeline does when events arrive late. Met when: I can say what a change to a window or a key will do before I make it.

Levels: - unassessed, 0 unaware, 1 heard of it, 2 follows it when shown, 3 does it with help, 4 does it alone on a new case twice, once cold, 5 can teach it.

| Concept | Level | Passes | Checked | Due |
|---|---|---|---|---|
| [Streams and event time](/learning/stream-processing/streams-and-event-time.md) | 4 | 3 | 2026-11-06 | 2026-11-13 |
| [Windows and lateness](/learning/stream-processing/windows-and-lateness.md) | 3 | 1 | 2026-11-12 | 2026-11-13 |
| [Keyed state](/learning/stream-processing/keyed-state.md) | 2 | 0 | 2026-11-12 | 2026-11-13 |
| Partitioning and keys | - | 0 | | |
| Exactly once | - | 0 | | |

## Glossary

- **Event time**: when the event happened, as the event says. Not when it arrived (processing time).
- **Window**: the span of event time whose events are counted together.

## Open

- [Why does a late event reopen a window?](/learning/stream-processing/why-does-a-late-event-reopen-a-window.md)

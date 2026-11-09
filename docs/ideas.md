# Ideas for later

Things worth doing that are not planned. Each says why, and what to check first.

## Extensions for VS Code and Obsidian (2026-11-09)

A way to reach people who already keep notes next to code or an agent, if the integration is there.

- **VS Code first.** MCP is native there, so the extension can write the config; a webview shows the Atlas and the agent pane from the local server; a command adds the editor selection as a pointer (a pointer already carries a file and lines). Small, and no second UI to keep.
- **Obsidian after that, and only on evidence of demand.** The closest users, but it already has a graph view and AI plugins, isorite links are Markdown (`[text](/path.md)`) rather than wikilinks, and a plugin would be an iframe onto the local server (not on mobile).
- **Cost:** a release and upkeep for each; neither removes installing isorite unless the extension starts the server.
- **Check first:** open the example base as an Obsidian vault and as a VS Code folder, and fix what breaks (link style, `.isorite/`, embeds).
- **When:** after the phone's Stage 1 and the agent pane cleanup.

## Merging a base through git: a merge view, and journals that follow a move (2026-11-09)

From `scripts/merge-sim.ts` (two people edit the tutorial base, then merge; run it with `node scripts/merge-sim.ts [--rebase]`). What is already done: the hidden list is merged by lines (`.isorite/hidden.txt`), and a note git left in conflict is marked in the list and on the Atlas and says so when opened. Two things were left, because neither is needed until a real conflict shows it is.

- **A merge view for a conflicted note.** A screen showing "yours" and "theirs" to pick or combine, in place of editing the markers by hand: a small merge manager. The case it would help most is two people adding different tags to one note, where the frontmatter breaks and the note shows without its title and tags until mended (a union of the tags would settle it); the same paragraph edited twice, and one person deleting what the other edited, are what git's own output serves as well. Could reuse the paragraph merge the editor has (`app/src/lib/merge.ts`). **Check first:** how often real conflicts happen, before the screen is built. A git merge driver for notes (`merge.isorite.driver`) would do the same without a screen, but each clone must register it.
- **Journals that follow a move across a merge.** A note's history is `.isorite/journal/<id>.jsonl` and moves with it. One note moved on one side and edited on the other is followed by git. A folder moved (or one note or folder renamed two ways) leaves its journals in rename-against-edit conflicts, which `merge=union` cannot settle; the notes come through, but their history can be at the old path or in conflict. A repair on open would match a journal with no note, and a note whose journal is elsewhere, by comparing the note's text with the last entry in the journal. **Cheaper first step:** a check that only reports the orphaned journals after a merge. **Matters if:** the history on the timeline is relied on after a merge.

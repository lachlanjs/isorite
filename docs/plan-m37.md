# M37: fixes from testing isorite

The owner's notes from using isorite (6 November 2026, after 0.18.0). Two lists: the fixes and small features to do soon (this milestone), and the bigger directions (kept here so they are not lost; each gets its own plan when it is taken up).

## Fixes and small features, ASAP

1. Clicking in the text of a note makes links and maths expand, which reflows the whole line and is hard on the eyes to track.
2. Notes cannot be moved to the outermost level (outside any folder).
3. Code and web satellites can get very long on a note in the Atlas and hide other things; they need a better UI.
4. Resolved problems and questions do not show. They should, with a green icon instead.
5. A small button in the Atlas to recompute the layout, rather than refreshing the page.
6. The note text column should be wider.
7. Artifacts cannot be hidden or revealed.
8. Back, when navigating between notes, could be better.
9. Renaming a base is missing.
10. The list view of notes shows no hierarchy; it should indent.
11. The numbers for the width of Atlas routes are not intuitive; probably hide them.
12. Better table editing controls: insert and delete rows and columns, and either WYSIWYG or source, optionally.
13. Tables should scroll horizontally rather than squeeze into their columns.
14. Rename the "Iso" pane to "Agent" pane.
15. Where the project is `project/notes/.isorite/...`: running `isorite` in `project/` creates `notes/.isorite` with `notes/opencode.json` inside, which suggests agents should be started in `notes/`, not the project. It may be better to have `project/.isorite` and `project/opencode.json`, without a separate `notes/` directory.

## Bigger directions (not in this milestone)

- A promo web page for isorite.
- Ctrl/Cmd+K search in the Atlas: exact and vector/semantic, highlighting what is found on the map. Parts of it could be reused to show what the agent accesses.
- Clearer handling of several knowledge bases: visible feedback when the agent retrieves from the local or the global one; separate them more clearly (for example both titles in the note pane header, and the global one glowing when something happens there).
- Using Obsidian, Confluence and other knowledge-base formats directly, and moving or reorganising between them and isorite.
- How isorite could give visual clarity to software-factory setups with large skill bases and sprawling documentation, and whether its compatibility could extend to that.

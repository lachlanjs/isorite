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

## Done, on branch m37-testing-fixes

Items 1 to 14 are done, one commit each. How, where it is not plain:

- 1: a link, maths, code, emphasis or picture shows its source only while the cursor is in it, not along the whole line. Headings, lists and rules still show theirs by the line.
- 2: in the list of notes a note could already be pulled to the top of the base. On the Atlas a note let go outside any folder now goes there (it was dropped nowhere). Not covered by a browser test.
- 4: resolved questions stay on the Atlas, in green like solved problems (problems already did).
- 7: artifacts have their own Atlas switch (Alt+A); the pictures switch (Alt+I) now covers the other files.
- 8: Back and Forward buttons in the Note pane follow the notes opened in this page. The browser's own Back is as it was; I did not find or change anything in it.
- 9: a base is shown by a title of its own (kept in the bases file beside its name). The name stays as the address and what agent sessions know it by; renaming that live would touch every open session.
- 12: a bar above a table's source (insert or delete a row or column). No WYSIWYG editing of the cells.
- 3: at most two columns of satellites (six places at the fewest), the last saying how many more; pressed, all of them.
- 14: the pane is called Agent in the app, its menus and the README; internal names (`iso`) and history notes are unchanged.

### Item 15, found

Config files (`.mcp.json`, `opencode.json`) go to the repository's top, found by `.git`. When `project/` is not a git repository, the base's own folder (`notes/`) is taken as the project, so they land in `notes/` and the command written is `isorite mcp .`, which is why agents seem to need starting in `notes/`. In a git repository they go to `project/` with `isorite mcp notes`. Offered separately by `isorite` in a folder with no base: `notes/` is made inside it. Options: (a) when run with no repository, treat the folder `isorite` was run in as the project, writing `project/opencode.json` and `isorite mcp notes`; (b) make the base `project/` itself (`project/.isorite`), which mixes notes with code. Decided (option 1): done. With no repository, a base named `notes` has its config in the folder that holds it (the project), written as `isorite mcp notes`, and agents the pane starts run there. Any other base keeps its config in its own folder, and never a home folder or the root. Considered and left for its own milestone: the whole base inside `project/.isorite/`, which would change the format and has costs (dot-folders skipped by ripgrep and Obsidian, the nested `.isorite/`, migration).

## Bigger directions (not in this milestone)

- A promo web page for isorite.
- Ctrl/Cmd+K search in the Atlas: exact and vector/semantic, highlighting what is found on the map. Parts of it could be reused to show what the agent accesses.
- Clearer handling of several knowledge bases: visible feedback when the agent retrieves from the local or the global one; separate them more clearly (for example both titles in the note pane header, and the global one glowing when something happens there).
- Using Obsidian, Confluence and other knowledge-base formats directly, and moving or reorganising between them and isorite.
- How isorite could give visual clarity to software-factory setups with large skill bases and sprawling documentation, and whether its compatibility could extend to that.

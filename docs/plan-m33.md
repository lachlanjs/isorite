# M33 and M34: handling folders and notes by hand, the pulse, the code reader

What was built after 0.16.0, from Lachlan's use of isorite at work.

## M33: notes and folders handled by hand

- Press and hold on a note, or on a folder's heading in the list: three tags appear. Move (blue) picks the item up after a moment on the tag, and it is dropped on a folder. Delete (rose) tints the item and asks first, naming the notes that link to it. Send (gold) puts it in Iso's tray. Gold is the one place it stands for something you do (`docs/taste.md`). A mouse pulling a row sideways carries it at once. The list scrolls near its edges while carrying. `app/src/lib/gesture.svelte.ts` is the whole gesture; touch holds still to start, and a moving finger scrolls.
- On the Atlas the same tags stand at the point held, on a note or a folder (its title, or a closed folder's block), with a mouse (`HoldTags.svelte`, the same `Gesture`). Move carries it to the deepest folder of the map under the pointer (dashed outline); delete asks in a panel on the map; send is `give()`. A mouse pulling a note sideways still carries it to Iso's pane, as before; holding a note no longer gives it at once (the gold tag does). A finger on the Atlas still holds for the offer menu.
- Folders: `Files.rmdir`, `engine.deleteFolder` (empty only; its empty folders inside go too), `engine.moveFolder` (the notes move one by one so links follow; refused where the folder holds anything that is not a note, or into itself), `POST /api/folder/delete` and `/api/folder/move`. A rename is a move within the same parent: a double click on the folder's name on the Atlas or in the list, or "rename" on its heading.
- The lit links of a chosen note are no longer dashes running along: each is a plain line with a pulse of light (a bright head, a fading tail, in the kind's colour) running from what is required to what requires it, every 2.2 s; a link both ways, and a "uses", stand still.
- Lyth Mono (hinted, subset to Latin, Greek and the symbols the interface draws; OFL) replaces Ioskeley Mono and Departure Mono in the app. See `docs/taste.md` for why the kit's artifact theme keeps Ioskeley.
- The Atlas: its switches wear their kind's colour while off, are wider from a pane 520 px wide, and say their names from 760 px (container queries, so it is the pane's width that decides). An empty folder keeps the room of a note and a large ellipsis. The dots are the map's own lattice, half as strong. A new link is a pulse of light along the route it is drawn along at rest; a pointed note's links fill with a blue pulse over them; a folder lit as "required here" or "builds on" takes a pulse round its edge in the tone's colour.

## M34: reading code in full, and a note from a link

- `engine.code(href, full)` and `GET /api/code?full=1` give the whole file with the lines a link names marked (the file is shown even where the symbol is not found). The page `#/code/<path>?at=<anchor>` (`CodeReader.svelte`) shows it with line numbers and colour; a click on a number marks the line (shift: a range) and "copy link" gives the matching `code:path#L5-L9`. It opens from Ctrl or Cmd and a click on a code link in a note (plain or an embed: the link control has no kind for `code:`, so the editor finds it itself), and from the file name in the header of code shown in place.
- Typing `[[a new idea` offers "a new note in <folder>" last in the list: taken, it makes the note beside the one being written (the top for a draft) and puts the link in. The title is the typed name as words.

## Left

- The Atlas's code satellites do not open the reader. A finger on the Atlas has no tags.
- A folder holding pictures or other files cannot be moved; a folder holding notes cannot be deleted (it is refused, with the count).
- Terminal agents: a line at the start of the next isorite tool result saying what was received, and whether an omp extension can show a live notice (not read yet).
- The Atlas's touch pan is still one finger; two-finger pan and zoom would leave one finger for holding and carrying.

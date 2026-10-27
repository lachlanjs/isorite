---
type: Concept
title: Diagrams and code
description: A fenced block of code is coloured by its language, one written in Mermaid is drawn as a diagram, and a picture is shown in place.
---

Name a fenced block's language after its opening fence, and its code is coloured by it:

```python
def leapfrog(x, v, a, dt):
    """One step: half a kick, a drift, half a kick."""
    v = v + 0.5 * dt * a(x)
    x = x + dt * v
    return x, v + 0.5 * dt * a(x)  # the second half kick
```

In the Note pane's settings, *the code* chooses colour, or ink as in print: keywords bold and comments faint.

A block whose language is `mermaid` is drawn as a diagram, and stays Mermaid in the file:

```mermaid
flowchart LR
  note[A note] -->|requires| other[The notes it rests on]
  note -->|uses| tool[What it uses]
  other --> atlas[(The Atlas)]
```

Put the cursor in it to change it: its source shows, and the diagram beneath it is drawn again as you type. A diagram that can't be drawn says why, in the line and column of its source. Maths in a label goes between double dollars, as Mermaid has it:

```mermaid
flowchart TB
  m["$$\mathcal{M}$$, a manifold"] -->|"$$T_p\mathcal{M}$$ at each point"| t["$$T\mathcal{M}$$, its tangent bundle"]
```

Every kind of diagram Mermaid draws is drawn: [flowcharts, sequences, states, classes, timelines and more](https://mermaid.js.org/intro/ "see also"). [Iso](/iso/iso.md "see also") draws one where a picture helps, or when you ask it for one.

## Pictures

Paste a picture into a note, or drop one on it. isorite asks for its name, and what it shows, then saves it in a folder named for the note and shows it where you pasted it: `![the player at rest](hitboxes/player-idle.png)`. What it shows is what [Iso](/iso/iso.md "see also") reads of it, since Iso can't see the picture. The same picture pasted twice is one file.

To show a picture that's in the notes already, type `[[!` and choose it: each is listed with a small copy of itself. Any number of notes can show the same picture. `"left"` after its path sets it at the left, with the text beside it: `![a map](map.png "left")`.

A picture from your code's repository is shown with `code:`, as a [code link](/out-of-the-base/web-and-code-links.md "see also") is: `![the player](code:assets/player.png)`. One whose file is gone is struck through.

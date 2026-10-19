# isorite

An agentic harness for understanding: your notes as a knowledge base, an Atlas of them, Iso (an agent that reads them and writes in them only where you ask, and only what you keep), study with exercises Iso marks, and the terminal, where an agent writing code has your notes beside it.

Needs Node 24 or later. For the terminal, OpenCode 2: `npm i -g @opencode/cli`.

```sh
npm install -g isorite
isorite --tutorial          # the tutorial: the terminal's tour, and the browser's beside it, on an example base
```

On your own notes, a folder of Markdown files (empty is fine):

```sh
isorite study init <notes>  # the study base beside it: journals of every change, your record, exercises
isorite serve <notes>       # the browser, at http://localhost:4767/; set Iso's provider key behind the logo
cd <your code> && isorite term <notes>   # OpenCode here, with the notes beside it
isorite model               # optional: search by meaning (fetches a 34 MB model, once)
```

The tutorial in a browser alone: https://lachlanjs.github.io/isorite/

Source, and what is on disk: https://github.com/lachlanjs/isorite

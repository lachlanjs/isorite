# isorite

An agentic harness for understanding: your notes as a knowledge base, an Atlas of them, Iso (an agent that reads them and writes in them only where you ask, and only what you keep), study with exercises Iso marks, and the terminal, where an agent writing code has your notes beside it.

Needs Node 24 or later. For the terminal, OpenCode 2: `npm i -g @opencode/cli`.

```sh
npm install -g isorite
isorite guide               # the guide: a knowledge base about isorite, with things to do, in ~/isorite-guide
```

On your own notes, a folder of Markdown files (`isorite new <notes>` starts one):

```sh
isorite serve <notes>       # the browser, at http://localhost:4767/; set Iso's provider key behind the logo
cd <your code> && isorite term <notes>   # OpenCode here, with the notes beside it
isorite model               # optional: search by meaning (fetches a 53 MB model, once)
```

Setting it up, at work too (a company's gateway, a client certificate, a proxy): `docs/setup.md` in this package.
When something fails, `isorite doctor` says what to change; `isorite doctor --report` gives it as one block, its
secrets hidden, to paste to someone helping. For an AI helping you: `isorite help setup`.

The guide in a browser alone: https://lachlanjs.github.io/isorite/

Source, and what is on disk: https://github.com/lachlanjs/isorite

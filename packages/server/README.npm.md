# isorite

An agentic harness for understanding: your notes as a knowledge base, an Atlas of them, questions and problems of your own, and the agent you already use (Claude, Codex, OpenCode, omp, Hermes, or any that speaks ACP) attached to them: it gets the notes over MCP, and its session shows in Iso's pane over ACP. Or isorite's own agent, built in, with a key of your own or a company gateway.

Needs Node 24 or later.

```sh
npm install -g isorite
isorite guide               # the guide: a knowledge base about isorite, with things to do, in ~/isorite-guide
```

On your own notes, a folder of Markdown files (`isorite new <notes>` starts one). They're drawn as you write them: maths, code coloured by its language, and Mermaid diagrams.

```sh
isorite serve <notes>       # the browser, at http://localhost:4767/; attach your agent from Iso's pane
isorite acp --agent "<your ACP agent's command>"   # from an ACP front end (Toad, Zed), in the project's folder
isorite doctor <notes>      # checks the setup, and offers the project's MCP config for your agent's own terminal
isorite model               # optional: search by meaning (fetches a 53 MB model, once)
isorite memory              # optional: the agent's memory, a base of its own lent to every session
```

Using it beside your agent: `docs/terminal.md` in this package; setting it up, at work too: `docs/setup.md`. When something fails, `isorite doctor` says what to change; `isorite doctor --report` gives it as one block, its secrets hidden, to paste to someone helping. For an AI helping you: `isorite help setup`.

The guide in a browser alone: https://lachlanjs.github.io/isorite/

Source, and what is on disk: https://github.com/lachlanjs/isorite

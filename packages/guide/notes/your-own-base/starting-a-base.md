---
type: Concept
title: Starting a base
description: Installing isorite, making a base, and attaching your agent.
---

isorite runs on your own machine, with Node 24 or later:

```sh
npm install -g isorite
cd ~/code/my-project
isorite
```

`isorite` opens the project's base in the browser. With none it offers to make a `notes/` folder, and from any other folder it lists the bases it knows and the guide. A folder of Markdown you have already is a base as it is.

isorite needs an agent. With none, Iso's pane offers its own, built in: give it a model's key (OpenRouter, Anthropic, OpenAI and others) or your company's gateway. Or attach the agent you already use, set up as it is for its own terminal, with its own key and model: from Iso's pane, choose one, or give isorite's MCP to the agent in its own terminal: see [your own agent](/terminal/your-own-agent.md "see also"). `isorite doctor` checks what isorite needs, and offers the project's MCP config. The steps are in the guide on GitHub: [setting up](https://github.com/lachlanjs/isorite/blob/main/docs/setup.md).

`isorite guide` (or choosing the guide from the list `isorite` shows) puts this guide in a folder of your own, where your own agent can be attached.

Then [keep it well](/your-own-base/keeping-a-base-well.md "see also").

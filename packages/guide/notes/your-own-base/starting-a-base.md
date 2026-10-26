---
type: Concept
title: Starting a base
description: Installing isorite, making a base, and giving Iso a model.
---

isorite runs on your own machine, with Node 24 or later:

```sh
npm install -g isorite
isorite new ~/notes/physics
isorite serve ~/notes/physics
```

`isorite new` makes an empty base, and `isorite serve` opens it in the browser. A folder of Markdown you have already is a base as it is.

For Iso, give isorite a provider and its key, in Iso's settings (the icon at the right of Iso's pane head): OpenRouter, with a key pasted or made by signing in, or a gateway of your own, with its address, key, headers and certificate. It is checked there before it is kept, and in use at once. `isorite doctor` checks it from the terminal too. The steps are in the guide on GitHub: [setting up](https://github.com/lachlanjs/isorite/blob/main/docs/setup.md).

`isorite guide` puts this guide in a folder of your own, where Iso is the real model.

Then [keep it well](/your-own-base/keeping-a-base-well.md "see also").

# Ideas for later

Things worth doing that are not planned. Each says why, and what to check first.

## Extensions for VS Code and Obsidian (2026-11-09)

A way to reach people who already keep notes next to code or an agent, if the integration is there.

- **VS Code first.** MCP is native there, so the extension can write the config; a webview shows the Atlas and the agent pane from the local server; a command adds the editor selection as a pointer (a pointer already carries a file and lines). Small, and no second UI to keep.
- **Obsidian after that, and only on evidence of demand.** The closest users, but it already has a graph view and AI plugins, isorite links are Markdown (`[text](/path.md)`) rather than wikilinks, and a plugin would be an iframe onto the local server (not on mobile).
- **Cost:** a release and upkeep for each; neither removes installing isorite unless the extension starts the server.
- **Check first:** open the example base as an Obsidian vault and as a VS Code folder, and fix what breaks (link style, `.isorite/`, embeds).
- **When:** after the phone's Stage 1 and the agent pane cleanup.

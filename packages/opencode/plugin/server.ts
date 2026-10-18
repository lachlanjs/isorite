// isorite's server half: the knowledge base as tools, the isorite server's own (Iso's look-ups, and proposing a
// change to a note), so that what the agent looks up is drawn on the Atlas in the browser as Iso's path is, and
// what it would change in a note waits for the person to keep it. Edits anywhere else are OpenCode's own.
//
// A turn is told to the server when a prompt is sent, and ended when the session has settled. (A plugin's event
// stream carries no session status.)

import { Plugin } from "@opencode/plugin";
import * as Isorite from "./isorite.ts";
import { noteOf } from "./notes.ts";

export const AGENT = "opencode";
const SETTLE = 500;

export default Plugin.define({
  id: "isorite",
  async setup(ctx) {
    const [tools, base] = await Promise.all([Isorite.get<Isorite.ToolDef[]>("/api/agent/tools"), Isorite.get<{ notes: string | null }>("/api/agent/base")]);
    /** What the person last asked in each session: a proposal says what it answers. */
    const asked = new Map<string, string>();

    await ctx.tool.transform((editor) => {
      for (const { function: tool } of tools) {
        editor.add({
          name: tool.name,
          description: tool.description,
          // Each look-up is a call of its own, so the transcript shows each step, as the board does.
          options: { codemode: false },
          input: tool.parameters as never,
          output: undefined,
          execute: async (args, context) => {
            const { text } = await Isorite.post<{ text: string }>("/api/agent/look", { agent: AGENT, session: context.sessionID, tool: tool.name, args, asked: asked.get(context.sessionID) ?? "" });
            return { content: text };
          },
        });
      }
    });

    // The agent is told where the notes are, and that they are changed only by proposing.
    if (base.notes) {
      const notes = base.notes;
      await ctx.session.hook("context", (request) => {
        request.system.push({
          type: "text",
          text: `The person's knowledge base is the folder ${notes}: notes in Markdown with YAML frontmatter, linked to each other. Look things up in it with brief_base, search_notes, outline_note and read_note rather than reading its files. Never edit or write its files: change a note with propose_note_edit or propose_note_write, which wait for the person to keep the change. Your edits to code and other files are yours to make as usual.`,
        });
      });
      // A write or an edit to a note anyway is made a proposal of the same change.
      await ctx.tool.hook("execute.before", (event) => {
        if (event.tool !== "write" && event.tool !== "edit") return;
        const input = event.input as Record<string, unknown>;
        const note = noteOf(notes, ctx.location.directory, input.path);
        if (!note) return;
        const { path: _, ...rest } = input;
        event.tool = event.tool === "write" ? "propose_note_write" : "propose_note_edit";
        event.input = { note, ...rest };
      });
    }

    const status = (session: string, busy: boolean) =>
      Isorite.post("/api/agent/status", { agent: AGENT, session, busy }).catch(() => undefined);
    await ctx.session.hook("prompt", ({ sessionID, prompt }) => {
      asked.set(sessionID, prompt.text.trim());
      void (async () => {
        await status(sessionID, true);
        // The prompt is taken up just after this hook; waiting at once could find the session not yet busy.
        await new Promise((r) => setTimeout(r, SETTLE));
        await ctx.session.wait({ sessionID }).catch(() => undefined);
        await status(sessionID, false);
      })();
    });
  },
});

// isorite's server half: the knowledge base as tools, the isorite server's own (Iso's look-ups), so that what
// the agent looks up is drawn on the Atlas in the browser as Iso's path is. A turn is told to the server when a
// prompt is sent, and ended when the session has settled. (A plugin's event stream carries no session status.)

import { Plugin } from "@opencode/plugin";
import * as Isorite from "./isorite.ts";

export const AGENT = "opencode";
const SETTLE = 500;

export default Plugin.define({
  id: "isorite",
  async setup(ctx) {
    const tools = await Isorite.get<Isorite.ToolDef[]>("/api/agent/tools");
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
            const { text } = await Isorite.post<{ text: string }>("/api/agent/look", { agent: AGENT, session: context.sessionID, tool: tool.name, args });
            return { content: text };
          },
        });
      }
    });

    const status = (session: string, busy: boolean) =>
      Isorite.post("/api/agent/status", { agent: AGENT, session, busy }).catch(() => undefined);
    await ctx.session.hook("prompt", ({ sessionID }) => {
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

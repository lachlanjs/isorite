// The base's tools for a pi agent (M35): the same ones isorite's MCP server gives any agent, written once in the engine
// (`agentTools`, `agentLook`), here as pi's `AgentTool`s. Calling one is a look-up the Atlas draws, as over MCP.

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { Api } from "@isorite/engine";

export type ToolsApi = Pick<Api, "agentTools" | "agentLook">;

/** `who` names the agent and session as the base knows them; `asked` is what is being asked now, for a change the agent makes. */
export async function isoriteTools(api: ToolsApi, who: { agent: string; session: string }, asked: () => string): Promise<AgentTool[]> {
  const defs = await api.agentTools();
  return defs.map(({ function: f }): AgentTool => ({
    name: f.name,
    label: f.name,
    description: f.description,
    parameters: f.parameters,
    // Failure is thrown, as pi asks: the model sees it as an error result.
    execute: async (_id, params) => {
      const now = asked();
      const { text } = await api.agentLook({ ...who, tool: f.name, args: params as Record<string, unknown>, ...(now ? { asked: now } : {}) });
      return { content: [{ type: "text", text }], details: undefined };
    },
  }));
}

/** What a call acted on, in a line: a query, a note, a path, a command. */
export function titleOf(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  for (const k of ["query", "note", "id", "path", "command", "question", "text"]) if (typeof a[k] === "string" && a[k]) return String(a[k]).slice(0, 200);
  const first = Object.values(a).find((v) => typeof v === "string" && v);
  return typeof first === "string" ? first.slice(0, 200) : "";
}

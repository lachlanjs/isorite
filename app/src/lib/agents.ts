// The terminal agents isorite knows by name. Another is shown as it names itself.

const NAMES: Record<string, string> = { opencode: "OpenCode", "claude-code": "Claude Code", pi: "Pi" };

/** An agent's name as people say it, from its own (`opencode`) or from a journal's who (`agent:opencode`). Empty when it is not an agent. */
export function agentName(name: string | null | undefined): string {
  const bare = name?.startsWith("agent:") ? name.slice("agent:".length) : name?.includes(":") ? "" : (name ?? "");
  return bare ? (NAMES[bare] ?? bare) : "";
}

// pi's own tools for the project's files and shell, behind switches (M35 step 5). Off unless chosen: the agent has the
// base's tools alone. `read` gives it to read the project (read, grep, find, ls); `write` adds edit and write; `shell`
// adds bash. What is left out is not there to call. What is there is checked before it runs (`pathGuard`): a file tool
// reaches only inside the project folder, and writes never reach its .git. Bash cannot be checked by its path: with
// `shell` on, the agent can do whatever the server's user can, files included; that is what the switch says.

import { isAbsolute, relative, resolve, sep } from "node:path";
import { createBashTool, createEditTool, createFindTool, createGrepTool, createLsTool, createReadTool, createWriteTool } from "@earendil-works/pi-coding-agent";
import type { AgentTool } from "@earendil-works/pi-agent-core";

export type Files = "off" | "read" | "write";
export interface Reach { files: Files; shell: boolean }

const READS = ["read", "grep", "find", "ls"];
const WRITES = ["edit", "write"];

export function fileTools(cwd: string, { files, shell }: Reach): AgentTool[] {
  // pi types each tool by its own parameters; the agent takes them as any tool.
  const tools: unknown[] = [];
  if (files !== "off") tools.push(createReadTool(cwd), createGrepTool(cwd), createFindTool(cwd), createLsTool(cwd));
  if (files === "write") tools.push(createEditTool(cwd), createWriteTool(cwd));
  if (shell) tools.push(createBashTool(cwd));
  return tools as AgentTool[];
}

/** A reason to refuse the call, or undefined to let it through. Anything that cannot be checked is refused. */
export function pathGuard(cwd: string): (call: { tool: string; args: unknown }) => string | undefined {
  const root = resolve(cwd);
  return ({ tool, args }) => {
    if (![...READS, ...WRITES].includes(tool)) return undefined;
    const given = (args as { path?: unknown } | null)?.path;
    if (given === undefined && (tool === "ls" || tool === "grep" || tool === "find")) return undefined; // the project folder itself
    if (typeof given !== "string" || !given) return `${tool} needs a path inside the project`;
    const target = isAbsolute(given) ? resolve(given) : resolve(root, given);
    const inside = relative(root, target);
    if (inside.startsWith("..") || isAbsolute(inside)) return `${given} is outside the project folder`;
    if (WRITES.includes(tool) && inside.split(sep).includes(".git")) return `${tool} does not reach .git`;
    return undefined;
  };
}

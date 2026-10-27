// Running isorite again, as itself: from npm or a checkout, Node with isorite's script; as the single executable
// (M21), the executable alone, which is Node with isorite inside and puts its own path first among the arguments.

import { isSea } from "node:sea";

/** Whether this is the single executable. */
export const single = (): boolean => { try { return isSea(); } catch { return false; } };

/** What runs isorite again with `args`, given the script (npm's or a checkout's) to run when not single. */
export function self(script: string, args: string[], execArgv: string[] = process.execArgv): { command: string; args: string[] } {
  return { command: process.execPath, args: single() ? args : [...execArgv, script, ...args] };
}

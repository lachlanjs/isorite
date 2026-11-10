// Finding a program on PATH, for the setup wizard's detection of the agent harnesses on this machine.

import { existsSync, statSync } from "node:fs";
import { delimiter, join } from "node:path";

/** The first file called `name` on PATH (with the extensions Windows tries), or null. */
export function onPath(name: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const exts = process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")] : [""];
  for (const dir of (env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const ext of exts) {
      const file = join(dir, name + ext);
      try { if (existsSync(file) && statSync(file).isFile()) return file; } catch { /* not readable: not there */ }
    }
  }
  return null;
}

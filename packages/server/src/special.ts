// The two bases isorite keeps beside a person's own, in its data folder (docs/format.md): the global base, notes that
// hold across bases, and the skills base, the skills the agent loads, opened as notes. This file makes the folders
// and gives the skills base its files: the person's skills folder, with the skills isorite ships beside them in a
// folder that cannot be written.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AGENTS_FILE } from "@isorite/core";
import { EngineError, type FileInfo, type Files } from "@isorite/engine";
import { NodeFiles } from "./nodefiles.ts";
import { BUILTIN_SKILLS } from "./pi/skills.ts";

/** The folder of the skills isorite ships, as the skills base shows it: an island of its own, read only. */
export const BUILT_IN = "built-in";

/** What the global base is for, in its AGENTS.md: read with brief_base, and the first line is what other bases' briefs say of it. */
export const GLOBAL_AGENTS = `# Knowledge that holds across bases: conventions, a glossary, the people you work with.

This is the global base. Every base can link to its notes, and the agent can look in it and write in it, giving \`base: "global"\`.

## What belongs here

- Conventions you want in every base: how you name things, how you write, what you never do.
- A glossary: terms you use the same way everywhere.
- People: who they are, what they work on, how they like to be reached.

What belongs to one base stays in it. Keep a note here only when two bases would want it.

## How to link to it

From a note in any base: \`[naming](global:conventions/naming.md "see also")\`. The note's id follows \`global:\`, and \`.md\` ends it.
`;

/** The global base's folder, made with its AGENTS.md the first time; an AGENTS.md the person has written is left as it is. */
export function prepareGlobal(dir: string): void {
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, AGENTS_FILE))) writeFileSync(join(dir, AGENTS_FILE), GLOBAL_AGENTS);
}

/** The person's skills, with the built-in ones in a folder of their own that no write reaches. */
export class SkillsFiles implements Files {
  readonly #user: NodeFiles;
  readonly #built: NodeFiles;
  readonly #has: boolean;

  constructor(user: string, builtin = BUILTIN_SKILLS) {
    mkdirSync(user, { recursive: true });
    this.#user = new NodeFiles(user);
    this.#built = new NodeFiles(builtin);
    this.#has = existsSync(builtin);
  }

  /** The files port and the path inside it for a path of the base. */
  #at(path: string): [NodeFiles, string, boolean] {
    const inside = path === BUILT_IN || path.startsWith(`${BUILT_IN}/`);
    return inside ? [this.#built, path.slice(BUILT_IN.length + 1), true] : [this.#user, path, false];
  }

  #kept(path: string): never {
    throw new EngineError(`${path} is a skill isorite ships and is read only: copy its folder into your skills to change it`, 403);
  }

  async read(path: string): Promise<string | null> { const [f, p] = this.#at(path); return f.read(p); }
  async readBytes(path: string): Promise<Uint8Array | null> { const [f, p] = this.#at(path); return f.readBytes(p); }
  async write(path: string, text: string): Promise<void> { const [f, p, b] = this.#at(path); if (b) this.#kept(path); await f.write(p, text); }
  async writeBytes(path: string, bytes: Uint8Array): Promise<void> { const [f, p, b] = this.#at(path); if (b) this.#kept(path); await f.writeBytes(p, bytes); }
  async append(path: string, text: string): Promise<void> { const [f, p, b] = this.#at(path); if (b) this.#kept(path); await f.append(p, text); }
  async remove(path: string): Promise<void> { const [f, p, b] = this.#at(path); if (b) this.#kept(path); await f.remove(p); }
  async mkdir(dir: string): Promise<void> { const [f, p, b] = this.#at(dir); if (b) this.#kept(dir); await f.mkdir(p); }
  async rmdir(dir: string): Promise<void> { const [f, p, b] = this.#at(dir); if (b) this.#kept(dir); await f.rmdir(p); }

  async list(dir: string): Promise<FileInfo[]> {
    const [f, p, b] = this.#at(dir);
    const own = await f.list(p);
    if (b) return own;
    return dir === "" && this.#has ? [...own.filter((e) => e.name !== BUILT_IN), { name: BUILT_IN, dir: true }].sort((x, y) => (x.name < y.name ? -1 : 1)) : own;
  }
}

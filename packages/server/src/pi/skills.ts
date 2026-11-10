// Skills for isorite's own agent: a folder with a SKILL.md (name and description in its frontmatter, then the body),
// the format Claude Code, pi and agentskills.io share. They come from three places, a later one winning by name:
// the ones isorite ships (packages/server/skills), the person's own (<isorite's data folder>/skills), and the base's
// (<base>/.isorite/skills).
//
// Only the name and description of the skills that are on go in the system prompt; the body is fetched when the agent
// uses the skill (`use_skill`) or the person names it (`/name` at the start of a message). A skill that cannot be read
// is listed with why, never fatal. The agent's tools are the base's, so it cannot read a file by itself: `use_skill`
// is also how it reads the files a skill holds, and it reaches nothing outside the skill's folder.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { AgentTool } from "@earendil-works/pi-agent-core";

export type SkillSource = "built-in" | "yours" | "base";

export interface Skill { name: string; description: string; source: SkillSource; dir: string; file: string }
/** A skill as the settings list it: a skill that could not be read has `error` and no description. */
export interface SkillRow { name: string; description: string; source: SkillSource; enabled: boolean; error?: string }

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_FILE = 200_000;
const MAX_LISTED = 60;

/** Where the skills isorite ships are: beside src/ in a checkout, at the package's root once installed (dist/main.js). */
export const BUILTIN_SKILLS = [join(dirname(fileURLToPath(import.meta.url)), "..", "skills"), join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills")]
  .find((dir) => existsSync(dir)) ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "skills");

export interface SkillDirs { builtin: string; user: string; base: string }

const strip = (text: string): string => text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "").trim();

/** Every skill found, with those that could not be read as rows with an error. Later sources win by name. */
export async function discover(dirs: SkillDirs): Promise<{ skills: Skill[]; broken: SkillRow[] }> {
  // The SDK is a second of loading; only an agent or the settings' list needs it.
  const { loadSkillsFromDir } = await import("@earendil-works/pi-coding-agent");
  const found = new Map<string, Skill>();
  const broken: SkillRow[] = [];
  for (const [source, root] of [["built-in", dirs.builtin], ["yours", dirs.user], ["base", dirs.base]] as const) {
    let folders: string[] = [];
    try { folders = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith(".")).map((d) => d.name).sort(); } catch { continue; }
    for (const folder of folders) {
      const dir = join(root, folder);
      if (!existsSync(join(dir, "SKILL.md"))) continue;
      const fail = (error: string) => broken.push({ name: folder, description: "", source, enabled: false, error });
      let loaded: ReturnType<typeof loadSkillsFromDir>;
      try { loaded = loadSkillsFromDir({ dir, source }); } catch (e) { fail((e as Error).message); continue; }
      const one = loaded.skills[0];
      if (!one) { fail(loaded.diagnostics[0]?.message ?? "it has no name and description"); continue; }
      if (!NAME.test(one.name)) { fail(`"${one.name}" is not a name: small letters, digits and dashes`); continue; }
      if (!one.description.trim()) { fail("it has no description"); continue; }
      let text: string;
      try { text = readFileSync(one.filePath, "utf8"); } catch (e) { fail((e as Error).message); continue; }
      if (!strip(text)) { fail("it has no instructions after its frontmatter"); continue; }
      found.set(one.name, { name: one.name, description: one.description.replace(/\s+/g, " ").trim(), source, dir, file: one.filePath });
    }
  }
  return { skills: [...found.values()].sort((a, b) => a.name.localeCompare(b.name)), broken };
}

/** The body of a skill, without its frontmatter. */
export const bodyOf = (skill: Skill): string => strip(readFileSync(skill.file, "utf8"));

/** The files a skill holds besides its SKILL.md and licence, relative to its folder, for the agent to read with `use_skill`. */
export function filesOf(skill: Skill): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    let entries: import("node:fs").Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { return; }
    for (const e of entries) {
      if (out.length >= MAX_LISTED || e.name.startsWith(".") || e.name === "node_modules") continue;
      const path = join(dir, e.name), rel = relative(skill.dir, path).split(sep).join("/");
      if (e.isDirectory()) { if (depth < 3) walk(path, depth + 1); }
      else if (e.isFile() && rel !== "SKILL.md" && !/^licen[cs]e(\.[a-z]+)?$/i.test(rel)) out.push(rel);
    }
  };
  walk(skill.dir, 0);
  return out;
}

/** A file of the skill, by path inside its folder. Throws, saying why, for anything outside it, or not text, or too big. */
export function readSkillFile(skill: Skill, path: string): string {
  if (!path || isAbsolute(path) || path.includes("\0")) throw new Error(`"${path}" is not a path inside the skill's folder`);
  const root = realpathSync(skill.dir);
  let real: string;
  try { real = realpathSync(resolve(skill.dir, path)); } catch { throw new Error(`the skill ${skill.name} has no file "${path}"`); }
  // A link out of the folder is no more allowed than "..".
  if (real !== root && !real.startsWith(root + sep)) throw new Error(`"${path}" is not a path inside the skill's folder`);
  const stat = statSync(real);
  if (!stat.isFile()) throw new Error(`"${path}" is not a file`);
  if (stat.size > MAX_FILE) throw new Error(`"${path}" is too large to read (${stat.size} bytes; the limit is ${MAX_FILE})`);
  const text = readFileSync(real, "utf8");
  if (text.includes("\0")) throw new Error(`"${path}" is not text`);
  return text;
}

/** The short section of the system prompt: name and description of each skill, and when to fetch one. */
export function skillsSection(skills: Skill[]): string {
  return [
    "<available_skills>",
    "Where a request matches one of these, call use_skill with its name before you answer, and follow what it returns.",
    ...skills.map((s) => `- ${s.name}: ${s.description}`),
    "</available_skills>",
  ].join("\n");
}

/** What `use_skill` returns: the body, then the other files it holds and how to read one. */
export function skillText(skill: Skill): string {
  const files = filesOf(skill);
  return `${bodyOf(skill)}${files.length ? `\n\n[Other files in this skill, read with use_skill (name: ${skill.name}, path):\n${files.map((f) => `- ${f}`).join("\n")}]` : ""}`;
}

/** The skill tool: `use_skill(name)` for the body, `use_skill(name, path)` for a file the skill holds. */
export function skillTool(skills: Skill[]): AgentTool {
  return {
    name: "use_skill",
    label: "use_skill",
    description: "Load a skill: its instructions, or with path a file it holds. Use it where a request matches a skill in available_skills.",
    parameters: { type: "object", properties: { name: { type: "string" }, path: { type: "string", description: "a file of the skill, as its list gives it" } }, required: ["name"] } as never,
    execute: async (_id, params) => {
      const { name, path } = params as { name?: unknown; path?: unknown };
      const skill = skills.find((s) => s.name === name);
      if (!skill) throw new Error(`no skill "${String(name)}" is on; those that are: ${skills.map((s) => s.name).join(", ")}`);
      const text = typeof path === "string" && path ? readSkillFile(skill, path) : skillText(skill);
      return { content: [{ type: "text", text }], details: undefined };
    },
  };
}

/** A message that begins with `/<skill name>` invokes that skill: the skill and what was asked after it, or null. */
export function invoked(text: string, skills: Skill[]): { skill: Skill; request: string } | null {
  const m = /^\/([a-z0-9][a-z0-9-]*)(?:\s+([\s\S]*))?$/.exec(text.trim());
  const skill = m ? skills.find((s) => s.name === m[1]) : undefined;
  return skill ? { skill, request: (m?.[2] ?? "").trim() } : null;
}

/** The skills of one base: where they are read from, and which the base has switched off. */
export class Skills {
  readonly #dirs: SkillDirs;
  readonly #off: () => Promise<string[]>;
  constructor(dirs: SkillDirs, off: () => Promise<string[]> = async () => []) { this.#dirs = dirs; this.#off = off; }

  /** Every skill, as the settings list it. Read again at each call: there is no watcher. */
  async list(): Promise<SkillRow[]> {
    const { skills, broken } = await discover(this.#dirs);
    const off = new Set(await this.#off());
    return [...skills.map((s) => ({ name: s.name, description: s.description, source: s.source, enabled: !off.has(s.name) })), ...broken]
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The skills that are on. */
  async enabled(): Promise<Skill[]> {
    const { skills } = await discover(this.#dirs);
    const off = new Set(await this.#off());
    return skills.filter((s) => !off.has(s.name));
  }
}

/** The directories a base's skills are read from. `data` is isorite's data folder (where the keys are kept). */
export const dirsFor = (notes: string, data: string): SkillDirs => ({ builtin: BUILTIN_SKILLS, user: join(data, "skills"), base: join(notes, ".isorite", "skills") });

// Changing a lens file (docs/lenses.md): an island added, renamed, moved or removed, notes added to or taken from one, the
// lens's title, and what it hides. Pure: the text in, the text out, and a line saying what was done. The file is written
// anew in one plain form (its comments are not kept); the ids in it keep the form they were written in, and a new one is
// written as a link writes it.

import { parse } from "smol-toml";
import { hiddenId, parseLens } from "./lens.ts";

/** One change to a lens. An island is named by its path of names (`Combat > Weapons`), or by its name or title alone
 *  where only one island has it. `at` is a place among its siblings (islands) or in the island's list (notes), from 0. */
export type LensEdit =
  | { action: "title"; title: string; island?: string }
  | { action: "add_island"; island: string; title?: string; notes?: string[]; match?: string[]; at?: number }
  | { action: "remove_island"; island: string }
  | { action: "rename_island"; island: string; name: string }
  | { action: "move_island"; island: string; at: number }
  | { action: "add_notes"; island: string; notes: string[]; match?: string[]; at?: number }
  | { action: "remove_notes"; island: string; notes: string[]; match?: string[] }
  | { action: "set_match"; island: string; match: string[] }
  | { action: "hide"; ids: string[] }
  | { action: "unhide"; ids: string[] }
  | { action: "set_hidden"; ids: string[] | null };

/** What is wrong with a change asked for: the island is not there, the name is taken, the file is not TOML. */
export class LensEditError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) { super(message); this.status = status; }
}

interface RawIsland { name: string; title?: string; notes: string[]; match: string[]; islands: RawIsland[] }
interface RawLens { title?: string; hidden: string[] | null; islands: RawIsland[] }

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : typeof v === "string" ? [v] : []);
const normId = (x: string): string => x.trim().replace(/^\/+/, "").replace(/\.md$/, "");

function rawIsland(v: unknown): RawIsland | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.name !== "string" || !r.name.trim()) return null;
  return { name: r.name.trim(), ...(typeof r.title === "string" && r.title.trim() ? { title: r.title.trim() } : {}), notes: strs(r.notes), match: strs(r.match), islands: (Array.isArray(r.islands) ? r.islands : []).map(rawIsland).filter((i): i is RawIsland => i !== null) };
}

function readRaw(text: string): RawLens {
  let doc: Record<string, unknown>;
  try { doc = parse(text) as Record<string, unknown>; } catch (e) { throw new LensEditError(`the lens file is not TOML (${(e as Error).message.split("\n")[0]}): mend it by hand first`); }
  return {
    ...(typeof doc.title === "string" && doc.title.trim() ? { title: doc.title.trim() } : {}),
    hidden: Array.isArray(doc.hidden) ? strs(doc.hidden) : null,
    islands: (Array.isArray(doc.islands) ? doc.islands : []).map(rawIsland).filter((i): i is RawIsland => i !== null),
  };
}

const q = (s: string): string => JSON.stringify(s);
const list = (xs: string[]): string => `[${xs.map(q).join(", ")}]`;

/** A lens in its plain form: the title and hidden list, then each island, its own islands under it. */
function lensText(l: RawLens): string {
  const out: string[] = [];
  if (l.title) out.push(`title = ${q(l.title)}`);
  if (l.hidden) out.push(`hidden = ${list(l.hidden)}`);
  const walk = (islands: RawIsland[], depth: number) => {
    for (const i of islands) {
      out.push("", `[[${Array(depth).fill("islands").join(".")}]]`, `name = ${q(i.name)}`);
      if (i.title && i.title !== i.name) out.push(`title = ${q(i.title)}`);
      if (i.notes.length) out.push(`notes = ${list(i.notes)}`);
      if (i.match.length) out.push(`match = ${list(i.match)}`);
      walk(i.islands, depth + 1);
    }
  };
  walk(l.islands, 1);
  return `${out.join("\n").replace(/^\n/, "")}\n`;
}

/** A new lens's text. */
export function newLensText(title: string): string {
  return lensText({ title: title.trim(), hidden: null, islands: [] });
}

const pathOf = (raw: string): string[] => raw.split(">").map((x) => x.trim()).filter(Boolean);
const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** The island a name or path names, with the list it is in. */
function findIsland(l: RawLens, raw: string): { island: RawIsland; siblings: RawIsland[]; path: string } {
  const path = pathOf(raw);
  if (!path.length) throw new LensEditError("name the island");
  let siblings = l.islands, island: RawIsland | undefined;
  for (const [k, part] of path.entries()) {
    island = siblings.find((i) => i.name === part) ?? siblings.find((i) => same(i.name, part));
    if (!island) break;
    if (k < path.length - 1) siblings = island.islands;
  }
  if (island) return { island, siblings, path: path.join(" > ") };
  // One name alone: an island anywhere with that name or title, where only one has it.
  if (path.length === 1) {
    const found: { island: RawIsland; siblings: RawIsland[]; path: string }[] = [];
    const walk = (list: RawIsland[], above: string) => {
      for (const i of list) {
        const p = above ? `${above} > ${i.name}` : i.name;
        if (same(i.name, path[0]!) || (i.title && same(i.title, path[0]!))) found.push({ island: i, siblings: list, path: p });
        walk(i.islands, p);
      }
    };
    walk(l.islands, "");
    if (found.length === 1) return found[0]!;
    if (found.length > 1) throw new LensEditError(`more than one island is called ${raw}: name it by its path (${found.map((f) => f.path).join("; ")})`);
  }
  throw new LensEditError(`there is no island ${raw} in this lens`, 404);
}

const place = <T>(xs: T[], x: T, at: number | undefined): void => { xs.splice(at === undefined ? xs.length : Math.max(0, Math.min(at, xs.length)), 0, x); };
const goodName = (name: string): string => {
  const n = name.trim();
  if (!n) throw new LensEditError("an island needs a name");
  if (n.includes(">")) throw new LensEditError("an island's name cannot hold >, which separates the names in a path");
  if (n.length > 120) throw new LensEditError("an island's name is 120 characters at most");
  return n;
};

/** A lens file's text with one change made. `baseHidden` is the base's hidden list: a lens with none of its own starts
 *  from it when something is first hidden or shown in the lens alone. Throws a `LensEditError` for a change that cannot
 *  be made. `said` is a line on what was done. */
export function editLens(text: string, edit: LensEdit, baseHidden: readonly string[] = []): { text: string; said: string } {
  const l = readRaw(text);
  let said: string;
  switch (edit.action) {
    case "title": {
      const title = edit.title.trim();
      if (!title) throw new LensEditError("a title cannot be empty");
      if (edit.island) {
        const { island, path } = findIsland(l, edit.island);
        if (title === island.name) delete island.title; else island.title = title;
        said = `The island ${path} is titled "${title}".`;
      } else { l.title = title; said = `The lens is titled "${title}".`; }
      break;
    }
    case "add_island": {
      const path = pathOf(edit.island), name = goodName(path.at(-1) ?? "");
      const siblings = path.length > 1 ? findIsland(l, path.slice(0, -1).join(" > ")).island.islands : l.islands;
      if (siblings.some((i) => same(i.name, name))) throw new LensEditError(`there is already an island ${path.join(" > ")}`, 409);
      const title = edit.title?.trim();
      place(siblings, { name, ...(title && title !== name ? { title } : {}), notes: [...new Set(edit.notes ?? [])], match: [...new Set(edit.match ?? [])], islands: [] }, edit.at);
      said = `Added the island ${path.join(" > ")}.`;
      break;
    }
    case "remove_island": {
      const { island, siblings, path } = findIsland(l, edit.island);
      siblings.splice(siblings.indexOf(island), 1);
      said = `Removed the island ${path}.`;
      break;
    }
    case "rename_island": {
      const { island, siblings, path } = findIsland(l, edit.island), name = goodName(edit.name);
      if (siblings.some((i) => i !== island && same(i.name, name))) throw new LensEditError(`there is already an island called ${name} beside it`, 409);
      // What it is shown as stays, unless it was shown by its name.
      if (!island.title && name !== island.name) island.title = island.name;
      island.name = name;
      if (island.title === name) delete island.title;
      said = `Renamed the island ${path} to ${name}.`;
      break;
    }
    case "move_island": {
      const { island, siblings, path } = findIsland(l, edit.island);
      siblings.splice(siblings.indexOf(island), 1);
      place(siblings, island, edit.at);
      said = `Moved the island ${path} to place ${siblings.indexOf(island) + 1} of ${siblings.length}.`;
      break;
    }
    case "add_notes": {
      const { island, path } = findIsland(l, edit.island);
      let at = edit.at, added = 0, moved = 0;
      for (const raw of edit.notes) {
        const k = island.notes.findIndex((n) => normId(n) === normId(raw));
        if (k >= 0 && at === undefined) continue;
        if (k >= 0) { island.notes.splice(k, 1); if (k < at!) at!--; moved++; } else added++;
        place(island.notes, raw, at);
        if (at !== undefined) at++;
      }
      const rules = (edit.match ?? []).map((m) => m.trim()).filter((m) => m && !island.match.includes(m));
      island.match.push(...rules);
      added += rules.length;
      said = `${added ? `Added ${added} to` : moved ? `Moved ${moved} in` : "Nothing new for"} the island ${path}${added && moved ? `, and moved ${moved}` : ""}.`;
      break;
    }
    case "remove_notes": {
      const { island, path } = findIsland(l, edit.island);
      const gone = new Set(edit.notes.map(normId)), rules = new Set((edit.match ?? []).map((m) => m.trim())), before = island.notes.length + island.match.length;
      island.notes = island.notes.filter((n) => !gone.has(normId(n)));
      island.match = island.match.filter((m) => !rules.has(m));
      said = `Took ${before - island.notes.length - island.match.length} from the island ${path}.`;
      break;
    }
    case "set_match": {
      const { island, path } = findIsland(l, edit.island);
      island.match = [...new Set(edit.match.map((m) => m.trim()).filter(Boolean))];
      said = `The island ${path} has ${island.match.length} ${island.match.length === 1 ? "rule" : "rules"}.`;
      break;
    }
    case "hide": case "unhide": case "set_hidden": {
      const had = l.hidden ? l.hidden.map(hiddenId) : [...baseHidden].map(hiddenId);
      const ids = (edit.ids ?? []).map(hiddenId).filter(Boolean);
      const now = edit.action === "set_hidden" ? (edit.ids === null ? null : ids) : edit.action === "hide" ? [...had, ...ids] : had.filter((h) => !ids.includes(h));
      // Written as `hidden.txt` keeps them, so the two lists read alike.
      l.hidden = now === null ? null : [...new Set(now.filter(Boolean))].sort();
      said = edit.action === "set_hidden" ? (now === null ? "The lens hides what the base hides." : `The lens hides ${l.hidden!.length}.`) : `${edit.action === "hide" ? "Hidden" : "Shown"} in this lens: ${ids.length}.`;
      break;
    }
  }
  // A mistake the change brings is refused; one the file had already is the person's to mend.
  const had = new Set(parseLens("lens", text).problems.map((p) => p.message));
  const out = lensText(l), errors = parseLens("lens", out).problems.filter((p) => p.level === "error" && !had.has(p.message));
  if (errors.length) throw new LensEditError(errors.map((e) => e.message).join("; "));
  return { text: out, said };
}

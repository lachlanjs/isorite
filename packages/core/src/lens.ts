// Lenses (docs/lenses.md): a named, declared grouping of the base's notes into nested islands, kept beside the
// notes in `.isorite/lenses/<name>.toml`. The real folders are the implicit lens, "Folders". Everything here is a
// pure function of the lens file's text and what the notes say of themselves, so the engine can keep the answer per
// revision and a shell can draw it.
//
//   title = "By kind"
//   [[islands]]
//   name = "Combat"                  the island's key; `title` is what is shown, when it should differ
//   notes = ["/combat/hitboxes.md"]  ids as links write them, in the order to be read
//   match = ["path:/combat/**", "tag:combat", "kind:question", "links-to:/combat/index.md", "-tag:old"]
//   [[islands.islands]]              islands nest; a note goes to the deepest island that holds it
//
// File order is the lens's order: islands, and the notes an island lists, keep it, so a lens can be a path to
// follow. Notes an island selects by rule come after the ones it lists, by id.

import { parse } from "smol-toml";
import type { Bundle } from "./bundle.ts";
import type { MapDir, MapModel, MapNote } from "./map.ts";

/** Where lens files are, inside the base's `.isorite/`. */
export const LENSES_DIR = "lenses";
/** The implicit lens: the real folders. */
export const FOLDERS_LENS = "folders";

export interface Island { name: string; title: string; notes: string[]; match: string[]; islands: Island[] }
export interface LensProblem { level: "error" | "warning"; message: string }
/** A lens file, read. `problems` are what the text got wrong (not what the notes do). */
export interface Lens { name: string; title: string; islands: Island[]; problems: LensProblem[] }

/** What a rule asks of a note. */
export interface LensNote { id: string; kind: string; tags: string[]; /** The notes it links to. */ links: string[] }

const normId = (x: string): string => x.trim().replace(/^\/+/, "").replace(/\.md$/, "");
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : typeof v === "string" && v.trim() ? [v.trim()] : []);
const RULES = ["kind", "tag", "path", "links-to"];

/** A rule split into its sign, key and value; null when it is not one. */
function rule(raw: string): { not: boolean; key: string; value: string } | null {
  const not = raw.startsWith("-"), body = (not ? raw.slice(1) : raw).trim(), at = body.indexOf(":");
  if (at <= 0) return null;
  return { not, key: body.slice(0, at).trim().toLowerCase(), value: body.slice(at + 1).trim() };
}

/** A glob over `/folder/note.md`: `**` crosses folders, `*` and `?` do not. */
export function globRe(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "*" && pattern[i + 1] === "*") { if (pattern[i + 2] === "/") { out += "(?:.*/)?"; i += 2; } else { out += ".*"; i++; } }
    else if (c === "*") out += "[^/]*";
    else if (c === "?") out += "[^/]";
    else out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

function island(raw: unknown, at: string, problems: LensProblem[]): Island | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) { problems.push({ level: "error", message: `${at}: an island is a table with a name` }); return null; }
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === "string" ? r.name.trim() : "";
  if (!name) { problems.push({ level: "error", message: `${at}: an island needs a name` }); return null; }
  const here = at ? `${at} > ${name}` : name;
  const match = strings(r.match);
  for (const m of match) {
    const p = rule(m);
    if (!p || !RULES.includes(p.key) || !p.value) problems.push({ level: "error", message: `${here}: "${m}" is not a rule (kind:, tag:, path:, links-to:, with a leading - to negate)` });
    else if (p.key === "kind" && !["note", "question", "problem"].includes(p.value.toLowerCase())) problems.push({ level: "error", message: `${here}: "${m}": a kind is note, question or problem` });
  }
  const kids = Array.isArray(r.islands) ? r.islands.map((k) => island(k, here, problems)).filter((k): k is Island => k !== null) : [];
  return { name, title: typeof r.title === "string" && r.title.trim() ? r.title.trim() : name, notes: strings(r.notes).map(normId), match, islands: kids };
}

/** A lens file's text, read. A text that is not TOML gives a lens with no islands and the reason. */
export function parseLens(name: string, text: string): Lens {
  const problems: LensProblem[] = [];
  let doc: Record<string, unknown> = {};
  try { doc = parse(text) as Record<string, unknown>; } catch (e) { problems.push({ level: "error", message: `not TOML: ${(e as Error).message.split("\n")[0]}` }); }
  const islands = Array.isArray(doc.islands) ? doc.islands.map((k) => island(k, "", problems)).filter((k): k is Island => k !== null) : [];
  if (doc.islands !== undefined && !Array.isArray(doc.islands)) problems.push({ level: "error", message: "islands is a list of [[islands]] tables" });
  return { name, title: typeof doc.title === "string" && doc.title.trim() ? doc.title.trim() : name, islands, problems };
}

/** What the rules ask of each note of a base. */
export function lensNotes(b: Bundle): LensNote[] {
  return [...b.concepts.values()].map((c) => ({ id: c.id, kind: c.kind, tags: c.tags, links: [...new Set(c.links.filter((l) => !l.broken && l.kind === "concept").map((l) => l.target))] }));
}

/** An island in a lens as a shell draws it, with its notes in the order to read them. `ref` is its name on the map: a
 *  colon first, which no note's or folder's id can hold, so it is never taken for one. */
export interface ResolvedIsland {
  ref: string; name: string; title: string;
  /** The notes whose home it is. */
  notes: string[];
  /** The notes it holds that are at home in another island: drawn as a tag joined to the home. */
  ghosts: string[];
  /** Notes it lists that are not in the base. */
  gone: string[];
  islands: ResolvedIsland[];
}
export interface ResolvedLens {
  name: string; title: string;
  islands: ResolvedIsland[];
  /** The notes in no island, by id, on the last island the map adds: `ELSEWHERE`. */
  elsewhere: string[];
  /** Every note once, in the lens's order: each island's own notes, then its islands', and Elsewhere last. */
  order: string[];
  /** Each note's home island, by `ref` ("" for Elsewhere is `ELSEWHERE`). */
  home: Record<string, string>;
  problems: LensProblem[];
}
export const ELSEWHERE = ":";
export const ELSEWHERE_TITLE = "Elsewhere";
/** Whether a map ref is an island of a lens, not a folder or a note. */
export const isIslandRef = (ref: string): boolean => ref.startsWith(":");

interface Node { src: Island; ref: string; path: string; own: Map<string, number>; kids: Node[]; hits: number[] }

/** A lens over the notes of a base. `rest` is not drawn: a note in no island goes to Elsewhere. */
export function resolveLens(lens: Lens, notes: readonly LensNote[]): ResolvedLens {
  const problems = [...lens.problems], byId = new Map(notes.map((n) => [n.id, n]));
  const sorted = [...notes].map((n) => n.id).sort();
  const build = (list: Island[], above: string, under: string): Node[] => {
    const used = new Set<string>();
    return list.map((src) => {
      let key = src.name.replace(/\//g, " "), k = 2;
      while (used.has(key)) key = `${src.name.replace(/\//g, " ")} (${k++})`;
      if (key !== src.name.replace(/\//g, " ")) problems.push({ level: "warning", message: `${under ? `${under} > ` : ""}${src.name}: two islands have this name` });
      used.add(key);
      const path = under ? `${under} > ${src.name}` : src.name, ref = `${above}${above === ":" ? "" : "/"}${key}`;
      const own = new Map<string, number>();
      src.notes.forEach((id, i) => { if (byId.has(id)) { if (!own.has(id)) own.set(id, i); } else problems.push({ level: "error", message: `${path}: ${id}.md is not in the base` }); });
      const rules = src.match.flatMap((raw) => { const r = rule(raw); return r && RULES.includes(r.key) && r.value ? [{ ...r, raw }] : []; });
      const test = (r: (typeof rules)[number], n: LensNote): boolean => {
        const v = r.value;
        return r.key === "kind" ? n.kind === v.toLowerCase()
          : r.key === "tag" ? n.tags.some((t) => t.toLowerCase() === v.toLowerCase())
          : r.key === "path" ? globRe(v.startsWith("/") ? v : `/${v}`).test(`/${n.id}.md`)
          : n.links.includes(normId(v));
      };
      const hits = rules.map(() => 0), positive = rules.filter((r) => !r.not);
      let seq = 0;
      if (positive.length) for (const id of sorted) {
        const n = byId.get(id)!;
        let any = false;
        rules.forEach((r, k) => { if (test(r, n)) { hits[k]!++; if (!r.not) any = true; } });
        if (any && !rules.some((r) => r.not && test(r, n)) && !own.has(id)) own.set(id, src.notes.length + seq++);
      }
      rules.forEach((r, k) => { if (!hits[k] && !r.not) problems.push({ level: "warning", message: `${path}: "${r.raw}" matches no note` }); });
      if (!positive.length && rules.length) problems.push({ level: "warning", message: `${path}: a rule that only negates selects nothing` });
      return { src, ref, path, own, kids: build(src.islands, ref, path), hits };
    });
  };
  const roots = build(lens.islands, ":", "");

  const holds = (n: Node, id: string): boolean => n.own.has(id) || n.kids.some((k) => holds(k, id));
  const places = (list: Node[], id: string): Node[] => {
    const out: Node[] = [];
    for (const n of list) {
      if (!holds(n, id)) continue;
      const inner = places(n.kids, id);
      if (inner.length) out.push(...inner); else out.push(n);
    }
    return out;
  };
  const home = new Map<string, Node>(), ghosts = new Map<Node, string[]>(), at = new Map<Node, string[]>();
  const elsewhere: string[] = [];
  for (const id of sorted) {
    const p = places(roots, id);
    if (!p.length) { elsewhere.push(id); continue; }
    home.set(id, p[0]!);
    (at.get(p[0]!) ?? at.set(p[0]!, []).get(p[0]!)!).push(id);
    for (const g of p.slice(1)) (ghosts.get(g) ?? ghosts.set(g, []).get(g)!).push(id);
  }
  const inOrder = (n: Node, ids: string[]): string[] => [...ids].sort((a, b) => n.own.get(a)! - n.own.get(b)! || (a < b ? -1 : 1));
  const order: string[] = [];
  const out = (n: Node): ResolvedIsland => {
    const mine = inOrder(n, at.get(n) ?? []), g = inOrder(n, ghosts.get(n) ?? []);
    order.push(...mine);
    const islands = n.kids.map(out);
    const resolved: ResolvedIsland = { ref: n.ref, name: n.src.name, title: n.src.title, notes: mine, ghosts: g, gone: n.src.notes.filter((id) => !byId.has(id)), islands };
    const total = (r: ResolvedIsland): number => r.notes.length + r.ghosts.length + r.islands.reduce((s, k) => s + total(k), 0);
    if (!total(resolved)) problems.push({ level: "warning", message: `${n.path}: holds no notes` });
    return resolved;
  };
  const islands = roots.map(out);
  order.push(...elsewhere);
  return { name: lens.name, title: lens.title, islands, elsewhere, order, home: Object.fromEntries([...home].map(([id, n]) => [id, n.ref]).concat(elsewhere.map((id) => [id, ELSEWHERE]))), problems };
}

/** Every island of a resolved lens, parents before their islands. */
export function allIslands(lens: ResolvedLens): ResolvedIsland[] {
  const out: ResolvedIsland[] = [];
  const walk = (list: ResolvedIsland[]) => { for (const i of list) { out.push(i); walk(i.islands); } };
  walk(lens.islands);
  return out;
}

/** The notes of an island (home or ghost) and of the islands in it, or of the whole lens when none is named. An island
 *  is named by its path of names (`Combat > Weapons`, or just `Weapons` when only one has it), or by its title. */
export function islandNotes(lens: ResolvedLens, name?: string): Set<string> | null {
  if (!name) return new Set(lens.order);
  const want = name.trim().toLowerCase();
  if (want === ELSEWHERE_TITLE.toLowerCase()) return new Set(lens.elsewhere);
  const found: ResolvedIsland[] = [];
  const walk = (list: ResolvedIsland[], above: string) => {
    for (const i of list) {
      const path = above ? `${above} > ${i.name}` : i.name;
      if ([path, i.name, i.title].some((x) => x.toLowerCase() === want)) found.push(i);
      walk(i.islands, path);
    }
  };
  walk(lens.islands, "");
  if (!found.length) return null;
  const all = new Set<string>();
  const add = (i: ResolvedIsland) => { for (const id of [...i.notes, ...i.ghosts]) all.add(id); i.islands.forEach(add); };
  found.forEach(add);
  return all;
}

/** A ghost's ref on the map: `ghost:<note id>:<island ref>`. No note's id holds a colon, so the id ends at the first one. */
export const ghostRef = (id: string, island: string): string => `ghost:${id}:${island}`;
/** The note a ghost's ref stands for, or null where the ref is not a ghost's. */
export const ghostOf = (ref: string): string | null => (ref.startsWith("ghost:") ? ref.slice(6, ref.indexOf(":", 6)) : null);

/** The map's model of a lens: the model of the folders with its folders replaced by the lens's islands. Only notes are
 *  placed (a lens has no files in it yet); each note is the folders' item for it, drawn once, at its home. A ghost is an
 *  item of its own in the island that holds it, with no links: it takes room, and takes no part in routing. */
export function lensModel(model: MapModel, lens: ResolvedLens): MapModel {
  const items = new Map<string, MapNote>();
  const find = (d: MapDir): void => { for (const c of d.children) if (c.kind === "dir") find(c); else if (c.id.startsWith("c:")) items.set(c.ref, c); };
  find(model.root);
  const dir = (i: ResolvedIsland): MapDir => ({ kind: "dir", id: `d:${i.ref}`, ref: i.ref, children: [...i.islands.map(dir), ...i.notes.flatMap((id) => items.get(id) ?? []), ...i.ghosts.flatMap((id): MapNote[] => { const n = items.get(id); return n ? [{ ...n, id: `g:${ghostRef(id, i.ref)}`, ref: ghostRef(id, i.ref) }] : []; })] });
  const children: (MapDir | MapNote)[] = lens.islands.map(dir);
  if (lens.elsewhere.length) children.push({ kind: "dir", id: `d:${ELSEWHERE}`, ref: ELSEWHERE, children: lens.elsewhere.flatMap((id) => items.get(id) ?? []) });
  return { root: { kind: "dir", id: "d:", ref: "", children }, edges: model.edges.filter(([a, b]) => items.has(a) && items.has(b)) };
}

/** The titles of a resolved lens's islands by ref, for naming them on a map. */
export function islandTitles(lens: ResolvedLens): Map<string, string> {
  return new Map([[ELSEWHERE, ELSEWHERE_TITLE], ...allIslands(lens).map((i): [string, string] => [i.ref, i.title])]);
}

/** A lens file's text with a note, or a folder with the notes in it, renamed: `notes` entries that name it, and `path:`
 *  rules that name it exactly (a glob is left alone: it still matches, or `check` says it does not). Quoted strings only. The
 *  form is kept: a leading slash and `.md`, or neither. Returns the text and how many entries were changed. */
export function renameInLens(text: string, from: string, to: string, folder = false): { text: string; changed: number } {
  const f = normId(from), t = normId(to);
  let changed = 0;
  const swap = (id: string): string | null => (id === f ? t : folder && id.startsWith(`${f}/`) ? `${t}${id.slice(f.length)}` : null);
  const out = text.replace(/"((?:[^"\\\n]|\\.)*)"|'([^'\n]*)'/g, (all, dq: string | undefined, sq: string | undefined) => {
    const value = dq ?? sq ?? "", quote = dq !== undefined ? '"' : "'";
    const m = /^((?:path|links-to):\s*)?(.*)$/.exec(value)!;
    if (/[*?]/.test(m[2]!)) {
      // A glob stays, except one that begins with the folder moved: that prefix follows it.
      if (folder && m[1] && /^path/.test(m[1]) && m[2]!.startsWith(`/${f}/`)) { changed++; return `${quote}${m[1]}/${t}${m[2]!.slice(f.length + 1)}${quote}`; }
      return all;
    }
    const lead = m[2]!.startsWith("/"), md = m[2]!.endsWith(".md");
    // A bare string (a name, a title) is left: only an id written as links write it, or a rule, is changed.
    const next = swap(normId(m[2]!));
    if (next === null || (!m[1] && !md && !lead)) return all;
    changed++;
    return `${quote}${m[1] ?? ""}${lead ? "/" : ""}${next}${md ? ".md" : ""}${quote}`;
  });
  return { text: out, changed };
}

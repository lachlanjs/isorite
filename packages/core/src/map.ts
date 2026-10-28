// The Atlas's model of a knowledge base, and what a note rests on: what lights when one is chosen.

import { citeKind, type Bundle, type FileKind } from "./bundle.ts";
import { STRENGTH } from "./graph.ts";

/** `of` says a question or a problem (M12); a plain note has none. */
export interface MapNote { kind: "concept"; id: string; ref: string; weight: number; rank: number; of?: "question" | "problem" | FileKind }
export interface MapDir { kind: "dir"; id: string; ref: string; children: (MapDir | MapNote)[] }
export interface MapModel { root: MapDir; edges: [from: string, to: string, strength: number][] }

/** The Atlas's model of a knowledge base: its folders and notes, and the links between notes, each with its strength.
 *  A question or a problem is joined to each note it is about, or uses, as a "uses" link from it (M12). */
export function mapModel(base: Bundle): MapModel {
  const order = base.prerequisiteOrder();
  const note = (id: string): MapNote => {
    const k = base.concepts.get(id)!.kind;
    return { kind: "concept", id: "c:" + id, ref: id, weight: 1, rank: order.get(id)?.depth ?? 0, ...(k === "note" ? {} : { of: k }) };
  };
  const edges: MapModel["edges"] = [];
  for (const c of base.concepts.values()) {
    const strongest = new Map<string, number>();
    for (const l of c.links) {
      if (l.broken || l.kind !== "concept" || l.target === c.id || !base.concepts.has(l.target)) continue;
      strongest.set(l.target, Math.max(strongest.get(l.target) ?? 0, (l.rel && STRENGTH[l.rel]) || STRENGTH.uses));
    }
    for (const to of c.attached) if (!strongest.has(to)) strongest.set(to, STRENGTH.uses);
    for (const [to, s] of strongest) edges.push([c.id, to, s]);
  }
  // A folder that holds files but no notes (a note's pictures, M22), or only such folders, isn't drawn as a folder;
  // an empty one is, waiting for notes.
  const holdsFiles = new Set<string>();
  const parentOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
  for (const f of base.files) holdsFiles.add(parentOf(f));

  // Files (M23, plan-m23 §2.1 b): each file of the notes that isn't a note is an item in its folder, joined to the
  // notes that cite it. A folder of pictures alone (the pictures pasted into a note, M22) is one item (Q110), its ref
  // the folder's path with a "/".
  const pictureFolder = (d: string) => {
    const dd = base.directories.get(d);
    const here = [...base.files].filter((f) => parentOf(f) === d);
    return !!d && (!dd || (!dd.concepts.length && !dd.children.length)) && here.length > 0 && here.every((f) => citeKind(f) === "image");
  };
  const refOf = (f: string) => (citeKind(f) === "image" && pictureFolder(parentOf(f)) ? parentOf(f) + "/" : f);
  const fileEdges = new Map<string, Set<string>>();
  for (const c of base.concepts.values()) for (const x of c.cites) {
    if (x.broken || !base.files.has(x.target)) continue;
    const ref = refOf(x.target);
    if (!fileEdges.has(c.id)) fileEdges.set(c.id, new Set());
    fileEdges.get(c.id)!.add(ref);
  }
  const rankOf = new Map<string, number>();
  for (const [from, refs] of fileEdges) for (const ref of refs) { edges.push([from, ref, STRENGTH.uses]); rankOf.set(ref, Math.max(rankOf.get(ref) ?? 0, order.get(from)?.depth ?? 0)); }
  const filesIn = new Map<string, MapNote[]>();
  for (const f of [...base.files].sort()) {
    const of = citeKind(f), ref = of ? refOf(f) : null;
    if (!of || !ref) continue;
    const at = ref.endsWith("/") ? parentOf(ref.slice(0, -1)) : parentOf(f);
    const list = filesIn.get(at) ?? [];
    if (!list.some((n) => n.ref === ref)) list.push({ kind: "concept", id: "f:" + ref, ref, weight: 1, rank: rankOf.get(ref) ?? 0, of });
    filesIn.set(at, list);
  }
  const dir = (id: string): MapDir | null => {
    const d = base.directories.get(id)!;
    if (id && pictureFolder(id)) return null;
    const children = [...[...d.children].sort().map(dir).filter((c): c is MapDir => c !== null), ...[...d.concepts].sort().map(note), ...(filesIn.get(id) ?? [])];
    return id && !children.length && (holdsFiles.has(id) || d.children.length) ? null : { kind: "dir", id: "d:" + id, ref: id, children };
  };
  return { root: dir("")!, edges };
}

/** Whether a map item is a file (M23), not a note: its ref has an extension, or is a folder of pictures. */
export const isFileRef = (ref: string): boolean => ref.endsWith("/") || citeKind(ref) !== null;

// ------------------------------------------------------------ what a note rests on

/** One link of a note's reach: `from` requires `to`. */
export interface ReachLink {
  from: string; to: string; kind: "requires" | "builds" | "uses";
  /** A link down the chain that a longer way already makes: left out when the whole chain is drawn. */
  spare?: true;
}
export interface Reach {
  /** What the note requires, all the way back, nearest first. */
  requires: string[];
  /** How many steps back each of those is: 1 for what the note itself requires. */
  depth: Record<string, number>;
  /** The note each was first reached from, so the way back to the note can be walked. */
  via: Record<string, string>;
  /** What builds on it directly. */
  builds: string[];
  /** What it is joined to by a weaker link, either way, one step: by "uses", which the map draws, and by "see also", which it does not. */
  uses: string[];
  also: string[];
  /** The links between them: every one down the chain of what it requires, each from what builds on it, and its own "uses". */
  links: ReachLink[];
}

/** What lights when a note is chosen on the Atlas (refs, as the map model names notes). Where the base rates its
 *  links, only "requires" is followed back; where it rates none, every drawn link is. */
export function reach(model: Pick<MapModel, "edges">, note: string): Reach {
  const least = model.edges.some(([, , s]) => s >= STRENGTH.requires) ? STRENGTH.requires : STRENGTH.uses;
  const needs = new Map<string, string[]>(), neededBy = new Map<string, string[]>();
  const uses = new Set<string>(), also = new Set<string>(), weak: ReachLink[] = [];
  for (const [from, to, s] of model.edges) {
    if (from === to) continue;
    if (s < least) {
      if (from !== note && to !== note) continue;
      (s >= STRENGTH.uses ? uses : also).add(from === note ? to : from);
      if (s >= STRENGTH.uses) weak.push({ from, to, kind: "uses" });
      continue;
    }
    needs.set(from, [...(needs.get(from) ?? []), to]);
    neededBy.set(to, [...(neededBy.get(to) ?? []), from]);
  }
  const depth: Record<string, number> = {}, via: Record<string, string> = {};
  const seen = new Set([note]), requires: string[] = [], links: ReachLink[] = [], todo = [note];
  for (let k = 0; k < todo.length; k++) {
    const from = todo[k]!;
    for (const to of needs.get(from) ?? []) {
      links.push({ from, to, kind: "requires" });
      if (seen.has(to)) continue;
      seen.add(to); requires.push(to); todo.push(to);
      depth[to] = (depth[from] ?? 0) + 1; via[to] = from;
    }
  }
  // A link is spare when the links kept so far join its ends a longer way.
  const kept = new Map<string, Set<string>>();
  for (const l of links) kept.set(l.from, (kept.get(l.from) ?? new Set()).add(l.to));
  for (const l of links) {
    const met = new Set<string>(), walk = [...kept.get(l.from)!].filter((t) => t !== l.to);
    let found = false;
    while (walk.length && !found) {
      const v = walk.pop()!;
      if (v === l.to) found = true;
      else if (v !== l.from && !met.has(v)) { met.add(v); walk.push(...(kept.get(v) ?? [])); }
    }
    if (found) { l.spare = true; kept.get(l.from)!.delete(l.to); }
  }
  const builds = [...new Set(neededBy.get(note) ?? [])];
  for (const from of builds) links.push({ from, to: note, kind: "builds" });
  const own = new Set([...requires, ...builds]);
  return { requires, depth, via, builds, uses: [...uses].filter((r) => !own.has(r)), also: [...also].filter((r) => !own.has(r) && !uses.has(r)), links: [...links, ...weak.filter((l) => !own.has(l.from === note ? l.to : l.from))] };
}

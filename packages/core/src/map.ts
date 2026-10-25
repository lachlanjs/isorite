// The Atlas's model of a knowledge base, and what a note rests on: what lights when one is chosen.

import type { Bundle } from "./bundle.ts";
import { STRENGTH } from "./graph.ts";

/** `of` says a question or a problem (M12); a plain note has none. */
export interface MapNote { kind: "concept"; id: string; ref: string; weight: number; rank: number; of?: "question" | "problem" }
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
  const dir = (id: string): MapDir => {
    const d = base.directories.get(id)!;
    return { kind: "dir", id: "d:" + id, ref: id, children: [...[...d.children].sort().map(dir), ...[...d.concepts].sort().map(note)] };
  };
  return { root: dir(""), edges };
}

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

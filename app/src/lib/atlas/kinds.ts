// The kinds on the Atlas (M12): questions and problems are notes, on the map or not as their switches say; links
// out of the base are not files, and are drawn beside their note, outside the layout's placing and routing (F1).

import { STRENGTH, type MapDir, type MapModel, type MapNote } from "@isorite/core";
import type { LayoutItem } from "@isorite/core/atlas";
import type { MapReport } from "@isorite/engine";

/** A question Iso asked and you have not kept (M24, R): its ref begins with "?", so it is never a note's. */
export interface Prospect { ref: string; title: string; about: string[] }

/** The model with the questions Iso asked and not kept, each where keeping it would put it: in the folder of the
 *  first note it is about, joined to each note it is about by a "uses" link, as a question note is (mapModel). One
 *  about no note on the map is left off. */
export function withProspects(model: MapModel, prospects: readonly Prospect[]): MapModel {
  if (!prospects.length) return model;
  const at = new Map<string, MapNote>(), into = new Map<string, Prospect[]>();
  const find = (d: MapDir): void => { for (const c of d.children) if (c.kind === "dir") find(c); else at.set(c.ref, c); };
  find(model.root);
  for (const p of prospects) {
    const first = p.about.find((a) => at.has(a));
    if (first) into.set(first, [...(into.get(first) ?? []), p]);
  }
  const add = (d: MapDir): MapDir => ({
    ...d,
    children: d.children.flatMap((c): (MapDir | MapNote)[] => (c.kind === "dir" ? [add(c)] : [c, ...(into.get(c.ref) ?? []).map((p): MapNote => ({ kind: "concept", id: "c:" + p.ref, ref: p.ref, weight: 1, rank: c.rank + 1, of: "question" }))])),
  });
  const edges = [...model.edges];
  for (const ps of into.values()) for (const p of ps) for (const a of p.about) if (at.has(a)) edges.push([p.ref, a, STRENGTH.uses]);
  return { root: add(model.root), edges };
}

/** The model without the notes `drop` says, and their links. Their folders stay. */
export function withoutNotes(model: MapModel, drop: (ref: string) => boolean): MapModel {
  const gone = new Set<string>();
  const keep = (d: MapDir): MapDir => ({
    ...d,
    children: d.children.flatMap((c): (MapDir | MapNote)[] => (c.kind === "dir" ? [keep(c)] : drop(c.ref) ? (gone.add(c.ref), []) : [c])),
  });
  const root = keep(model.root);
  return gone.size ? { root, edges: model.edges.filter(([a, b]) => !gone.has(a) && !gone.has(b)) } : model;
}

export interface Satellite {
  key: string; kind: "web" | "code" | "picture"; href: string; text: string; broken: boolean; gx: number; gy: number;
  /** The note it's beside; and for a picture (M22), where it is. */
  note: string; picture?: { path: string; from: "notes" | "code" };
}

/** A satellite's side, and the room between it and its note and the next, in cells. */
const SIDE = 3, GAP = 1;

/** Each note's links out of the base that are switched on, and the pictures it shows (M22), beside it at its right:
 *  down its side, then a column further out. */
export function satellites(items: LayoutItem[], notes: MapReport["notes"], on: { web: boolean; code: boolean; pictures?: boolean }): Satellite[] {
  if (!on.web && !on.code && !on.pictures) return [];
  const out: Satellite[] = [];
  for (const n of items) {
    const r = notes[n.ref];
    const links: Omit<Satellite, "gx" | "gy" | "key" | "note">[] = [
      ...(r?.links ?? []).filter((l) => on[l.kind]).map((l) => ({ kind: l.kind, href: l.href, text: l.text, broken: !!l.broken })),
      ...(on.pictures ? r?.pictures ?? [] : []).map((p) => ({ kind: "picture" as const, href: p.href, text: p.text, broken: !!p.broken, picture: { path: p.path, from: p.from } })),
    ];
    const per = Math.max(1, Math.floor((n.h + GAP) / (SIDE + GAP)));
    links.forEach((l, k) => {
      const col = Math.floor(k / per), row = k % per;
      out.push({ ...l, key: `${n.ref} ${l.kind === "picture" ? "picture:" : ""}${l.href}`, note: n.ref, gx: n.gx + n.w + GAP + col * (SIDE + GAP), gy: n.gy + row * (SIDE + GAP) });
    });
  }
  return out;
}

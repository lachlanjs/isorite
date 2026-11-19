// What the app needs to change a lens (docs/lenses.md) from what the engine gives it: each island's path of names, which
// is how a change names an island, the islands in order for a picker, a lens's file name from a title, and an island's
// rules from what is typed in one plain field.

import { ELSEWHERE, type ResolvedIsland, type ResolvedLens } from "@isorite/core";

/** An island as a picker lists it: its ref on the map, its path of names (`Combat > Weapons`), its title and depth. */
export interface IslandRow { ref: string; path: string; title: string; depth: number; island: ResolvedIsland }

/** Every island of a lens, parents before their islands, each with the path a change names it by. */
export function islandRows(lens: ResolvedLens): IslandRow[] {
  const out: IslandRow[] = [];
  const walk = (list: ResolvedIsland[], above: string, depth: number) => {
    for (const i of list) {
      const path = above ? `${above} > ${i.name}` : i.name;
      out.push({ ref: i.ref, path, title: i.title, depth, island: i });
      walk(i.islands, path, depth + 1);
    }
  };
  walk(lens.islands, "", 0);
  return out;
}

/** The island a note is at home in, as a row, or null where it is in Elsewhere or not in the lens. */
export function homeOf(lens: ResolvedLens, id: string): IslandRow | null {
  const ref = lens.home[id];
  if (!ref || ref === ELSEWHERE) return null;
  return islandRows(lens).find((r) => r.ref === ref) ?? null;
}

/** A lens's file name from what a person calls it: lower case letters, digits and hyphens, as the engine takes them. */
export function lensName(title: string): string {
  return title.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

const RULE_KEYS = "kind|tag|path|links-to|linked-from|type";
/** An island's rules from one plain field: separated by commas, or by spaces before the next rule (`kind:question
 *  tag:combat`), so a value with a space in it survives where a comma separates it. */
export function parseRules(text: string): string[] {
  return [...new Set(text.split(new RegExp(`,|\\s+(?=-?(?:${RULE_KEYS}):)`)).map((r) => r.trim()).filter(Boolean))];
}
/** The rules as the field shows them. */
export const rulesText = (match: readonly string[]): string => match.join(" ");

/** The rule that leaves an item out of an island by its path: a note's with `.md`, a file's as it is. */
export const leaveOut = (id: string, isNote: boolean): string => `-path:/${id}${isNote ? ".md" : ""}`;

/** How to take an item out of an island: off its list where it is listed there, else by a rule that leaves it out (a rule
 *  of the island holds it). */
export function takeOut(island: ResolvedIsland, id: string, isNote: boolean): { notes: string[]; match: string[] } {
  return island.listed.includes(id) ? { notes: [id], match: [] } : { notes: [], match: [leaveOut(id, isNote)] };
}

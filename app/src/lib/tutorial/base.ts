// Which example base the tutorial's page was loaded with: the N-body simulation's notes, or the differential
// geometry notes (`?base=geometry`). A section on the other base loads the page again.

export type BaseName = "nbody" | "geometry";
export const baseNow = (): BaseName => (new URLSearchParams(location.search).get("base") === "geometry" ? "geometry" : "nbody");
/** The address of this page with `base`, at `hash`. */
export const withBase = (base: BaseName, hash: string): string => `${location.pathname}${base === "geometry" ? "?base=geometry" : ""}#${hash}`;

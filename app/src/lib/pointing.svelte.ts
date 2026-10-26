// A note pointed at in one pane and shown in another (M17). From elsewhere to the Atlas: a link under the pointer
// in the Note pane or in Iso's, or a moment of the session's timeline, outlines its note on the map (Atlas-Timeline)
// and lights the link from the open note to it. From the Atlas to the note: the note pointed at on the map
// underlines the open note's links to it.

/** What points: the Note pane's text, Iso's pane, or the timeline; and whose the pointing is (the outline's colour). */
export interface Elsewhere { id: string; folder: boolean; from: "note" | "iso" | "timeline"; who: "you" | "iso" }

class Pointing {
  /** A note (or folder) pointed at outside the Atlas. */
  elsewhere = $state.raw<Elsewhere | null>(null);
  /** The note pointed at on the Atlas. */
  onAtlas = $state("");

  /** Point at a note from a pane, or stop pointing from it (null): one pane's letting go leaves another's alone. */
  set(from: Elsewhere["from"], to: Omit<Elsewhere, "from"> | null): void {
    if (to) this.elsewhere = { ...to, from };
    else if (this.elsewhere?.from === from) this.elsewhere = null;
  }
}

export const pointing = new Pointing();

/** The note or folder an address in the app names (`#/n/<id>`, as rendered Markdown links are), or null. */
export function pointedBy(href: string): { id: string; folder: boolean } | null {
  const m = /^#\/n\/([^?#]+)/.exec(href);
  if (!m) return null;
  const id = decodeURIComponent(m[1]!);
  return id.endsWith("/") ? { id: id.slice(0, -1), folder: true } : { id, folder: false };
}

// Which of the site's bases this page is for (packages/guide/src/bases.ts), fixed when the page loads: the address names it
// then, and a switch to another base is a reload into it. After that the address is only kept naming it: the routes know
// nothing of bases, so a navigation drops the prefix and it is put back.

import { DEFAULT_BASE, movedHash, parseSiteHash } from "@isorite/guide";

/** The base of this page: the Tutorial where the address named none, so the guide's older addresses are as they were. */
export const SITE_HERE: string = typeof location === "undefined" ? DEFAULT_BASE : parseSiteHash(location.hash).base;

/** Put the base back in the address where a navigation took it off. */
export function keepAddress(): void {
  // An address from before the guide's notes moved (`#/n/atlas/the-switches`) is put right, and the note it was opens.
  const moved = movedHash(location.hash);
  if (moved && SITE_HERE === DEFAULT_BASE) { location.replace(moved); return; }
  // The Tutorial's address needs no base in it at a note, as the guide's never had: a link that named it whole is shortened.
  if (SITE_HERE === DEFAULT_BASE && location.hash.startsWith("#/b/tutorial/n/")) { history.replaceState(history.state, "", `#${location.hash.slice("#/b/tutorial".length)}`); return; }
  if (SITE_HERE === DEFAULT_BASE || location.hash.startsWith(`#/b/${SITE_HERE}`)) return;
  history.replaceState(history.state, "", `#/b/${SITE_HERE}${location.hash.slice(1)}`);
}

/** An address that names another base than this page's is a switch: the page loads again into it. An address that names
 *  none stays where it is (a link in a note, a press of Back). */
export function followAddress(): void {
  const named = /^#\/b\/([^/?#]+)/.exec(location.hash)?.[1];
  if (named && named !== SITE_HERE && parseSiteHash(location.hash).base === named) location.reload();
  else keepAddress();
}

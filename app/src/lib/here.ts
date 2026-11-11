// Which base this page is for, where a server holds several (M20): the app's page with ?base=<name> (its API at
// /b/<name>/api/), and without it the base the server was started for. What this browser keeps for a base (the
// note last open, unsaved text) is kept under that base's name, so that two bases' pages don't take each other's.

import { DEFAULT_BASE, siteHash } from "@isorite/guide";
import { SITE_HERE } from "./guide/site.ts";

/** The base named in this page's address; "" for the server's first. On the site (several bases in the page, named in the
 *  hash) it is the base the hash names, and "" for the Tutorial, so what was kept before there were several is still read. */
export function baseHere(): string {
  if (import.meta.env.MODE === "guide") return SITE_HERE === DEFAULT_BASE ? "" : SITE_HERE;
  try { return new URLSearchParams(location.search).get("base") ?? ""; } catch { return ""; }
}

/** A key this browser keeps for this base alone. */
export const kept = (key: string): string => (baseHere() ? `${key}@${baseHere()}` : key);

/** Another base's page on this server, at a place in it (a hash: #/n/<id>). */
export function basePage(name: string, hash = ""): string {
  // On the site a base is a place in the hash, and the page is reloaded into it (guide/engine.ts).
  if (import.meta.env.MODE === "guide") return `${location.pathname}${siteHash(name, hash.replace(/^#/, ""))}`;
  return `${location.origin}${location.pathname}?base=${encodeURIComponent(name)}${hash}`;
}

/** The page of a note in the global base, from a link to it (`global:conventions/naming.md`): the global base's page, at that note. */
export function globalPage(href: string): string {
  const id = href.trim().replace(/^global:\/?/, "").replace(/[#?].*$/, "").replace(/\.md$/i, "");
  return basePage("global", `#/n/${id.split("/").map(encodeURIComponent).join("/")}`);
}

/** The page of a note in the Tutorial, from a link to it (`tutorial:agents/your-own-agent.md`): the guide's page, whichever base this is. */
export function tutorialPage(href: string): string {
  const id = href.trim().replace(/^tutorial:\/?/, "").replace(/[#?].*$/, "").replace(/\.md$/i, "");
  const at = `#/n/${id.split("/").map(encodeURIComponent).join("/")}`;
  // Named whole (`#/b/tutorial/n/..`), since an address that names no base stays in the one it is in.
  return import.meta.env.MODE === "guide" ? `${location.pathname}#/b/tutorial${at.slice(1)}` : basePage("tutorial", at);
}

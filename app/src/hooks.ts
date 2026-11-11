// On the site a page's address may begin with the base it is for (`#/b/code/n/notes/main`, guide/engine.ts): the routes
// are the same in every base, so the prefix is taken off before they are matched.
import type { Reroute } from "@sveltejs/kit";
import { movedHash } from "@isorite/guide";

export const reroute: Reroute = ({ url }) => {
  if (import.meta.env.MODE !== "guide") return;
  // A moved note of the guide opens at its new id (the address itself is put right once the page is up: guide/site.ts).
  const moved = movedHash(url.hash), hash = moved ?? url.hash;
  // The router's hash mode puts the route in the URL's hash, and takes what is returned as the new hash.
  const m = /^#\/b\/[^/?#]+([/?#].*)?$/.exec(hash);
  if (m) return m[1]?.startsWith("/") ? m[1] : `/${m[1] ?? ""}`;
  return moved ? hash.slice(1) : undefined;
};

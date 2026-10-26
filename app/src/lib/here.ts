// Which base this page is for, where a server holds several (M20): the app's page with ?base=<name> (its API at
// /b/<name>/api/), and without it the base the server was started for. What this browser keeps for a base (the
// note last open, unsaved text) is kept under that base's name, so that two bases' pages don't take each other's.

/** The base named in this page's address; "" for the server's first. */
export function baseHere(): string {
  try { return new URLSearchParams(location.search).get("base") ?? ""; } catch { return ""; }
}

/** A key this browser keeps for this base alone. */
export const kept = (key: string): string => (baseHere() ? `${key}@${baseHere()}` : key);

/** Another base's page on this server, at a place in it (a hash: #/n/<id>). */
export function basePage(name: string, hash = ""): string {
  return `${location.origin}${location.pathname}?base=${encodeURIComponent(name)}${hash}`;
}

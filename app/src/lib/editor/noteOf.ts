/** The note a link's address names ("/folder/note.md"), or null for anything else. */
export function noteOf(url: string): string | null {
  const path = url.split("#")[0]!;
  return path.startsWith("/") && path.endsWith(".md") ? path.slice(1, -3) : null;
}

/** The file of the notes a link's address names ("/folder/fig.html", M23): any path with an extension but a note's. */
export function fileOf(url: string): string | null {
  const path = url.split(/[#?]/)[0]!;
  return path.startsWith("/") && !path.startsWith("//") && /\/[^/]*\.[^./]+$/.test(path) && !path.endsWith(".md") ? decodeURI(path.slice(1)) : null;
}

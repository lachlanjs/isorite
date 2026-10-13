/** The note a link's address names ("/folder/note.md"), or null for anything else. */
export function noteOf(url: string): string | null {
  const path = url.split("#")[0]!;
  return path.startsWith("/") && path.endsWith(".md") ? path.slice(1, -3) : null;
}

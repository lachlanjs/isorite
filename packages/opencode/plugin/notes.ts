// Which files are notes of the knowledge base: what the plugin hands to isorite rather than to OpenCode.

import path from "node:path";

/** Where a file is in the knowledge base, as a note's path, or null when it is not a note of it. */
export function noteOf(notes: string | null, directory: string, file: unknown): string | null {
  if (!notes || typeof file !== "string" || !file.toLowerCase().endsWith(".md")) return null;
  const rel = path.relative(notes, path.resolve(directory, file));
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel) ? rel.split(path.sep).join("/") : null;
}

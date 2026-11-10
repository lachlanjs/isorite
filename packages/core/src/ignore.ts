// What is not a file of the base though it is in the folder (code in the notes, plan: docs/files.md): the folders
// that only hold dependencies or caches, and what the base's top `.gitignore` says of files that are not notes (a note is never dropped by it). Pure: the text is given.

/** Folders never looked into, whatever a `.gitignore` says. */
const SKIPPED = new Set(["node_modules", "__pycache__"]);

/** The most a non-Markdown file may weigh to be an item at all, and the most of one read as text. */
export const MAX_ITEM_BYTES = 20_000_000;
export const MAX_TEXT_BYTES = 256_000;

/** Whether a folder's or file's name is one that is never walked: dotfiles, and the dependency and build folders
 *  (only a folder). */
export const skippedName = (name: string, dir: boolean): boolean => name.startsWith(".") || (dir && SKIPPED.has(name));

/** A `.gitignore`'s simple patterns, as a test of a path from the base's root: a name (`secrets.txt`), a folder
 *  (`out/`), a glob with `*` (`*.log`), and a path from the root (`/scratch`). Comments, blank lines and negations
 *  (`!keep`) are left out, and so are `**` patterns and nested `.gitignore` files: a match missed shows a file the
 *  person can hide, and one made by mistake would hide one they could not find. */
export function ignoredBy(text: string): (path: string, dir: boolean) => boolean {
  const rules: { re: RegExp; dirOnly: boolean; anchored: boolean }[] = [];
  for (const raw of text.split("\n")) {
    let line = raw.replace(/\r$/, "").trim();
    if (!line || line.startsWith("#") || line.startsWith("!") || line.includes("**")) continue;
    const dirOnly = line.endsWith("/");
    if (dirOnly) line = line.slice(0, -1);
    const anchored = line.includes("/");
    line = line.replace(/^\//, "");
    if (!line) continue;
    const body = line.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");
    rules.push({ re: new RegExp(`^${body}$`), dirOnly, anchored });
  }
  if (!rules.length) return () => false;
  return (path, dir) => {
    const parts = path.split("/");
    // A path is ignored when it, or a folder above it, matches.
    for (let i = 0; i < parts.length; i++) {
      const isDir = i < parts.length - 1 || dir, here = parts.slice(0, i + 1).join("/");
      for (const r of rules) if ((!r.dirOnly || isDir) && r.re.test(r.anchored ? here : parts[i]!)) return true;
    }
    return false;
  };
}

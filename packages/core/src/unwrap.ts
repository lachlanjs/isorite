// Markdown as one line per paragraph (M24): a paragraph or a list item hard-wrapped at a width is joined onto one
// line, so the editor and the panes wrap it to their own width instead of breaking it raggedly where the writer's
// width ran out. Frontmatter, fenced code, $$ maths, tables, headings, HTML, indented code and hard breaks (two
// spaces or a backslash at a line's end) are left as they are. Rendered, the text is the same.

const ITEM = /^\s*([-*+]|\d+[.)])\s+/;
const APART = /^\s*(#{1,6}\s|\||<|```|~~~|\$\$|>|---\s*$|\*\*\*\s*$|___\s*$|\[[^\]]+\]:\s)/;
const QUOTED = /^\s*>\s?\S/;

export function unwrap(text: string): string {
  const lines = text.split("\n"), out: string[] = [];
  let i = 0, fence = "", maths = false;
  /** What the last line written may be continued by: prose, a quoted line, or nothing. */
  let open: "" | "prose" | "quote" = "";
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) { out.push(...lines.slice(0, end + 1)); i = end + 1; }
  }
  for (; i < lines.length; i++) {
    const l = lines[i]!, t = l.trim();
    if (fence) { out.push(l); if (t.startsWith(fence)) fence = ""; continue; }
    if (maths) { out.push(l); if (t.endsWith("$$")) maths = false; continue; }
    if (t.startsWith("```") || t.startsWith("~~~")) { fence = t.slice(0, 3); out.push(l); open = ""; continue; }
    if (t.startsWith("$$") && !t.slice(2).includes("$$")) { maths = true; out.push(l); open = ""; continue; }
    if (!t) { out.push(l); open = ""; continue; }
    const hard = /( {2}|\\)$/.test(out.at(-1) ?? "");
    if (APART.test(l)) {
      if (open === "quote" && QUOTED.test(l) && !/^\s*>\s*([-*+]|\d+[.)]|#)/.test(l) && !hard) { out[out.length - 1] += " " + l.replace(/^\s*>\s?/, "").trim(); continue; }
      out.push(l);
      open = QUOTED.test(l) ? "quote" : "";
      continue;
    }
    if (ITEM.test(l)) { out.push(l); open = "prose"; continue; }
    if (open === "prose" && !hard) { out[out.length - 1] += " " + t; continue; }
    out.push(l);
    // A line indented four or more after a blank is code, and nothing joins it.
    open = open === "" && /^( {4}|\t)/.test(l) ? "" : "prose";
  }
  return out.join("\n");
}

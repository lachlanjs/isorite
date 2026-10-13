// Markdown drawn as HTML, for the blocks the editor shows rendered away from
// the cursor (displayed maths, tables). markdown-it with KaTeX, sanitised:
// notes come from other people and from models.

import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import DOMPurify from "dompurify";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(texmath, { engine: katex, delimiters: ["dollars", "brackets"], katexOptions: { throwOnError: false } });

// Wrap tables so wide ones scroll on phones.
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
md.renderer.rules.table_close = () => "</table></div>";

// A link to a note (/folder/note.md) goes to its page in the app.
type Rule = NonNullable<MarkdownIt["renderer"]["rules"]["link_open"]>;
const linkOpen: Rule = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!;
  const href = token.attrGet("href") ?? "";
  if (/^https?:/i.test(href)) { token.attrSet("target", "_blank"); token.attrSet("rel", "noopener"); }
  else if (href.startsWith("/") && /\.md(#.*)?$/.test(href)) token.attrSet("href", "#/n" + href.replace(/\.md(#.*)?$/, ""));
  return linkOpen(tokens, idx, options, env, self);
};

export function render(text: string): string {
  return DOMPurify.sanitize(md.render(text || ""), { ADD_ATTR: ["target"] });
}

// Markdown drawn as HTML, for the blocks the editor shows rendered away from
// the cursor (displayed maths, tables) and for what Iso and the agent say.
// markdown-it with KaTeX, sanitised: notes come from other people and from
// models. Fenced code is coloured where its language is loaded already (the
// rest by colourCode, code.ts, once it is); a mermaid fence is left as a
// placeholder for drawDiagrams (diagram.ts).

import MarkdownIt from "markdown-it";
import texmath from "markdown-it-texmath";
import katex from "katex";
import DOMPurify from "dompurify";
import { rating } from "@isorite/core";
import { highlighted } from "./code.ts";

const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  .use(texmath, { engine: katex, delimiters: ["dollars", "brackets"], katexOptions: { throwOnError: false } });

// Wrap tables so wide ones scroll on phones.
md.renderer.rules.table_open = () => '<div class="table-wrap"><table>';
md.renderer.rules.table_close = () => "</table></div>";

// Fenced code: in a block with its language's name; a diagram as its placeholder, its source as its text (not an
// attribute, which the sanitiser drops for Mermaid's -->).
const escape = md.utils.escapeHtml;
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]!, info = token.info.trim(), lang = info.split(/\s/)[0] ?? "";
  if (lang.toLowerCase() === "mermaid") return `<div class="diagram"><pre><code>${escape(token.content)}</code></pre></div>\n`;
  const body = (lang ? highlighted(token.content.replace(/\n$/, ""), lang) : null) ?? escape(token.content.replace(/\n$/, ""));
  const named = lang ? `<span class="code-lang">${escape(lang)}</span>` : "";
  return `<div class="code-block"><pre><code${lang ? ` class="language-${escape(lang)}"` : ""}>${body}</code></pre>${named}</div>\n`;
};

// A link to a note (/folder/note.md) goes to its page in the app. Every link is a vein (M24, N): its weight is the
// kind its title names (requires, uses, see also; none counts as uses), a link to the web its own.
type Rule = NonNullable<MarkdownIt["renderer"]["rules"]["link_open"]>;
const linkOpen: Rule = md.renderer.rules.link_open ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]!;
  const href = token.attrGet("href") ?? "";
  const web = /^https?:/i.test(href), kind = rating(token.attrGet("title"));
  token.attrSet("class", `vein ${web ? "web" : kind === "requires" ? "requires" : kind === "see also" ? "also" : "uses"}`);
  if (web) { token.attrSet("target", "_blank"); token.attrSet("rel", "noopener"); }
  else if (href.startsWith("/") && /\.md(#.*)?$/.test(href)) token.attrSet("href", "#/n" + href.replace(/\.md(#.*)?$/, ""));
  return linkOpen(tokens, idx, options, env, self);
};

export function render(text: string): string {
  return DOMPurify.sanitize(md.render(text || ""), { ADD_ATTR: ["target"] });
}

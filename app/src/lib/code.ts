// Code coloured by its language (M19), the same in the note editor and wherever Markdown is rendered: one set of
// parsers (@codemirror/language-data, each loaded the first time a note uses it) and one highlighter giving a few
// classes, coloured in app.css. In colour by default; in ink (the board's: keywords bold, comments faint) by the
// Note pane's setting.

import { LanguageDescription, ensureSyntaxTree, languageDataProp } from "@codemirror/language";
import { markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { languages } from "@codemirror/language-data";
import { highlightCode, tagHighlighter, tags, type Highlighter } from "@lezer/highlight";

export { languages };

const tagged = tagHighlighter([
  { tag: tags.keyword, class: "tok-k" },
  { tag: [tags.string, tags.regexp, tags.special(tags.string)], class: "tok-s" },
  { tag: [tags.number, tags.bool, tags.null, tags.atom], class: "tok-n" },
  { tag: [tags.typeName, tags.className, tags.namespace], class: "tok-t" },
  { tag: tags.comment, class: "tok-c" },
]);

/** Only the code inside a fence: the note's own Markdown has its own styles (every Markdown language shares one
 *  set of language data). */
export const codeHighlighter: Highlighter = { style: (t) => tagged.style(t), scope: (top) => top.prop(languageDataProp) !== markdownLanguage.data };

/** The language a fence names (```python), or null where none is known. */
export function languageOf(info: string): LanguageDescription | null {
  const name = info.trim().split(/\s/)[0] ?? "";
  return name ? LanguageDescription.matchLanguageName(languages, name, false) : null;
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The code as HTML with the highlighter's classes, if its language is loaded already; null if not. */
export function highlighted(code: string, info: string): string | null {
  const support = languageOf(info)?.support;
  if (!support) return null;
  let out = "";
  // Parsed in a state of its own, as the editor does: the older stream languages (Julia, R, Fortran…) read theirs.
  const tree = ensureSyntaxTree(EditorState.create({ doc: code, extensions: [support] }), code.length, 500) ?? support.language.parser.parse(code);
  highlightCode(code, tree, codeHighlighter,
    (text, classes) => { out += classes ? `<span class="${classes}">${escape(text)}</span>` : escape(text); },
    () => { out += "\n"; });
  return out;
}

/** The same, loading the language first. null where none is known or it couldn't be loaded. */
export async function highlight(code: string, info: string): Promise<string | null> {
  const lang = languageOf(info);
  if (!lang) return null;
  try { await lang.load(); } catch { return null; }
  return highlighted(code, info);
}

/** Colour the fenced code inside an element rendered by render(): each `pre > code.language-x`, in place, once its
 *  language has loaded. A Svelte action; again whenever what it was given changes. */
export function colourCode(node: HTMLElement, _given?: unknown) {
  const run = () => {
    for (const code of node.querySelectorAll<HTMLElement>("pre > code[class*='language-']:not([data-coloured])")) {
      const info = /language-(\S+)/.exec(code.className)?.[1] ?? "";
      const source = code.textContent ?? "";
      code.dataset.coloured = "";
      void highlight(source, info).then((html) => { if (html !== null && code.textContent === source) code.innerHTML = html; });
    }
  };
  run();
  return { update: run };
}

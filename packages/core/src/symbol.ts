// Finding a function, method or class in a file of code by its name (M29): the lines it covers now, wherever it has
// moved to. A code link `code:sim/step.py#leapfrog` (or `#Body.step`) names it; the file is read when it is shown.
// No parser: a declaration is found by its shape, and its end by indentation (Python) or by matching braces, which is
// enough for the languages below and cheap. Where it is not enough the link can still name lines.

export interface SymbolSpan { /** 1-based, inclusive. */ start: number; end: number; /** How many declarations of that name there were; the first is taken. */ count: number }

const PY = new Set(["py", "pyi"]);
const BRACE = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "go", "rs", "java", "kt", "kts", "cs", "c", "h", "cc", "cpp", "cxx", "hpp", "swift", "php", "scala", "dart", "zig", "svelte", "vue"]);

/** Whether symbols can be found in a file of this name. */
export function hasSymbols(path: string): boolean {
  const ext = path.split(".").at(-1)!.toLowerCase();
  return PY.has(ext) || BRACE.has(ext);
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The lines of `path`'s symbol `name` (`Class.method` for one inside another) in `text`, or null. */
export function findSymbol(text: string, path: string, name: string): SymbolSpan | null {
  const ext = path.split(".").at(-1)!.toLowerCase();
  const lines = text.split(/\r?\n/);
  const parts = name.split(".").filter(Boolean);
  if (!parts.length || (!PY.has(ext) && !BRACE.has(ext))) return null;
  let from = 0, to = lines.length - 1, span: SymbolSpan | null = null;
  for (const part of parts) {
    const found = PY.has(ext) ? pyFind(lines, part, from, to) : braceFind(lines, part, from, to);
    if (!found) return null;
    span = found;
    // The next part is looked for inside this one, after its first line.
    from = found.start; to = found.end - 1;
  }
  return span;
}

function pyFind(lines: string[], name: string, from: number, to: number): SymbolSpan | null {
  const re = new RegExp(`^(\\s*)(?:async\\s+)?(?:def|class)\\s+${esc(name)}\\b`);
  // The declaration nearest the outside of where it is looked for: at the top level, not in a class or a function.
  const at: { i: number; indent: number }[] = [];
  for (let i = from; i <= to; i++) { const m = re.exec(lines[i]!); if (m) at.push({ i, indent: m[1]!.length }); }
  const shallow = Math.min(...at.map((a) => a.indent), Infinity);
  const top = from === 0 && to === lines.length - 1;
  const here = at.filter((a) => a.indent === shallow && (!top || shallow === 0));
  let first: SymbolSpan | null = null, count = 0;
  for (const { i, indent } of here) {
    count++;
    if (first) continue;
    // The signature may run over lines: the body starts after the line that ends in a colon.
    let open = i;
    while (open < lines.length - 1 && !/:\s*(#.*)?$/.test(lines[open]!)) open++;
    let end = open;
    for (let j = open + 1; j < lines.length; j++) {
      const l = lines[j]!;
      if (!l.trim()) continue;
      if (l.length - l.trimStart().length <= indent) break;
      end = j;
    }
    // Its decorators above, at its own indent.
    let start = i;
    while (start > 0 && new RegExp(`^\\s{${indent}}@`).test(lines[start - 1]!)) start--;
    first = { start: start + 1, end: Math.min(end, to) + 1, count: 1 };
  }
  return first ? { ...first, count } : null;
}

const DECL = (n: string) => [
  new RegExp(`\\b(?:function\\*?|class|interface|enum|struct|trait|union|impl|fn|func|def|type|record|namespace|object|module)\\s+(?:<[^>]*>\\s*)?(?:\\([^)]*\\)\\s*)?${n}\\b`),
  new RegExp(`\\b(?:const|let|var|val)\\s+${n}\\s*(?::[^=]+)?=\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>|\\w+\\s*=>)`),
  new RegExp(`^\\s*(?:(?:public|private|protected|internal|static|async|override|final|abstract|export|default|get|set|pub|unsafe|virtual|readonly|suspend|inline|open)\\s+)*(?:[\\w<>\\[\\],.?*&:]+\\s+)?\\*?${n}\\s*(?:<[^>]*>)?\\(`),
];

function braceFind(lines: string[], name: string, from: number, to: number): SymbolSpan | null {
  const res = DECL(esc(name));
  let first: SymbolSpan | null = null, count = 0;
  let i = from;
  while (i <= to) {
    const line = lines[i]!;
    if (/^\s*(\/\/|\*|\/\*|#)/.test(line) || !res.some((re) => re.test(line))) { i++; continue; }
    // A declaration has its `{` before any `;` (a call or a use does not).
    const body = openBrace(lines, i, to);
    if (!body) { i++; continue; }
    count++;
    const end = closeBrace(lines, body.line, body.col);
    if (!first) {
      // Its doc comment and attributes above.
      let start = i;
      while (start > 0 && /^\s*(@|#\[|\/\/|\/\*|\*)/.test(lines[start - 1]!)) start--;
      first = { start: start + 1, end: Math.min(end, to) + 1, count: 1 };
    }
    i = end + 1;
  }
  return first ? { ...first, count } : null;
}

/** The first `{` from line `i`, if it comes before a `;` (within a few lines, the signature). */
function openBrace(lines: string[], i: number, to: number): { line: number; col: number } | null {
  for (let j = i; j <= Math.min(to, i + 8); j++) {
    const l = stripStrings(lines[j]!);
    const b = l.indexOf("{"), s = l.indexOf(";");
    if (b >= 0 && (s < 0 || b < s)) return { line: j, col: b };
    if (s >= 0) return null;
  }
  return null;
}

/** Blank out what is inside quotes and after `//`, so braces there are not counted. */
function stripStrings(l: string): string {
  return l.replace(/\/\/.*$/, (m) => " ".repeat(m.length)).replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, (m) => " ".repeat(m.length));
}

/** The line holding the `}` that closes the `{` at (line, col). The end of the file when it does not. */
function closeBrace(lines: string[], line: number, col: number): number {
  let depth = 0, block = false;
  for (let j = line; j < lines.length; j++) {
    let l = stripStrings(lines[j]!);
    if (block) { const e = l.indexOf("*/"); if (e < 0) continue; l = " ".repeat(e + 2) + l.slice(e + 2); block = false; }
    l = l.replace(/\/\*.*?\*\//g, (m) => " ".repeat(m.length));
    const o = l.indexOf("/*");
    if (o >= 0) { block = true; l = l.slice(0, o); }
    for (let k = j === line ? col : 0; k < l.length; k++) {
      if (l[k] === "{") depth++;
      else if (l[k] === "}" && --depth === 0) return j;
    }
  }
  return lines.length - 1;
}

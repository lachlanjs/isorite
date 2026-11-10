// Editing a table (M37): with the cursor in a table's source, a small bar above it inserts and deletes rows and
// columns. Each change rewrites the table's Markdown the way you would type it (one undo step, ordinary pipes and
// dashes), so the file stays as any other Markdown reads it.

import { syntaxTree } from "@codemirror/language";
import { EditorSelection, StateField, type EditorState } from "@codemirror/state";
import { EditorView, showTooltip, type Tooltip } from "@codemirror/view";

export type TableOp = "row-above" | "row-below" | "row-delete" | "col-left" | "col-right" | "col-delete";

interface Found { from: number; to: number; rows: string[][]; at: { row: number; col: number } }

/** The cells of a line of a table: split at pipes that are not escaped, outer pipes dropped. */
export function cellsOf(line: string): string[] {
  const t = line.trim();
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (c === "\\" && i + 1 < t.length) { cell += c + t[i + 1]; i++; continue; }
    if (c === "|") { cells.push(cell); cell = ""; continue; }
    cell += c;
  }
  cells.push(cell);
  if (t.startsWith("|")) cells.shift();
  if (t.endsWith("|") && !t.endsWith("\\|")) cells.pop();
  return cells.map((c) => c.trim());
}

/** Which cell of `line` the position `col` (a character of the line) is in. */
function columnAt(line: string, col: number): number {
  const lead = line.length - line.trimStart().length;
  let n = 0;
  for (let i = lead; i < Math.min(col, line.length); i++) {
    if (line[i] === "\\") { i++; continue; }
    if (line[i] === "|") n++;
  }
  return line.trimStart().startsWith("|") ? Math.max(0, n - 1) : n;
}

function find(state: EditorState): Found | null {
  const head = state.selection.main.head;
  // At the table's first character the node before it is the one found going left; so look both ways.
  const tree = syntaxTree(state);
  for (const side of [-1, 1] as const) for (let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(head, side); node; node = node.parent) {
    if (node.name !== "Table") continue;
    const text = state.sliceDoc(node.from, node.to).split("\n");
    const line = state.doc.lineAt(head);
    const row = state.doc.lineAt(head).number - state.doc.lineAt(node.from).number;
    return { from: node.from, to: node.to, rows: text.map(cellsOf), at: { row: Math.max(0, Math.min(row, text.length - 1)), col: columnAt(line.text, head - line.from) } };
  }
  return null;
}

const blank = (n: number): string[] => Array.from({ length: n }, () => "");
const dash = (c: string): string => (/^:-+:$/.test(c) ? ":---:" : /^:-+$/.test(c) ? ":---" : /^-+:$/.test(c) ? "---:" : "---");

function render(rows: string[][]): string {
  return rows.map((r) => `| ${r.map((c) => c.replace(/\|/g, (m, i, s) => (s[i - 1] === "\\" ? m : "\\|")) ).join(" | ")} |`).join("\n");
}

/** Whether `op` can be done where the cursor is: not on the header or its rule, never the last column or body row left. */
export function can(t: { rows: string[][]; at: { row: number; col: number } }, op: TableOp): boolean {
  const cols = t.rows[0]?.length ?? 0;
  switch (op) {
    case "row-above": return t.at.row >= 2;
    case "row-below": return true;
    case "row-delete": return t.at.row >= 2 && t.rows.length > 3;
    case "col-delete": return cols > 1;
    default: return true;
  }
}

/** Apply `op` to the table, as a new text and where the cursor goes in it (a row, a column). */
export function edit(rows: string[][], at: { row: number; col: number }, op: TableOp): { rows: string[][]; at: { row: number; col: number } } {
  const cols = rows[0]?.length ?? 1;
  const out = rows.map((r) => [...r]);
  const col = Math.min(at.col, cols - 1);
  switch (op) {
    case "row-above": out.splice(at.row, 0, blank(cols)); return { rows: out, at: { row: at.row, col } };
    case "row-below": { const to = Math.max(at.row + 1, 2); out.splice(to, 0, blank(cols)); return { rows: out, at: { row: to, col } }; }
    case "row-delete": out.splice(at.row, 1); return { rows: out, at: { row: Math.min(at.row, out.length - 1), col } };
    case "col-left":
    case "col-right": {
      const to = op === "col-left" ? col : col + 1;
      out.forEach((r, i) => r.splice(to, 0, i === 1 ? "---" : ""));
      return { rows: out, at: { row: at.row, col: to } };
    }
    case "col-delete": out.forEach((r) => r.splice(col, 1)); return { rows: out, at: { row: at.row, col: Math.min(col, cols - 2) } };
  }
}

/** Do `op` in the table the cursor is in. False where it is in none, or cannot be done there. */
export function tableEdit(view: EditorView, op: TableOp): boolean {
  const t = find(view.state);
  if (!t || !can(t, op)) return false;
  const done = edit(t.rows, t.at, op);
  // The rule row keeps each column's alignment where it is kept.
  done.rows[1] = done.rows[1]!.map(dash);
  const text = render(done.rows);
  // Into the cell the cursor was in, or the new one: after its leading "| ".
  const lines = text.split("\n");
  let pos = t.from;
  for (let i = 0; i < done.at.row; i++) pos += lines[i]!.length + 1;
  const cells = cellsOf(lines[done.at.row]!);
  let off = 2;
  for (let c = 0; c < done.at.col; c++) off += (cells[c]?.length ?? 0) + 3;
  view.dispatch({ changes: { from: t.from, to: t.to, insert: text }, selection: EditorSelection.cursor(pos + off), userEvent: "input", scrollIntoView: true });
  view.focus();
  return true;
}

const LABELS: [TableOp, string, string][] = [
  ["row-above", "row ↑", "Insert a row above"], ["row-below", "row ↓", "Insert a row below"], ["row-delete", "row ✕", "Delete this row"],
  ["col-left", "col ←", "Insert a column to the left"], ["col-right", "col →", "Insert a column to the right"], ["col-delete", "col ✕", "Delete this column"],
];

function makeBar(v: EditorView): { dom: HTMLElement; update: (u: { state: EditorState }) => void } {
  const dom = document.createElement("div");
  dom.className = "cm-table-bar";
  dom.setAttribute("role", "toolbar");
  dom.setAttribute("aria-label", "Table");
  for (const [op, label, title] of LABELS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("aria-label", title);
    // Pressed without taking the focus (and so the cursor) out of the table.
    b.addEventListener("mousedown", (e) => { e.preventDefault(); tableEdit(v, op); });
    dom.append(b);
  }
  const update = (u: { state: EditorState }): void => {
    const f = find(u.state);
    dom.querySelectorAll("button").forEach((b, i) => { b.disabled = !f || !can(f, LABELS[i]![0]); });
  };
  update({ state: v.state });
  return { dom, update };
}

/** The extension: the bar above a table while the cursor is in its source, kept in step with the cursor. */
export function tables() {
  const field = StateField.define<{ key: number; tip: Tooltip | null }>({
    create: (state) => { const t = find(state); return { key: t?.from ?? -1, tip: t ? { pos: t.from, above: true, arrow: false, create: makeBar } : null }; },
    update: (value, tr) => {
      if (!tr.docChanged && !tr.selection) return value;
      const t = find(tr.state), key = t?.from ?? -1;
      if (key === value.key) return value;
      return { key, tip: t ? { pos: t.from, above: true, arrow: false, create: makeBar } : null };
    },
    provide: (f) => showTooltip.compute([f], (s) => s.field(f).tip),
  });
  return [field, EditorView.baseTheme({
    ".cm-table-bar": { display: "flex", gap: "2px", padding: "2px", background: "var(--ground-2)", border: "1px solid var(--line-strong)", fontFamily: "var(--font-ui)", fontSize: "0.75rem" },
    ".cm-table-bar button": { background: "none", border: "0", color: "var(--text-soft)", padding: "3px 6px", cursor: "pointer", font: "inherit" },
    ".cm-table-bar button:hover:not(:disabled)": { color: "var(--text)", background: "var(--line)" },
    ".cm-table-bar button:disabled": { opacity: "0.35", cursor: "default" },
  })];
}

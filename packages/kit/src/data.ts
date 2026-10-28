// Data files as rows, the same in the kit (in the artifact) and in read_data (for Iso): CSV and TSV with quoted fields,
// JSON (an array of objects, or an object holding one), and JSON lines. A field that reads as a number is one; an empty
// one is null.

export type Value = string | number | boolean | null;
export type Row = Record<string, Value>;

const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/;
const value = (s: string): Value => (s === "" ? null : NUMBER.test(s.trim()) ? +s : s);

/** One line of delimited text into fields; quotes may hold the delimiter, newlines and doubled quotes. */
function* records(text: string, sep: string): Generator<string[]> {
  let field = "", row: string[] = [], quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === sep) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") yield row;
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") yield row;
}

export function parseDelimited(text: string, sep = ","): Row[] {
  const it = records(text.replace(/^﻿/, ""), sep), head = it.next();
  if (head.done) return [];
  const cols = head.value.map((c) => c.trim());
  const out: Row[] = [];
  for (const r of it) out.push(Object.fromEntries(cols.map((c, i) => [c, value(r[i] ?? "")])));
  return out;
}

export function parseData(path: string, text: string): Row[] {
  const ext = path.toLowerCase().split(".").pop();
  if (ext === "json") {
    const j = JSON.parse(text);
    if (Array.isArray(j)) return j;
    const inner = j && typeof j === "object" ? Object.values(j).find(Array.isArray) : null;
    if (inner) return inner as Row[];
    throw new Error(`${path}: not an array of rows`);
  }
  if (ext === "jsonl" || ext === "ndjson") return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (ext === "tsv") return parseDelimited(text, "\t");
  if (ext === "csv") return parseDelimited(text, ",");
  throw new Error(`${path}: the kit reads CSV, TSV, JSON and JSON lines`);
}

/** Every column any row has, in the order they first appear. */
export function columnsOf(rows: Row[]): string[] {
  const seen = new Set<string>();
  for (const r of rows.slice(0, 1000)) for (const k of Object.keys(r)) seen.add(k);
  return [...seen];
}

export interface Shape {
  path: string;
  rows: number;
  columns: { name: string; type: "number" | "text" | "boolean" | "empty"; min?: number; max?: number; mean?: number; values?: string[]; distinct?: number; empty: number }[];
  head: Row[];
}
/** What read_data tells Iso: enough to build on a file without reading it. */
export function shapeOf(path: string, rows: Row[], head = 5): Shape {
  return {
    path, rows: rows.length, head: rows.slice(0, head),
    columns: columnsOf(rows).map((name) => {
      const vs = rows.map((r) => r[name]), present = vs.filter((v) => v !== null && v !== undefined && v !== ""), empty = vs.length - present.length;
      if (!present.length) return { name, type: "empty" as const, empty };
      if (present.every((v) => typeof v === "number")) {
        let min = Infinity, max = -Infinity, sum = 0;
        for (const v of present as number[]) { if (v < min) min = v; if (v > max) max = v; sum += v; }
        return { name, type: "number" as const, min, max, mean: sum / present.length, empty };
      }
      if (present.every((v) => typeof v === "boolean")) return { name, type: "boolean" as const, empty };
      const distinct = [...new Set(present.map(String))];
      return { name, type: "text" as const, distinct: distinct.length, values: distinct.slice(0, 12), empty };
    }),
  };
}

/** The shape as text, the way Iso reads it. */
export function describeShape(s: Shape): string {
  const g = (x: number) => (Number.isInteger(x) ? String(x) : String(+x.toPrecision(4)));
  const lines = [`${s.path}: ${s.rows} rows, ${s.columns.length} columns`];
  for (const c of s.columns) {
    const empty = c.empty ? `, ${c.empty} empty` : "";
    if (c.type === "number") lines.push(`- ${c.name}: number, ${g(c.min!)} to ${g(c.max!)} (mean ${g(c.mean!)})${empty}`);
    else if (c.type === "text") lines.push(`- ${c.name}: text, ${c.distinct} distinct: ${c.values!.join(", ")}${c.distinct! > c.values!.length ? ", …" : ""}${empty}`);
    else lines.push(`- ${c.name}: ${c.type}${empty}`);
  }
  const cols = s.columns.map((c) => c.name);
  lines.push("First rows:", cols.join(","), ...s.head.map((r) => cols.map((c) => r[c] ?? "").join(",")));
  return lines.join("\n");
}

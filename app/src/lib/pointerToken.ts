// A pointer as it is drawn: a small chip in isorite's cut-corner frame and its blue, a pointing mark and where it is
// from ("Surprise · 7", "huff.py · 10–20", "the answer"), so that several in one message can be told apart. The same
// element is in the prompt, and carried to it from the selection.

import type { Pointer } from "./pointers.ts";

const NS = "http://www.w3.org/2000/svg";

/** What the chip says: the note's title or the file's name, shortened, and its lines. */
export function chipText(p: Pick<Pointer, "title" | "from" | "to" | "kind">): string {
  if (p.kind === "turn") return "the answer";
  const t = p.title.length > 16 ? `${p.title.slice(0, 15).trimEnd()}…` : p.title;
  if (p.kind === "folder") return `${t}/`;
  if (p.from === 0 && p.to === 0) return t;
  return `${t} · ${p.from === p.to ? p.from : `${p.from}–${p.to}`}`;
}

export function tokenEl(p: Pick<Pointer, "id" | "title" | "from" | "to" | "kind">, selected = false): HTMLElement {
  const el = document.createElement("span");
  el.className = selected ? "pt pt-selected" : "pt";
  el.dataset.pt = String(p.id);
  el.contentEditable = "false";
  el.title = p.kind === "folder" || (p.kind === "note" && p.from === 0 && p.to === 0) ? `${p.title}: opens it` : p.kind === "turn" ? `${p.title}: a passage of the agent's answer` : `${p.title}, line${p.from === p.to ? "" : "s"} ${p.from === p.to ? p.from : `${p.from}–${p.to}`}`;
  const face = document.createElement("span");
  face.className = "pt-face";
  // A mark that points: an arrow's head, closed on a short stem.
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("width", "10");
  svg.setAttribute("height", "10");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", "M2 6h6.5M6 3l3 3-3 3");
  svg.append(path);
  const text = document.createElement("span");
  text.className = "pt-text";
  text.textContent = chipText(p);
  face.append(svg, text);
  el.append(face);
  return el;
}

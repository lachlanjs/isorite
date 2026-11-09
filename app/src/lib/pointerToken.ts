// A pointer as it is drawn: a small glowing bar in isorite's blue with a fleck of branches at each end, ">---<". The
// same element is in the prompt, and carried to it from the selection.

import { flecks } from "./flecks.ts";
import type { Pointer } from "./pointers.ts";

const NS = "http://www.w3.org/2000/svg";
const W = 76, H = 22;

export function tokenEl(p: Pick<Pointer, "id" | "title" | "from" | "to" | "kind">): HTMLElement {
  const el = document.createElement("span");
  el.className = "pt";
  el.dataset.pt = String(p.id);
  el.contentEditable = "false";
  el.title = p.kind === "turn" ? `${p.title}: a passage of the agent's answer` : `${p.title}, line${p.from === p.to ? "" : "s"} ${p.from === p.to ? p.from : `${p.from}–${p.to}`}`;
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("width", String(W));
  svg.setAttribute("height", String(H));
  svg.setAttribute("aria-hidden", "true");
  const tw = document.createElementNS(NS, "path");
  tw.setAttribute("class", "tw");
  tw.setAttribute("d", flecks(p.id, 20, W - 20, H / 2));
  const bar = document.createElementNS(NS, "rect");
  bar.setAttribute("class", "bar");
  bar.setAttribute("x", "20");
  bar.setAttribute("y", String(H / 2 - 3));
  bar.setAttribute("width", String(W - 40));
  bar.setAttribute("height", "6");
  bar.setAttribute("rx", "3");
  svg.append(tw, bar);
  el.append(svg);
  return el;
}

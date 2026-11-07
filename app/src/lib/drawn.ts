// What render() gives, finished in the page (M19): code coloured once its language has loaded, diagrams drawn, and
// where a pane asks for it, a copy icon on each code block. A Svelte action, run again when what it was given changes:
// `<div use:drawn={text}>{@html render(text)}</div>`, or `use:drawn={{ given: text, copy: true }}`.

import { colourCode } from "./code.ts";
import { drawDiagrams } from "./diagram.ts";

const COPY = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8"/><path d="M10.5 3.5v-1h-8v8h1"/></svg>';
const COPIED = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7"/></svg>';

function copyIcons(node: HTMLElement): void {
  for (const block of node.querySelectorAll<HTMLElement>(".code-block:not(:has(> .code-copy))")) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "code-copy";
    button.title = "Copy the code";
    button.setAttribute("aria-label", "Copy the code");
    button.innerHTML = COPY;
    button.addEventListener("click", () => {
      const text = block.querySelector("code")?.textContent ?? "";
      void navigator.clipboard?.writeText(text).then(() => {
        button.classList.add("done");
        button.innerHTML = COPIED;
        setTimeout(() => { button.classList.remove("done"); button.innerHTML = COPY; }, 1500);
      }, () => undefined);
    });
    block.insertBefore(button, block.querySelector(".code-lang"));
  }
}

type Given = unknown | { given: unknown; copy?: boolean };
const wantsCopy = (g: Given): boolean => typeof g === "object" && g !== null && "copy" in g && Boolean((g as { copy?: boolean }).copy);

export function drawn(node: HTMLElement, given?: Given) {
  // Drawn when what is in the node changes, not when Svelte calls update: update can come before {@html} has put
  // the new text in (and comes for every object passed, equal or not, so a pane's session redrawn from every event
  // would draw everything again). Only the node's own children are watched, so what drawing adds does not wake it.
  let copy = wantsCopy(given);
  let queued = false;
  const run = () => {
    queued = false;
    colourCode(node);
    drawDiagrams(node);
    if (copy) copyIcons(node);
  };
  const soon = () => { if (!queued) { queued = true; queueMicrotask(run); } };
  run();
  const changed = new MutationObserver(soon);
  changed.observe(node, { childList: true, characterData: true });
  return {
    update: (g: Given) => { const was = copy; copy = wantsCopy(g); if (copy && !was) soon(); },
    destroy: () => changed.disconnect(),
  };
}

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
  const run = (g: Given) => {
    colourCode(node);
    drawDiagrams(node);
    if (wantsCopy(g)) copyIcons(node);
  };
  run(given);
  return { update: (g: Given) => run(g) };
}
